import {
  Background,
  BaseEdge,
  EdgeLabelRenderer,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  getBezierPath,
  useReactFlow,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent } from "react";
import { graphVisualColor, graphVisualKind, isMcpNode, MCP_ICON_PATHS } from "../../lib/graphVisuals";
import {
  COMPONENT_LABELS,
  countLabel,
  isAgentStep,
  resolveWorkflowAgent,
  type AgentProfile,
  type ComponentKind,
} from "../../lib/inventory";
import type { GraphData, GraphNode } from "../../lib/schema";
import { isWorkflowTrigger, workflowNodeMetadata } from "../../lib/workflowMetadata";
import "./GraphCanvas.css";

type CatalogNodeData = {
  source: GraphNode;
  absolutePosition: { x: number; y: number };
  agent?: AgentProfile;
};

type CatalogNode = Node<CatalogNodeData, "catalog">;
// Designer positions are already ~300px apart; a light stretch keeps labels clear without shrinking the fitted view.
const WORKFLOW_LAYOUT_SCALE_X = 1.1;
const WORKFLOW_LAYOUT_SCALE_Y = 1.35;
const READABLE_ZOOM = 0.85;

const ICONS: Record<string, string> = {
  start: "IN",
  end: "OUT",
  ifElse: "IF",
  loop: "LP",
  variable: "VR",
  builtinFunction: "FN",
  classifyOnInlineAgent: "CL",
};

function GraphNodeIcon({ source }: { source: GraphNode }) {
  const { type } = source;
  if (isMcpNode(source)) {
    return (
      <svg viewBox="0 0 195 195" aria-hidden="true">
        {MCP_ICON_PATHS.map((path) => (
          <path key={path} d={path} fill="none" stroke="currentColor" strokeWidth="12" strokeLinecap="round" />
        ))}
      </svg>
    );
  }
  if (type === "agent" || type === "classifyOnInlineAgent") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 11H2v4h2M18 11h2v4h-2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <rect x="4" y="7" width="14" height="11" rx="4" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <rect x="7" y="10" width="8" height="5" rx="2.5" fill="currentColor" />
        <circle cx="9.5" cy="12.5" r="0.75" fill="var(--cp-surface)" />
        <circle cx="12.5" cy="12.5" r="0.75" fill="var(--cp-surface)" />
        <path d="m18.5 1 .8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8Z" fill="currentColor" />
      </svg>
    );
  }
  if (type === "tool" || type === "connector") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="2.5" y="8" width="7" height="8" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <rect x="14.5" y="8" width="7" height="8" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path d="M9.5 12h5M5 5.5V8m2.5-2.5V8M17 16v2.5m2.5-2.5v2.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }
  if (type === "skill") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="m12 2.5 8 4.6v9.8l-8 4.6-8-4.6V7.1l8-4.6Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="m12 7 .9 2.6 2.6.9-2.6.9L12 14l-.9-2.6-2.6-.9 2.6-.9L12 7Z" fill="currentColor" />
      </svg>
    );
  }
  return <>{ICONS[type] ?? type.slice(0, 2)}</>;
}

function agentStepLabel(source: GraphNode, agent: AgentProfile | undefined): string {
  if (agent) return `Agent · ${countLabel(agent.components.length, "component")}`;
  if (source.type === "classifyOnInlineAgent") return "Classifier";
  return source.details.mode === "inline" ? "Inline agent" : "Agent";
}

function CatalogNodeView({ data, selected }: NodeProps<CatalogNode>) {
  const source = data.source;
  const typeLabel = isAgentStep(source)
    ? agentStepLabel(source, data.agent)
    : isMcpNode(source) ? "MCP server" : isWorkflowTrigger(source) ? "Trigger" : humanize(source.type);
  const metadata = workflowNodeMetadata(source);
  const isContainer = source.width !== undefined && source.height !== undefined;
  return (
    <div
      className={`catalog-node${isContainer ? " catalog-node--container" : ""}`}
      data-kind={source.type}
      data-visual={graphVisualKind(source)}
      data-agent-step={isAgentStep(source) ? "true" : undefined}
      data-selected={selected ? "true" : "false"}
    >
      <Handle type="target" id="target-top" position={Position.Top} />
      <Handle type="target" id="target-right" position={Position.Right} />
      <Handle type="target" id="target-bottom" position={Position.Bottom} />
      <Handle type="target" id="target-left" position={Position.Left} />
      {isContainer && (
        <>
          <Handle type="target" id="external-input" position={Position.Left} />
          <Handle type="source" id="external-output" position={Position.Right} />
          <Handle type="source" id="internal-source" position={Position.Right} style={{ left: 16, right: "auto" }} />
          <Handle type="target" id="internal-target" position={Position.Left} style={{ left: "auto", right: 16 }} />
        </>
      )}
      <div className="catalog-node__body">
        <span className="catalog-node__icon" aria-hidden="true">
          <GraphNodeIcon source={source} />
        </span>
        <span className="catalog-node__copy">
          <span className="catalog-node__type">{typeLabel}</span>
          <span className="catalog-node__name">{source.name}</span>
          {metadata?.value && <span className="catalog-node__metadata">{metadata.value}</span>}
        </span>
      </div>
      <Handle type="source" id="source-top" position={Position.Top} />
      <Handle type="source" id="source-right" position={Position.Right} />
      <Handle type="source" id="source-bottom" position={Position.Bottom} />
      <Handle type="source" id="source-left" position={Position.Left} />
    </div>
  );
}

