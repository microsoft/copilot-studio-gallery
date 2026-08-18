import type { GraphNode } from "./schema";

// Icon-only mark from the official Model Context Protocol documentation logo.
export const MCP_ICON_PATHS = [
  "M25 97.8528L92.8823 29.9706C102.255 20.598 117.451 20.598 126.823 29.9706C136.196 39.3431 136.196 54.5391 126.823 63.9117L75.5581 115.177",
  "M76.2653 114.47L126.823 63.9117C136.196 54.5391 151.392 54.5391 160.765 63.9117L161.118 64.2652C170.491 73.6378 170.491 88.8338 161.118 98.2063L99.7248 159.6C96.6006 162.724 96.6006 167.789 99.7248 170.913L112.331 183.52",
  "M109.853 46.9411L59.6482 97.1457C50.2757 106.518 50.2757 121.714 59.6482 131.087C69.0208 140.459 84.2168 140.459 93.5894 131.087L143.794 80.8822",
] as const;

export type GraphVisualKind =
  | "trigger"
  | "ai"
  | "decision"
  | "loop"
  | "data"
  | "communication"
  | "approval"
  | "content"
  | "action"
  | "tool"
  | "mcp"
  | "connector"
  | "skill"
  | "end"
  | "note";

const KEYWORDS: Array<[GraphVisualKind, RegExp]> = [
  ["approval", /\b(approve|approval|human|review|escalat|decision)\b/i],
  ["communication", /\b(send|notify|message|email|post|channel|teams|welcome|inform|update)\b/i],
  ["content", /\b(draft|summar|extract|document|brief|report|article|content|response|narrat)\b/i],
  ["data", /\b(search|find|load|collect|get|fetch|query|telemetry|knowledge|research|crm|signal)\b/i],
  ["action", /\b(create|route|assign|open|close|provision|schedule|classify|validate|resolve|priorit)\b/i],
];

export function isMcpNode(node: GraphNode): boolean {
  if (node.type !== "tool" && node.type !== "connector") return false;
  const details = Object.values(node.details)
    .filter((value): value is string => typeof value === "string")
    .join(" ");
  return /\bmcp\b|model context protocol/i.test(`${node.name} ${node.summary ?? ""} ${details}`);
}

export function graphVisualKind(node: GraphNode): GraphVisualKind {
  if (isMcpNode(node)) return "mcp";
  switch (node.type) {
    case "start":
      return "trigger";
    case "end":
      return "end";
    case "agent":
    case "classifyOnInlineAgent":
      return "ai";
    case "ifElse":
      return "decision";
    case "loop":
      return "loop";
    case "variable":
    case "builtinFunction":
      return "data";
    case "tool":
      return "tool";
    case "connector":
      return "connector";
    case "skill":
      return "skill";
    case "canvasNote":
      return "note";
    default: {
      const text = `${node.name} ${node.summary ?? ""}`;
      return KEYWORDS.find(([, pattern]) => pattern.test(text))?.[0] ?? "action";
    }
  }
}

export function graphVisualColor(kind: GraphVisualKind): string {
  return `var(--graph-${kind})`;
}
