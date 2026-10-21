import { getCollection } from "astro:content";
import type { SolutionEntry } from "./catalog";
import { isDemo } from "./discovery";

/** Solutions shown on the site. Demo-tagged submissions stay in the repo but are hidden. */
export function getPublishedSolutions(): Promise<SolutionEntry[]> {
  return getCollection("solutions", (solution) => !isDemo(solution.data.tags));
}
