import { isMcpNode } from "./graphVisuals";
import type { AgentPreview, GraphNode, SolutionRecord } from "./schema";

export type ComponentKind = "tool" | "mcp" | "skill";

export interface AgentComponent {
  id: string;
  kind: ComponentKind;
  name: string;
  description?: string;
}

export interface ConnectedAgentRef {
  name: string;
  schemaName?: string;
}

export interface AgentProfile {
  schemaName: string;
  name: string;
  model?: string;
  instructions?: string;
  channels: string[];
  components: AgentComponent[];
  connectedAgents: ConnectedAgentRef[];
  counts: Record<ComponentKind, number>;
}

export interface SolutionInventory {
  agents: number;
  workflows: number;
  tools: number;
  mcpServers: number;
  skills: number;
  /** Agent building blocks: tools + MCP servers + skills. Agents and workflows are counted separately. */
  components: number;
}

export const COMPONENT_LABELS: Record<ComponentKind, { singular: string; plural: string; inline: [string, string] }> = {
  tool: { singular: "Tool", plural: "Tools", inline: ["tool", "tools"] },
  mcp: { singular: "MCP server", plural: "MCP servers", inline: ["MCP server", "MCP servers"] },
  skill: { singular: "Skill", plural: "Skills", inline: ["skill", "skills"] },
};

export function countLabel(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function agentAnchor(schemaName: string): string {
  return `agent-${schemaName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}

export type BlockKind = "workflow" | "agent" | ComponentKind;
export type BlockCounts = Partial<Record<BlockKind, number>>;

export const BLOCK_KINDS: BlockKind[] = ["workflow", "agent", "mcp", "tool", "skill"];

export const BLOCK_LABELS: Record<BlockKind, [string, string]> = {
  workflow: ["workflow", "workflows"],
  agent: ["agent", "agents"],
  ...Object.fromEntries(Object.entries(COMPONENT_LABELS).map(([kind, labels]) => [kind, labels.inline])) as Record<ComponentKind, [string, string]>,
};

export function inventoryBlocks(inventory: SolutionInventory): BlockCounts {
  return {
    workflow: inventory.workflows,
    agent: inventory.agents,
    mcp: inventory.mcpServers,
    tool: inventory.tools,
    skill: inventory.skills,
  };
}

export interface AgentTeam {
  lead: AgentProfile;
  delegates: AgentProfile[];
  /** Delegation targets that are not agents in this solution. */
  external: ConnectedAgentRef[];
}

/** Groups agents one level deep: each lead with the solution agents it delegates to, plus standalone agents. */
export function agentTeams(profiles: AgentProfile[]): { teams: AgentTeam[]; standalone: AgentProfile[] } {
  const bySchema = new Map(profiles.map((profile) => [profile.schemaName.toLowerCase(), profile]));
  const delegated = new Set(
    profiles.flatMap((profile) => profile.connectedAgents.flatMap((connected) => (connected.schemaName ? [connected.schemaName.toLowerCase()] : []))),
  );
  const withDelegates = profiles.filter((profile) => profile.connectedAgents.length > 0);
  const topLevel = withDelegates.filter((profile) => !delegated.has(profile.schemaName.toLowerCase()));
  const placed = new Set<AgentProfile>();
  const teams: AgentTeam[] = [];
  for (const lead of topLevel.length ? topLevel : withDelegates.slice(0, 1)) {
    placed.add(lead);
    const delegates: AgentProfile[] = [];
    const external: ConnectedAgentRef[] = [];
    for (const connected of lead.connectedAgents) {
      const profile = connected.schemaName ? bySchema.get(connected.schemaName.toLowerCase()) : undefined;
      if (!profile) external.push(connected);
      else if (!placed.has(profile)) {
        placed.add(profile);
        delegates.push(profile);
      }
    }
    teams.push({ lead, delegates, external });
  }
  return { teams, standalone: profiles.filter((profile) => !placed.has(profile)) };
}

function componentKind(node: GraphNode): ComponentKind | undefined {
  if (node.type === "skill") return "skill";
  if (node.type === "tool" || node.type === "connector") return isMcpNode(node) ? "mcp" : "tool";
  return undefined;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

type AgentSource = Pick<SolutionRecord, "agents" | "agentGraph">;

/** One profile per solution agent, built from the agent graph so every count on the page shares a source. */
export function agentProfiles({ agents, agentGraph }: AgentSource): AgentProfile[] {
  const nodes = new Map(agentGraph.nodes.map((node) => [node.id, node]));
  const schemaById = new Map(agents.map((agent) => [`agent:${agent.id}`, agent.schemaName]));
  const profiles = agents.map((agent: AgentPreview) => {
    const nodeId = `agent:${agent.id}`;
    const components: AgentComponent[] = [];
    const connectedAgents: ConnectedAgentRef[] = [];
    for (const edge of agentGraph.edges) {
      if (edge.source !== nodeId) continue;
      const target = nodes.get(edge.target);
      if (!target) continue;
      if (target.type === "agent") {
        connectedAgents.push({ name: target.name, ...(schemaById.has(target.id) ? { schemaName: schemaById.get(target.id) } : {}) });
        continue;
      }
      const kind = componentKind(target);
      if (!kind) continue;
      const description = text(target.summary) ?? text(target.details.description);
      components.push({ id: target.id, kind, name: target.name, ...(description ? { description } : {}) });
    }
    const order: ComponentKind[] = ["tool", "mcp", "skill"];
    components.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) || a.name.localeCompare(b.name));
    return {
      schemaName: agent.schemaName,
      name: agent.name,
      ...(agent.model ? { model: agent.model } : {}),
      ...(agent.instructions ? { instructions: agent.instructions } : {}),
      channels: agent.channels,
      components,
      connectedAgents,
      counts: {
        tool: components.filter((component) => component.kind === "tool").length,
        mcp: components.filter((component) => component.kind === "mcp").length,
        skill: components.filter((component) => component.kind === "skill").length,
      },
    };
  });
  // Orchestrators first so readers meet the entry point before its delegates.
  return profiles.sort((a, b) => Number(b.connectedAgents.length > 0) - Number(a.connectedAgents.length > 0));
}

export function solutionInventory(data: AgentSource & Pick<SolutionRecord, "workflows">): SolutionInventory {
  const totals = agentProfiles(data).reduce(
    (sum, profile) => ({
      tools: sum.tools + profile.counts.tool,
      mcpServers: sum.mcpServers + profile.counts.mcp,
      skills: sum.skills + profile.counts.skill,
    }),
    { tools: 0, mcpServers: 0, skills: 0 },
  );
  return {
    agents: data.agents.length,
    workflows: data.workflows.length,
    ...totals,
    components: totals.tools + totals.mcpServers + totals.skills,
  };
}

/** Matches a workflow agent step to the solution agent it invokes, if any. */
export function resolveWorkflowAgent(node: GraphNode, profiles: AgentProfile[]): AgentProfile | undefined {
  const schemaName = text(node.details.botSchemaName);
  if (!schemaName) return undefined;
  return profiles.find((profile) => profile.schemaName.toLowerCase() === schemaName.toLowerCase());
}

export function isAgentStep(node: GraphNode): boolean {
  return node.type === "agent" || node.type === "classifyOnInlineAgent";
}
