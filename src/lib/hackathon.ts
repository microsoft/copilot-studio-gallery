import type { HackathonAward } from "./schema";

export interface HackathonBadge {
  award: HackathonAward;
  title: string;
  /** Badge artwork, relative to /public. */
  image: string;
  meaning: string;
  rank: number;
}

export const HACKATHON_EVENT = "Copilot Studio Hackathon";

export const HACKATHON_BADGES: Record<HackathonAward, HackathonBadge> = {
  winner: {
    award: "winner",
    title: "Hackathon Winner",
    image: "badges/hackathon-winner.png",
    meaning: "Won the Copilot Studio agents & workflows hackathon.",
    rank: 2,
  },
  hacker: {
    award: "hacker",
    title: "Agents & Workflows Hacker",
    image: "badges/hackathon-hacker.png",
    meaning: "Built and shared a solution at the Copilot Studio agents & workflows hackathon.",
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
