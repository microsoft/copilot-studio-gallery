import assert from "node:assert/strict";
import test from "node:test";
import { normalizeWorkflowGraph } from "./import-submissions";
import { graphVisualKind } from "../src/lib/graphVisuals";
import { workflowAgentCalls, type AgentProfile } from "../src/lib/inventory";
import { connectorName, resolvePreviewWorkflow, triggerType, workflowConnectorNames, workflowMetadataNotice, workflowNodeMetadata, workflowTriggerType } from "../src/lib/workflowMetadata";
import type { GraphNode, WorkflowPreview } from "../src/lib/schema";

function node(type: string, config: Record<string, unknown>, name = "Submitted step title"): GraphNode {
  return normalizeWorkflowGraph({
    nodes: [{ id: "step", type, name, data: { config } }],
    edges: [],
  }).nodes[0]!;
}

test("requires an explicit hero for both single-workflow and multi-workflow solutions", () => {
  const workflows: WorkflowPreview[] = [
    { id: "one", name: "First", nodeCount: 0, edgeCount: 0, graph: { nodes: [], edges: [] } },
    { id: "two", name: "Second", nodeCount: 0, edgeCount: 0, graph: { nodes: [], edges: [] } },
  ];
  assert.throws(() => resolvePreviewWorkflow([workflows[0]!]), /previewWorkflow is required/);
  assert.throws(() => resolvePreviewWorkflow(workflows), /previewWorkflow is required/);
  assert.equal(resolvePreviewWorkflow(workflows, "two"), workflows[1]);
  assert.equal(resolvePreviewWorkflow(workflows, "Second"), workflows[1]);
  assert.equal(resolvePreviewWorkflow([]), undefined);
  assert.throws(() => resolvePreviewWorkflow(workflows, "missing"), /does not match/);
  assert.throws(() => resolvePreviewWorkflow([], "one"), /does not match/);
});

test("rejects ambiguous hero names and gives stable IDs precedence over names", () => {
  const first: WorkflowPreview = { id: "one", name: "Shared name", nodeCount: 0, edgeCount: 0, graph: { nodes: [], edges: [] } };
  const second = { ...first, id: "two" };
  assert.throws(() => resolvePreviewWorkflow([first, second], "Shared name"), /matches multiple/);
  assert.equal(resolvePreviewWorkflow([first, second], "two"), second);
  assert.equal(resolvePreviewWorkflow([first, { ...second, name: "one" }], "one"), first);
  assert.throws(() => resolvePreviewWorkflow([first, { ...second, id: "one" }], "one"), /matches multiple/);
});

test("identifies nested email trigger metadata without publishing connection payloads", () => {
  const trigger = node("start", {
    triggerType: "connector",
    connector: {
      apiName: "shared_office365",
      operationName: "OnNewEmailV3",
      displayName: "My renamed trigger",
      operationType: "OpenApiConnectionNotification",
      connectionName: "private-connection",
      inputs: { endpoint: "private-endpoint" },
      iconUri: "private-icon",
      outputSchema: { privateSchema: true },
      parametersSchema: { privateParameters: true },
    },
  });
  assert.deepEqual(trigger.details, {
    triggerType: "connector",
    apiName: "shared_office365",
    operationName: "OnNewEmailV3",
    displayName: "My renamed trigger",
    operationType: "OpenApiConnectionNotification",
  });
  assert.deepEqual(workflowNodeMetadata(trigger), { label: "Trigger type", value: "Email · Office 365 Outlook" });
  assert.equal(trigger.name, "Submitted step title");
  assert.equal(workflowTriggerType({ graph: { nodes: [trigger], edges: [] } }), "Email · Office 365 Outlook");
  assert.equal(JSON.stringify(trigger).includes("private-"), false);
});

test("keeps connector service separate from operation and submitted titles", () => {
  const connector = node("connector", { apiName: "shared_teams", displayName: "Reply", operationName: "postMessage" }, "Search knowledge");
  assert.equal(connectorName(connector), "Microsoft Teams");
  assert.deepEqual(workflowNodeMetadata(connector), { label: "Connector", value: "Microsoft Teams" });
  assert.equal(connector.name, "Search knowledge");
  assert.equal(connector.details.operationName, "postMessage");
  assert.equal(connectorName(node("connector", { apiName: "shared_vendor", connectorDisplayName: "Vendor service" })), "Vendor service");
  assert.equal(connectorName(node("connector", { apiName: "shared_vendor", displayName: "User title" })), "shared_vendor");
});

