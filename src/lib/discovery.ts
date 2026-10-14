import type { ComponentKind, SolutionInventory } from "./inventory";

export type SortMode = "newest" | "name";

export interface SortableSolution {
  name: string;
  updatedAt?: string;
  createdAt?: string;
}

export const CONTAINS_KINDS: readonly ComponentKind[] = ["mcp", "tool", "skill"];

export function parseSortMode(value: string | null | undefined): SortMode {
  return value === "name" ? "name" : "newest";
}

export function compareSolutionOrder(a: SortableSolution, b: SortableSolution, mode: SortMode): number {
  const byName = a.name.localeCompare(b.name);
  if (mode === "name") return byName;
  const updated = (solution: SortableSolution) => solution.updatedAt ?? solution.createdAt ?? "";
  return updated(b).localeCompare(updated(a)) || byName;
}

export function containedComponents(inventory: Pick<SolutionInventory, "tools" | "mcpServers" | "skills">): ComponentKind[] {
  const counts: Record<ComponentKind, number> = {
    mcp: inventory.mcpServers,
    tool: inventory.tools,
    skill: inventory.skills,
  };
  return CONTAINS_KINDS.filter((kind) => counts[kind] > 0);
}

export function containsEveryComponent(present: readonly string[], selected: Iterable<string>): boolean {
  return [...selected].every((kind) => present.includes(kind));
}
