import type { GraphNode, WorkflowPreview } from "./schema";

const CONNECTOR_NAMES: Record<string, string> = {
  shared_office365: "Office 365 Outlook",
  shared_outlook: "Outlook.com",
  shared_gmail: "Gmail",
  shared_teams: "Microsoft Teams",
  shared_sharepointonline: "SharePoint",
  shared_commondataserviceforapps: "Microsoft Dataverse",
  shared_approvals: "Approvals",
  shared_advancedapprovals: "Human review",
};
const EMAIL_APIS = new Set(["shared_office365", "shared_outlook", "shared_gmail"]);
const EMAIL_OPERATIONS = new Set([
  "onnewemail", "onnewemailv2", "onnewemailv3",
  "onnewemailinsharedmailbox", "onnewemailinsharedmailboxv2",
  "onflaggedemail", "onflaggedemailv2", "onflaggedemailv3",
]);
const HTTP_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]);

function detail(node: GraphNode, key: string): string | undefined {
  const value = node.details[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function apiName(node: GraphNode): string | undefined {
  return detail(node, "apiName")?.split("/").filter(Boolean).at(-1);
}

export function isWorkflowTrigger(node: GraphNode): boolean {
  return node.type.toLowerCase() === "start" || /trigger/i.test(node.type);
}

export function isWorkflowConnector(node: GraphNode): boolean {
  return !isWorkflowTrigger(node) && /connector|openapi/i.test(node.type);
}

export function connectorName(node: GraphNode): string | undefined {
  const api = apiName(node);
  return detail(node, "connectorDisplayName")
    ?? detail(node, "apiDisplayName")
    ?? (api ? CONNECTOR_NAMES[api.toLowerCase()] ?? api : undefined);
}

export function triggerType(node: GraphNode): string | undefined {
  const type = detail(node, "triggerType");
  const method = detail(node, "method")?.toUpperCase();
  const service = connectorName(node);
  const operation = (detail(node, "operationName") ?? detail(node, "operationId"))?.toLowerCase();
  if (type?.toLowerCase() === "email" || (
    EMAIL_APIS.has(apiName(node)?.toLowerCase() ?? "") && EMAIL_OPERATIONS.has(operation ?? "")
  )) {
    return service ? `Email · ${service}` : "Email";
  }
  if (type?.toLowerCase() === "manual") return "Manual";
  if (["recurrence", "schedule", "scheduled"].includes(type?.toLowerCase() ?? "")) return "Scheduled";
  if (type?.toLowerCase() === "http" || (!type && method && HTTP_METHODS.has(method))) {
    return method && HTTP_METHODS.has(method) ? `HTTP · ${method}` : "HTTP";
  }
  if (service) return `Connector · ${service}`;
  if (type?.toLowerCase() === "connector") return "Connector";
  return type;
}

export function workflowNodeMetadata(node: GraphNode): { label: string; value: string | undefined } | undefined {
  if (isWorkflowTrigger(node)) return { label: "Trigger type", value: triggerType(node) };
  if (isWorkflowConnector(node)) return { label: "Connector", value: connectorName(node) };
  return undefined;
}

export function workflowTriggerType(workflow: Pick<WorkflowPreview, "graph">): string | undefined {
  const trigger = workflow.graph.nodes.find(isWorkflowTrigger);
  return trigger ? triggerType(trigger) : undefined;
}

export function workflowConnectorNames(workflow: Pick<WorkflowPreview, "graph">): string[] {
  return [...new Set(workflow.graph.nodes.filter(isWorkflowConnector).flatMap((node) => {
    const name = connectorName(node);
    return name ? [name] : [];
  }))];
}

export function workflowMetadataNotice(workflow: Pick<WorkflowPreview, "graph">): string | undefined {
  const missingTrigger = !workflowTriggerType(workflow);
  const missingConnector = workflow.graph.nodes.some((node) => {
    const usesConnector = isWorkflowConnector(node)
      || (isWorkflowTrigger(node) && detail(node, "triggerType")?.toLowerCase() === "connector");
    return usesConnector && !connectorName(node);
  });
  if (missingTrigger && missingConnector) return "This export doesn't include the trigger type or some connector identities.";
  if (missingTrigger) return "This export doesn't include the trigger type.";
  if (missingConnector) return "Some connector identities aren't included in this export.";
  return undefined;
}
