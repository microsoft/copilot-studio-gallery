import assert from "node:assert/strict";
import { test } from "node:test";
import { AgentSession, errorMessage, readTurn } from "./client";
import type { ConnectorResult, CopilotConnector } from "./client";

const config = {
  environmentId: "11111111-2222-3333-4444-555555555555",
  schemaName: "contoso_friendlyAgent",
};

test("reads Agent Node text without exposing activities, files, or structured output", () => {
  assert.deepEqual(readTurn({
    conversationId: "conversation", status: "Completed", result: "An answer",
    activities: [{ text: "internal" }], files: [{ contentBytes: "private" }],
    structuredOutput: { reasoning: "hidden" },
  }), { conversationId: "conversation", replies: ["An answer"] });
});

test("rejects missing conversation IDs instead of silently starting another conversation", () => {
  for (const data of [
    undefined, null, "answer", [], {}, { result: "Answer" },
    { conversationId: "" }, { conversationId: "   " },
    { conversationId: 123, result: "Answer" },
  ]) {
    assert.throws(() => readTurn(data), /conversation/);
  }
});

test("rejects empty, structured-only, card-only, and malformed answers explicitly", () => {
  for (const data of [
    { result: "" }, { result: "  " },
    { message: "An inline-definition result is not an InvokeAgent result" },
    { activities: [{ type: "message", attachments: [{}] }] },
    { structuredOutput: { answer: "Not a text turn" } },
    { responses: ["A classic-connector response is not an Agent Node result"] },
  ]) {
    assert.throws(() => readTurn({ conversationId: "id", ...data }), /no text answer/);
  }
  assert.throws(() => readTurn({ conversationId: "id", result: { text: "Not text" } }), /unexpected answer format/);
});

test("identifies the observed asynchronous acknowledgement without inventing a reply", () => {
  assert.throws(
    () => readTurn({ conversationId: "id" }),
    /acknowledgement, not a completed answer.*Completion retrieval/,
  );
});

test("never displays a pending or failed run as an answer", () => {
  for (const status of ["Running", "Failed", "Cancelled", null, 200]) {
    assert.throws(() => readTurn({ conversationId: "id", status, result: "Not a completed answer" }), /did not return a completed turn/);
  }
});

test("uses InvokeAgent and passes each chat's conversation ID in its native header parameter", async () => {
  const calls: Parameters<CopilotConnector["InvokeAgent"]>[] = [];
  const service: CopilotConnector = {
    async InvokeAgent(...args) {
      calls.push(args);
      return { success: true, data: { conversationId: args[1] ?? `chat-${calls.length}`, result: "Answer" } };
    },
  };
  const settings = { ...config };
  const first = new AgentSession(settings, service);
  settings.schemaName = "another_agent";
  await first.send("Hello");
  await first.send("Follow-up");
  const second = first.fork();
  await second.send("Different chat");
  await second.send("Its follow-up");
  await first.send("Back to the first chat");
  assert.deepEqual(calls.map(call => call[1]), [undefined, "chat-1", undefined, "chat-3", "chat-1"]);
  assert.ok(calls.every(call => call[0].agentId === config.schemaName && call[2] === config.environmentId));
  assert.deepEqual(calls[0], [{ agentId: config.schemaName, prompt: "Hello" }, undefined, config.environmentId, undefined]);
  assert.deepEqual(calls[1][0], { agentId: config.schemaName, prompt: "Follow-up" });
});

test("does not automatically repeat failed or ambiguous agent requests", async () => {
  for (const result of [
    { success: false, error: { message: "Consent required" } },
    { success: true },
    { success: true, data: { conversationId: "id" } },
    { success: true, data: { conversationId: "id", result: "" } },
  ]) {
    let count = 0;
    const session = new AgentSession(config, {
      async InvokeAgent() { count++; return result; },
    });
    await assert.rejects(session.send("Hello"));
    await assert.rejects(session.send("Try again"), /previous request could not be confirmed/);
    assert.equal(count, 1);
  }
});

test("surfaces native connector error details without returning scripted answers", async () => {
  const session = new AgentSession(config, {
    async InvokeAgent() { return { success: false, error: { message: "Blocked by policy" } }; },
  });
  await assert.rejects(session.send("Hello"), /Blocked by policy/);
  assert.match(errorMessage({}), /connector request failed/);
});

test("prevents overlapping sends and conversation ID changes", async () => {
  let resolve!: (value: ConnectorResult) => void;
  const session = new AgentSession(config, {
    InvokeAgent() { return new Promise(done => { resolve = done; }); },
  });
  const first = session.send("Hello");
  await assert.rejects(session.send("Too soon"), /Wait for the current answer/);
  resolve({ success: true, data: { conversationId: "one", result: "Hi" } });
  await first;
  const next = session.send("Follow-up");
  resolve({ success: true, data: { conversationId: "two", result: "Wrong chat" } });
  await assert.rejects(next, /changed the conversation ID/);
  await assert.rejects(session.send("Do not retry"), /previous request could not be confirmed/);
});

test("invalid inputs do not contact the agent or poison a valid session", async () => {
  let calls = 0;
  const session = new AgentSession(config, {
    async InvokeAgent() {
      calls++;
      return { success: true, data: { conversationId: "id", result: "Hi" } };
    },
  });
  await assert.rejects(session.send("  "), /Write a message/);
  await assert.rejects(session.send("a".repeat(8001)), /8,000/);
  await session.send("a".repeat(8000));
  assert.equal(calls, 1);
});

test("passes local cancellation to the adapter without poisoning an unsent session", async () => {
  const controller = new AbortController();
  controller.abort();
  let calls = 0;
  const session = new AgentSession(config, {
    async InvokeAgent(_body, _conversation, _environment, signal) {
      calls++;
      assert.equal(signal, undefined);
      return { success: true, data: { conversationId: "id", result: "Hi" } };
    },
  });
  await assert.rejects(session.send("Never send", controller.signal), /before it was sent/);
  assert.equal(calls, 0);
  await session.send("Now send");
  assert.equal(calls, 1);
});
