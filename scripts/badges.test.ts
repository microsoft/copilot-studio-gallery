import assert from "node:assert/strict";
import test from "node:test";
import { earnedContributorBadges, HATCHLING_BADGE } from "../src/lib/badges";
import type { HackathonAward } from "../src/lib/schema";

const solution = (id: string, createdAt?: string, hackathon?: HackathonAward) => ({
  id,
  data: { name: id, createdAt, hackathon },
});

test("no published solutions means no badges", () => {
  assert.deepEqual(earnedContributorBadges([]), []);
});

test("a first contribution earns Hatchling without a hackathon award", () => {
  const first = solution("Hooks Lab", "2026-10-23");
  assert.deepEqual(earnedContributorBadges([first]), [{ badge: HATCHLING_BADGE, solution: first }]);
});

test("multiple contributions earn exactly one Hatchling linked to the earliest creation date", () => {
  const first = solution("Zulu", "2026-01-01");
  const recentlyUpdated = { ...first, data: { ...first.data, updatedAt: "2026-12-01" } };
  const solutions = [solution("Alpha", "2026-02-01"), solution("Undated"), recentlyUpdated];
  const original = [...solutions];
  assert.deepEqual(earnedContributorBadges(solutions), [{ badge: HATCHLING_BADGE, solution: recentlyUpdated }]);
  assert.deepEqual(solutions, original);
});

test("missing and tied creation dates resolve consistently by name then ID", () => {
  assert.equal(earnedContributorBadges([solution("Zulu"), solution("Alpha")])[0].solution.id, "Alpha");
  const a = { id: "a", data: { name: "Same", createdAt: "2026-01-01" } };
  const b = { id: "b", data: { name: "Same", createdAt: "2026-01-01" } };
  assert.equal(earnedContributorBadges([b, a])[0].solution.id, "a");
});

test("Hatchling coexists with every solution award, best award first", () => {
  const solutions = [
    solution("B", "2026-02-01", "hacker"),
    solution("C", "2026-03-01", "winner"),
    solution("A", "2026-01-01", "hacker"),
  ];
  assert.deepEqual(
    earnedContributorBadges(solutions).map(({ badge, solution }) => [badge.title, solution.id]),
    [
      ["Build-a-thon Winner", "C"],
      ["Agents & Workflows Hacker", "A"],
      ["Agents & Workflows Hacker", "B"],
      ["Copilot Studio Hatchling", "A"],
    ],
  );
});
