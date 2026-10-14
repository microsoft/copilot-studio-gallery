import { useState } from "react";
import type { AgentProfile } from "../../lib/inventory";
import type { WorkflowPreview } from "../../lib/schema";
import { workflowMetadataNotice, workflowTriggerType } from "../../lib/workflowMetadata";
import GraphCanvas from "./GraphCanvas";

export default function WorkflowExplorer({ workflows, agents = [] }: { workflows: WorkflowPreview[]; agents?: AgentProfile[] }) {
  const [activeId, setActiveId] = useState(workflows[0]?.id ?? "");
  const active = workflows.find((workflow) => workflow.id === activeId) ?? workflows[0];

  if (!active) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-elevated px-6 py-14 text-center">
        <p className="font-semibold text-ink">No workflows in this solution</p>
        <p className="mt-2 text-sm text-muted">The agent architecture is still available in the Agents tab.</p>
      </div>
    );
  }

  const triggerType = workflowTriggerType(active);
  const metadataNotice = workflowMetadataNotice(active);

  return (
    <div>
      <div className="mb-3 space-y-2 rounded-[0.625rem] border border-border bg-surface p-3">
        {workflows.length > 1 ? (
          <label className="flex min-w-0 items-center gap-3">
            <span className="shrink-0 text-sm font-medium text-muted">
              Workflow
            </span>
            <select
              value={active.id}
              onChange={(event) => setActiveId(event.target.value)}
              className="min-w-0 flex-1 rounded-[0.625rem] border border-border bg-elevated px-3 py-2 text-sm font-semibold text-ink"
            >
              {workflows.map((workflow) => (
                <option value={workflow.id} key={workflow.id}>
                  {workflow.name}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <h3 className="break-words text-sm font-semibold text-ink">{active.name}</h3>
        )}
        <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted">
          {active.trigger && <span>Trigger: <strong className="text-ink">{active.trigger}</strong></span>}
          {triggerType && <span>Type: <strong className="text-ink">{triggerType}</strong></span>}
          <span>{active.nodeCount} steps</span>
          <span>{active.edgeCount} connections</span>
        </div>
        {metadataNotice && <p className="text-xs leading-relaxed text-muted">{metadataNotice}</p>}
      </div>
      <div className="overflow-hidden rounded-2xl border border-border bg-elevated card-shadow">
        <GraphCanvas graph={active.graph} label={`${active.name} workflow graph`} agents={agents} />
      </div>
    </div>
  );
}
