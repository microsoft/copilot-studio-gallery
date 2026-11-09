import { getCollection } from "astro:content";
import { readFile } from "node:fs/promises";
import type { SolutionEntry } from "./catalog";
import { isDemo } from "./discovery";
import { downloadSnapshotSchema, submissionDownload } from "./downloads";

/** Solutions shown on the site. Demo-tagged submissions stay in the repo but are hidden. */
export async function getPublishedSolutions(): Promise<SolutionEntry[]> {
  const solutions = await getCollection("solutions", (solution) => !isDemo(solution.data.tags));
  const path = process.env.GALLERY_DOWNLOAD_DATA;
  if (!path) {
    if (process.env.GALLERY_REQUIRE_RELEASES === "true") throw new Error("Production release download snapshot is required");
    return solutions;
  }
  const snapshot = downloadSnapshotSchema.parse(JSON.parse(await readFile(path, "utf8")));
  return solutions.map((solution) => ({
    ...solution,
    data: {
      ...solution.data,
      download: submissionDownload(snapshot, solution.id, solution.data.bundleSha256),
    },
  }));
}
