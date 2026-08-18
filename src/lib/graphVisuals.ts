import type { GraphNode } from "./schema";

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

export function graphVisualKind(node: GraphNode): GraphVisualKind {
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
