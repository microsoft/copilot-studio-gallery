export interface AgentConfig { environmentId: string; schemaName: string }

type SelectionStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
type StorageAccess = () => SelectionStorage;
const selectionKey = "oddly.agent.v1";

export function validateConfig(config: AgentConfig): void {
  const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!guid.test(config.environmentId.replace(/^Default-/i, ""))) throw new Error("Use the environment ID from your Copilot Studio URL, not a display name or full URL.");
  if (guid.test(config.schemaName) || config.schemaName === config.environmentId) throw new Error("Agent schema name must be the name from Settings > Agent details, not the environment ID or agent GUID.");
  if (!/^[a-zA-Z0-9_.-]{1,200}$/.test(config.schemaName)) throw new Error("Enter the agent schema name, not a URL or display name.");
}

export function sameAgent(first: AgentConfig, second: AgentConfig): boolean {
  return first.environmentId.toLowerCase() === second.environmentId.toLowerCase()
    && first.schemaName === second.schemaName;
}

export function readAgentSelection(storage: StorageAccess): { config: AgentConfig | null; notice: string } {
  try {
    const raw = storage().getItem(selectionKey);
    if (raw === null) return { config: null, notice: "" };
    const value: unknown = JSON.parse(raw);
    if (value === null || typeof value !== "object"
      || !("version" in value) || value.version !== 1
      || !("environmentId" in value) || typeof value.environmentId !== "string"
      || !("schemaName" in value) || typeof value.schemaName !== "string") {
      throw new Error("Invalid saved selection");
    }
    const config = { environmentId: value.environmentId, schemaName: value.schemaName };
    validateConfig(config);
    return { config, notice: "" };
  } catch {
    return { config: null, notice: "Your remembered agent could not be read. You can still select an agent for this visit." };
  }
}

export function rememberAgentSelection(storage: StorageAccess, config: AgentConfig): string {
  validateConfig(config);
  try {
    storage().setItem(selectionKey, JSON.stringify({
      version: 1, environmentId: config.environmentId, schemaName: config.schemaName,
    }));
    return "";
  } catch {
    return "Your browser could not remember this agent. It is selected for this visit only.";
  }
}

export function forgetAgentSelection(storage: StorageAccess): string {
  try {
    storage().removeItem(selectionKey);
    return "";
  } catch {
    return "Your browser could not clear the remembered agent. It may be selected again on your next visit.";
  }
}
