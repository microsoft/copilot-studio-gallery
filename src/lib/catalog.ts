import type { CollectionEntry } from "astro:content";
import { isDemo } from "./discovery";
import { launchRank } from "./launchOrder";
import { CATEGORIES, contributorKey, type Category } from "./schema";

export type SolutionEntry = CollectionEntry<"solutions">;

export interface ContributorSummary {
  key: string;
  name: string;
  github?: string;
  url?: string;
  count: number;
  agents: number;
  workflows: number;
  featured: number;
  latest?: string;
  solutions: SolutionEntry[];
}

export function collectCategories(solutions: SolutionEntry[]): Array<[Category, number]> {
  return CATEGORIES.map((category): [Category, number] => [
    category,
    solutions.filter((solution) => solution.data.category === category).length,
  ]);
}

/** Built by Microsoft first, demos last, then the launch order, newest, and name — the gallery's default order. */
export function compareSolutions(a: SolutionEntry, b: SolutionEntry): number {
  const updated = (entry: SolutionEntry) => entry.data.updatedAt ?? entry.data.createdAt ?? "";
  return Number(b.data.featured) - Number(a.data.featured)
    || Number(isDemo(a.data.tags)) - Number(isDemo(b.data.tags))
    || launchRank(a.id) - launchRank(b.id)
    || updated(b).localeCompare(updated(a))
    || a.data.name.localeCompare(b.data.name);
}

export function collectTags(solutions: SolutionEntry[]): Array<[string, number]> {
  const counts = new Map<string, number>();
  for (const solution of solutions) {
    for (const tag of solution.data.tags) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

export function collectContributors(solutions: SolutionEntry[]): ContributorSummary[] {
  const contributors = new Map<string, ContributorSummary>();
  for (const solution of solutions) {
    const updated = solution.data.updatedAt ?? solution.data.createdAt;
    for (const author of solution.data.authors) {
      const key = contributorKey(author);
      const existing = contributors.get(key);
      if (existing) {
        if (existing.solutions.includes(solution)) continue;
        existing.count += 1;
        existing.agents += solution.data.agentCount;
        existing.workflows += solution.data.workflowCount;
        existing.featured += solution.data.featured ? 1 : 0;
        if (updated && (!existing.latest || updated > existing.latest)) existing.latest = updated;
        if (!existing.github && author.github) existing.github = author.github;
        if (!existing.url && author.url) existing.url = author.url;
        existing.solutions.push(solution);
        continue;
      }
      contributors.set(key, {
        key,
        name: author.name,
        ...(author.github ? { github: author.github } : {}),
        ...(author.url ? { url: author.url } : {}),
        count: 1,
        agents: solution.data.agentCount,
        workflows: solution.data.workflowCount,
        featured: solution.data.featured ? 1 : 0,
        ...(updated ? { latest: updated } : {}),
        solutions: [solution],
      });
    }
  }

  return [...contributors.values()]
    .map((contributor) => ({
      ...contributor,
      solutions: contributor.solutions.sort((a, b) => a.data.name.localeCompare(b.data.name)),
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}
