import { allLinks, type MapLink, type MindMap, type MindMapLayout, type PlacedNode } from "@/lib/mindmap-data";
import { measureTextWidth, type TextFont } from "@/lib/text-measure";

// Where association links run. A link is a dotted line between two placed nodes that goes around every other
// node rather than through it: it starts as the straight line between the two, and wherever that line would
// cross a node (plus a margin) it turns at the nearest corner of that node and carries on, until it is clear
// or has turned as often as it is allowed. The turns are rounded, and every path is written with the same
// number of commands whatever its shape, so a link morphs from one route to the next instead of jumping.
// Routing never moves a node — it runs after the layout, on the layout — and is memoised on the layout
// object together with the links themselves, so typing a description or picking a colour re-routes nothing.

/**
 * Clearance a link keeps from the nodes it passes, in map pixels. Less than half the layout's gap between
 * stacked siblings (18px), so two neighbours' cleared boxes never overlap and a line can run between them.
 */
export const LINK_MARGIN = 8;
/** How far outside a node's cleared corner a turn is placed, so the leg leaving it does not graze the node again. */
const CORNER_OUT = 2;
/** Radius of a rounded turn (less when a leg is short). */
const TURN_RADIUS = 14;
/**
 * Turns per link at most; a line across a crowded map is routed as well as that allows. Slipping between two
 * stacked siblings takes about three turns, and a link across a large map may cross five or six columns.
 */
const MAX_TURNS = 20;
/** Gap between a node's edge and where its link starts or ends. */
const END_GAP = 3;
/** Length of the open arrowhead at the end a link leads to, and half its width. */
const ARROW_LENGTH = 7;
const ARROW_HALF = 4.5;
/** The label's font, pill height and padding; the pill is as wide as the measured text plus the padding. */
export const LINK_LABEL_FONT: TextFont = { size: 11, weight: 500 };
export const LINK_LABEL_HEIGHT = 18;
export const LINK_LABEL_PAD_X = 7;

export interface RoutedLink extends MapLink {
  /** The placed nodes the ends attach to: the node itself, or its nearest ancestor when it sits in a collapsed branch. */
  fromNode: string;
  toNode: string;
  /** At least one end is inside a collapsed branch and attaches to an ancestor instead; such a link is drawn fainter. */
  attached: boolean;
  /** The dotted line, from the carrying node to the target. */
  d: string;
  /** The arrowhead at the target end. */
  arrowD: string;
  /** The label's centre: halfway along the line. */
  mx: number;
  my: number;
  /** The label pill's width; 0 for an unlabelled link. */
  labelW: number;
}

interface Pt {
  x: number;
  y: number;
}

