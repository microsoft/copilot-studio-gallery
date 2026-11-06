import assert from "node:assert/strict";
import test from "node:test";
import { keeperSchema, MemoryClient, MemoryUnavailableError, MemoryUncertainError, readKeepers } from "./memories";
import type { Keeper } from "./memories";
import type { CopilotConnector } from "./client";

const config = { environmentId: "11111111-2222-3333-4444-555555555555", schemaName: "contoso_test" };
const keeper: Keeper = { id: "c53e8797-a4bc-4ac4-885f-92621d58fb01", title: "An idea", content: "An independently recalled non-sensitive idea." };
const payload = (keepers: Keeper[] = []) => ({ namespace: "oddly.keepers.v1", version: 1, status: "ok", keepers, message: "" });
const completed = (value: unknown = payload(), conversationId = "new-conversation") => ({ conversationId, status: "Completed", structuredOutput: value });

test("validates structured memory output and strict text fallback separately from normal chat", () => {
  assert.deepEqual(readKeepers(completed(payload([keeper]))).keepers, [keeper]);
  assert.deepEqual(readKeepers({ conversationId: "other", result: JSON.stringify(payload()) }).keepers, []);
  assert.throws(() => readKeepers({ conversationId: "other", result: "```json\n{}\n```" }), /strict memory JSON/);
  assert.throws(() => readKeepers({ ...completed("bad"), result: JSON.stringify(payload()) }), /structured memory/);
  assert.throws(() => readKeepers({ conversationId: "other" }), /no usable JSON/);
  assert.throws(() => readKeepers({ ...completed(), status: "Running" }), /completed/);
});

test("distinguishes unavailable memory and native errors from a genuine empty store", () => {
  assert.throws(() => readKeepers(completed({ ...payload(), status: "unavailable", message: "Memory is off." })), MemoryUnavailableError);
  assert.throws(() => readKeepers(completed({ ...payload(), status: "error", message: "Cannot list." })), /Cannot list/);
  assert.deepEqual(readKeepers(completed()).keepers, []);
});

test("rejects foreign, duplicate, malformed and oversized keeper data without truncation", () => {
  for (const invalid of [
    { ...payload(), namespace: "another-memory" }, { ...payload(), version: 2 },
    { ...payload(), extra: true }, { ...payload(), status: ["ok"] }, { ...payload(), message: "a".repeat(2001) },
    payload([keeper, { ...keeper, id: keeper.id.toUpperCase() }]),
    payload([{ ...keeper, id: "not-an-id" }]), payload([{ ...keeper, title: " " }]),
    payload([{ ...keeper, content: "a".repeat(8001) }]), payload(Array.from({ length: 21 }, () => keeper)),
  ]) assert.throws(() => readKeepers(completed(invalid)));
  assert.throws(() => readKeepers({ conversationId: "other", result: "a".repeat(200001) }), /no usable JSON/);
});

test("isolates every memory operation, disables HITL and passes the declared object output schema", async () => {
  const calls: Parameters<CopilotConnector["InvokeAgent"]>[] = [];
  const connector: CopilotConnector = {
    async InvokeAgent(...args) {
      calls.push(args);
      return { success: true, data: completed(payload(calls.length === 2 ? [keeper] : []), `conversation-${calls.length}`) };
    },
  };
  const selection = { ...config };
  const client = new MemoryClient(selection, connector);
  selection.schemaName = "another_agent";
  await client.remember(keeper, "idea");
  await client.forget(keeper.id);
  assert.equal(calls.length, 4);
  for (const [body, conversationId, environmentId] of calls) {
    assert.equal(body.agentId, config.schemaName);
    assert.equal(body.isHitlEscalationEnabled, false);
    assert.deepEqual(body.outputSchema, keeperSchema);
    assert.equal(conversationId, undefined);
    assert.equal(environmentId, config.environmentId);
  }
  for (const call of [calls[1], calls[3]]) {
    assert.ok(!String(call[0].prompt).includes(keeper.id));
    assert.ok(!String(call[0].prompt).includes(keeper.content));
  }
});

test("does not mistake a save acknowledgement for persistence or retry a mutation", async () => {
  let calls = 0;
  const client = new MemoryClient(config, {
    async InvokeAgent() { return { success: true, data: completed(payload(calls++ === 0 ? [keeper] : []), `conversation-${calls}`) }; },
  });
  await assert.rejects(client.remember(keeper, "idea"), error => error instanceof MemoryUncertainError && error.keeperId === keeper.id);
  assert.equal(calls, 2);
});

test("reports uncertain writes/deletes and performs no automatic replay on transport failure", async () => {
  let calls = 0;
  const client = new MemoryClient(config, {
    async InvokeAgent() { calls++; throw new Error("Connection lost"); },
  });
  await assert.rejects(client.remember(keeper, "summary"), /could not be confirmed.*Connection lost.*Refresh Memories/);
  await assert.rejects(client.forget(keeper.id), /could not be confirmed.*Connection lost.*Refresh Memories/);
  assert.equal(calls, 2);
});

test("requires independent deletion verification and rejects reused conversation context", async () => {
  const client = new MemoryClient(config, {
    async InvokeAgent() { return { success: true, data: completed(payload([keeper])) }; },
  });
  await assert.rejects(client.forget(keeper.id), /independent recall/);
});

test("does not confirm deletion when a fresh conversation still recalls the keeper", async () => {
  let calls = 0;
  const client = new MemoryClient(config, {
    async InvokeAgent() { return { success: true, data: completed(payload(++calls === 2 ? [keeper] : []), `conversation-${calls}`) }; },
  });
  await assert.rejects(client.forget(keeper.id), /still found this memory/);
  assert.equal(calls, 2);
});

test("cancellation after a submitted write remains uncertain and does not send its reconciliation", async () => {
  const controller = new AbortController();
  let calls = 0;
  const client = new MemoryClient(config, {
    async InvokeAgent(_body, _conversationId, _environmentId, signal) {
      calls++;
      assert.equal(signal, controller.signal);
      controller.abort();
      return { success: true, data: completed(payload([keeper])) };
    },
  });
  await assert.rejects(client.remember(keeper, "idea", controller.signal), MemoryUncertainError);
  assert.equal(calls, 1);
});

test("full-text and summary requests quote the same content but use distinct storage instructions", async () => {
  const prompts: string[] = [];
  const client = new MemoryClient(config, {
    async InvokeAgent(body) {
      prompts.push(String(body.prompt));
      return { success: true, data: completed(payload([keeper]), `conversation-${prompts.length}`) };
    },
  });
  await client.remember(keeper, "idea");
  await client.remember(keeper, "summary");
  assert.ok(prompts[0].includes(JSON.stringify(keeper)));
  assert.ok(prompts[0].includes("without rewriting or summarizing"));
  assert.ok(prompts[2].includes(JSON.stringify(keeper)));
  assert.ok(prompts[2].includes("faithful summary"));
  assert.ok(!prompts[1].includes(keeper.content));
  assert.ok(!prompts[3].includes(keeper.content));
});

test("validates input and cancellation before contacting the native agent", async () => {
  let calls = 0;
  const client = new MemoryClient(config, { async InvokeAgent() { calls++; throw new Error("Unexpected request"); } });
  await assert.rejects(client.remember({ ...keeper, content: "" }, "idea"), /invalid/);
  await assert.rejects(client.forget("all memories"), /valid memory/);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(client.list(controller.signal), /abort/i);
  await assert.rejects(client.remember(keeper, "idea", controller.signal), /abort/i);
  await assert.rejects(client.forget(keeper.id, controller.signal), /abort/i);
  assert.equal(calls, 0);
});
