import { createDataClient } from "@microsoft/managed-apps-common/dataClient";
import type { DataSourcesInfo } from "@microsoft/managed-apps-common/dataClient";
import type { CopilotConnector } from "./client";
import { nativeHost } from "./runtime";

// Keep native binding metadata untouched. An unbound checkout still builds.
const modules = import.meta.glob<{ default: DataSourcesInfo }>(
  "../generated/dataSources.ts", { eager: true },
);

export function loadConnector(): CopilotConnector {
  const sources = Object.values(modules).map(module => module.default);
  if (sources.length !== 1 || !sources[0].agentnode?.apis.InvokeAgent) throw new Error("The native Agent Node connector is not configured. Add shared_agentnode in action mode with the Managed Apps CLI, then restart or rebuild. The generated dataSources metadata must expose InvokeAgent. Open the authenticated Local Play or hosted player, not bare localhost.");
  const dataSourcesInfo = sources[0];
  return {
    InvokeAgent(body, conversationId, environmentId, signal) {
      const client = createDataClient({ host: nativeHost(signal), dataSourcesInfo });
      return client.executeAsync({
        connectorOperation: {
          tableName: "agentnode",
          operationName: "InvokeAgent",
          parameters: { body, "x-ms-conversation-id": conversationId, environmentId },
        },
      });
    },
  };
}
