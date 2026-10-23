import assert from "node:assert/strict";
import test from "node:test";
import { compareSolutionOrder, containedComponents, containsEveryComponent, isDemo, parseSortMode } from "../src/lib/discovery";
import { sharedMcpServers, solutionInventory } from "../src/lib/inventory";

test("sorts by newest using updated dates, creation dates, and name tie-breaks", () => {
  const solutions = [
    { name: "No date" },
    { name: "Older", createdAt: "2026-01-01" },
    { name: "Zulu", createdAt: "2026-03-01" },
    { name: "Alpha", createdAt: "2026-02-01", updatedAt: "2026-03-01" },
    { name: "Recently updated", createdAt: "2025-01-01", updatedAt: "2026-04-01" },
  ];
  assert.deepEqual(
    solutions.sort((a, b) => compareSolutionOrder(a, b, "newest")).map((solution) => solution.name),
    ["Recently updated", "Alpha", "Zulu", "Older", "No date"],
  );
  assert.ok(compareSolutionOrder({ name: "Alpha" }, { name: "Zulu" }, "newest") < 0);
});

test("name sorting ignores dates", () => {
  assert.ok(compareSolutionOrder({ name: "Alpha" }, { name: "Zulu", updatedAt: "2026-10-01" }, "name") < 0);
  assert.equal(compareSolutionOrder({ name: "Same" }, { name: "Same" }, "name"), 0);
});

test("demos sink to the bottom in every sort mode", () => {
  const solutions = [
    { name: "Alpha demo", createdAt: "2026-09-01", demo: true },
    { name: "Bravo", createdAt: "2026-01-01" },
    { name: "Charlie demo", createdAt: "2026-10-01", demo: true },
    { name: "Delta", createdAt: "2026-02-01" },
  ];
  assert.deepEqual(
    [...solutions].sort((a, b) => compareSolutionOrder(a, b, "newest")).map((solution) => solution.name),
    ["Delta", "Bravo", "Charlie demo", "Alpha demo"],
  );
  assert.deepEqual(
    [...solutions].sort((a, b) => compareSolutionOrder(a, b, "name")).map((solution) => solution.name),
    ["Bravo", "Delta", "Alpha demo", "Charlie demo"],
  );
});

test("isDemo matches the demo tag case-insensitively", () => {
  assert.equal(isDemo(["sales", "demo"]), true);
  assert.equal(isDemo(["Demo"]), true);
  assert.equal(isDemo(["sales", "demonstration"]), false);
  assert.equal(isDemo([]), false);
});

test("normalizes absent and invalid sort modes to featured", () => {
  assert.equal(parseSortMode("name"), "name");
  assert.equal(parseSortMode("newest"), "newest");
  for (const value of ["featured", "invalid", "", null, undefined]) {
    assert.equal(parseSortMode(value), "featured");
  }
});

test("featured sorting follows the launch order, then newest", () => {
  const solutions = [
    { name: "Unranked old", createdAt: "2026-01-01" },
    { name: "Second", rank: 1, createdAt: "2026-01-01" },
    { name: "Unranked new", createdAt: "2026-09-01" },
    { name: "First", rank: 0 },
  ];
  assert.deepEqual(
    [...solutions].sort((a, b) => compareSolutionOrder(a, b, "featured")).map((solution) => solution.name),
    ["First", "Second", "Unranked new", "Unranked old"],
  );
});

test("Contains uses positive inventory counts and keeps MCP servers separate from tools", () => {
  assert.deepEqual(containedComponents({ mcpServers: 0, tools: 0, skills: 0 }), []);
  assert.deepEqual(containedComponents({ mcpServers: 2, tools: 0, skills: 0 }), ["mcp"]);
  assert.deepEqual(containedComponents({ mcpServers: 2, tools: 1, skills: 3 }), ["mcp", "tool", "skill"]);
});

test("Contains requires every selected component type", () => {
  assert.equal(containsEveryComponent([], []), true);
  assert.equal(containsEveryComponent(["mcp"], ["mcp"]), true);
  assert.equal(containsEveryComponent(["mcp"], ["skill"]), false);
  assert.equal(containsEveryComponent(["mcp"], ["mcp", "skill"]), false);
  assert.equal(containsEveryComponent(["skill"], ["mcp", "skill"]), false);
  assert.equal(containsEveryComponent(["mcp", "skill"], new Set(["mcp", "skill"])), true);
  assert.equal(containsEveryComponent(["mcp", "skill"], ["mcp", "tool", "skill"]), false);
  assert.equal(containsEveryComponent(["mcp", "tool", "skill"], ["mcp", "tool", "skill"]), true);
  assert.equal(containsEveryComponent(["mcp", "tool", "skill"], ["unknown"]), false);
});

test("Contains aggregates components across agents in the same solution", () => {
  const inventory = solutionInventory({
    agents: ["first", "second"].map((id) => ({
      id,
      schemaName: id,
      name: id,
      channels: [],
      toolCount: id === "first" ? 1 : 0,
      skillCount: id === "second" ? 1 : 0,
      connectedAgentCount: 0,
    })),
    agentGraph: {
      nodes: [
        { id: "server", name: "MCP server", type: "tool", position: { x: 0, y: 0 }, details: {} },
        { id: "skill", name: "Research", type: "skill", position: { x: 0, y: 0 }, details: {} },
      ],
      edges: [
        { id: "first-server", source: "agent:first", target: "server" },
        { id: "second-skill", source: "agent:second", target: "skill" },
      ],
    },
    workflows: [],
  });
  assert.equal(containsEveryComponent(containedComponents(inventory), ["mcp", "skill"]), true);
  assert.equal(containsEveryComponent(containedComponents(inventory), ["tool"]), false);
});

test("counts MCP servers shipped as connectors once, without double-counting ones attached to agents", () => {
  const data = {
    workflows: [],
    agents: [{ id: "lead", schemaName: "lead_agent", name: "Lead", channels: [], toolCount: 1, skillCount: 0, connectedAgentCount: 0 }],
    agentGraph: {
      nodes: [
        { id: "agent:lead", name: "Lead", type: "agent", position: { x: 0, y: 0 }, details: {} },
        { id: "tool:orders", name: "Order Management MCP — Order Management MCP Server", type: "tool", position: { x: 0, y: 0 }, details: { description: "MCP server" } },
      ],
      edges: [{ id: "uses", source: "agent:lead", target: "tool:orders" }],
    },
    connectors: [
      { id: "orders", name: "Order Management MCP", mcp: true },
      { id: "warehouse", name: "Warehouse MCP", mcp: true },
      { id: "weather", name: "Weather API", mcp: false },
    ],
  };
  assert.deepEqual(sharedMcpServers(data).map((connector) => connector.name), ["Warehouse MCP"]);
  assert.equal(solutionInventory(data).mcpServers, 2);
  assert.equal(solutionInventory({ ...data, connectors: undefined }).mcpServers, 1);
});

test("hackathon badges list the best award first", async () => {
  const { earnedHackathonBadges } = await import("../src/lib/hackathon");
  const solution = (name: string, hackathon?: "hacker" | "winner") => ({ data: { name, hackathon } });
  const badges = earnedHackathonBadges([solution("B", "hacker"), solution("None"), solution("C", "winner"), solution("A", "hacker")]);
  assert.deepEqual(badges.map(({ badge, solution }) => `${badge.award}:${solution.data.name}`), ["winner:C", "hacker:A", "hacker:B"]);
});
