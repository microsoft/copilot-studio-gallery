import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "astro/zod";
import { CATEGORIES, submissionMetadataFields } from "../src/lib/submissionMetadata";

export const METADATA_LABEL = "allow-metadata-changes";
export const SITE_LABEL = "allow-site-changes";
const metadataPaths = new Set([
  "src/lib/submissionMetadata.ts",
  "submissions/README.md",
  "submissions/_template/metadata.json",
]);
const generatedPattern = /^(?:src\/content\/(?:solutions|guides)|public\/bundles)\//;
const submissionPattern = /^submissions\/([a-z0-9]+(?:-[a-z0-9]+)*)\//;
const metadataKeys = new Set(Object.keys(submissionMetadataFields));
const objectSchema = z.record(z.string(), z.unknown());

export interface ChangedFile {
  filename: string;
  status: string;
  previous_filename?: string;
}

export interface MetadataChange {
  path: string;
  base?: Record<string, unknown>;
  head?: Record<string, unknown>;
}

export function checkContributionPolicy(
  files: ChangedFile[],
  labels: string[],
  metadata: MetadataChange[],
): string[] {
  const errors: string[] = [];
  const metadataAllowed = labels.includes(METADATA_LABEL);
  const siteAllowed = labels.includes(SITE_LABEL);
  const slugs = new Set<string>();
  const sites: string[] = [];
  const contracts: string[] = [];
  const generated: string[] = [];
  let payloadChanges = false;
  for (const file of files) {
    for (const path of [file.filename, file.previous_filename].filter((path): path is string => path !== undefined)) {
      if (metadataPaths.has(path)) {
        contracts.push(path);
      } else if (generatedPattern.test(path)) {
        generated.push(path);
      } else {
        const submission = submissionPattern.exec(path);
        if (submission) {
          slugs.add(submission[1]);
          if (!/^submissions\/[^/]+\/(?:metadata\.json|README\.md)$/.test(path)) payloadChanges = true;
        } else {
          sites.push(path);
        }
      }
    }
  }
  if (contracts.length && !metadataAllowed) {
    errors.push(`Metadata contract changes require the maintainer label ${METADATA_LABEL}: ${[...new Set(contracts)].join(", ")}`);
  }
  if (sites.length && !siteAllowed) {
    errors.push(`Site/repository changes require the maintainer label ${SITE_LABEL}: ${[...new Set(sites)].join(", ")}`);
  }
  if (slugs.size > 1 && !(payloadChanges ? siteAllowed : metadataAllowed)) {
    errors.push(`Keep ordinary submissions to one entry. Multi-entry maintenance requires ${payloadChanges ? SITE_LABEL : METADATA_LABEL}.`);
  }
  if (generated.length && slugs.size === 0) {
    errors.push("Generated output changes require corresponding submission source changes; do not hand-edit generated files.");
  }
  for (const { path, base, head } of metadata) {
    if (!head) continue;
    if (!metadataAllowed) {
      for (const key of ["featured", "hackathon"]) {
        const before = base?.[key] ?? (key === "featured" ? false : undefined);
        const after = head[key] ?? (key === "featured" ? false : undefined);
        if (before !== after) errors.push(`${path}: changing ${key} requires ${METADATA_LABEL}.`);
      }
      const unknown = Object.keys(head).filter((key) => !metadataKeys.has(key));
      if (unknown.length) errors.push(`${path}: unknown metadata fields (${unknown.join(", ")}) require a schema change and ${METADATA_LABEL}.`);
      if (head.category !== undefined && !CATEGORIES.some((category) => category === head.category)) {
        errors.push(`${path}: category must be an existing category (${CATEGORIES.join(", ")}). Taxonomy changes require ${METADATA_LABEL}.`);
      }
    }
  }
  return errors;
}

const shaSchema = z.string().regex(/^[a-f0-9]{40}$/);
const prSchema = z.object({
  state: z.literal("open"),
  changed_files: z.number().int().nonnegative().max(3000),
  labels: z.array(z.object({ name: z.string() })),
  base: z.object({ sha: shaSchema }),
  head: z.object({ sha: shaSchema }),
});
const filesSchema = z.array(z.object({
  filename: z.string().min(1),
  status: z.string(),
  previous_filename: z.string().optional(),
}));
const contentSchema = z.object({
  type: z.literal("file"),
  encoding: z.literal("base64"),
  size: z.number().int().nonnegative().max(512 * 1024),
  content: z.string().max(750_000),
});

