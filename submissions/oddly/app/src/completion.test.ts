import assert from "node:assert/strict";
import { test } from "node:test";
import type { HttpSendParams, HttpSendResult } from "@microsoft/managed-apps-common/communication";
import { createDataClient } from "@microsoft/managed-apps-common/dataClient";
import type { DataClientHost, DataSourcesInfo } from "@microsoft/managed-apps-common/dataClient";
import { completeAgentRequest } from "./completion";
import type { PollClock } from "./completion";
import { AgentSession } from "./client";
import type { CopilotConnector } from "./client";

const id = "11111111-2222-3333-4444-555555555555";
const followUpId = "c-aaaaaaaa111122223333bbbbbbbbbbbb";
const endpoint = "https://example.environment.api.powerplatform.com/connectors/runtime/apis/agentnode/connections/test/powerautomate/agentnodes/conversations";
const location = `${endpoint}/${id}?environmentId=test&goodUntil=opaque%2Bexpiry%3D%3D`;
const request: HttpSendParams = {
  url: `${endpoint}?environmentId=test`,
  method: "POST",
  headers: { "Content-Type": "application/json", "x-ms-protocol-semantics": "cdp", ServiceNamespace: "agentnode", "X-Custom": "not-forwarded" },
  body: JSON.stringify({ agentId: "contoso_agent", prompt: "Hello" }),
  context: {
    operationName: "connectorDataOperation.InvokeAgent",
    connection: {
      apiId: "/providers/Microsoft.PowerApps/apis/shared_agentnode",
      connectionId: "test",
      dataSourceName: "agentnode",
    },
  },
};

function response(status: number, body: unknown, headers: Record<string, string> = {}): HttpSendResult {
  return { status, body: JSON.stringify(body), headers: { "Content-Type": "application/json", ...headers } };
}
function pending(headers: Record<string, string> = {}): HttpSendResult {
  return response(202, { conversationId: id }, { Location: location, "Retry-After": "15", ...headers });
}
const answer = response(200, { conversationId: id, result: "A real answer" });

function clock() {
  let now = Date.parse("2026-01-01T00:00:00Z");
  const waits: number[] = [];
  const value: PollClock = {
    now: () => now,
    async wait(milliseconds, signal) {
      signal?.throwIfAborted();
      waits.push(milliseconds);
      now += milliseconds;
    },
  };
  return { value, waits };
}

test("returns synchronous results without a completion GET", async () => {
  let calls = 0;
  const result = await completeAgentRequest(async () => { calls++; return answer; }, request);
  assert.equal(result, answer);
  assert.equal(calls, 1);
});

test("follows opaque Location through the same native connection, with one POST", async () => {
  const calls: HttpSendParams[] = [];
  const budgets: number[] = [];
  const timer = clock();
  const responses = [
    pending(),
    response(202, { conversationId: id }, { "retry-after": "7" }),
    answer,
  ];
  const result = await completeAgentRequest(async (params, budget) => {
    calls.push(params);
    budgets.push(budget);
    return responses[calls.length - 1];
  }, request, undefined, timer.value);
  assert.equal(result, answer);
  assert.deepEqual(timer.waits, [15_000, 7000]);
  assert.deepEqual(budgets, [180_000, 165_000, 158_000]);
  assert.deepEqual(calls.map(call => call.method), ["POST", "GET", "GET"]);
  for (const call of calls.slice(1)) {
    assert.equal(call.url, location);
    assert.equal(call.body, undefined);
    assert.deepEqual(call.headers, { Accept: "application/json", "x-ms-protocol-semantics": "cdp", ServiceNamespace: "agentnode" });
    assert.deepEqual(call.context?.connection, request.context?.connection);
    assert.equal(call.context?.operationName, "connectorDataOperation.GetConversationStatus");
  }
});

test("uses relative Location and the server's HTTP-date retry interval", async () => {
  const timer = clock();
  let calls = 0;
  const result = await completeAgentRequest(async params => {
    if (calls++ === 0) return pending({
      Location: new URL(location).pathname + new URL(location).search,
      "Retry-After": new Date(timer.value.now() + 20_000).toUTCString(),
    });
    assert.equal(params.url, location);
    return answer;
  }, request, undefined, timer.value);
  assert.equal(result, answer);
  assert.deepEqual(timer.waits, [20_000]);
});

