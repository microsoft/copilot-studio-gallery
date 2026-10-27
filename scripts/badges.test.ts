import assert from "node:assert/strict";
import test from "node:test";
import { earnedContributorBadges, HATCHLING_BADGE, HOOK_BADGE, topHookSubmissionIds } from "../src/lib/badges";
import type { HackathonAward } from "../src/lib/schema";

const solution = (id: string, createdAt?: string, hackathon?: HackathonAward) => ({
  id,
  data: { name: id, createdAt, hackathon },
});
const noHookWinners = new Set<string>();

test("no published solutions means no badges", () => {
  assert.deepEqual(earnedContributorBadges([], noHookWinners), []);
});

test("a first contribution earns Hatchling without a hackathon award", () => {
  const first = solution("Hooks Lab", "2026-10-23");
  assert.deepEqual(earnedContributorBadges([first], noHookWinners), [{ badge: HATCHLING_BADGE, solution: first }]);
});

test("multiple contributions earn exactly one Hatchling linked to the earliest creation date", () => {
  const first = solution("Zulu", "2026-01-01");
  const recentlyUpdated = { ...first, data: { ...first.data, updatedAt: "2026-12-01" } };
  const solutions = [solution("Alpha", "2026-02-01"), solution("Undated"), recentlyUpdated];
  const original = [...solutions];
  assert.deepEqual(earnedContributorBadges(solutions, noHookWinners), [{ badge: HATCHLING_BADGE, solution: recentlyUpdated }]);
  assert.deepEqual(solutions, original);
});

test("missing and tied creation dates resolve consistently by name then ID", () => {
  assert.equal(earnedContributorBadges([solution("Zulu"), solution("Alpha")], noHookWinners)[0].solution.id, "Alpha");
  const a = { id: "a", data: { name: "Same", createdAt: "2026-01-01" } };
  const b = { id: "b", data: { name: "Same", createdAt: "2026-01-01" } };
  assert.equal(earnedContributorBadges([b, a], noHookWinners)[0].solution.id, "a");
});

test("Hatchling coexists with every solution award, best award first", () => {
  const solutions = [
    solution("B", "2026-02-01", "hacker"),
    solution("C", "2026-03-01", "winner"),
    solution("A", "2026-01-01", "hacker"),
  ];
  assert.deepEqual(
    earnedContributorBadges(solutions, noHookWinners).map(({ badge, solution }) => [badge.title, solution.id]),
    [
      ["Build-a-thon Winner", "C"],
      ["Agents & Workflows Hacker", "A"],
      ["Agents & Workflows Hacker", "B"],
      ["Copilot Studio Hatchling", "A"],
    ],
  );
});

const hooked = (id: string, hookCount: number) => ({ id, data: { name: id, hookCount } });

test("hooks leaderboard excludes zero hooks and handles fewer than three eligible submissions", () => {
  assert.deepEqual([...topHookSubmissionIds([])], []);
  assert.deepEqual([...topHookSubmissionIds([hooked("none", 0)])], []);
  assert.deepEqual([...topHookSubmissionIds([hooked("none", 0), hooked("only", 6)])], ["only"]);
  assert.deepEqual([...topHookSubmissionIds([hooked("two", 2), hooked("one", 1), hooked("zero", 0)])], ["two", "one"]);
});

test("hooks leaderboard selects the top three counts and includes cutoff ties", () => {
  const solutions = [hooked("low", 1), hooked("tied-a", 4), hooked("first", 6), hooked("second", 5), hooked("tied-b", 4)];
  const original = [...solutions];
  assert.deepEqual([...topHookSubmissionIds(solutions)].sort(), ["first", "second", "tied-a", "tied-b"]);
  assert.deepEqual(solutions, original);
  assert.equal(topHookSubmissionIds([...solutions, hooked("new", 7)]).has("tied-a"), false);
  assert.equal(topHookSubmissionIds([...solutions, hooked("new", 7)]).has("tied-b"), false);
});

test("each credited author gets the same qualifying solution badge, alongside Hatchling and hackathon awards", () => {
  const winner = { ...hooked("Shared", 6), data: { ...hooked("Shared", 6).data, hackathon: "winner" as const } };
  const lower = hooked("Lower", 1);
  const winners = topHookSubmissionIds([winner, hooked("Second", 5), hooked("Third", 4), lower]);
  const alice = earnedContributorBadges([winner, lower], winners);
  const bob = earnedContributorBadges([winner], winners);
  assert.equal(alice.filter(({ badge }) => badge === HOOK_BADGE).length, 1);
  assert.equal(bob.filter(({ badge }) => badge === HOOK_BADGE).length, 1);
  assert.deepEqual(alice.map(({ badge }) => badge.title), ["Build-a-thon Winner", HOOK_BADGE.title, HATCHLING_BADGE.title]);
  assert.equal(alice.find(({ badge }) => badge === HOOK_BADGE)?.solution.id, winner.id);
  assert.equal(earnedContributorBadges([lower], winners).some(({ badge }) => badge === HOOK_BADGE), false);
});

test("a contributor earns a hooks badge per qualifying solution, in stable name order", () => {
  const solutions = [hooked("Zulu", 6), hooked("Alpha", 4)];
  const badges = earnedContributorBadges(solutions, topHookSubmissionIds(solutions));
  assert.deepEqual(badges.filter(({ badge }) => badge === HOOK_BADGE).map(({ solution }) => solution.id), ["Alpha", "Zulu"]);
});
