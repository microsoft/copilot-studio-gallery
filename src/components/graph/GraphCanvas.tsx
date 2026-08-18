import {
  Background,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { graphVisualColor, graphVisualKind, isMcpNode, MCP_ICON_PATHS } from "../../lib/graphVisuals";
import type { GraphData, GraphNode } from "../../lib/schema";
import "./GraphCanvas.css";

type CatalogNodeData = {
  source: GraphNode;
  primary: boolean;
};

type CatalogNode = Node<CatalogNodeData, "catalog">;
const WORKFLOW_LAYOUT_SCALE_X = 1.7;
const WORKFLOW_LAYOUT_SCALE_Y = 1.5;

const ICONS: Record<string, string> = {
  start: "IN",
  end: "OUT",
  ifElse: "IF",
  loop: "LP",
  variable: "VR",
  builtinFunction: "FN",
  classifyOnInlineAgent: "CL",
  canvasNote: "NT",
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

function CatalogNodeView({ data, selected }: NodeProps<CatalogNode>) {
  const source = data.source;
  const typeLabel = isMcpNode(source) ? "MCP server" : humanize(source.type);
  return (
    <div
      className="catalog-node"
      data-kind={source.type}
      data-visual={graphVisualKind(source)}
      data-primary={data.primary ? "true" : "false"}
      data-selected={selected ? "true" : "false"}
    >
      <Handle type="target" id="target-top" position={Position.Top} />
      <Handle type="target" id="target-right" position={Position.Right} />
      <Handle type="target" id="target-bottom" position={Position.Bottom} />
      <Handle type="target" id="target-left" position={Position.Left} />
      <div className="catalog-node__body">
        <span className="catalog-node__icon" aria-hidden="true">
          <GraphNodeIcon source={source} />
        </span>
        <span className="catalog-node__copy">
          <span className="catalog-node__type">{typeLabel}</span>
          <span className="catalog-node__name">{source.name}</span>
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
  if (handle === "else") return "Else";
  if (handle === "default-category") return "Default";
  if (handle.startsWith("condition:")) return "Condition";
  if (handle.startsWith("category:")) return "Category";
  return humanize(handle);
}

function nearestHandles(source: GraphNode, target: GraphNode): {
  sourceHandle: string;
  targetHandle: string;
} {
  const dx = target.position.x - source.position.x;
  const dy = target.position.y - source.position.y;
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
  showNotesInitially,
  compact,
  variant,
}: {
  graph: GraphData;
  label: string;
  showNotesInitially: boolean;
  compact: boolean;
  variant: "workflow" | "agent";
}) {
  const wrapper = useRef<HTMLDivElement>(null);
  const { fitView, zoomIn, zoomOut } = useReactFlow<CatalogNode>();
  const [selected, setSelected] = useState<GraphNode | null>(null);
  const [showNotes, setShowNotes] = useState(showNotesInitially);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelected(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const element = wrapper.current;
    if (!element) return;
    let hasFittedVisibleCanvas = false;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (!hasFittedVisibleCanvas && width > 0 && height > 0) {
        hasFittedVisibleCanvas = true;
        requestAnimationFrame(() => void fitView({ padding: 0.18, duration: 0 }));
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [fitView, graph]);

  const hiddenIds = useMemo(
    () => new Set(showNotes ? [] : graph.nodes.filter((node) => node.type === "canvasNote").map((node) => node.id)),
    [graph.nodes, showNotes],
  );
  const primaryAgentIds = useMemo(() => {
    if (variant !== "agent") return new Set<string>();
    const agentIds = new Set(graph.nodes.filter((node) => node.type === "agent").map((node) => node.id));
    const delegatedIds = new Set(
      graph.edges
        .filter((edge) => agentIds.has(edge.source) && agentIds.has(edge.target))
        .map((edge) => edge.target),
    );
    return new Set([...agentIds].filter((id) => !delegatedIds.has(id)));
  }, [graph.edges, graph.nodes, variant]);
  const nodes = useMemo<CatalogNode[]>(
    () =>
      graph.nodes
        .filter((node) => !hiddenIds.has(node.id))
        .map((node) => ({
          id: node.id,
          type: "catalog",
          position: variant === "workflow"
            ? {
                x: node.position.x * WORKFLOW_LAYOUT_SCALE_X,
                y: node.position.y * WORKFLOW_LAYOUT_SCALE_Y,
              }
            : node.position,
          data: { source: node, primary: primaryAgentIds.has(node.id) },
          width: node.type === "start" || node.type === "end" ? 160 : 224,
          height: 72,
          draggable: false,
          selectable: !compact,
        })),
    [compact, graph.nodes, hiddenIds, primaryAgentIds, variant],
  );
  const graphNodeById = useMemo(() => new Map(graph.nodes.map((node) => [node.id, node])), [graph.nodes]);
  const edges = useMemo<Edge[]>(
    () =>
      graph.edges
        .filter((edge) => !hiddenIds.has(edge.source) && !hiddenIds.has(edge.target))
        .map((edge) => {
          const sourceNode = graphNodeById.get(edge.source);
          const color = sourceNode
            ? graphVisualColor(graphVisualKind(sourceNode))
            : "var(--cp-border-strong)";
          const targetNode = graphNodeById.get(edge.target);
          const handles = sourceNode && targetNode
            ? nearestHandles(sourceNode, targetNode)
            : {};
          return {
            id: edge.id,
            source: edge.source,
            target: edge.target,
            label: edge.label ?? branchLabel(edge.sourceHandle),
            type: "smoothstep",
            ...handles,
            markerEnd: { type: MarkerType.ArrowClosed, color, width: 18, height: 18 },
            style: { strokeWidth: 1.8, stroke: color },
          };
        }),
    [graph.edges, graphNodeById, hiddenIds, variant],
  );

  const toggleFullscreen = async () => {
    if (!wrapper.current) return;
    if (document.fullscreenElement) await document.exitFullscreen();
    else await wrapper.current.requestFullscreen();
  };

  return (
    <div
      ref={wrapper}
      className={`catalog-flow catalog-flow--${variant}${compact ? " catalog-flow--compact" : ""}`}
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
        {!compact && graph.nodes.some((node) => node.type === "canvasNote") && (
          <button type="button" aria-pressed={showNotes} onClick={() => setShowNotes((value) => !value)}>
            Notes
          </button>
        )}
        {!compact && <button type="button" onClick={() => void toggleFullscreen()}>Full screen</button>}
      </div>
      <ReactFlow<CatalogNode>
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.18 }}
        minZoom={0.15}
        maxZoom={1.8}
        nodesDraggable={false}
        nodesConnectable={false}
        onNodeClick={(_, node) => {
          if (!compact) setSelected(node.data.source);
        }}
        onPaneClick={() => setSelected(null)}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={24} size={1.2} />
        {!compact && (
          <MiniMap
            pannable
            zoomable
            position="bottom-right"
            nodeColor={(node) => graphVisualColor(graphVisualKind((node as CatalogNode).data.source))}
          />
        )}
      </ReactFlow>
      {!compact && selected && (
        <aside className="graph-detail" aria-label={`${selected.name} details`}>
          <div className="graph-detail__header">
            <div>
              <p className="catalog-node__type">{humanize(selected.type)}</p>
              <h3>{selected.name}</h3>
            </div>
            <button type="button" className="graph-detail__close" onClick={() => setSelected(null)} aria-label="Close node details">
              ×
            </button>
          </div>
          <dl className="graph-detail__content">
            {selected.summary && (
              <div className="graph-detail__field">
                <dt>Summary</dt>
                <dd>{selected.summary}</dd>
              </div>
            )}
            {Object.entries(selected.details).map(([key, value]) => (
              <div className="graph-detail__field" key={key}>
                <dt>{humanize(key)}</dt>
                <dd>{displayValue(value)}</dd>
              </div>
            ))}
            {!selected.summary && Object.keys(selected.details).length === 0 && (
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
  showNotesInitially = true,
  compact = false,
  variant = "workflow",
}: {
  graph: GraphData;
  label: string;
  showNotesInitially?: boolean;
  compact?: boolean;
  variant?: "workflow" | "agent";
}) {
  return (
    <ReactFlowProvider>
      <Canvas graph={graph} label={label} showNotesInitially={showNotesInitially} compact={compact} variant={variant} />
    </ReactFlowProvider>
  );
}
