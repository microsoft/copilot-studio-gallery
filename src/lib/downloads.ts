import { z } from "astro/zod";
import { downloadCountsSchema, type DownloadCounts } from "./download-counts";

export const DOWNLOAD_REPOSITORY = "microsoft/copilot-studio-gallery";
export const DOWNLOAD_BRANCH = "download-stats";
const hashSchema = z.string().regex(/^[a-f0-9]{64}$/);
const slugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const tagSchema = z.string().regex(/^gallery-bundles-[a-f0-9]{40}-[1-9]\d*$/);
const countSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const idSchema = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);

export function releaseDownloadUrl(slug: string, hash: string, tag: string): string {
  return `https://github.com/${DOWNLOAD_REPOSITORY}/releases/download/${tag}/${slug}-${hash}.zip`;
}

export const downloadAssetSchema = z.object({
  slug: slugSchema,
  hash: hashSchema,
  assetId: idSchema,
  releaseId: idSchema,
  tag: tagSchema,
  url: z.url(),
  size: idSchema,
  publishedAt: z.iso.datetime(),
  count: countSchema,
}).strict().refine((asset) => asset.url === releaseDownloadUrl(asset.slug, asset.hash, asset.tag), {
  message: "Release download URL must match its repository, tag, slug, and ZIP hash",
});

export const downloadSnapshotSchema = z.object({
  schemaVersion: z.literal(1),
  collectedAt: z.iso.datetime(),
  assets: z.array(downloadAssetSchema),
}).strict().superRefine((snapshot, ctx) => {
  const ids = new Set<number>();
  const versions = new Set<string>();
  const totals = new Map<string, number>();
  for (const asset of snapshot.assets) {
    const version = `${asset.slug}:${asset.hash}`;
    if (ids.has(asset.assetId) || versions.has(version)) {
      ctx.addIssue({ code: "custom", message: "Duplicate release asset ID or submission version" });
    }
    if (Date.parse(asset.publishedAt) > Date.parse(snapshot.collectedAt)) {
      ctx.addIssue({ code: "custom", message: "Asset publication cannot follow its count snapshot" });
    }
    ids.add(asset.assetId);
    versions.add(version);
    const total = (totals.get(asset.slug) ?? 0) + asset.count;
    if (!Number.isSafeInteger(total)) ctx.addIssue({ code: "custom", message: "Download total exceeds a safe integer" });
    totals.set(asset.slug, total);
  }
});

export const submissionDownloadSchema = z.object({
  url: z.url(),
  count: countSchema,
  asOf: z.iso.datetime(),
  trackedSince: z.iso.datetime(),
  source: z.literal("github-release-assets"),
}).strict();

export type DownloadAsset = z.infer<typeof downloadAssetSchema>;
export type DownloadSnapshot = z.infer<typeof downloadSnapshotSchema>;
export type SubmissionDownload = z.infer<typeof submissionDownloadSchema>;

export function projectDownloadCounts(snapshot: DownloadSnapshot): DownloadCounts {
  const validated = downloadSnapshotSchema.parse(snapshot);
  const totals = new Map<string, number>();
  for (const asset of validated.assets) totals.set(asset.slug, (totals.get(asset.slug) ?? 0) + asset.count);
  return downloadCountsSchema.parse({
    schemaVersion: 1,
    collectedAt: validated.collectedAt,
    submissions: [...totals].sort(([a], [b]) => a.localeCompare(b)).map(([slug, count]) => ({ slug, count })),
  });
}

export function submissionDownload(
  snapshot: DownloadSnapshot,
  slug: string,
  hash: string | undefined,
): SubmissionDownload {
  const assets = snapshot.assets.filter((asset) => asset.slug === slug);
  const current = assets.find((asset) => asset.hash === hash);
  if (!current) throw new Error(`No published release asset for current ZIP: ${slug}`);
  return submissionDownloadSchema.parse({
    url: current.url,
    count: assets.reduce((total, asset) => total + asset.count, 0),
    asOf: snapshot.collectedAt,
    trackedSince: assets.map((asset) => asset.publishedAt).sort((a, b) => Date.parse(a) - Date.parse(b))[0],
    source: "github-release-assets",
  });
}