const nodeTypes = { catalog: CatalogNodeView };

type FlowEdgeData = { label?: string; color: string };
type FlowEdge = Edge<FlowEdgeData, "flow">;

/** Soft curved connector; its label is an HTML pill above every line so other connectors never cover it. */
function FlowEdgeView({ id, sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition, markerEnd, data }: EdgeProps<FlowEdge>) {
  const [path, labelX, labelY] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition, curvature: 0.3 });
  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} style={{ stroke: data?.color, strokeWidth: 1.6, strokeOpacity: 0.8 }} />
      {data?.label && (
        <EdgeLabelRenderer>
          <div
            className="flow-edge-label"
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`, "--edge-color": data.color } as CSSProperties}
          >
            {data.label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

const edgeTypes = { flow: FlowEdgeView };

const COMPONENT_ORDER: ComponentKind[] = ["tool", "mcp", "skill"];

function agentCountsSummary(agent: AgentProfile): string {
  const parts = COMPONENT_ORDER.map((kind) => countLabel(agent.counts[kind], ...COMPONENT_LABELS[kind].inline));
  if (agent.connectedAgents.length) parts.push(countLabel(agent.connectedAgents.length, "connected agent"));
  return parts.join(" · ");
}

/** Single-level agent summary: components and delegate names only, never the delegates' own components. */
function AgentComponentsSummary({ agent }: { agent: AgentProfile }) {
  return (
    <div className="agent-overlay">
      <p className="agent-overlay__counts">{agentCountsSummary(agent)}</p>
      {agent.components.length > 0 ? (
        <ul className="agent-overlay__list">
          {agent.components.map((component) => (
            <li key={component.id} data-kind={component.kind}>
              <span className="agent-overlay__kind">{COMPONENT_LABELS[component.kind].singular}</span>
              <span className="agent-overlay__name">{component.name}</span>
              {component.description && <span className="agent-overlay__description">{component.description}</span>}
            </li>
          ))}
        </ul>
      ) : (
        <p className="agent-overlay__empty">This agent has no tools, MCP servers, or skills.</p>
      )}
      {agent.connectedAgents.length > 0 && (
        <p className="agent-overlay__delegates">
          Delegates to {agent.connectedAgents.map((connected) => connected.name).join(", ")}
        </p>
      )}
    </div>
  );
}

function openAgentsTab(event: ReactMouseEvent<HTMLAnchorElement>, schemaName: string) {
  if (document.fullscreenElement) void document.exitFullscreen();
  event.preventDefault();
  window.dispatchEvent(new CustomEvent("gallery:show-agent", { detail: { schemaName } }));
}

function AgentStepDetails({ source, agent }: { source: GraphNode; agent?: AgentProfile }) {
  if (agent) {
    return (
      <>
        <div className="graph-detail__field">
          <dt>Invokes agent</dt>
          <dd>
            <strong className="text-ink">{agent.name}</strong>
          </dd>
        </div>
        <div className="graph-detail__field">
          <dt>Agent components</dt>
          <dd><AgentComponentsSummary agent={agent} /></dd>
        </div>
        <a className="graph-detail__link" href="#agents" onClick={(event) => openAgentsTab(event, agent.schemaName)}>
          View {agent.name} in the Agents tab →
        </a>
      </>
    );
  }
  if (source.type === "classifyOnInlineAgent") return null;
  return (
    <div className="graph-detail__field">
      <dt>Agent</dt>
      <dd>Inline agent defined in this workflow step. It has no separate agent components.</dd>
    </div>
  );
}

const AGENT_STEP_HIDDEN_DETAILS = new Set(["botSchemaName", "mode"]);

function humanize(value: string): string {
  return value
    .replace(/^category:/, "")
    .replace(/[-_]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .trim();
}

function displayValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    return value.map((item) => displayValue(item)).join("\n");
  }
  if (value && typeof value === "object") {
    return Object.entries(value)
      .map(([key, child]) => `${humanize(key)}: ${displayValue(child)}`)
      .join("\n");
  }
  return "Not specified";
}

function branchLabel(handle: string | undefined): string | undefined {
  if (!handle) return undefined;
  if (handle === "input" || handle === "output") return undefined;
  if (handle === "internal-source") return "Each item";
  if (handle === "external-output") return "After loop";
  if (handle === "else") return "Else";
  if (handle === "default-category") return "Default";
  if (handle.startsWith("condition:")) return "Condition";
  if (handle.startsWith("category:")) return "Category";
  return humanize(handle);
}

function nearestHandles(source: CatalogNode, target: CatalogNode): {
  sourceHandle: string;
  targetHandle: string;
} {
  const dx = target.data.absolutePosition.x - source.data.absolutePosition.x;
  const dy = target.data.absolutePosition.y - source.data.absolutePosition.y;
  if (Math.abs(dx) > Math.abs(dy)) {
    return dx >= 0
      ? { sourceHandle: "source-right", targetHandle: "target-left" }
      : { sourceHandle: "source-left", targetHandle: "target-right" };
  }
  return dy >= 0
    ? { sourceHandle: "source-bottom", targetHandle: "target-top" }
    : { sourceHandle: "source-top", targetHandle: "target-bottom" };
}

function Canvas({
  graph,
  label,
  compact,
  agents,
}: {
  graph: GraphData;
  label: string;
  compact: boolean;
  agents: AgentProfile[];
}) {
  const wrapper = useRef<HTMLDivElement>(null);
  const { fitView, setViewport, zoomIn, zoomOut } = useReactFlow<CatalogNode, FlowEdge>();
  const [selected, setSelected] = useState<CatalogNodeData | null>(null);
  const [peek, setPeek] = useState<{ data: CatalogNodeData; left: number; top: number } | null>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelected(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const nodes = useMemo<CatalogNode[]>(
    () => {
      const positions = new Map<string, { x: number; y: number }>();
      return graph.nodes.map((node) => {
        const agent = isAgentStep(node) ? resolveWorkflowAgent(node, agents) : undefined;
        const metadata = workflowNodeMetadata(node);
        const parent = node.parentId ? positions.get(node.parentId) : undefined;
        if (node.parentId && !parent) throw new Error(`Workflow container ${node.parentId} must precede ${node.id}`);
        const position = {
          x: node.position.x * WORKFLOW_LAYOUT_SCALE_X,
          y: node.position.y * WORKFLOW_LAYOUT_SCALE_Y,
        };
        const absolutePosition = { x: position.x + (parent?.x ?? 0), y: position.y + (parent?.y ?? 0) };
        positions.set(node.id, absolutePosition);
        const isContainer = node.width !== undefined && node.height !== undefined;
        return {
          id: node.id,
          type: "catalog",
          position,
          ...(node.parentId ? { parentId: node.parentId } : {}),
          data: { source: node, absolutePosition, ...(agent ? { agent } : {}) },
          width: node.width !== undefined ? node.width * WORKFLOW_LAYOUT_SCALE_X : 240,
          ...(node.height !== undefined ? { height: node.height * WORKFLOW_LAYOUT_SCALE_Y } : {}),
          initialHeight: metadata?.value ? 112 : 88,
          zIndex: isContainer ? 0 : 1,
          ...(isContainer ? { style: { pointerEvents: "none" as const } } : {}),
          ariaLabel: [node.name, metadata?.value].filter(Boolean).join(" · "),
          draggable: false,
          selectable: true,
        };
      });
    },
    [agents, graph.nodes],
  );

  // Computed from node positions so it works before ReactFlow has measured anything (fitView silently no-ops then).
  const showInitialView = useMemo(() => (width: number, height: number) => {
    if (nodes.length === 0) return;
    const minX = Math.min(...nodes.map((node) => node.data.absolutePosition.x));
    const minY = Math.min(...nodes.map((node) => node.data.absolutePosition.y));
    const maxX = Math.max(...nodes.map((node) => node.data.absolutePosition.x + (node.width ?? 240)));
    const maxY = Math.max(...nodes.map((node) => node.data.absolutePosition.y + (node.height ?? node.initialHeight ?? 88)));
    const padding = compact ? 24 : 48;
    const fitZoom = Math.min((width - padding * 2) / (maxX - minX), (height - padding * 2) / (maxY - minY), 1.1);
    if (compact || fitZoom >= READABLE_ZOOM) {
      const zoom = Math.max(fitZoom, 0.08);
      void setViewport({
        x: (width - (maxX - minX) * zoom) / 2 - minX * zoom,
        y: (height - (maxY - minY) * zoom) / 2 - minY * zoom,
        zoom,
      }, { duration: 0 });
      return;
    }
    // Too wide to read when fitted: start at a readable zoom from the trigger, and let people pan the rest.
    const zoom = READABLE_ZOOM;
    const contentHeight = (maxY - minY) * zoom;
    const trigger = nodes.find((node) => isWorkflowTrigger(node.data.source))
      ?? nodes.reduce((first, node) => (node.data.absolutePosition.x < first.data.absolutePosition.x ? node : first));
    const triggerCenter = trigger.data.absolutePosition.y + (trigger.height ?? trigger.initialHeight ?? 88) / 2;
    const y = contentHeight < height - padding * 2
      ? (height - contentHeight) / 2 - minY * zoom
      : Math.min(padding - minY * zoom, Math.max(height - padding - maxY * zoom, height / 2 - triggerCenter * zoom));
    void setViewport({ x: padding - minX * zoom, y, zoom }, { duration: 0 });
  }, [compact, nodes, setViewport]);

  useEffect(() => {
    const element = wrapper.current;
    if (!element) return;
    let shown = false;
    let wasFullscreen = false;
    let frame: number | undefined;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width <= 0 || height <= 0) return;
      const fullscreen = document.fullscreenElement === element;
      const shouldFit = fullscreen || wasFullscreen;
      if (!shown || shouldFit) {
        shown = true;
        if (frame !== undefined) cancelAnimationFrame(frame);
        // Let React Flow's resize observer update its viewport dimensions first.
        frame = requestAnimationFrame(() => {
          if (shouldFit) void fitView({ padding: 0.18, duration: 250 });
          else showInitialView(width, height);
        });
      }
      wasFullscreen = fullscreen;
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
      if (frame !== undefined) cancelAnimationFrame(frame);
    };
  }, [fitView, graph, showInitialView]);
  const graphNodeById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const edges = useMemo<FlowEdge[]>(
    () =>
      graph.edges.map((edge) => {
        const sourceNode = graphNodeById.get(edge.source);
        const color = sourceNode
          ? graphVisualColor(graphVisualKind(sourceNode.data.source))
          : "var(--cp-border-strong)";
        const targetNode = graphNodeById.get(edge.target);
        const handles: { sourceHandle?: string; targetHandle?: string } = sourceNode && targetNode
          ? nearestHandles(sourceNode, targetNode)
          : {};
        const sourcePort = sourceNode?.data.source.width !== undefined && (edge.sourceHandle === "internal-source" || edge.sourceHandle === "external-output")
          ? edge.sourceHandle : undefined;
        const targetPort = targetNode?.data.source.width !== undefined && (edge.targetHandle === "internal-target" || edge.targetHandle === "external-input")
          ? edge.targetHandle : undefined;
        const label = edge.label ?? branchLabel(edge.sourceHandle);
        return {
          id: edge.id,
          source: edge.source,
          target: edge.target,
          type: "flow" as const,
          sourceHandle: sourcePort ?? (targetPort ? "source-right" : handles.sourceHandle),
          targetHandle: targetPort ?? (sourcePort ? "target-left" : handles.targetHandle),
          data: { color, ...(label ? { label } : {}) },
          markerEnd: { type: MarkerType.ArrowClosed, color, width: 14, height: 14 },
        };
      }),
    [graph.edges, graphNodeById],
  );

  const toggleFullscreen = async () => {
    if (!wrapper.current) return;
    if (document.fullscreenElement) await document.exitFullscreen();
    else await wrapper.current.requestFullscreen();
  };

  const showPeek = (event: ReactMouseEvent, node: CatalogNode) => {
    if (!node.data.agent || !wrapper.current) return;
    const element = (event.target as Element).closest(".react-flow__node");
    if (!element) return;
    const bounds = wrapper.current.getBoundingClientRect();
    const target = element.getBoundingClientRect();
    const width = Math.min(288, bounds.width - 24);
    setPeek({
      data: node.data,
      left: Math.max(12, Math.min(target.left - bounds.left, bounds.width - width - 12)),
      top: Math.min(target.bottom - bounds.top + 8, bounds.height - 12),
    });
  };

  const source = selected?.source;
  const metadata = source ? workflowNodeMetadata(source) : undefined;

  return (
    <div
      ref={wrapper}
      className={`catalog-flow${compact ? " catalog-flow--compact" : ""}`}
      aria-label={label}
    >
      <div className="graph-toolbar">
        <button type="button" aria-label="Zoom out" title="Zoom out" onClick={() => void zoomOut({ duration: 180 })}>
          −
        </button>
        <button type="button" aria-label="Zoom in" title="Zoom in" onClick={() => void zoomIn({ duration: 180 })}>
          +
        </button>
        <button type="button" onClick={() => void fitView({ padding: 0.18, duration: 250 })}>
          Fit
        </button>
        <button type="button" onClick={() => void toggleFullscreen()}>Full screen</button>
      </div>
      <ReactFlow<CatalogNode, FlowEdge>
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        minZoom={0.08}
        maxZoom={1.8}
        nodesDraggable={false}
        nodesConnectable={false}
        onNodeClick={(_, node) => {
          setPeek(null);
          setSelected(node.data);
        }}
        onNodeMouseEnter={showPeek}
        onNodeMouseLeave={() => setPeek(null)}
        onMoveStart={() => setPeek(null)}
        onPaneClick={() => setSelected(null)}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={24} size={1.2} />
        {!compact && (
          <MiniMap
            pannable
            zoomable
            style={{ width: 150, height: 96 }}
            position="bottom-right"
            nodeColor={(node) => (node as CatalogNode).data.source.width !== undefined ? "transparent" : graphVisualColor(graphVisualKind((node as CatalogNode).data.source))}
            nodeStrokeColor={(node) => (node as CatalogNode).data.source.width !== undefined ? graphVisualColor(graphVisualKind((node as CatalogNode).data.source)) : "none"}
          />
        )}
      </ReactFlow>
      {peek?.data.agent && peek.data.source.id !== source?.id && (
        <div className="agent-peek" style={{ left: peek.left, top: peek.top }} role="tooltip">
          <p className="catalog-node__type">Invokes agent</p>
          <p className="agent-peek__name">{peek.data.agent.name}</p>
          <AgentComponentsSummary agent={peek.data.agent} />
          <p className="agent-peek__hint">Click the step for details</p>
        </div>
      )}
      {selected && source && (
        <aside className="graph-detail" aria-label={`${source.name} details`}>
          <div className="graph-detail__header">
            <div>
              <p className="catalog-node__type">{isAgentStep(source) ? agentStepLabel(source, selected.agent) : isWorkflowTrigger(source) ? "Trigger" : humanize(source.type)}</p>
              <h3>{source.name}</h3>
            </div>
            <button type="button" className="graph-detail__close" onClick={() => setSelected(null)} aria-label="Close node details">
              ×
            </button>
          </div>
          <dl className="graph-detail__content">
            {metadata && (
              <div className="graph-detail__field">
                <dt>{metadata.label}</dt>
                <dd>{metadata.value ?? "Not included in this export."}</dd>
              </div>
            )}
            {isAgentStep(source) && <AgentStepDetails source={source} agent={selected.agent} />}
            {source.summary && (
              <div className="graph-detail__field">
                <dt>Summary</dt>
                <dd>{source.summary}</dd>
              </div>
            )}
            {Object.entries(source.details)
              .filter(([key]) => !isAgentStep(source) || !AGENT_STEP_HIDDEN_DETAILS.has(key))
              .filter(([, value]) => value !== "")
              .map(([key, value]) => (
                <div className="graph-detail__field" key={key}>
                  <dt>{humanize(key)}</dt>
                  <dd>{displayValue(value)}</dd>
                </div>
              ))}
            {!isAgentStep(source) && !source.summary && Object.keys(source.details).length === 0 && (
              <div className="graph-detail__field">
                <dt>Details</dt>
                <dd>No additional configuration was published for this node.</dd>
              </div>
            )}
          </dl>
        </aside>
      )}
    </div>
  );
}

export default function GraphCanvas({
  graph,
  label,
  compact = false,
  agents = [],
}: {
  graph: GraphData;
  label: string;
  compact?: boolean;
  agents?: AgentProfile[];
}) {
  return (
    <ReactFlowProvider>
      <Canvas graph={graph} label={label} compact={compact} agents={agents} />
    </ReactFlowProvider>
  );
}
