import { z } from "astro/zod";

export const DOWNLOAD_COUNTS_FILE = "download-counts.json";
export const DOWNLOAD_COUNTS_URL = `https://raw.githubusercontent.com/microsoft/copilot-studio-gallery/download-stats/${DOWNLOAD_COUNTS_FILE}`;
export const DOWNLOAD_COUNTS_MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000;

export const downloadCountsSchema = z.object({
  schemaVersion: z.literal(1),
  collectedAt: z.iso.datetime(),
  submissions: z.array(z.object({
    slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    count: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  }).strict()),
}).strict().superRefine((snapshot, ctx) => {
  const slugs = new Set<string>();
  for (const { slug } of snapshot.submissions) {
    if (slugs.has(slug)) ctx.addIssue({ code: "custom", message: "Duplicate submission slug" });
    slugs.add(slug);
  }
});

export type DownloadCounts = z.infer<typeof downloadCountsSchema>;

export function downloadCountExplanation(trackedSince: string, asOf: string): string {
  return `GitHub Release ZIP downloads across tracked versions since ${trackedSince.slice(0, 10)}. Last counted ${asOf}. Includes direct downloads, repeats, and automation; not installations.`;
}

export function refreshedDownloadCount(
  value: unknown, slug: string, previous: { count: number; asOf: string }, now = Date.now(),
): { count: number; asOf: string } {
  const snapshot = downloadCountsSchema.parse(value);
  const collected = Date.parse(snapshot.collectedAt);
  if (collected > now || now - collected > DOWNLOAD_COUNTS_MAX_AGE_MS) {
    throw new Error("Download count snapshot is future-dated or stale");
  }
  if (collected < Date.parse(previous.asOf)) throw new Error("Download count snapshot is older than the rendered metric");
  const entry = snapshot.submissions.find((submission) => submission.slug === slug);
  if (!entry) throw new Error("Download count snapshot is missing this submission");
  if (entry.count < previous.count) throw new Error("Download count total decreased");
  if (collected === Date.parse(previous.asOf) && entry.count !== previous.count) {
    throw new Error("Download count changed without a newer snapshot");
  }
  return { count: entry.count, asOf: snapshot.collectedAt };
}
