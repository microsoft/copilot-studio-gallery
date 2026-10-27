import { earnedHackathonBadges, type HackathonBadge } from "./hackathon";
import type { HackathonAward } from "./schema";

type ContributorBadge = Pick<HackathonBadge, "title" | "image" | "meaning">;

export const HATCHLING_BADGE: ContributorBadge = {
  title: "Copilot Studio Hatchling",
  image: "badges/hatchling.png",
  meaning: "Cracked the shell, sparked an idea, and shared their first solution with the community. Every dragon starts somewhere.",
};

/** Call with a contributor's published solutions; one Hatchling plus their solution awards. */
export function earnedContributorBadges<T extends {
  id: string;
  data: { name: string; createdAt?: string; hackathon?: HackathonAward };
}>(solutions: readonly T[]): Array<{ badge: ContributorBadge; solution: T }> {
  const first = [...solutions].sort((a, b) =>
    (a.data.createdAt ?? "9999-12-31").localeCompare(b.data.createdAt ?? "9999-12-31")
    || a.data.name.localeCompare(b.data.name)
    || a.id.localeCompare(b.id),
  )[0];
  return [
    ...earnedHackathonBadges(solutions),
    ...(first ? [{ badge: HATCHLING_BADGE, solution: first }] : []),
  ];
}
