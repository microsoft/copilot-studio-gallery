import type { MindMapLayout, PlacedNode } from "@/lib/mindmap-data";

// Where the selected node's floating toolbar goes. The bar is drawn at screen size whatever the zoom, so its
// footprint on the map shrinks as the map is zoomed in; the viewport uses the same numbers to keep room for it.

/** Which edge of the selected node the bar sits against. */
export type ActionBarSide = "above" | "below" | "left" | "right";

/** Screen-pixel geometry, so the viewport can keep room for the bar when it reveals the selected node. */
export const NODE_ACTION_BAR_HEIGHT = 40;
export const NODE_ACTION_BAR_GAP = 8;
/** The bar's own box: `size-8` buttons, `gap-0.5` between items, `p-1` around them, and a 1px divider with `mx-0.5`. */
const BUTTON = 32;
const ITEM_GAP = 2;
const PADDING = 4;
const DIVIDER = 5;
/** The drag grip at the bar's start (`w-5`). */
const GRIP = 20;
/** The bar keeps this far inside the map viewport's edges. */
const EDGE_INSET = 8;

/**
 * How many buttons and dividers the bar holds for a root or an ordinary node (the direction fly-out's trigger is one
 * button), counting Edit, which is left out while the details panel is pinned beside the map.
 */
const BAR_ITEMS = { root: { buttons: 5, dividers: 1 }, node: { buttons: 12, dividers: 2 } };
/**
 * In the compact bar, Move up, Move down, Indent, Outdent, Arrange branch and Branch direction go into one
 * More actions menu, so an ordinary node's bar loses five buttons. The root's bar is always short enough.
 */
const COMPACT_SAVING = 5;

/** The bar's screen width for a root or an ordinary node, with or without its Edit button, full or compact. */
export function actionBarWidth(isRoot: boolean, withEdit = true, compact = false): number {
  const counts = isRoot ? BAR_ITEMS.root : BAR_ITEMS.node;
  const buttons = counts.buttons - (withEdit ? 0 : 1) - (compact && !isRoot ? COMPACT_SAVING : 0);
  const { dividers } = counts;
  return GRIP + buttons * BUTTON + dividers * DIVIDER + (buttons + dividers) * ITEM_GAP + PADDING * 2;
}

/** Whether the full bar is too wide for a map viewport this wide (a phone, say), so the compact one is used. */
export function actionBarCompact(viewportWidth: number, withEdit = true): boolean {
  return viewportWidth > 0 && actionBarWidth(false, withEdit) + EDGE_INSET * 2 > viewportWidth;
}

interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

const overlap = (a: Box, b: Box) =>
  Math.max(0, Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX)) * Math.max(0, Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY));
const nodeBox = (p: PlacedNode): Box => ({ minX: p.x - p.w / 2, maxX: p.x + p.w / 2, minY: p.y - p.h / 2, maxY: p.y + p.h / 2 });

/**
 * The side of the selected node where the bar covers the least of the other nodes — above when there is room,
 * otherwise below, then beside it. It never sits on the side the branch grows from, where the expand/collapse
 * toggle and the connectors to the children are.
 */
