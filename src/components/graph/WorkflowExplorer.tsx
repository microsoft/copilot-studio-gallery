import { useState } from "react";
import type { WorkflowPreview } from "../../lib/schema";
import GraphCanvas from "./GraphCanvas";

export default function WorkflowExplorer({ workflows }: { workflows: WorkflowPreview[] }) {
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

  return (
    <div>
      <div className="mb-3 flex flex-col gap-3 rounded-[0.625rem] border border-border bg-surface p-3 sm:flex-row sm:items-center sm:justify-between">
        <label className="flex min-w-0 flex-1 items-center gap-3 overflow-hidden">
          <span className="shrink-0 font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-soft">
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
        <div className="flex shrink-0 flex-wrap gap-3 text-xs text-muted">
          {active.trigger && <span>Trigger: <strong className="text-ink">{active.trigger}</strong></span>}
          <span>{active.nodeCount} nodes</span>
          <span>{active.edgeCount} connections</span>
        </div>
      </div>
      <div className="overflow-hidden rounded-2xl border border-border bg-elevated card-shadow">
        <GraphCanvas graph={active.graph} label={`${active.name} workflow graph`} />
      </div>
    </div>
  );
}