test("identifies HTTP, manual, and scheduled triggers from explicit metadata", () => {
  const http = node("start", { triggerType: "http", http: { method: "post", uri: "private-url", headers: { secret: true } } });
  assert.deepEqual(http.details, { triggerType: "http", method: "post" });
  assert.equal(triggerType(http), "HTTP · POST");
  assert.equal(triggerType(node("trigger", { method: "GET" })), "HTTP · GET");
  assert.equal(triggerType(node("start", { triggerType: "http" })), "HTTP");
  assert.equal(triggerType(node("start", { triggerType: "manual" })), "Manual");
  assert.equal(triggerType(node("start", { triggerType: "recurrence", frequency: "Week", interval: 1 })), "Scheduled");
  assert.equal(graphVisualKind(node("trigger", { method: "POST" })), "trigger");
});

test("does not mistake calendar connectors or generic connector operations for email triggers", () => {
  assert.equal(triggerType(node("start", {
    triggerType: "connector",
    connector: { apiName: "shared_office365", operationName: "OnNewCalendarEventV3" },
  })), "Connector · Office 365 Outlook");
  assert.equal(triggerType(node("start", {
    triggerType: "connector",
    connector: { apiName: "shared_vendor", operationName: "OnNewEmailV3" },
  })), "Connector · shared_vendor");
  assert.equal(triggerType(node("start", {
    triggerType: "connector",
    connector: { apiName: "/providers/Microsoft.PowerApps/apis/shared_office365", operationId: "OnNewEmailInSharedMailboxV2" },
  })), "Email · Office 365 Outlook");
});

test("does not infer missing connector and trigger types from user-authored names", () => {
  const connector = node("connector", { displayName: "Office 365 Outlook" }, "Search knowledge");
  const trigger = node("start", { displayName: "When a new email arrives", operationType: "trigger" }, "HTTP request");
  assert.deepEqual(workflowNodeMetadata(connector), { label: "Connector", value: undefined });
  assert.deepEqual(workflowNodeMetadata(trigger), { label: "Trigger type", value: undefined });
  assert.equal(triggerType(node("start", { triggerType: "connector" })), "Connector");
  assert.equal(triggerType(node("start", { triggerType: "future-event" })), "future-event");
  assert.equal(workflowNodeMetadata(node("agent", {})), undefined);
  assert.equal(workflowTriggerType({ graph: { nodes: [], edges: [] } }), undefined);
});

test("workflow summaries list distinct connector services without including triggers", () => {
  const graph = {
    nodes: [
      node("start", { triggerType: "manual" }),
      node("connector", { apiName: "shared_teams" }),
      node("connector", { apiName: "shared_teams" }),
      node("connector", {}),
    ],
    edges: [],
  };
  assert.deepEqual(workflowConnectorNames({ graph }), ["Microsoft Teams"]);
  assert.equal(workflowMetadataNotice({ graph }), "Some connector identities aren't included in this export.");
});

test("workflow summaries distinguish inline, classifier, and called agents using exported metadata", () => {
  const profiles: AgentProfile[] = [{
    schemaName: "support_agent", name: "Support Agent", channels: [], components: [], connectedAgents: [], counts: { mcp: 0, tool: 0, skill: 0 },
  }];
  const graph = {
    nodes: [
      node("start", { triggerType: "manual" }),
      node("connector", { apiName: "shared_teams" }, "Call an agent"),
      node("agent", { mode: "inline" }, "Extract"),
      node("classifyOnInlineAgent", {}, "Classify"),
      node("agent", { botSchemaName: "SUPPORT_AGENT" }, "Handle request"),
      node("agent", { botSchemaName: "external_agent" }, "Escalate"),
      node("agent", {}, "Unspecified agent"),
    ],
    edges: [],
  };
  assert.deepEqual(workflowAgentCalls({ graph }, profiles), [
    { name: "Extract", kind: "Inline agent" },
    { name: "Classify", kind: "Inline classifier" },
    { name: "Support Agent", kind: "Agent call" },
    { name: "external_agent", kind: "Agent call" },
    { name: "Unspecified agent", kind: "Agent call" },
  ]);
  assert.deepEqual(workflowAgentCalls({ graph: { nodes: [node("connector", {}, "Agent step")], edges: [] } }), []);
});

test("explains missing metadata once per workflow without treating it as a service name", () => {
  const missing = { graph: { nodes: [node("start", {}), node("connector", {}), node("connector", {})], edges: [] } };
  assert.deepEqual(workflowConnectorNames(missing), []);
  assert.equal(workflowMetadataNotice(missing), "This export doesn't include the trigger type or some connector identities.");
  assert.equal(workflowMetadataNotice({ graph: { nodes: [node("start", {})], edges: [] } }), "This export doesn't include the trigger type.");
  assert.equal(workflowMetadataNotice({ graph: { nodes: [node("start", { triggerType: "connector" })], edges: [] } }), "Some connector identities aren't included in this export.");
  assert.equal(workflowMetadataNotice({ graph: { nodes: [node("start", { triggerType: "manual" }), node("connector", { apiName: "shared_teams" })], edges: [] } }), undefined);
});
