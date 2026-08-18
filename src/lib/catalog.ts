import type { CollectionEntry } from "astro:content";
import { authorKey } from "./schema";

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
    const key = authorKey(solution.data.authorGithub, solution.data.author);
    const existing = contributors.get(key);
    const updated = solution.data.updatedAt ?? solution.data.createdAt;
    if (existing) {
      existing.count += 1;
      existing.agents += solution.data.agentCount;
      existing.workflows += solution.data.workflowCount;
      existing.featured += solution.data.featured ? 1 : 0;
      if (updated && (!existing.latest || updated > existing.latest)) existing.latest = updated;
      existing.solutions.push(solution);
      continue;
    }
    contributors.set(key, {
      key,
      name: solution.data.author,
      ...(solution.data.authorGithub ? { github: solution.data.authorGithub } : {}),
      ...(solution.data.authorUrl ? { url: solution.data.authorUrl } : {}),
      count: 1,
      agents: solution.data.agentCount,
      workflows: solution.data.workflowCount,
      featured: solution.data.featured ? 1 : 0,
      ...(updated ? { latest: updated } : {}),
      solutions: [solution],
    });
  }

  return [...contributors.values()]
    .map((contributor) => ({
      ...contributor,
      solutions: contributor.solutions.sort((a, b) => a.data.name.localeCompare(b.data.name)),
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}
