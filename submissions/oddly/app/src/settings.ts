export interface AgentConfig { environmentId: string; schemaName: string }

export function validateConfig(config: AgentConfig): void {
  const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!guid.test(config.environmentId.replace(/^Default-/i, ""))) throw new Error("Use the environment ID from your Copilot Studio URL, not a display name or full URL.");
  if (guid.test(config.schemaName) || config.schemaName === config.environmentId) throw new Error("Agent schema name must be the name from Settings > Agent details, not the environment ID or agent GUID.");
  if (!/^[a-zA-Z0-9_.-]{1,200}$/.test(config.schemaName)) throw new Error("Enter the agent schema name, not a URL or display name.");
}
