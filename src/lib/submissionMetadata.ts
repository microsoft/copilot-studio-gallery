import { z } from "astro/zod";

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
  "Agent Building",
  "Governance",
  "Other",
] as const;
export type Category = (typeof CATEGORIES)[number];
export const categorySchema = z.enum(CATEGORIES, {
  error: () => `category must be one of: ${CATEGORIES.join(", ")}. See submissions/README.md#choose-a-category, or leave category out.`,
}).optional();

export const HACKATHON_AWARDS = ["hacker", "winner"] as const;
export type HackathonAward = (typeof HACKATHON_AWARDS)[number];
export const hackathonSchema = z.enum(HACKATHON_AWARDS, {
  error: () => `hackathon must be one of: ${HACKATHON_AWARDS.join(", ")}`,
}).optional();

const githubHandleSchema = z.string().regex(/^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i);
const sourceNameSchema = z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,99}$/);
export const appSetupSchema = z.object({
  prerequisites: z.array(z.string().trim().min(1).max(500)).max(12).default([]),
  connectors: z.array(z.object({
    connector: z.string().regex(/^(?:shared_)?[a-z0-9_]{1,100}$/),
    mode: z.enum(["table", "action"]),
    dataSource: sourceNameSchema,
    table: z.string().trim().min(1).max(100).optional(),
    instructions: z.string().trim().min(1).max(1000),
    columns: z.array(z.object({
      name: sourceNameSchema,
      type: z.string().trim().min(1).max(100),
      description: z.string().trim().min(1).max(300),
    }).strict()).max(30).default([]),
  }).strict().refine((binding) => binding.mode === "table" || (!binding.table && binding.columns.length === 0), {
    message: "action connectors must not declare a table or columns",
  })).max(12).default([]),
}).strict();

export const screenshotSchema = z.object({
  path: z.string().regex(/^screenshots\/[a-z0-9][a-z0-9-]*\.png$/),
  alt: z.string().trim().min(1).max(240),
}).strict();

const supportingFilenamePattern = /^(?!(?:con|prn|aux|nul|com[1-9]|lpt[1-9])\.)[a-z0-9][a-z0-9-]*\.(?:csv|json|txt)$/;
export const supportingFileMetadataSchema = z.object({
  path: z.string().refine((path) => path.startsWith("supporting/") && supportingFilenamePattern.test(path.slice("supporting/".length)), {
    message: "supporting files must be named supporting/<lowercase-name>.csv, .json, or .txt",
  }),
  label: z.string().trim().min(1).max(100),
}).strict();
const supportingFilesMetadataSchema = z.array(supportingFileMetadataSchema).max(5).default([]).refine(
  (files) => new Set(files.map((file) => file.path)).size === files.length,
  { message: "supporting file paths must be unique" },
);
export const supportingFileSchema = supportingFileMetadataSchema.extend({
  path: z.string().regex(/^bundles\/[a-z0-9-]+\.(?:csv|json|txt)$/),
  filename: z.string().regex(supportingFilenamePattern),
  size: z.number().int().positive(),
});

export const authorSchema = z.object({
  name: z.string().trim().min(1),
  github: githubHandleSchema.optional(),
  url: z.url().optional(),
});

export const submissionMetadataFields = {
  submissionType: z.enum(["solution", "managed-app"]).default("solution"),
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
  app: appSetupSchema.optional(),
  screenshot: screenshotSchema.optional(),
  supportingFiles: supportingFilesMetadataSchema,
};

export const submissionMetadataSchema = z.object(submissionMetadataFields).strict()
  .superRefine((metadata, ctx) => {
    if (metadata.submissionType === "managed-app" && (!metadata.app || metadata.previewWorkflow)) {
      ctx.addIssue({ code: "custom", path: ["app"], message: "managed-app requires app setup metadata and must omit previewWorkflow" });
    }
    if (metadata.submissionType === "solution" && (metadata.app || metadata.screenshot)) {
      ctx.addIssue({ code: "custom", path: ["app"], message: "app and screenshot are only supported on managed-app submissions" });
    }
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

export type SubmissionMetadata = z.infer<typeof submissionMetadataSchema>;
export type Author = z.infer<typeof authorSchema>;

/** Text placed before the author at `index`: "A and B", "A, B, and C". */
export function authorSeparator(index: number, total: number): string {
  if (index === 0) return "";
  if (total === 2) return " and ";
  return index === total - 1 ? ", and " : ", ";
}

export function joinAuthorNames(authors: ReadonlyArray<Pick<Author, "name">>): string {
  return authors.map((author, index) => `${authorSeparator(index, authors.length)}${author.name}`).join("");
}
