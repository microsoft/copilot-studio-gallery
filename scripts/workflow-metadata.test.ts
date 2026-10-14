import assert from "node:assert/strict";
import test from "node:test";
import { normalizeWorkflowGraph } from "./import-submissions";
import { graphVisualKind } from "../src/lib/graphVisuals";
import { connectorName, triggerType, workflowConnectorNames, workflowMetadataNotice, workflowNodeMetadata, workflowTriggerType } from "../src/lib/workflowMetadata";
import type { GraphNode } from "../src/lib/schema";

function node(type: string, config: Record<string, unknown>, name = "Submitted step title"): GraphNode {
  return normalizeWorkflowGraph({
    nodes: [{ id: "step", type, name, data: { config } }],
    edges: [],
  }).nodes[0]!;
}

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

test("phone workflow summaries list distinct connector services without including triggers", () => {
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

test("explains missing metadata once per workflow without treating it as a service name", () => {
  const missing = { graph: { nodes: [node("start", {}), node("connector", {}), node("connector", {})], edges: [] } };
  assert.deepEqual(workflowConnectorNames(missing), []);
  assert.equal(workflowMetadataNotice(missing), "This export doesn't include the trigger type or some connector identities.");
  assert.equal(workflowMetadataNotice({ graph: { nodes: [node("start", {})], edges: [] } }), "This export doesn't include the trigger type.");
  assert.equal(workflowMetadataNotice({ graph: { nodes: [node("start", { triggerType: "connector" })], edges: [] } }), "Some connector identities aren't included in this export.");
  assert.equal(workflowMetadataNotice({ graph: { nodes: [node("start", { triggerType: "manual" }), node("connector", { apiName: "shared_teams" })], edges: [] } }), undefined);
});
