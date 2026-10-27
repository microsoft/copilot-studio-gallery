import { earnedHackathonBadges, type HackathonBadge } from "./hackathon";
import type { HackathonAward } from "./schema";

type ContributorBadge = Pick<HackathonBadge, "title" | "image" | "meaning">;

export const HATCHLING_BADGE: ContributorBadge = {
  title: "Copilot Studio Hatchling",
  image: "badges/hatchling.png",
  meaning: "Cracked the shell, sparked an idea, and shared their first solution with the community. Every dragon starts somewhere.",
};

export const HOOK_BADGE: ContributorBadge = {
  title: "Hook, Line & Sinker",
  image: "badges/hook-line-sinker.png",
  meaning: "Hooked the agentic flow and reeled in a top-three spot for the most hooks in a published solution.",
};

/** Rank the entire published catalog, including ties at the third-place cutoff. */
export function topHookSubmissionIds(
  publishedSolutions: readonly { id: string; data: { hookCount: number } }[],
): ReadonlySet<string> {
  const ranked = publishedSolutions.filter((solution) => solution.data.hookCount > 0)
    .sort((a, b) => b.data.hookCount - a.data.hookCount);
  const cutoff = ranked.slice(0, 3).at(-1)?.data.hookCount;
  return new Set(ranked.filter((solution) => cutoff !== undefined && solution.data.hookCount >= cutoff).map((solution) => solution.id));
}

/** Call with a contributor's published solutions and the catalog-wide hooks leaderboard. */
export function earnedContributorBadges<T extends {
  id: string;
  data: { name: string; createdAt?: string; hackathon?: HackathonAward };
}>(solutions: readonly T[], hookWinners: ReadonlySet<string>): Array<{ badge: ContributorBadge; solution: T }> {
  const first = [...solutions].sort((a, b) =>
    (a.data.createdAt ?? "9999-12-31").localeCompare(b.data.createdAt ?? "9999-12-31")
    || a.data.name.localeCompare(b.data.name)
    || a.id.localeCompare(b.id),
  )[0];
  return [
    ...earnedHackathonBadges(solutions),
    ...solutions.filter((solution) => hookWinners.has(solution.id))
      .sort((a, b) => a.data.name.localeCompare(b.data.name) || a.id.localeCompare(b.id))
      .map((solution) => ({ badge: HOOK_BADGE, solution })),
    ...(first ? [{ badge: HATCHLING_BADGE, solution: first }] : []),
  ];
}
