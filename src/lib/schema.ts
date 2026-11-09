import { z } from "astro/zod";
import { submissionDownloadSchema } from "./downloads";
import { appSetupSchema, authorSchema, categorySchema, hackathonSchema, supportingFileSchema, type Author } from "./submissionMetadata";
export * from "./submissionMetadata";

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

// Custom connectors shipped inside the solution package (for example, inline MCP servers shared by agents and workflows).
export const connectorSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  mcp: z.boolean(),
});

export const fileSummarySchema = z.object({
  path: z.string(),
  category: z.string(),
  size: z.number().int().nonnegative(),
});

const solutionBaseSchema = z.object({
  submissionType: z.literal("solution").default("solution"),
  name: z.string(),
  description: z.string(),
  tags: z.array(z.string()).min(1),
  category: categorySchema,
  author: z.string(),
  authors: z.array(authorSchema).min(1),
  createdAt: z.iso.date().optional(),
  updatedAt: z.iso.date().optional(),
  featured: z.boolean().default(false),
  hackathon: hackathonSchema,
  previewWorkflow: z.string().min(1).optional(),
  uniqueName: z.string(),
  version: z.string(),
  publisher: z.string().optional(),
  bundle: z.string(),
  bundleSha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  download: submissionDownloadSchema.optional(),
  agentCount: z.number().int().nonnegative(),
  workflowCount: z.number().int().nonnegative(),
  hookCount: z.number().int().nonnegative(),
  componentCount: z.number().int().nonnegative(),
  agents: z.array(agentSchema),
  agentGraph: graphSchema,
  workflows: z.array(workflowSchema),
  connectors: z.array(connectorSchema).default([]),
  files: z.array(fileSummarySchema),
  supportingFiles: z.array(supportingFileSchema).max(5).default([]),
});

export const solutionSchema = solutionBaseSchema.refine((solution) => solution.workflows.length === 0 || solution.previewWorkflow !== undefined, {
  path: ["previewWorkflow"],
  message: "previewWorkflow is required when the solution contains workflows",
}).refine((solution) => solution.previewWorkflow === undefined || solution.workflows.some((workflow) => workflow.id === solution.previewWorkflow), {
  path: ["previewWorkflow"],
  message: "previewWorkflow must identify a workflow in this solution",
});

export const managedAppSchema = solutionBaseSchema.pick({
  name: true, description: true, tags: true, category: true, author: true,
  authors: true, createdAt: true, updatedAt: true, featured: true,
  hackathon: true, version: true, bundle: true, bundleSha256: true, download: true, files: true, supportingFiles: true,
}).extend({
  submissionType: z.literal("managed-app"),
  app: appSetupSchema,
  template: z.string().regex(/^github:microsoft\/copilot-studio-gallery\/submissions\/[a-z0-9]+(?:-[a-z0-9]+)*\/app#main$/),
  screenshot: z.object({ path: z.string(), alt: z.string() }).optional(),
});

export const gallerySchema = z.union([solutionSchema, managedAppSchema]);

export type GraphPosition = z.infer<typeof graphPositionSchema>;
export type GraphNode = z.infer<typeof graphNodeSchema>;
export type GraphEdge = z.infer<typeof graphEdgeSchema>;
export type GraphData = z.infer<typeof graphSchema>;
export type AgentPreview = z.infer<typeof agentSchema>;
export type WorkflowPreview = z.infer<typeof workflowSchema>;
export type FileSummary = z.infer<typeof fileSummarySchema>;
export type ConnectorPreview = z.infer<typeof connectorSchema>;
export type SolutionRecord = z.infer<typeof solutionSchema>;
export type ManagedAppRecord = z.infer<typeof managedAppSchema>;
export type GalleryRecord = z.infer<typeof gallerySchema>;
export type AppSetup = z.infer<typeof appSetupSchema>;
export type SupportingFile = z.infer<typeof supportingFileSchema>;

export function isManagedApp(data: GalleryRecord): data is ManagedAppRecord {
  return data.submissionType === "managed-app";
}

export function submissionMakeup(data: GalleryRecord): string {
  return isManagedApp(data) ? "Apps" : solutionMakeup(data.agentCount, data.workflowCount);
}

export function authorKey(github: string | undefined, author: string): string {
  if (github) return github.toLowerCase();
  return author
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function contributorKey(author: Pick<Author, "name" | "github">): string {
  return authorKey(author.github, author.name);
}

export function authorInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter((word) => /^[A-Za-z]/.test(word))
    .slice(0, 2)
    .map((word) => word[0]!.toUpperCase())
    .join("");
}

export function solutionMakeup(agentCount: number, workflowCount: number): string {
  if (agentCount > 0 && workflowCount > 0) return "Agents + workflows";
  if (agentCount > 0) return "Agents";
  return "Workflows";
}