test("follows an opaque invocation handle distinct from the acknowledged conversation ID", async () => {
  const timer = clock();
  const calls: HttpSendParams[] = [];
  const followUpLocation = location.replace(id, followUpId);
  const updatedLocation = followUpLocation.replace("opaque%2Bexpiry%3D%3D", "renewed%2Bexpiry%3D%3D");
  const responses = [
    pending({ Location: followUpLocation }),
    pending({ Location: updatedLocation }),
    answer,
  ];
  assert.equal(await completeAgentRequest(async params => {
    calls.push(params);
    return responses[calls.length - 1];
  }, {
    ...request, headers: { ...request.headers, "x-ms-conversation-id": id },
  }, undefined, timer.value), answer);
  assert.deepEqual(calls.map(call => call.method), ["POST", "GET", "GET"]);
  assert.deepEqual(calls.slice(1).map(call => call.url), [followUpLocation, updatedLocation]);
});

test("keeps polling bounded and never repeats the invocation", async () => {
  const timer = clock();
  const methods: string[] = [];
  await assert.rejects(completeAgentRequest(async params => {
    methods.push(params.method);
    return pending();
  }, request, undefined, timer.value), /within three minutes/);
  assert.equal(methods.filter(method => method === "POST").length, 1);
  assert.equal(methods.filter(method => method === "GET").length, 11);
  assert.ok(timer.waits.reduce((sum, delay) => sum + delay, 0) < 180_000);
});

test("does not poll earlier than Retry-After when the delay exceeds the wait budget", async () => {
  const timer = clock();
  let calls = 0;
  await assert.rejects(completeAgentRequest(async () => {
    calls++;
    return pending({ "Retry-After": "3600" });
  }, request, undefined, timer.value), /within three minutes/);
  assert.equal(calls, 1);
  assert.deepEqual(timer.waits, []);
});

test("validates the polling destination before forwarding any request", async () => {
  for (const destination of [
    location.replace("https:", "http:"),
    location.replace("example.environment.api.powerplatform.com", "untrusted.example"),
    location.replace("https://", "https://user:password@"),
    location.replace("/connections/test/", "/connections/other/"),
    `${location}#fragment`,
    endpoint,
    `${endpoint}/`,
    `${endpoint}/${id}/other`,
    `${endpoint}/..`,
    `${endpoint}/%2e%2e`,
    `${endpoint}/${id}%2fother`,
    `${endpoint}/${id}%5cother`,
  ]) {
    let calls = 0;
    await assert.rejects(completeAgentRequest(async () => {
      calls++;
      return pending({ Location: destination });
    }, request, undefined, clock().value), /polling URL/);
    assert.equal(calls, 1);
  }
});

test("refuses a switch to another invocation handle during polling", async () => {
  let calls = 0;
  await assert.rejects(completeAgentRequest(async () => {
    calls++;
    return calls === 1 ? pending() : pending({
      Location: location.replace(id, "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"),
    });
  }, request, undefined, clock().value), /outside this agent invocation/);
  assert.equal(calls, 2);
});

test("fails explicitly for missing Location or malformed retry headers", async () => {
  for (const item of [
    response(202, { conversationId: id }),
    pending({ "Retry-After": "not-a-delay" }),
  ]) {
    let calls = 0;
    await assert.rejects(completeAgentRequest(async () => {
      calls++;
      return item;
    }, request, undefined, clock().value), /no completion Location|invalid Retry-After/);
    assert.equal(calls, 1);
  }
});

test("returns native policy, authentication, and agent errors without retrying", async () => {
  for (const status of [400, 401, 403, 429, 500]) {
    let calls = 0;
    const failure = response(status, { error: "Native connector failure" });
    const result = await completeAgentRequest(async () => calls++ === 0 ? pending() : failure, request, undefined, clock().value);
    assert.equal(result, failure);
    assert.equal(calls, 2);
  }
});

test("does not add Agent Node polling to unrelated operations", async () => {
  for (const operation of [
    { ...request, method: "GET" },
    { ...request, context: { ...request.context, operationName: "connectorDataOperation.InvokeDefinition" } },
    { ...request, url: request.url.replace("/powerautomate/", "/other/") },
  ]) {
    let calls = 0;
    const accepted = pending();
    assert.equal(await completeAgentRequest(async () => { calls++; return accepted; }, operation), accepted);
    assert.equal(calls, 1);
  }
});

