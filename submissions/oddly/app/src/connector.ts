import type { CopilotConnector } from "./client";

// Recipients generate this client by binding their own native connector. An unbound checkout still builds.
const modules = import.meta.glob<Record<string, unknown>>(
  "../generated/services/MicrosoftCopilotStudioService.ts", { eager: true },
);

function isConnector(value: unknown): value is CopilotConnector {
  return (typeof value === "function" || (value !== null && typeof value === "object"))
    && "ExecuteCopilotAsyncV2" in value && typeof value.ExecuteCopilotAsyncV2 === "function";
}

export function loadConnector(): CopilotConnector {
  const connectors = Object.values(modules).flatMap(module => Object.values(module).filter(isConnector));
  if (connectors.length !== 1) throw new Error("The native Copilot Studio connector is not configured. Add microsoftcopilotstudio in action mode with the Managed Apps CLI, then restart or rebuild. Open the authenticated Local Play or hosted player, not bare localhost.");
  return connectors[0];
}