export function chooseActionBarSide(
  layout: MindMapLayout,
  id: string,
  isRoot: boolean,
  hasToggle: boolean,
  zoom: number,
  /** The map viewport's width in screen pixels; beside the node is ruled out when the bar can't fit there. */
  viewportWidth = 0,
  /** Whether the bar carries its Edit button. */
  withEdit = true,
): ActionBarSide {
  const placed = layout.nodes.find((p) => p.id === id);
  if (!placed) return "above";
  const barWidth = actionBarWidth(isRoot, withEdit, actionBarCompact(viewportWidth, withEdit));
  const w = barWidth / zoom;
  const h = NODE_ACTION_BAR_HEIGHT / zoom;
  const gap = NODE_ACTION_BAR_GAP / zoom;
  const own = nodeBox(placed);
  const candidates: Array<{ side: ActionBarSide; box: Box }> = [
    { side: "above", box: { minX: placed.x - w / 2, maxX: placed.x + w / 2, minY: own.minY - gap - h, maxY: own.minY - gap } },
    { side: "below", box: { minX: placed.x - w / 2, maxX: placed.x + w / 2, minY: own.maxY + gap, maxY: own.maxY + gap + h } },
    { side: "right", box: { minX: own.maxX + gap, maxX: own.maxX + gap + w, minY: placed.y - h / 2, maxY: placed.y + h / 2 } },
    { side: "left", box: { minX: own.minX - gap - w, maxX: own.minX - gap, minY: placed.y - h / 2, maxY: placed.y + h / 2 } },
  ];
  const blocked: ActionBarSide | null = hasToggle ? ({ right: "right", left: "left", down: "below", up: "above" } as const)[placed.dir] : null;
  // Beside the node needs room for the node, the gap and the whole bar, or the bar would be pushed back over it.
  const besideFits = !viewportWidth || placed.w * zoom + NODE_ACTION_BAR_GAP + barWidth + EDGE_INSET * 2 <= viewportWidth;
  const others = layout.nodes.filter((p) => p.id !== id);
  let best: ActionBarSide = "above";
  let bestScore = Infinity;
  for (const candidate of candidates) {
    if (candidate.side === blocked) continue;
    if (!besideFits && (candidate.side === "left" || candidate.side === "right")) continue;
    const score = others.reduce((sum, p) => sum + overlap(candidate.box, nodeBox(p)), 0);
    // Only a clear improvement moves the bar off an earlier (preferred) side.
    if (score < bestScore - 1) {
      best = candidate.side;
      bestScore = score;
    }
  }
  return best;
}

export interface ScreenRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * Where the rendered bar actually goes, in screen pixels, once its real size (wrapped onto two rows on a narrow
 * screen, say) is known: the preferred side unless the bar there would cover the node or leave the map, then the
 * first other side that keeps it clear of the node and inside the map. Sideways it is slid back inside the map.
 */
export function placeActionBar(
  node: ScreenRect,
  bar: { width: number; height: number },
  frame: ScreenRect,
  preferred: ActionBarSide,
): { side: ActionBarSide; left: number; top: number } {
  const gap = NODE_ACTION_BAR_GAP;
  const cx = (node.left + node.right) / 2;
  const cy = (node.top + node.bottom) / 2;
  const at: Record<ActionBarSide, { left: number; top: number }> = {
    above: { left: cx - bar.width / 2, top: node.top - gap - bar.height },
    below: { left: cx - bar.width / 2, top: node.bottom + gap },
    left: { left: node.left - gap - bar.width, top: cy - bar.height / 2 },
    right: { left: node.right + gap, top: cy - bar.height / 2 },
  };
  const minLeft = frame.left + EDGE_INSET;
  const maxLeft = frame.right - EDGE_INSET - bar.width;
  const slide = (left: number) => (maxLeft < minLeft ? minLeft : Math.min(Math.max(left, minLeft), maxLeft));
  const order = [...new Set<ActionBarSide>([preferred, "above", "below", "right", "left"])];
  let clearOnly: { side: ActionBarSide; left: number; top: number } | null = null;
  for (const side of order) {
    const left = slide(at[side].left);
    const top = at[side].top;
    const box = { minX: left, maxX: left + bar.width, minY: top, maxY: top + bar.height };
    const clear = overlap(box, { minX: node.left, maxX: node.right, minY: node.top, maxY: node.bottom }) === 0;
    const inside = top >= frame.top + EDGE_INSET && box.maxY <= frame.bottom - EDGE_INSET;
    if (clear && inside) return { side, left, top };
    if (clear && !clearOnly) clearOnly = { side, left, top };
  }
  return clearOnly ?? { side: preferred, left: slide(at[preferred].left), top: at[preferred].top };
}