test("cancels a local wait without submitting or cancelling remote work", async () => {
  const controller = new AbortController();
  let calls = 0;
  const result = completeAgentRequest(async () => {
    calls++;
    controller.abort();
    return pending();
  }, request, controller.signal);
  await assert.rejects(result, /Stopped waiting locally/);
  assert.equal(calls, 1);
  await assert.rejects(completeAgentRequest(async () => { calls++; return answer; }, request, controller.signal), /Stopped waiting locally/);
  assert.equal(calls, 1);
});

test("cancels an in-flight native request locally instead of hanging", async () => {
  const controller = new AbortController();
  let calls = 0;
  const result = completeAgentRequest(() => {
    calls++;
    return new Promise<HttpSendResult>(() => {});
  }, request, controller.signal);
  controller.abort();
  await assert.rejects(result, /Stopped waiting locally/);
  assert.equal(calls, 1);
});

test("does not follow a terminal redirect", async () => {
  let calls = 0;
  await assert.rejects(completeAgentRequest(async () => calls++ === 0 ? pending() : response(302, {}), request, undefined, clock().value), /unexpected redirect/);
  assert.equal(calls, 2);
});

test("the published SDK preserves conversation identity when follow-up polling uses a different handle", async () => {
  const timer = clock();
  const calls: HttpSendParams[] = [];
  const connection = request.context!.connection!;
  const dataSourcesInfo: DataSourcesInfo = {
    agentnode: {
      tableId: "",
      dataSourceType: "Connector",
      apis: {
        InvokeAgent: {
          method: "POST",
          path: "/{connectionId}/powerautomate/agentnodes/conversations",
          parameters: [
            { name: "connectionId", in: "path", required: true, type: "string" },
            { name: "body", in: "body", required: true, type: "object" },
            { name: "x-ms-conversation-id", in: "header", required: false, type: "string" },
            { name: "environmentId", in: "query", required: false, type: "string" },
          ],
          responseInfo: { "201": { type: "object" }, default: { type: "void" } },
        },
      },
    },
  };
  const host: DataClientHost = {
    async getAppConnections() {
      return { agentnode: {
        apiId: connection.apiId,
        connectionId: connection.connectionId,
        runtimeUrl: "https://example.environment.api.powerplatform.com/connectors/runtime/apis/agentnode",
      } };
    },
    sendHttpRequest(params) {
      return completeAgentRequest(async current => {
        calls.push(current);
        assert.deepEqual(current.context?.connection, connection);
        if (current.method === "GET") return current.url.includes(followUpId)
          ? response(200, { conversationId: id, status: "Completed", result: "A continued answer" })
          : answer;
        const url = new URL(current.url);
        url.pathname += `/${current.headers?.["x-ms-conversation-id"] ? followUpId : id}`;
        url.searchParams.set("goodUntil", "opaque+expiry==");
        return pending({ Location: url.href });
      }, params, undefined, timer.value);
    },
    trackEvent(name) { assert.fail(`Unexpected SDK telemetry error: ${name}`); },
  };
  const client = createDataClient({ host, dataSourcesInfo });
  const connector: CopilotConnector = {
    InvokeAgent(body, conversationId, environmentId) {
      return client.executeAsync({
        connectorOperation: {
          tableName: "agentnode", operationName: "InvokeAgent",
          parameters: { body, "x-ms-conversation-id": conversationId, environmentId },
        },
      });
    },
  };
  const session = new AgentSession({ environmentId: id, schemaName: "contoso_friendlyAgent" }, connector);
  assert.deepEqual(await session.send("Hello"), ["A real answer"]);
  assert.deepEqual(await session.send("Follow-up"), ["A continued answer"]);
  assert.deepEqual(calls.map(call => call.method), ["POST", "GET", "POST", "GET"]);
  assert.equal(calls[0].headers?.["x-ms-conversation-id"], undefined);
  assert.equal(calls[2].headers?.["x-ms-conversation-id"], id);
  assert.deepEqual(JSON.parse(calls[2].body!), { agentId: "contoso_friendlyAgent", prompt: "Follow-up" });
  assert.equal(new URL(calls[1].url).pathname.endsWith(`/${id}`), true);
  assert.equal(new URL(calls[3].url).pathname.endsWith(`/${followUpId}`), true);
  for (const call of calls) assert.equal(new URL(call.url).searchParams.get("environmentId"), id);
  assert.equal(dataSourcesInfo.agentnode.apis.GetConversationStatus, undefined);
});
