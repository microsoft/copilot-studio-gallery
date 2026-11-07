import { createHash } from "node:crypto";
import { readFile, readdir, lstat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";
import { z } from "astro/zod";
import {
  DOWNLOAD_BRANCH, DOWNLOAD_REPOSITORY, downloadSnapshotSchema, releaseDownloadUrl,
  type DownloadAsset, type DownloadSnapshot,
} from "../src/lib/downloads";
import { gallerySchema } from "../src/lib/schema";
import { isDemo } from "../src/lib/discovery";

const repoPath = `/repos/${DOWNLOAD_REPOSITORY}`;
const id = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const releaseSchema = z.object({
  id, tag_name: z.string(), draft: z.boolean(), published_at: z.iso.datetime().nullable(),
});
const assetSchema = z.object({
  id, name: z.string(), state: z.string(), size: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  browser_download_url: z.url(), digest: z.string().nullable().optional(),
  download_count: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
});
type Release = z.infer<typeof releaseSchema>;
type Asset = z.infer<typeof assetSchema>;
export interface Bundle { slug: string; hash: string; bytes: Buffer }

export class GitHubError extends Error {
  constructor(public readonly status: number, path: string) {
    super(`GitHub request failed (${status}): ${path}`);
  }
}

export class GitHub {
  private lastWrite = 0;
  constructor(
    private readonly token: string,
    private readonly fetcher: typeof fetch = fetch,
    private readonly pause: (ms: number) => Promise<void> = sleep,
  ) {}

  async request(path: string, method = "GET", body?: unknown, upload?: Buffer, accept = "application/vnd.github+json"): Promise<unknown> {
    const origin = upload ? "https://uploads.github.com" : "https://api.github.com";
    if (method !== "GET") {
      // Stay below GitHub's general 500 content-generating requests/hour limit.
      await this.pause(Math.max(0, 8000 - (Date.now() - this.lastWrite)));
      this.lastWrite = Date.now();
    }
    for (let attempt = 0; attempt < 3; attempt++) {
      const response = await this.fetcher(`${origin}${repoPath}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: accept,
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "copilot-studio-gallery-downloads",
          "Content-Type": upload ? "application/zip" : "application/json",
        },
        body: upload ? new Uint8Array(upload) : body === undefined ? undefined : JSON.stringify(body),
        redirect: "error",
        signal: AbortSignal.timeout(60_000),
      });
      if (response.ok) return response.status === 204 ? undefined : response.json();
      const retryAfter = Number(response.headers.get("retry-after"));
      const reset = Number(response.headers.get("x-ratelimit-reset")) * 1000 - Date.now();
      const delay = Math.max(1000 * 2 ** attempt, retryAfter * 1000,
        response.headers.get("x-ratelimit-remaining") === "0" ? reset : 0);
      const retryable = response.status >= 500 || response.status === 429
        || (response.status === 403 && (retryAfter > 0 || response.headers.get("x-ratelimit-remaining") === "0"));
      await response.body?.cancel();
      // Only reads are retried automatically; uncertain writes are reconciled on the next run.
      if (method !== "GET" || !retryable || attempt === 2 || delay > 60_000) {
        throw new GitHubError(response.status, path);
      }
      await this.pause(delay);
    }
    throw new Error("GitHub retry limit exceeded");
  }

  async list<T>(path: string, schema: z.ZodType<T>): Promise<T[]> {
    const result: T[] = [];
    for (let page = 1; ; page++) {
      const rows = z.array(schema).parse(await this.request(`${path}?per_page=100&page=${page}`));
      result.push(...rows);
      if (rows.length < 100) return result;
    }
  }

  async download(assetId: number): Promise<Buffer> {
    let url = `https://api.github.com${repoPath}/releases/assets/${assetId}`;
    for (let redirects = 0; redirects < 5; redirects++) {
      const parsed = new URL(url);
      const api = parsed.origin === "https://api.github.com";
      if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port
        || (!api && !["github.com", "release-assets.githubusercontent.com", "objects.githubusercontent.com"].includes(parsed.hostname))) {
        throw new Error("Unexpected release asset redirect host");
      }
      const response = await this.fetcher(url, {
        headers: api ? { Authorization: `Bearer ${this.token}`, Accept: "application/octet-stream" } : {},
        redirect: "manual", signal: AbortSignal.timeout(60_000),
      });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("location");
        await response.body?.cancel();
        if (!location) throw new Error("Release asset redirect has no location");
        const next = new URL(location, url);
        if (next.origin === "https://api.github.com") throw new Error("Unexpected redirect back to authenticated API");
        url = next.href;
        continue;
      }
      if (!response.ok) throw new GitHubError(response.status, `/releases/assets/${assetId}`);
      return Buffer.from(await response.arrayBuffer());
    }
    throw new Error("Too many release asset redirects");
  }
}

export async function readBundles(root: string): Promise<Bundle[]> {
  const directory = join(root, "src/content/solutions");
  const bundles: Bundle[] = [];
  for (const filename of (await readdir(directory)).filter((name) => name.endsWith(".json")).sort()) {
    if (!(await lstat(join(directory, filename))).isFile()) throw new Error(`Generated record must be a regular file: ${filename}`);
    const record = gallerySchema.parse(JSON.parse(await readFile(join(directory, filename), "utf8")));
    if (isDemo(record.tags)) continue;
    const slug = filename.slice(0, -5);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || !/^bundles\/[a-z0-9-]+\.zip$/.test(record.bundle)) {
      throw new Error(`Invalid generated bundle path: ${filename}`);
    }
    const path = join(root, "public", record.bundle);
    if (!(await lstat(path)).isFile()) throw new Error(`ZIP must be a regular file: ${slug}`);
    const bytes = await readFile(path);
    const hash = createHash("sha256").update(bytes).digest("hex");
    if (record.bundleSha256 !== hash) throw new Error(`Generated ZIP hash mismatch: ${slug}`);
    bundles.push({ slug, hash, bytes });
  }
  return bundles;
}

