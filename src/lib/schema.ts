import { z } from "astro/zod";

// Fixed discovery categories: authored in metadata.json (one per solution) and validated here.
export const CATEGORIES = [
  "Customer service",
  "Sales & marketing",
  "IT & security",
  "Operations",
  "HR",
  "Finance",
  "Legal & compliance",
  "Productivity & knowledge",
] as const;

export type Category = (typeof CATEGORIES)[number];

// At most one category per solution: the main persona or business activity it serves. Tags carry everything else.
// Optional so submissions that predate categories still validate; uncategorized solutions simply skip the category filter.
const categorySchema = z.enum(CATEGORIES).optional();

export const submissionMetadataSchema = z.object({
  name: z.string().trim().min(1),
  description: z.string().trim().min(1).max(320),
  tags: z.array(z.string().trim().min(1).max(40)).min(1),
  category: categorySchema,
  author: z.string().trim().min(1),
  authorUrl: z.url().optional(),
  authorGithub: z
    .string()
    .regex(/^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i)
    .optional(),
  createdAt: z.iso.date().optional(),
  updatedAt: z.iso.date().optional(),
  featured: z.boolean().default(false),
});

export const graphPositionSchema = z.object({
  x: z.number(),
  y: z.number(),
});

export const graphNodeSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  position: graphPositionSchema,
  parentId: z.string().optional(),
  width: z.number().positive().optional(),
  height: z.number().positive().optional(),
  summary: z.string().optional(),
  details: z.record(z.string(), z.unknown()).default({}),
});

export const graphEdgeSchema = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  sourceHandle: z.string().optional(),
  targetHandle: z.string().optional(),
  label: z.string().optional(),
});

export const graphSchema = z.object({
  nodes: z.array(graphNodeSchema),
  edges: z.array(graphEdgeSchema),
});

export const agentSchema = z.object({
  id: z.string(),
  schemaName: z.string(),
  name: z.string(),
  model: z.string().optional(),
  instructions: z.string().optional(),
  channels: z.array(z.string()).default([]),
  toolCount: z.number().int().nonnegative(),
  skillCount: z.number().int().nonnegative(),
  connectedAgentCount: z.number().int().nonnegative(),
});

export const workflowSchema = z.object({
  id: z.string(),
  name: z.string(),
  trigger: z.string().optional(),
  nodeCount: z.number().int().nonnegative(),
  edgeCount: z.number().int().nonnegative(),
  graph: graphSchema,
});

export const fileSummarySchema = z.object({
  path: z.string(),
  category: z.string(),
  size: z.number().int().nonnegative(),
});

export const solutionSchema = z.object({
  name: z.string(),
  description: z.string(),
  tags: z.array(z.string()).min(1),
  category: categorySchema,
  author: z.string(),
  authorUrl: z.url().optional(),
  authorGithub: z.string().optional(),
  createdAt: z.iso.date().optional(),
  updatedAt: z.iso.date().optional(),
  featured: z.boolean().default(false),
  uniqueName: z.string(),
  version: z.string(),
  publisher: z.string().optional(),
  bundle: z.string(),
  agentCount: z.number().int().nonnegative(),
  workflowCount: z.number().int().nonnegative(),
  componentCount: z.number().int().nonnegative(),
  agents: z.array(agentSchema),
  agentGraph: graphSchema,
  workflows: z.array(workflowSchema),
  files: z.array(fileSummarySchema),
});

export type SubmissionMetadata = z.infer<typeof submissionMetadataSchema>;
export type GraphPosition = z.infer<typeof graphPositionSchema>;
export type GraphNode = z.infer<typeof graphNodeSchema>;
export type GraphEdge = z.infer<typeof graphEdgeSchema>;
export type GraphData = z.infer<typeof graphSchema>;
export type AgentPreview = z.infer<typeof agentSchema>;
export type WorkflowPreview = z.infer<typeof workflowSchema>;
export type FileSummary = z.infer<typeof fileSummarySchema>;
export type SolutionRecord = z.infer<typeof solutionSchema>;

export function authorKey(github: string | undefined, author: string): string {
  if (github) return github.toLowerCase();
  return author
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function solutionMakeup(agentCount: number, workflowCount: number): string {
  if (agentCount > 0 && workflowCount > 0) return "Agents + workflows";
  if (agentCount > 0) return "Agents";
  return "Workflows";
}
