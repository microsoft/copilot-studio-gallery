import assert from "node:assert/strict";
import { test } from "node:test";
import { AgentSession, errorMessage, readTurn } from "./client";
import type { ConnectorResult, CopilotConnector } from "./client";

const config = {
  environmentId: "11111111-2222-3333-4444-555555555555",
  schemaName: "contoso_friendlyAgent",
};

test("reads complete turns without exposing tool or reasoning metadata", () => {
  assert.deepEqual(readTurn({
    conversationId: "conversation", responses: ["First", "", "Second"], lastResponse: "Second",
    completed: false, toolResults: "private", reasoning: "hidden",
  }), { conversationId: "conversation", replies: ["First", "Second"] });
});

test("accepts documented conversation ID casing and lastResponse fallback", () => {
  for (const key of ["conversationId", "ConversationId", "conversationID"]) {
    assert.deepEqual(readTurn({ [key]: "id", lastResponse: "Answer" }), { conversationId: "id", replies: ["Answer"] });
  }
});

test("rejects missing context, empty/card-only replies, and malformed results explicitly", () => {
  for (const data of [undefined, null, "answer", [], {}, { responses: ["Answer"] }, { conversationId: "" }]) {
    assert.throws(() => readTurn(data), /conversation/);
  }
  assert.throws(() => readTurn({ conversationId: "id", responses: [] }), /no text answer/);
  assert.throws(() => readTurn({ conversationId: "id", attachments: [{}] }), /supported channel/);
  assert.throws(() => readTurn({ conversationId: "id", responses: [{ text: "Not text" }] }), /unexpected answer format/);
});

test("uses the native operation with the selected environment and reuses each conversation ID", async () => {
  const calls: Parameters<CopilotConnector["ExecuteCopilotAsyncV2"]>[] = [];
  const service: CopilotConnector = {
    async ExecuteCopilotAsyncV2(...args) {
      calls.push(args);
      return { success: true, data: { conversationId: args[2] ?? `chat-${calls.length}`, responses: ["Answer"] } };
    },
  };
  const settings = { ...config };
  const first = new AgentSession(settings, service);
  settings.schemaName = "another_agent";
  await first.send("Hello", "en-US");
  await first.send("Follow-up", "en-US");
  const second = first.fork();
  await second.send("Different chat", "en-GB");
  await second.send("Its follow-up", "en-GB");
  assert.deepEqual(calls.map(call => call[2]), [undefined, "chat-1", undefined, "chat-3"]);
  assert.ok(calls.every(call => call[0] === config.schemaName && call[3] === config.environmentId));
  assert.deepEqual(calls[0][1], { message: "Hello", locale: "en-US", notificationUrl: "https://notificationurlplaceholder" });
});

test("does not automatically repeat failed or ambiguous agent requests", async () => {
  for (const result of [
    { success: false, error: { message: "Consent required" } },
    { success: true },
    { success: true, data: { conversationId: "id", responses: [] } },
  ]) {
    let count = 0;
    const session = new AgentSession(config, {
      async ExecuteCopilotAsyncV2() { count++; return result; },
    });
    await assert.rejects(session.send("Hello", "en-US"));
    await assert.rejects(session.send("Try again", "en-US"), /previous request could not be confirmed/);
    assert.equal(count, 1);
  }
});

test("surfaces native connector error details without returning scripted answers", async () => {
  const session = new AgentSession(config, {
    async ExecuteCopilotAsyncV2() { return { success: false, error: { message: "Blocked by policy" } }; },
  });
  await assert.rejects(session.send("Hello", "en-US"), /Blocked by policy/);
  assert.match(errorMessage({}), /connector request failed/);
});

test("prevents overlapping sends and conversation ID changes", async () => {
  let resolve!: (value: ConnectorResult) => void;
  const session = new AgentSession(config, {
    ExecuteCopilotAsyncV2() { return new Promise(done => { resolve = done; }); },
  });
  const first = session.send("Hello", "en-US");
  await assert.rejects(session.send("Too soon", "en-US"), /Wait for the current answer/);
  resolve({ success: true, data: { conversationId: "one", responses: ["Hi"] } });
  await first;
  const next = session.send("Follow-up", "en-US");
  resolve({ success: true, data: { conversationId: "two", responses: ["Wrong chat"] } });
  await assert.rejects(next, /changed the conversation ID/);
});

test("invalid inputs do not contact the agent or poison a valid session", async () => {
  let calls = 0;
  const session = new AgentSession(config, {
    async ExecuteCopilotAsyncV2() {
      calls++;
      return { success: true, data: { conversationId: "id", responses: ["Hi"] } };
    },
  });
  await assert.rejects(session.send("  ", "en-US"), /Write a message/);
  await assert.rejects(session.send("a".repeat(8001), "en-US"), /8,000/);
  await session.send("a".repeat(8000), "en-US");
  assert.equal(calls, 1);
});