const emptySnapshot = (): DownloadSnapshot => ({
  schemaVersion: 1, collectedAt: "1970-01-01T00:00:00.000Z", assets: [],
});

export async function loadSnapshot(github: GitHub): Promise<{ snapshot: DownloadSnapshot; head?: string }> {
  let ref: unknown;
  try {
    ref = await github.request(`/git/ref/heads/${DOWNLOAD_BRANCH}`);
  } catch (error) {
    if (error instanceof GitHubError && error.status === 404) return { snapshot: emptySnapshot() };
    throw error;
  }
  const head = z.object({ object: z.object({ sha: z.string().regex(/^[a-f0-9]{40}$/) }) }).parse(ref).object.sha;
  const data = await github.request(`/contents/downloads.json?ref=${head}`, "GET", undefined, undefined, "application/vnd.github.raw+json");
  return { head, snapshot: downloadSnapshotSchema.parse(data) };
}

export async function saveSnapshot(github: GitHub, snapshot: DownloadSnapshot, head?: string): Promise<void> {
  const content = `${JSON.stringify(downloadSnapshotSchema.parse(snapshot), null, 2)}\n`;
  const base = head
    ? z.object({ tree: z.object({ sha: z.string() }) }).parse(await github.request(`/git/commits/${head}`)).tree.sha
    : undefined;
  const tree = z.object({ sha: z.string() }).parse(await github.request("/git/trees", "POST", {
    ...(base ? { base_tree: base } : {}),
    tree: [{ path: "downloads.json", mode: "100644", type: "blob", content }],
  }));
  const commit = z.object({ sha: z.string() }).parse(await github.request("/git/commits", "POST", {
    message: "chore: snapshot release ZIP downloads\n\nCo-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>",
    tree: tree.sha, parents: head ? [head] : [],
  }));
  // A concurrent writer makes this non-fast-forward update fail instead of losing history.
  if (head) await github.request(`/git/refs/heads/${DOWNLOAD_BRANCH}`, "PATCH", { sha: commit.sha, force: false });
  else await github.request("/git/refs", "POST", { ref: `refs/heads/${DOWNLOAD_BRANCH}`, sha: commit.sha });
}

async function verifyAsset(github: GitHub, asset: Asset, bundle: Bundle): Promise<void> {
  if (asset.state !== "uploaded" || asset.name !== `${bundle.slug}-${bundle.hash}.zip` || asset.size !== bundle.bytes.length) {
    throw new Error(`Release ZIP identity or size mismatch: ${bundle.slug}`);
  }
  const digest = asset.digest ?? `sha256:${createHash("sha256").update(await github.download(asset.id)).digest("hex")}`;
  if (digest !== `sha256:${bundle.hash}`) throw new Error(`Release ZIP digest mismatch: ${bundle.slug}`);
}

