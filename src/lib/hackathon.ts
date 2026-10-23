import type { HackathonAward } from "./schema";

export interface HackathonBadge {
  award: HackathonAward;
  title: string;
  /** Badge artwork, relative to /public. */
  image: string;
  meaning: string;
  rank: number;
}

export const HACKATHON_EVENT = "PPCC Vegas 2026 Build-a-thon";

export const HACKATHON_BADGES: Record<HackathonAward, HackathonBadge> = {
  winner: {
    award: "winner",
    title: "Build-a-thon Winner",
    image: "badges/hackathon-winner.png",
    meaning: "Beat the odds at the PPCC Vegas 2026 Build-a-thon. This time, the house lost.",
    rank: 2,
  },
  hacker: {
    award: "hacker",
    title: "Agents & Workflows Hacker",
    image: "badges/hackathon-hacker.png",
    meaning: "Shipped agents & workflows at the PPCC Vegas 2026 Build-a-thon. What happens in Vegas gets published.",
    rank: 1,
  },
};

export interface EarnedBadge<T> {
  badge: HackathonBadge;
  solution: T;
}

/** One badge per awarded solution, best award first. */
export function earnedHackathonBadges<T extends { data: { name: string; hackathon?: HackathonAward } }>(
  solutions: readonly T[],
): EarnedBadge<T>[] {
  return solutions
    .flatMap((solution) => (solution.data.hackathon ? [{ badge: HACKATHON_BADGES[solution.data.hackathon], solution }] : []))
    .sort((a, b) => b.badge.rank - a.badge.rank || a.solution.data.name.localeCompare(b.solution.data.name));
}
