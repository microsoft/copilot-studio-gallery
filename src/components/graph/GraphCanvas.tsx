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
import { graphVisualColor, graphVisualKind } from "../../lib/graphVisuals";
import type { GraphData, GraphNode } from "../../lib/schema";
import "./GraphCanvas.css";

type CatalogNodeData = {
  source: GraphNode;
  primary: boolean;
};

type CatalogNode = Node<CatalogNodeData, "catalog">;

const ICONS: Record<string, string> = {
  agent: "AI",
  tool: "TL",
  skill: "SK",
  start: "IN",
  end: "OUT",
  connector: "CN",
  ifElse: "IF",
  loop: "LP",
  variable: "VR",
  builtinFunction: "FN",
  classifyOnInlineAgent: "CL",
  canvasNote: "NT",
};

function CatalogNodeView({ data, selected }: NodeProps<CatalogNode>) {
  const source = data.source;
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
          {ICONS[source.type] ?? source.type.slice(0, 2)}
        </span>
        <span className="catalog-node__copy">
          <span className="catalog-node__type">{humanize(source.type)}</span>
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
          position: node.position,
          data: { source: node, primary: primaryAgentIds.has(node.id) },
          width: node.type === "start" || node.type === "end" ? 160 : 224,
          height: 72,
          draggable: false,
          selectable: !compact,
        })),
    [compact, graph.nodes, hiddenIds, primaryAgentIds],
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
          const handles = variant === "agent" && sourceNode && targetNode
            ? nearestHandles(sourceNode, targetNode)
            : {};
          return {
            id: edge.id,
            source: edge.source,
            target: edge.target,
            label: edge.label ?? branchLabel(edge.sourceHandle),
            type: variant === "agent" ? "straight" : "smoothstep",
            ...handles,
            markerEnd: { type: MarkerType.ArrowClosed, color },
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