export class GitHubPolicyApi {
  constructor(
    private readonly repo: string,
    private readonly token: string,
    private readonly apiUrl = "https://api.github.com",
    private readonly request: typeof fetch = fetch,
  ) {
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error("Invalid repository name");
  }

  async get(path: string, missingAllowed = false): Promise<unknown> {
    const response = await this.request(`${this.apiUrl}/repos/${this.repo}/${path}`, {
      headers: { Authorization: `Bearer ${this.token}`, Accept: "application/vnd.github+json" },
      redirect: "error",
    });
    if (missingAllowed && response.status === 404) return undefined;
    if (!response.ok) throw new Error(`GitHub API ${response.status} reading ${path}`);
    return response.json();
  }

  async metadata(path: string, sha: string): Promise<Record<string, unknown> | undefined> {
    shaSchema.parse(sha);
    const data = await this.get(`contents/${path.split("/").map(encodeURIComponent).join("/")}?ref=${sha}`, true);
    if (data === undefined) return undefined;
    const content = contentSchema.parse(data);
    const text = Buffer.from(content.content, "base64");
    if (text.length !== content.size) throw new Error(`Incomplete metadata content: ${path}`);
    return objectSchema.parse(JSON.parse(text.toString("utf8")));
  }
}

export async function inspectPullRequest(api: GitHubPolicyApi, number: number, expected?: { base: string; head: string }): Promise<string[]> {
  if (!Number.isSafeInteger(number) || number < 1) throw new Error("Invalid PR number");
  const pr = prSchema.parse(await api.get(`pulls/${number}`));
  if (expected && (pr.base.sha !== expected.base || pr.head.sha !== expected.head)) {
    throw new Error("PR base or head changed; rerun the policy check on the current revision.");
  }
  const files: ChangedFile[] = [];
  for (let page = 1; page <= 30; page++) {
    const batch = filesSchema.parse(await api.get(`pulls/${number}/files?per_page=100&page=${page}`));
    files.push(...batch);
    if (batch.length < 100) break;
  }
  if (files.length !== pr.changed_files) throw new Error("Incomplete PR file list; refusing to approve contribution scope.");
  const paths = new Set(files.flatMap((file) => [file.filename, file.previous_filename])
    .filter((path): path is string => path !== undefined && /^submissions\/[^/]+\/metadata\.json$/.test(path)));
  const metadata: MetadataChange[] = [];
  for (const path of paths) {
    const [base, head] = await Promise.all([api.metadata(path, pr.base.sha), api.metadata(path, pr.head.sha)]);
    if (!head && files.some((file) => file.filename === path && file.status !== "removed")) {
      throw new Error(`Missing changed head metadata: ${path}`);
    }
    metadata.push({ path, base, head });
  }
  const labels = pr.labels.map((label) => label.name).sort();
  const live = prSchema.parse(await api.get(`pulls/${number}`));
  if (live.base.sha !== pr.base.sha || live.head.sha !== pr.head.sha
    || JSON.stringify(live.labels.map((label) => label.name).sort()) !== JSON.stringify(labels)) {
    throw new Error("PR revisions or labels changed while checking; rerun the policy check.");
  }
  return checkContributionPolicy(files, labels, metadata);
}

async function main(): Promise<void> {
  const event = z.object({
    number: z.number().int().positive(),
    pull_request: z.object({ base: z.object({ sha: shaSchema }), head: z.object({ sha: shaSchema }) }),
  }).parse(JSON.parse(await readFile(requiredEnv("GITHUB_EVENT_PATH"), "utf8")));
  const api = new GitHubPolicyApi(requiredEnv("GITHUB_REPOSITORY"), requiredEnv("GH_TOKEN"), process.env.GITHUB_API_URL);
  const errors = await inspectPullRequest(api, event.number, {
    base: event.pull_request.base.sha, head: event.pull_request.head.sha,
  });
  if (errors.length) throw new Error(errors.join("\n"));
  console.log("Contribution scope and metadata policy passed.");
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
