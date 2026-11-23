import { SIZE_SPECS, getColor, type MindMap, type MindMapLayout } from "@/lib/mindmap-data";
import { measureTextWidth, type TextFont } from "@/lib/text-measure";
import { cn } from "@/lib/utils";

interface MapThumbnailProps {
  map: MindMap;
  layout: MindMapLayout;
  /** Unique id base for the picture's title and description. */
  id: string;
  className?: string;
}

/**
 * A label on one line, cut back with an ellipsis until it fits the width its node box affords — measured in
 * the font the thumbnail draws it in, the same way the layout measured the box.
 */
function fitLabel(label: string, width: number, font: TextFont): string {
  const text = label.trim().replace(/\s+/g, " ");
  if (measureTextWidth(text, font) <= width) return text;
  const characters = Array.from(text);
  let low = 1;
  let high = characters.length - 1;
  let best = "";
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const prefix = characters.slice(0, middle).join("").trimEnd();
    if (measureTextWidth(`${prefix}…`, font) <= width) {
      best = prefix;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return best ? `${best}…` : "…";
}

/**
 * Still picture of a whole map: every node box and connector from the shared
 * layout, scaled to fit. Colours follow each node's own colour key, so the
 * thumbnail reads like the editor canvas at a glance.
 */
export function MapThumbnail({ map, layout, id, className }: MapThumbnailProps) {
  const root = map.nodes[map.rootId];
  const titleId = `${id}-title`;
  const descId = `${id}-desc`;
  const branches = root?.children.length ?? 0;
  const nodeCount = Object.keys(map.nodes).length;

  return (
    <svg
      role="img"
      aria-labelledby={`${titleId} ${descId}`}
      viewBox={`${layout.minX} ${layout.minY} ${layout.width} ${layout.height}`}
      preserveAspectRatio="xMidYMid meet"
      className={cn("h-auto w-full", className)}
    >
      <title id={titleId}>Preview of {root?.label ?? "mind map"}</title>
      <desc id={descId}>
        {root?.label ?? "Mind map"} with {nodeCount} {nodeCount === 1 ? "node" : "nodes"} in {branches} {branches === 1 ? "branch" : "branches"}.
      </desc>
      {layout.edges.map((edge) => (
        <path
          key={edge.id}
          d={edge.d}
          strokeWidth={edge.width}
          strokeLinecap="round"
          className={cn("fill-none forced-colors:stroke-[color:CanvasText]", getColor(edge.color).stroke)}
        />
      ))}
      {layout.nodes.map((placed) => {
        const node = map.nodes[placed.id];
        if (!node) return null;
        const isRoot = placed.id === map.rootId;
        const spec = SIZE_SPECS[node.size];
        const weight = isRoot ? 600 : 500;
        return (
          <g key={placed.id}>
            <rect
              x={placed.x - placed.w / 2}
              y={placed.y - placed.h / 2}
              width={placed.w}
              height={placed.h}
              rx={isRoot ? placed.h / 2 : 8}
              strokeWidth={isRoot ? 3 : 2}
              className={cn("fill-card forced-colors:fill-[color:Canvas] forced-colors:stroke-[color:CanvasText]", getColor(node.color).stroke)}
            />
            <text
              x={placed.x}
              y={placed.y}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={spec.font}
              fontWeight={weight}
              className="fill-foreground forced-colors:fill-[color:CanvasText]"
            >
              {fitLabel(node.label, placed.w - spec.padX * 2, { size: spec.font, weight })}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