export async function publishBundles(github: GitHub, snapshot: DownloadSnapshot, bundles: Bundle[], sha: string): Promise<DownloadAsset[]> {
  if (!/^[a-f0-9]{40}$/.test(sha)) throw new Error("A trusted source commit SHA is required");
  const missing = bundles.filter((bundle) => !snapshot.assets.some((asset) => asset.slug === bundle.slug && asset.hash === bundle.hash));
  if (!missing.length) return [...snapshot.assets];
  const releases = await github.list("/releases", releaseSchema);
  const registered = [...snapshot.assets];
  for (let offset = 0; offset < missing.length; offset += 1000) {
    const batch = missing.slice(offset, offset + 1000);
    const tag = `gallery-bundles-${sha}-${offset / 1000 + 1}`;
    const matches = releases.filter((release) => release.tag_name === tag);
    if (matches.length > 1) throw new Error(`Duplicate release tag: ${tag}`);
    let release: Release = matches[0] ?? releaseSchema.parse(await github.request("/releases", "POST", {
      tag_name: tag, target_commitish: sha, name: `Gallery ZIPs ${sha.slice(0, 12)} (${offset / 1000 + 1})`,
      body: "Deterministic submission ZIPs. Review community source before importing or installing.",
      draft: true, make_latest: "false",
    }));
    const assets = await github.list(`/releases/${release.id}/assets`, assetSchema);
    const expected = new Set(batch.map((bundle) => `${bundle.slug}-${bundle.hash}.zip`));
    if (assets.some((asset) => !expected.has(asset.name))) throw new Error(`Unexpected asset in gallery release: ${tag}`);
    const verified: Asset[] = [];
    for (const bundle of batch) {
      const name = `${bundle.slug}-${bundle.hash}.zip`;
      const existing = assets.filter((asset) => asset.name === name);
      if (existing.length > 1) throw new Error(`Duplicate ZIP asset: ${name}`);
      let asset: Asset | undefined = existing[0];
      if (asset?.state === "starter" && asset.size === 0 && release.draft) {
        await github.request(`/releases/assets/${asset.id}`, "DELETE");
        asset = undefined;
      }
      if (!asset) {
        if (!release.draft) throw new Error(`Published release is missing ZIP: ${name}`);
        asset = assetSchema.parse(await github.request(`/releases/${release.id}/assets?name=${encodeURIComponent(name)}`, "POST", undefined, bundle.bytes));
      }
      await verifyAsset(github, asset, bundle);
      if (asset.browser_download_url !== releaseDownloadUrl(bundle.slug, bundle.hash, tag)) throw new Error(`Unexpected ZIP download URL: ${name}`);
      verified.push(asset);
    }
    if (release.draft) release = releaseSchema.parse(await github.request(`/releases/${release.id}`, "PATCH", { draft: false, make_latest: "false" }));
    if (release.draft || !release.published_at) throw new Error(`Release was not published: ${tag}`);
    for (const [index, bundle] of batch.entries()) {
      const asset = verified[index]!;
      registered.push({
        slug: bundle.slug, hash: bundle.hash, assetId: asset.id, releaseId: release.id, tag,
        url: asset.browser_download_url, size: asset.size, publishedAt: release.published_at, count: 0,
      });
    }
  }
  return registered;
}

export async function collectDownloads(github: GitHub, registered: DownloadAsset[], now = () => new Date()): Promise<DownloadSnapshot> {
  const assets: DownloadAsset[] = [];
  for (const releaseId of [...new Set(registered.map((asset) => asset.releaseId))]) {
    const release = releaseSchema.parse(await github.request(`/releases/${releaseId}`));
    if (release.draft || !release.published_at) throw new Error(`Registered release is not public: ${releaseId}`);
    const current = await github.list(`/releases/${releaseId}/assets`, assetSchema);
    for (const entry of registered.filter((asset) => asset.releaseId === releaseId)) {
      const matches = current.filter((asset) => asset.id === entry.assetId);
      const asset = matches[0];
      if (matches.length !== 1 || !asset || release.tag_name !== entry.tag
        || asset.state !== "uploaded" || asset.name !== `${entry.slug}-${entry.hash}.zip`
        || asset.size !== entry.size || asset.browser_download_url !== entry.url
        || (asset.digest != null && asset.digest !== `sha256:${entry.hash}`)) {
        throw new Error(`Registered release ZIP is missing or changed: ${entry.slug}/${entry.assetId}`);
      }
      if (asset.download_count < entry.count) throw new Error(`Release download counter decreased: ${entry.assetId}`);
      assets.push({ ...entry, count: asset.download_count });
    }
  }
  assets.sort((a, b) => a.slug.localeCompare(b.slug) || a.hash.localeCompare(b.hash));
  return downloadSnapshotSchema.parse({ schemaVersion: 1, collectedAt: now().toISOString(), assets });
}

async function main(): Promise<void> {
  const [mode, output] = process.argv.slice(2);
  if (!["publish", "collect"].includes(mode ?? "") || !output || process.argv.length !== 4) {
    throw new Error("Usage: release-downloads.ts <publish|collect> <snapshot-output-file>");
  }
  if (process.env.GITHUB_ACTIONS !== "true" || process.env.GITHUB_REPOSITORY !== DOWNLOAD_REPOSITORY
    || process.env.GITHUB_REF !== "refs/heads/main") throw new Error("Release operations require a trusted main workflow");
  const token = process.env.GH_TOKEN;
  if (!token) throw new Error("GH_TOKEN is required");
  const github = new GitHub(token);
  const { snapshot, head } = await loadSnapshot(github);
  if (mode === "collect" && !head) throw new Error("No published download registry; run the main deployment first");
  const registered = mode === "publish"
    ? await publishBundles(github, snapshot, await readBundles(process.cwd()), process.env.GITHUB_SHA ?? "")
    : snapshot.assets;
  const updated = await collectDownloads(github, registered);
  await saveSnapshot(github, updated, head);
  await writeFile(output, `${JSON.stringify(updated, null, 2)}\n`);
  console.log(`Saved complete snapshot of ${updated.assets.length} release ZIP versions.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
