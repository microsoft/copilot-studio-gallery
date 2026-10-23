import { z } from "astro/zod";

// Fixed discovery categories: authored in metadata.json (one per solution) and validated here.
export const CATEGORIES = [
  "Customer service",
  "Sales & marketing",
  "IT & security",
  "Operations",
  "Project & communications management",
  "HR",
  "Finance",
  "Legal & compliance",
  "Productivity & knowledge",
  // Catch-all until contributors can propose their own categories.
  "Other",
] as const;

export type Category = (typeof CATEGORIES)[number];

// At most one category per solution: the main persona or business activity it serves. Tags carry everything else.
// Optional so submissions that predate categories still validate; uncategorized solutions simply skip the category filter.
const categorySchema = z
  .enum(CATEGORIES, {
    error: () => `category must be one of: ${CATEGORIES.join(", ")}. See submissions/README.md#choose-a-category, or leave category out.`,
  })
  .optional();

// Copilot Studio Hackathon recognition, set by maintainers during review.
export const HACKATHON_AWARDS = ["hacker", "winner"] as const;
export type HackathonAward = (typeof HACKATHON_AWARDS)[number];
const hackathonSchema = z
  .enum(HACKATHON_AWARDS, { error: () => `hackathon must be one of: ${HACKATHON_AWARDS.join(", ")}` })
  .optional();

const githubHandleSchema = z.string().regex(/^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i);

export const authorSchema = z.object({
  name: z.string().trim().min(1),
  github: githubHandleSchema.optional(),
  url: z.url().optional(),
});

// Submissions credit either one person (author + optional authorGithub/authorUrl) or several (authors).
// Both forms normalize to `authors`, with `author` kept as the joined display line.
export const submissionMetadataSchema = z
  .object({
    name: z.string().trim().min(1),
    description: z.string().trim().min(1).max(320),
    tags: z.array(z.string().trim().min(1).max(40)).min(1),
    category: categorySchema,
    author: z.string().trim().min(1).optional(),
    authorUrl: z.url().optional(),
    authorGithub: githubHandleSchema.optional(),
    authors: z.array(authorSchema).min(1).optional(),
    createdAt: z.iso.date().optional(),
    updatedAt: z.iso.date().optional(),
    featured: z.boolean().default(false),
    hackathon: hackathonSchema,
    previewWorkflow: z.string().trim().min(1).optional(),
  })
  .superRefine((metadata, ctx) => {
    if (metadata.authors && (metadata.author || metadata.authorUrl || metadata.authorGithub)) {
      ctx.addIssue({ code: "custom", path: ["authors"], message: "use either authors, or author with authorUrl/authorGithub, not both" });
    }
    if (!metadata.authors && !metadata.author) {
      ctx.addIssue({ code: "custom", path: ["author"], message: "author or authors is required" });
    }
  })
  .transform(({ author, authorUrl, authorGithub, authors, ...rest }) => {
    const credited = authors ?? [{ name: author!, ...(authorGithub ? { github: authorGithub } : {}), ...(authorUrl ? { url: authorUrl } : {}) }];
    return { ...rest, author: joinAuthorNames(credited), authors: credited };
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

export const solutionSchema = z.object({
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
  agentCount: z.number().int().nonnegative(),
  workflowCount: z.number().int().nonnegative(),
  componentCount: z.number().int().nonnegative(),
  agents: z.array(agentSchema),
  agentGraph: graphSchema,
  workflows: z.array(workflowSchema),
  connectors: z.array(connectorSchema).default([]),
  files: z.array(fileSummarySchema),
}).refine((solution) => solution.workflows.length === 0 || solution.previewWorkflow !== undefined, {
  path: ["previewWorkflow"],
  message: "previewWorkflow is required when the solution contains workflows",
}).refine((solution) => solution.previewWorkflow === undefined || solution.workflows.some((workflow) => workflow.id === solution.previewWorkflow), {
  path: ["previewWorkflow"],
  message: "previewWorkflow must identify a workflow in this solution",
});

export type SubmissionMetadata = z.infer<typeof submissionMetadataSchema>;
export type Author = z.infer<typeof authorSchema>;
export type GraphPosition = z.infer<typeof graphPositionSchema>;
export type GraphNode = z.infer<typeof graphNodeSchema>;
export type GraphEdge = z.infer<typeof graphEdgeSchema>;
export type GraphData = z.infer<typeof graphSchema>;
export type AgentPreview = z.infer<typeof agentSchema>;
export type WorkflowPreview = z.infer<typeof workflowSchema>;
export type FileSummary = z.infer<typeof fileSummarySchema>;
export type ConnectorPreview = z.infer<typeof connectorSchema>;
export type SolutionRecord = z.infer<typeof solutionSchema>;

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

/** Text placed before the author at `index`: "A and B", "A, B, and C". */
export function authorSeparator(index: number, total: number): string {
  if (index === 0) return "";
  if (total === 2) return " and ";
  return index === total - 1 ? ", and " : ", ";
}

export function joinAuthorNames(authors: ReadonlyArray<Pick<Author, "name">>): string {
  return authors.map((author, index) => `${authorSeparator(index, authors.length)}${author.name}`).join("");
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