interface Rect {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** A node as an obstacle: its own box (plus a hair) and the box a link keeps clear of. */
interface Obstacle {
  id: string;
  inner: Rect;
  outer: Rect;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const dist = (a: Pt, b: Pt) => Math.hypot(b.x - a.x, b.y - a.y);
const contains = (r: Rect, p: Pt) => p.x > r.minX && p.x < r.maxX && p.y > r.minY && p.y < r.maxY;

function inflate(p: PlacedNode, by: number): Rect {
  return { minX: p.x - p.w / 2 - by, minY: p.y - p.h / 2 - by, maxX: p.x + p.w / 2 + by, maxY: p.y + p.h / 2 + by };
}

/**
 * Where the segment a→b first enters `r`, as a fraction of its length — or null when it misses, touches the
 * boundary only, or runs along it (Liang–Barsky clipping).
 */
function entry(a: Pt, b: Pt, r: Rect): number | null {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let t0 = 0;
  let t1 = 1;
  const clip = (p: number, q: number): boolean => {
    if (p === 0) return q > 0;
    const t = q / p;
    if (p < 0) {
      if (t > t1) return false;
      if (t > t0) t0 = t;
    } else {
      if (t < t0) return false;
      if (t < t1) t1 = t;
    }
    return true;
  };
  if (!clip(-dx, a.x - r.minX) || !clip(dx, r.maxX - a.x) || !clip(-dy, a.y - r.minY) || !clip(dy, r.maxY - a.y)) return null;
  return t0 < t1 ? t0 : null;
}

interface Hit {
  rect: Rect;
  t: number;
  point: Pt;
}

/**
 * The first obstacle the segment a→b runs into. An obstacle whose cleared box already holds an end of the
 * segment (a turn placed in a neighbour's margin, say) counts only by its own box; one holding an end inside
 * its own box does not count at all, or the line could never leave it.
 */
function firstHit(a: Pt, b: Pt, obstacles: readonly Obstacle[]): Hit | null {
  const minX = Math.min(a.x, b.x);
  const maxX = Math.max(a.x, b.x);
  const minY = Math.min(a.y, b.y);
  const maxY = Math.max(a.y, b.y);
  let best: Hit | null = null;
  for (const obstacle of obstacles) {
    const { outer } = obstacle;
    if (outer.maxX <= minX || outer.minX >= maxX || outer.maxY <= minY || outer.minY >= maxY) continue;
    let rect = outer;
    if (contains(outer, a) || contains(outer, b)) {
      rect = obstacle.inner;
      if (contains(rect, a) || contains(rect, b)) continue;
    }
    const t = entry(a, b, rect);
    if (t === null || (best && t >= best.t)) continue;
    best = { rect, t, point: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t } };
  }
  return best;
}

const cornerKey = (p: Pt) => `${p.x},${p.y}`;

/**
 * The corner of the hit box the line goes around: one of the two on the edge it entered — whichever makes the
 * shorter way round — never the corner the leg set out from or is heading to, and never one this route has
 * turned at already (two boxes close together would otherwise send the line back and forth between their
 * facing corners). With both corners of the edge spent, one of the far edge's; with all four spent, null:
 * the leg stays as it is.
 */
function turnAt(a: Pt, b: Pt, { rect, point }: Hit, used: ReadonlySet<string>): Pt | null {
  const o = CORNER_OUT;
  const tl = { x: rect.minX - o, y: rect.minY - o };
  const tr = { x: rect.maxX + o, y: rect.minY - o };
  const bl = { x: rect.minX - o, y: rect.maxY + o };
  const br = { x: rect.maxX + o, y: rect.maxY + o };
  const eps = 0.01;
  const onEdge =
    Math.abs(point.x - rect.minX) < eps ? [tl, bl] : Math.abs(point.x - rect.maxX) < eps ? [tr, br] : Math.abs(point.y - rect.minY) < eps ? [tl, tr] : [bl, br];
  const free = (corner: Pt) => dist(corner, a) > 0.5 && dist(corner, b) > 0.5 && !used.has(cornerKey(corner));
  let corners = onEdge.filter(free);
  if (!corners.length) corners = [tl, tr, bl, br].filter(free);
  if (!corners.length) return null;
  return corners.reduce((best, corner) => (dist(a, corner) + dist(corner, b) < dist(a, best) + dist(best, b) ? corner : best));
}

/**
 * The line through `initial` (its ends, and any turns it already has) with a turn added around every obstacle
 * a leg runs into, until every leg is clear or the line has `MAX_TURNS` turns.
 */
function route(initial: readonly Pt[], obstacles: readonly Obstacle[]): Pt[] {
  const points = [...initial];
  const used = new Set(points.slice(1, -1).map(cornerKey));
  let turns = points.length - 2;
  let i = 0;
  while (i < points.length - 1 && turns < MAX_TURNS) {
    const hit = firstHit(points[i], points[i + 1], obstacles);
    const turn = hit && turnAt(points[i], points[i + 1], hit, used);
    if (!turn) {
      i += 1;
      continue;
    }
    // The leg up to the turn is checked again next round; the leg after it when its turn comes.
    points.splice(i + 1, 0, turn);
    used.add(cornerKey(turn));
    turns += 1;
  }
  return points;
}

/** The point on the edge of `p` (plus `gap`) in the direction of `toward`. */
function edgePoint(p: PlacedNode, toward: Pt, gap: number): Pt {
  const dx = toward.x - p.x;
  const dy = toward.y - p.y;
  const hw = p.w / 2 + gap;
  const hh = p.h / 2 + gap;
  if (dx === 0 && dy === 0) return { x: p.x, y: p.y + hh };
  const s = Math.min(dx === 0 ? Infinity : hw / Math.abs(dx), dy === 0 ? Infinity : hh / Math.abs(dy));
  return { x: p.x + dx * s, y: p.y + dy * s };
}

/** `r` map pixels from `from` towards `to` (or `to` itself when they are closer than that). */
function towards(from: Pt, to: Pt, r: number): Pt {
  const d = dist(from, to);
  if (d <= r || d === 0) return to;
  return { x: from.x + ((to.x - from.x) / d) * r, y: from.y + ((to.y - from.y) / d) * r };
}

const pt = (p: Pt) => `${round1(p.x)} ${round1(p.y)}`;

/**
 * The line through `points` with rounded turns. Written with exactly `MAX_TURNS` turns — the unused ones
 * folded onto the end point, where they draw nothing — so every link's path has the same shape and one can
 * be animated into the next.
 */
function smoothPath(points: readonly Pt[]): string {
  const start = points[0];
  const end = points[points.length - 1];
  let d = `M ${pt(start)}`;
  for (let i = 1; i < points.length - 1; i++) {
    const previous = points[i - 1];
    const turn = points[i];
    const next = points[i + 1];
    const r = Math.min(TURN_RADIUS, dist(previous, turn) / 2, dist(turn, next) / 2);
    d += ` L ${pt(towards(turn, previous, r))} Q ${pt(turn)} ${pt(towards(turn, next, r))}`;
  }
  for (let i = points.length - 2; i < MAX_TURNS; i++) d += ` L ${pt(end)} Q ${pt(end)} ${pt(end)}`;
  return `${d} L ${pt(end)}`;
}

/** The point halfway along the polyline, by length. */
function halfway(points: readonly Pt[]): Pt {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += dist(points[i - 1], points[i]);
  let remaining = total / 2;
  for (let i = 1; i < points.length; i++) {
    const leg = dist(points[i - 1], points[i]);
    if (leg >= remaining) return towards(points[i - 1], points[i], remaining);
    remaining -= leg;
  }
  return points[points.length - 1];
}

/** An open arrowhead at `tip`, pointing the way the last leg runs. */
function arrowPath(before: Pt, tip: Pt): string {
  const d = dist(before, tip);
  const ux = d === 0 ? 1 : (tip.x - before.x) / d;
  const uy = d === 0 ? 0 : (tip.y - before.y) / d;
  const baseX = tip.x - ux * ARROW_LENGTH;
  const baseY = tip.y - uy * ARROW_LENGTH;
  const left = { x: baseX - uy * ARROW_HALF, y: baseY + ux * ARROW_HALF };
  const right = { x: baseX + uy * ARROW_HALF, y: baseY - ux * ARROW_HALF };
  return `M ${pt(left)} L ${pt(tip)} L ${pt(right)}`;
}

/** The placed node a link end attaches to: the node itself, else the nearest ancestor on the canvas. */
function placedAnchor(map: MindMap, placed: ReadonlyMap<string, PlacedNode>, id: string): string | null {
  let current: string | null = id;
  const seen = new Set<string>();
  while (current && !seen.has(current)) {
    if (placed.has(current)) return current;
    seen.add(current);
    current = map.nodes[current]?.parentId ?? null;
  }
  return null;
}

/** The width of a label's pill, from the browser's measure of the text. */
export function linkLabelWidth(label: string): number {
  return label ? Math.ceil(measureTextWidth(label, LINK_LABEL_FONT)) + LINK_LABEL_PAD_X * 2 : 0;
}

/** Every drawable link of `map` routed around the nodes `layout` places. A link whose two ends resolve to the same visible node is left out. */
export function routeLinks(map: MindMap, layout: MindMapLayout): RoutedLink[] {
  const placed = new Map(layout.nodes.map((p) => [p.id, p] as const));
  const obstacles: Obstacle[] = layout.nodes.map((p) => ({ id: p.id, inner: inflate(p, 1), outer: inflate(p, LINK_MARGIN) }));
  const routes: RoutedLink[] = [];
  for (const link of allLinks(map)) {
    const fromNode = placedAnchor(map, placed, link.from);
    const toNode = placedAnchor(map, placed, link.to);
    if (!fromNode || !toNode || fromNode === toNode) continue;
    const source = placed.get(fromNode) as PlacedNode;
    const target = placed.get(toNode) as PlacedNode;
    const others = obstacles.filter((obstacle) => obstacle.id !== fromNode && obstacle.id !== toNode);
    let points = route([edgePoint(source, target, END_GAP), edgePoint(target, source, END_GAP)], others);
    if (points.length > 2) {
      // The ends face the first and last turn rather than each other, so the line leaves a node the way it
      // goes — and the two legs that moved are checked again, since a new end can cross a neighbour.
      points[0] = edgePoint(source, points[1], END_GAP);
      points[points.length - 1] = edgePoint(target, points[points.length - 2], END_GAP);
      points = route(points, others);
    }
    const mid = halfway(points);
    routes.push({
      ...link,
      fromNode,
      toNode,
      attached: fromNode !== link.from || toNode !== link.to,
      d: smoothPath(points),
      arrowD: arrowPath(points[points.length - 2], points[points.length - 1]),
      mx: round1(mid.x),
      my: round1(mid.y),
      labelW: linkLabelWidth(link.label),
    });
  }
  return routes;
}

const sameRoute = (a: RoutedLink, b: RoutedLink) =>
  a.d === b.d && a.arrowD === b.arrowD && a.label === b.label && a.attached === b.attached && a.fromNode === b.fromNode && a.toNode === b.toNode && a.labelW === b.labelW;

/** `next` with every link routed exactly as in `previous` kept as the very same object — and `previous` itself when nothing changed. */
export function shareRoutes(previous: RoutedLink[], next: RoutedLink[]): RoutedLink[] {
  const byId = new Map(previous.map((r) => [r.id, r] as const));
  let unchanged = previous.length === next.length;
  const routes = next.map((r, index) => {
    const old = byId.get(r.id);
    if (old && sameRoute(old, r)) {
      if (previous[index] !== old) unchanged = false;
      return old;
    }
    unchanged = false;
    return r;
  });
  return unchanged ? previous : routes;
}

/** Everything the routes depend on besides the layout: which node links to which, with what label. */
export function linksSignature(map: MindMap): string {
  const parts: string[] = [];
  for (const node of Object.values(map.nodes)) {
    if (!node.links.length) continue;
    parts.push(`${node.id}\u001F${node.links.map((link) => `${link.to}\u001E${link.label}`).join("\u001D")}`);
  }
  return parts.join("\u001C");
}

const cache = new WeakMap<MindMapLayout, { signature: string; routes: RoutedLink[] }>();
let lastRoutes: RoutedLink[] = [];

/**
 * The map's links routed on `layout`, the same array back while neither the layout object nor the links
 * have changed, and each unchanged route the same object as before.
 */
export function linkRoutes(map: MindMap, layout: MindMapLayout): RoutedLink[] {
  const signature = linksSignature(map);
  const hit = cache.get(layout);
  if (hit && hit.signature === signature) return hit.routes;
  const routes = shareRoutes(lastRoutes, routeLinks(map, layout));
  cache.set(layout, { signature, routes });
  lastRoutes = routes;
  return routes;
}
