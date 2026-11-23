import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState, type ReactElement, type RefObject } from "react";
import {
  DndContext,
  MouseSensor,
  TouchSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type CollisionDetection,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import { motion, type Transition } from "motion/react";
import { useAppStore } from "@/lib/store";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Search, Spline, Star, Tag, type LucideIcon } from "lucide-react";
import { centeredDecoration, DECOR_GLYPH, decorScaleFor, LINK_HANDLE_SIZE } from "@/lib/node-decorations";
import { dragDisplacement, edgePanVelocity } from "@/lib/drag-edge-pan";
import type { MapView, TouchGesture } from "@/hooks/use-map-view";
import { NodeActionBar, type LinkActions, type NodeActions } from "@/components/node-action-bar";
import { useStableCallback } from "@/hooks/use-stable-callback";
import type { ActionBarSide } from "@/lib/action-bar-placement";
import { cn } from "@/lib/utils";
import {
  IMPORTANCE_LABEL,
  SIZE_SPECS,
  canLink,
  canMoveUnder,
  countAllDescendants,
  directionVector,
  getColor,
  getIcon,
  isDescendant,
  linkRefusal,
  shiftBranch,
  type Direction,
  type MindMap,
  type MindMapLayout,
  type MindNode,
  type NodeOffset,
  type PlacedEdge,
  type PlacedNode,
} from "@/lib/mindmap-data";
import { LINK_LABEL_FONT, LINK_LABEL_HEIGHT, linkRoutes, type RoutedLink } from "@/lib/mindmap-links";

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];
const INSTANT: Transition = { duration: 0 };
/** How a node or connector settles into a new place. One shared object, so memoised nodes see the same prop every render. */
const SETTLE: Transition = { duration: 0.45, ease: EASE };
/** A leaving element is let go after this long even if its exit animation never reports completing (nothing to animate, say). */
const EXIT_FALLBACK_MS = 800;

/** Report a leaving element done once its exit has had time to run, should the animation itself never say so. */
function useExitFallback(leaving: boolean, id: string, onLeft: (id: string) => void) {
  useEffect(() => {
    if (!leaving) return;
    const timer = window.setTimeout(() => onLeft(id), EXIT_FALLBACK_MS);
    return () => window.clearTimeout(timer);
  }, [leaving, id, onLeft]);
}
/** A drop closer than this to where the drag started leaves the node where it was. */
const MIN_MOVE = 4;
/** The expanded toggle's chevron points back towards the parent. */
const COLLAPSE_CHEVRON: Record<Direction, LucideIcon> = { right: ChevronLeft, left: ChevronRight, down: ChevronUp, up: ChevronDown };
// Mouse drags start after a short move so a plain click still selects; touch needs a press-and-hold so a swipe
// stays a swipe. Module constants: dnd-kit keeps its sensors (and so the context every node reads) only while
// the options object is the same one, so inline options would re-render every node on every commit.
const MOUSE_SENSOR_OPTIONS = { activationConstraint: { distance: 6 } };
const TOUCH_SENSOR_OPTIONS = { activationConstraint: { delay: 250, tolerance: 8 } };
/** The link handle's draggable id is the node's id behind this prefix, so a drop can tell a link from a move. */
const LINK_HANDLE_PREFIX = "link:";
const linkSource = (id: UniqueIdentifier | undefined): string | null => {
  const text = id === undefined ? "" : String(id);
  return text.startsWith(LINK_HANDLE_PREFIX) ? text.slice(LINK_HANDLE_PREFIX.length) : null;
};
const NO_ROUTES: RoutedLink[] = [];
/** Opacity of a link no selected or hovered node touches — present, not distracting. */
const FAINT_LINK = 0.3;
/** Opacity factor for a link one end of which sits in a collapsed branch and attaches to an ancestor instead. */
const ATTACHED_LINK = 0.6;
/** Opacity of a connector into a node the search does not match, so the connectors into the matches stand out. */
const FADED_EDGE = 0.35;

interface MindMapCanvasProps {
  map: MindMap;
  layout: MindMapLayout;
  selectedId: string | null;
  zoom: number;
  view: MapView;
  viewportRef: RefObject<HTMLDivElement | null>;
  onPanForDrag: (dx: number, dy: number) => void;
  pinching: boolean;
  touchGesture: RefObject<TouchGesture>;
  /** Changes as the map pans or zooms; the action bar re-places itself on it. */
  viewKey?: string;
  captionId: string;
  /** `byPointer` when a click or tap picked it, so the page can wait out a possible double-click before panning. */
  onSelect: (id: string, byPointer?: boolean) => void;
  onToggle: (id: string) => void;
  /** Drop `id` onto `targetId`: the node becomes the target's last child. */
  onMove: (id: string, targetId: string) => void;
  /** Drop `id` on the background: keep it (and its branch) where it was released, relative to its parent. */
  onPlace: (id: string, offset: NodeOffset) => void;
  /** A node took keyboard focus: keep it inside the viewport. */
  onReveal: (id: string) => void;
  /** What the selected node can do; shown as a toolbar beside it. */
  actions: NodeActions;
  /** Whether the selected node's toolbar is up; the user can hide it to see what it covers. */
  toolbarOpen: boolean;
  /** The side of the selected node the toolbar sits on. */
  toolbarSide: ActionBarSide;
  /** The map is too narrow for the full toolbar, so its less-used actions go into a More actions menu. */
  toolbarCompact: boolean;
  onShowToolbar: () => void;
  onHideToolbar: () => void;
  /** Nodes the find bar's query matches; null while no search is on. Other nodes are shown greyed and faded, their connectors with them. */
  matchIds: ReadonlySet<string> | null;
  /** A branch is being dragged (true) or was just dropped or let go (false). */
  onDragChange?: (dragging: boolean) => void;
  /** Whether association links are drawn. Hidden links still exist; the inspector lists them. */
  showLinks: boolean;
  /** The link picked on the canvas (or from the inspector), drawn at full strength; null for none. */
  selectedLinkId: string | null;
  onSelectLink: (id: string | null) => void;
  /** The link handle of `from` was dropped on `to`: draw a link between them. */
  onLink: (from: string, to: string) => void;
  /** The link handle was clicked rather than dragged: offer the nodes `id` can be linked to. */
  onPickLinkTarget: (id: string) => void;
  /** A node was double-clicked or double-tapped: open its details. */
  onEditNode: (id: string) => void;
  /** What the picked link's toolbar does. */
  linkActions: LinkActions;
  /** A link was double-clicked or double-tapped: open its details. */
  onEditLink: (id: string) => void;
}

/**
 * What is being dragged: a branch (`move`) and how far it has travelled, or the link handle of a node
 * (`link`), from the handle's centre (`hx`, `hy`) to wherever the pointer has taken it — all in map pixels.
 */
interface LiveDrag {
  kind: "move" | "link";
  id: string;
  dx: number;
  dy: number;
  hx: number;
  hy: number;
  startPoint: { x: number; y: number };
  startView: MapView;
}

/** How strongly a link is drawn: picked, touching the selected or hovered node, or merely present. */
type LinkEmphasis = "selected" | "strong" | "faint";

/** Which corner of the selected node its link handle sits on. */
type HandleCorner = "top-left" | "top-right" | "bottom-left" | "bottom-right";
const HANDLE_CORNERS: HandleCorner[] = ["bottom-right", "top-right", "bottom-left", "top-left"];
/** The corners each edge of a node owns. */
const EDGE_CORNERS: Record<Direction, HandleCorner[]> = {
  up: ["top-left", "top-right"],
  down: ["bottom-left", "bottom-right"],
  left: ["top-left", "bottom-left"],
  right: ["top-right", "bottom-right"],
};
const OPPOSITE: Record<Direction, Direction> = { up: "down", down: "up", left: "right", right: "left" };

/**
 * The corner for the selected node's link handle: clear of its action bar, of its expand/collapse toggle
 * (the middle of the side its branch grows towards) and, where possible, of the connector from its parent —
 * each given up in turn when a node is boxed in on every side.
 */
function handleCorner(placed: PlacedNode, isRoot: boolean, hasToggle: boolean, toolbarSide: ActionBarSide | null): HandleCorner {
  const taken = (sides: Direction[]) => new Set(sides.flatMap((side) => EDGE_CORNERS[side]));
  const bar: Direction[] = toolbarSide ? [({ above: "up", below: "down", left: "left", right: "right" } as const)[toolbarSide]] : [];
  const toggle: Direction[] = hasToggle ? [placed.dir] : [];
  const connector: Direction[] = isRoot ? [] : [OPPOSITE[placed.side]];
  for (const avoid of [taken([...bar, ...toggle, ...connector]), taken([...bar, ...toggle]), taken(bar)]) {
    const corner = HANDLE_CORNERS.find((candidate) => !avoid.has(candidate));
    if (corner) return corner;
  }
  return HANDLE_CORNERS[0];
}

/** The centre of the handle on `corner` of `placed`, in map pixels. */
function handleCentre(placed: PlacedNode, corner: HandleCorner): { x: number; y: number } {
  return {
    x: corner.endsWith("right") ? placed.x + placed.w / 2 : placed.x - placed.w / 2,
    y: corner.startsWith("bottom") ? placed.y + placed.h / 2 : placed.y - placed.h / 2,
  };
}

/** A node on its way out, as it last was: a deleted node is no longer in the map, so its data is kept with it. */
interface LeavingNode {
  placed: PlacedNode;
  node: MindNode;
  /** Items beneath it when it left, for a folded toggle's count. */
  descendants: number;
}

/** Nodes and connectors still animating out of the canvas, with the layout (and map) they were last compared against. */
interface Presence {
  layout: MindMapLayout;
  map: MindMap;
  nodes: LeavingNode[];
  edges: PlacedEdge[];
}

/**
 * Whether a finished animation was the exit (the one that fades to nothing). `onAnimationComplete` reports
 * whichever animation finishes next — a move still in flight when the node started leaving included — and
 * only the exit's completion means the element is done.
 */
const isExit = (definition: unknown): boolean =>
  typeof definition === "object" && definition !== null && (definition as { opacity?: unknown }).opacity === 0;

/** The action bar re-renders only when one of its flags changes, so its callbacks must hold still: see `useStableActions`. */
const StableNodeActionBar = memo(NodeActionBar);
/** The box a link's bar keeps clear of around the link's middle, in map units: about a label's height. */
const LINK_BAR_BOX_H = 20;

/** `actions` with every callback stable (each runs the latest one handed down) and the flags current. */
function useStableActions(actions: NodeActions): NodeActions {
  const latest = useRef(actions);
  useLayoutEffect(() => {
    latest.current = actions;
  });
  const callbacks = useMemo(
    () => ({
      onAddChild: () => latest.current.onAddChild(),
      onAddSibling: () => latest.current.onAddSibling(),
      onMoveUp: () => latest.current.onMoveUp(),
      onMoveDown: () => latest.current.onMoveDown(),
      onIndent: () => latest.current.onIndent(),
      onOutdent: () => latest.current.onOutdent(),
      onDelete: () => latest.current.onDelete(),
      onArrangeBranch: () => latest.current.onArrangeBranch(),
      onSetDirection: (dir: Direction | null) => latest.current.onSetDirection(dir),
      onLink: () => latest.current.onLink(),
      onEdit: () => latest.current.onEdit(),
    }),
    [],
  );
  const { canAddSibling, canMoveUp, canMoveDown, canIndent, canOutdent, canDelete, canArrangeBranch, direction, canLink: linkable, showEdit } = actions;
  return useMemo(
    () => ({ canAddSibling, canMoveUp, canMoveDown, canIndent, canOutdent, canDelete, canArrangeBranch, direction, canLink: linkable, showEdit, ...callbacks }),
    [canAddSibling, canMoveUp, canMoveDown, canIndent, canOutdent, canDelete, canArrangeBranch, direction, linkable, showEdit, callbacks],
  );
}

const sameProps = <P extends object>(a: P, b: P): boolean => {
  for (const key in a) if (!Object.is(a[key], b[key])) return false;
  return true;
};

/**
 * Elements reused from the previous render while their props are unchanged. Handed the very same element,
 * React skips the subtree at once — nothing to build, nothing to compare — which, with a few hundred nodes
 * and connectors, is what keeps a commit touching one node from costing a pass over all of them.
 */
function useElementCache<P extends object>(): (key: string, props: P, create: (props: P) => ReactElement) => ReactElement {
  const cache = useRef(new Map<string, { props: P; element: ReactElement }>());
  const previous = cache.current;
  const next = new Map<string, { props: P; element: ReactElement }>();
  // Entries from this render are kept once it is committed (a render React throws away keeps the old ones).
  useLayoutEffect(() => {
    cache.current = next;
  });
  return (key, props, create) => {
    const old = previous.get(key);
    const entry = old && sameProps(old.props, props) ? old : { props, element: create(props) };
    next.set(key, entry);
    return entry.element;
  };
}

/** The presence once `layout` (of `map`) has replaced the one in `current`: what has gone starts leaving; what is back stops. */
function leavingAfter(current: Presence, layout: MindMapLayout, map: MindMap): Presence {
  const nodeIds = new Set(layout.nodes.map((p) => p.id));
  const edgeIds = new Set(layout.edges.map((e) => e.id));
  const nodes = current.nodes.filter((entry) => !nodeIds.has(entry.placed.id));
  const edges = current.edges.filter((e) => !edgeIds.has(e.id));
  const leavingNodeIds = new Set(nodes.map((entry) => entry.placed.id));
  const leavingEdgeIds = new Set(edges.map((e) => e.id));
  let counts: Map<string, number> | null = null;
  for (const placed of current.layout.nodes) {
    const node = current.map.nodes[placed.id];
    if (!node || nodeIds.has(placed.id) || leavingNodeIds.has(placed.id)) continue;
    counts ??= countAllDescendants(current.map);
    nodes.push({ placed, node, descendants: counts.get(placed.id) ?? 0 });
  }
  for (const e of current.layout.edges) if (!edgeIds.has(e.id) && !leavingEdgeIds.has(e.id)) edges.push(e);
  return { layout, map, nodes, edges };
}

const actionsHintId = (id: string) => `${id}-actions-hint`;

export function MindMapCanvas({
  map,
  layout,
  selectedId,
  zoom,
  view,
  viewportRef,
  onPanForDrag,
  pinching,
  touchGesture,
  viewKey,
  captionId,
  onSelect,
  onToggle,
  onMove,
  onPlace,
  onReveal,
  actions,
  toolbarOpen,
  toolbarSide,
  toolbarCompact,
  onShowToolbar,
  onHideToolbar,
  matchIds,
  onDragChange,
  showLinks,
  selectedLinkId,
  onSelectLink,
  onLink,
  onPickLinkTarget,
  onEditNode,
  linkActions,
  onEditLink,
}: MindMapCanvasProps) {
  const reduceMotion = useAppStore((s) => s.reduceMotion);
  const transition: Transition = reduceMotion ? INSTANT : SETTLE;
  const [drag, setDrag] = useState<LiveDrag | null>(null);
  /** The node under the pointer: the links touching it are drawn at full strength while it is. */
  const [hoverId, setHoverId] = useState<string | null>(null);
  // The page hands down fresh closures every render; the nodes get one stable function each, so a change
  // elsewhere on the page (a description typed, a menu opened) does not re-render every node on the canvas.
  const selectNode = useStableCallback(onSelect);
  const toggleNode = useStableCallback(onToggle);
  const revealNode = useStableCallback(onReveal);
  const selectLink = useStableCallback((id: string) => onSelectLink(id));
  const pickLinkTarget = useStableCallback(onPickLinkTarget);
  const editNode = useStableCallback(onEditNode);
  const editLink = useStableCallback(onEditLink);
  const linkEdit = useStableCallback(linkActions.onEdit);
  const linkReverse = useStableCallback(linkActions.onReverse);
  const linkDelete = useStableCallback(linkActions.onDelete);
  const linkShowEdit = linkActions.showEdit;
  const stableLinkActions = useMemo<LinkActions>(
    () => ({ onEdit: linkEdit, onReverse: linkReverse, onDelete: linkDelete, showEdit: linkShowEdit }),
    [linkEdit, linkReverse, linkDelete, linkShowEdit],
  );
  const hoverNode = useCallback((id: string | null) => setHoverId(id), []);
  const stableActions = useStableActions(actions);
  const nodeElement = useElementCache<MindMapNodeProps>();
  const edgeElement = useElementCache<MindMapEdgeProps>();
  const linkElement = useElementCache<MindMapLinkProps>();
  const lastDelta = useRef({ x: 0, y: 0 });
  const startClient = useRef<{ x: number; y: number } | null>(null);
  const dragPinchGeneration = useRef(0);
  const cancelTouchDrop = useRef(false);
  const collisionArgs = useRef<Parameters<CollisionDetection>[0] | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const actionBarRef = useRef<HTMLDivElement>(null);
  /** Tab was pressed on the selected node while its bar was hidden: focus the bar as soon as it is shown. */
  const pendingBarFocus = useRef(false);
  const sensors = useSensors(useSensor(MouseSensor, MOUSE_SENSOR_OPTIONS), useSensor(TouchSensor, TOUCH_SENSOR_OPTIONS));

  const descendants = useMemo(() => countAllDescendants(map), [map]);
  // While a branch is dragged it follows the pointer live; the rest of the map holds still until the drop.
  const displacement = useMemo(() => drag ? dragDisplacement(drag.startPoint, { x: drag.dx, y: drag.dy }, drag.startView, view) : null, [drag, view]);
  const liveLayout = useMemo(
    () => (drag?.kind === "move" && displacement ? shiftBranch(map, layout, drag.id, displacement.x, displacement.y) : layout),
    [drag, displacement, layout, map],
  );
  const inDrag = (id: string) => drag?.kind === "move" && (id === drag.id || isDescendant(map, drag.id, id));
  // SVG paints in document order, so the dragged branch is rendered last to stay on top.
  const orderedNodes = drag?.kind === "move" ? [...liveLayout.nodes.filter((p) => !inDrag(p.id)), ...liveLayout.nodes.filter((p) => inDrag(p.id))] : liveLayout.nodes;
  /** The node a link is being dragged from, while one is. */
  const linkFrom = drag?.kind === "link" ? drag.id : null;
  const decorScale = decorScaleFor(zoom);
  // Links are routed around the nodes as they are placed right now — the same routes back while nothing moved.
  const routes = useMemo(() => (showLinks ? linkRoutes(map, liveLayout) : NO_ROUTES), [showLinks, map, liveLayout]);
  const touchesNode = (route: RoutedLink, id: string | null) => id !== null && (id === route.from || id === route.to || id === route.fromNode || id === route.toNode);
  const emphasisOf = (route: RoutedLink): LinkEmphasis => {
    if (route.id === selectedLinkId) return "selected";
    if (linkFrom !== null) return "faint";
    return touchesNode(route, selectedId) || touchesNode(route, hoverId) ? "strong" : "faint";
  };
  // The dots march along the links the selection concerns — the picked link and those touching the selected
  // node — towards their arrowheads; hovering alone brightens a link without setting it going. Nothing marches
  // for a user who asked for less motion, nor while a link is being dragged (every other link is faint then).
  const marches = (route: RoutedLink): boolean => !reduceMotion && (route.id === selectedLinkId || (linkFrom === null && touchesNode(route, selectedId)));

  // Nodes and connectors that have just left the layout (a branch folded, a node deleted, an undo) stay on the
  // canvas, animating back into their parent, until that animation has run. Tracked here rather than with a
  // presence wrapper per child: those wrappers re-render for every node on every commit, and with a hundred
  // nodes and more that was most of a keystroke's cost. Only the committed layout is compared — a drag moves
  // nodes without any leaving. (Derived from the previous render's layout, so a node is never dropped and
  // re-added between frames.)
  const [presence, setPresence] = useState<Presence>({ layout, map, nodes: [], edges: [] });
  // With motion reduced nothing animates out, so nothing is kept.
  if (presence.layout !== layout) setPresence(reduceMotion ? { layout, map, nodes: [], edges: [] } : leavingAfter(presence, layout, map));
  const leavingNodes = presence.layout === layout ? presence.nodes : [];
  const leavingEdges = presence.layout === layout ? presence.edges : [];
  const nodeLeft = useCallback(
    (id: string) =>
      setPresence((current) => (current.nodes.some((entry) => entry.placed.id === id) ? { ...current, nodes: current.nodes.filter((entry) => entry.placed.id !== id) } : current)),
    [],
  );
  const edgeLeft = useCallback(
    (id: string) => setPresence((current) => (current.edges.some((e) => e.id === id) ? { ...current, edges: current.edges.filter((e) => e.id !== id) } : current)),
    [],
  );

  // Nodes and connectors are positioned through `animate` alone, never `initial`: React re-attaches a moved
  // element in development, and motion then rewinds `initial`-driven values to the element's very first target,
  // which left connectors (and nodes) frozen where the map started. A node that is new since the last commit
  // instead mounts at its parent's centre and grows into place on the follow-up render; a node that has just
  // left the layout is forgotten, so it grows again when its branch is expanded.
  const settledIds = useRef<Set<string> | null>(null);
  if (settledIds.current === null) settledIds.current = new Set(liveLayout.nodes.map((p) => p.id));
  const isFresh = (id: string) => !settledIds.current?.has(id);
  const [, settle] = useReducer((tick: number) => tick + 1, 0);
  useEffect(() => {
    const hasFresh = liveLayout.nodes.some((p) => isFresh(p.id));
    settledIds.current = new Set(liveLayout.nodes.map((p) => p.id));
    if (hasFresh) settle();
  });

  const labelOf = (id: UniqueIdentifier | undefined) => (id === undefined ? "node" : (map.nodes[linkSource(id) ?? String(id)]?.label ?? "node"));
  const announcements: Announcements = {
    onDragStart: ({ active }) =>
      linkSource(active.id) !== null
        ? `Linking from ${labelOf(active.id)}. Drop on another node to draw a link between the two.`
        : `Picked up ${labelOf(active.id)}. Drop it on another node to nest it there, or anywhere else to leave it in that spot.`,
    onDragOver: ({ active, over }) => {
      const from = linkSource(active.id);
      if (!over) return `${labelOf(active.id)} is over empty canvas.`;
      if (from !== null) {
        const refusal = linkRefusal(map, from, String(over.id));
        return refusal ?? `Over ${labelOf(over.id)}. Drop to link ${labelOf(active.id)} to it.`;
      }
      return canMoveUnder(map, String(active.id), String(over.id))
        ? `${labelOf(active.id)} is over ${labelOf(over.id)}. Drop to move it under ${labelOf(over.id)}.`
        : `${labelOf(active.id)} can't be moved under ${labelOf(over.id)}.`;
    },
    onDragEnd: ({ active, over }) => {
      const from = linkSource(active.id);
      if (from !== null) return over && canLink(map, from, String(over.id)) ? `Linked ${labelOf(active.id)} to ${labelOf(over.id)}.` : "No link was drawn.";
      if (over && canMoveUnder(map, String(active.id), String(over.id))) return `Moved ${labelOf(active.id)} under ${labelOf(over.id)}.`;
      return Math.hypot(lastDelta.current.x, lastDelta.current.y) >= MIN_MOVE
        ? `Placed ${labelOf(active.id)} where it was dropped.`
        : `${labelOf(active.id)} was not moved.`;
    },
    onDragCancel: ({ active }) => (linkSource(active.id) !== null ? "Linking was cancelled." : `Moving ${labelOf(active.id)} was cancelled.`),
  };

  // Keyboard route between the selected node and its action bar: Tab on the node lands on the bar (showing it
  // again if it was hidden); from the bar, Shift+Tab returns to the node and Tab moves on to the node after it,
  // as if the bar sat between them. Escape hides the bar and puts focus back on the node.
  const nodeButtons = () => Array.from(svgRef.current?.querySelectorAll<HTMLButtonElement>("button[data-node-id]:not([inert])") ?? []);
  const focusNodeButton = (id: string) => nodeButtons().find((button) => button.dataset.nodeId === id)?.focus({ preventScroll: true });
  const focusBarItem = () => actionBarRef.current?.querySelector<HTMLElement>('[tabindex="0"]')?.focus({ preventScroll: true });
  const focusActionBar = useStableCallback(() => {
    if (actionBarRef.current) {
      focusBarItem();
      return;
    }
    pendingBarFocus.current = true;
    onShowToolbar();
  });
  useEffect(() => {
    if (!pendingBarFocus.current || !actionBarRef.current) return;
    pendingBarFocus.current = false;
    focusBarItem();
  });
  // Stable for the memoised action bar; each runs with the current selection.
  const dismissActionBar = useStableCallback(() => {
    onHideToolbar();
    if (selectedId) focusNodeButton(selectedId);
  });
  const focusAfterSelected = useStableCallback((): boolean => {
    const buttons = nodeButtons();
    const next = buttons[buttons.findIndex((button) => button.dataset.nodeId === selectedId) + 1];
    if (!next) return false;
    next.focus({ preventScroll: true });
    return true;
  });
  const focusSelectedNode = useStableCallback(() => {
    if (selectedId) focusNodeButton(selectedId);
  });
  /** The picked link has no button of its own: Escape and Shift+Tab from its bar land on the map. */
  const focusMap = useStableCallback(() => {
    actionBarRef.current?.closest<HTMLElement>("[data-map-viewport]")?.focus({ preventScroll: true });
  });
  const tabPastLinkBar = useStableCallback((): boolean => false);
  /** Hide on the link's bar lets go of the link, as Escape does, and brings the node's bar back. */
  const dismissLinkBar = useStableCallback(() => {
    focusMap();
    onSelectLink(null);
  });
  const selectedRoute = selectedLinkId && drag === null ? routes.find((route) => route.id === selectedLinkId) : undefined;

  const selectedPlaced = selectedId ? liveLayout.nodes.find((p) => p.id === selectedId) : undefined;
  const selectedNode = selectedId ? map.nodes[selectedId] : undefined;
  // The middle of the node edge the bar sits against, on the side chosen for it.
  const barAnchor = selectedPlaced
    ? {
        above: { x: selectedPlaced.x, y: selectedPlaced.y - selectedPlaced.h / 2 },
        below: { x: selectedPlaced.x, y: selectedPlaced.y + selectedPlaced.h / 2 },
        left: { x: selectedPlaced.x - selectedPlaced.w / 2, y: selectedPlaced.y },
        right: { x: selectedPlaced.x + selectedPlaced.w / 2, y: selectedPlaced.y },
      }[toolbarSide]
    : null;
  const barShown = toolbarOpen && drag === null && selectedLinkId === null;
  // The link handle sits on a free corner of the selected node; it steps aside with the bar during a drag.
  const handleAt =
    selectedPlaced && selectedNode && showLinks && drag?.kind !== "move"
      ? drag?.kind === "link"
        ? { x: drag.hx, y: drag.hy }
        : handleCentre(
            selectedPlaced,
            handleCorner(selectedPlaced, selectedPlaced.id === map.rootId, selectedPlaced.id !== map.rootId && selectedNode.children.length > 0, barShown ? toolbarSide : null),
          )
      : null;
  const handleRef = useRef(handleAt);
  useLayoutEffect(() => {
    handleRef.current = handleAt;
  });

  const collisionDetection = useCallback<CollisionDetection>((args) => {
    collisionArgs.current = args;
    const pointer = args.pointerCoordinates;
    const viewport = viewportRef.current?.getBoundingClientRect();
    if (!pointer || !viewport || pointer.x < viewport.left || pointer.x > viewport.right || pointer.y < viewport.top || pointer.y > viewport.bottom) return [];
    const rects = new Map(args.droppableRects);
    for (const container of args.droppableContainers) {
      const rect = container.node.current?.getBoundingClientRect();
      if (rect) rects.set(container.id, rect);
    }
    return pointerWithin({ ...args, droppableRects: rects });
  }, [viewportRef]);

  const dragActive = drag !== null;
  useEffect(() => {
    if (!pinching || !dragActive) return;
    cancelTouchDrop.current = true;
    setDrag(null);
    onDragChange?.(false);
  }, [pinching, dragActive, onDragChange]);

  useEffect(() => {
    if (!dragActive) return;
    let frame = 0;
    let previous: number | null = null;
    const step = (now: number) => {
      const viewport = viewportRef.current?.getBoundingClientRect();
      const start = startClient.current;
      if (viewport && start && previous !== null) {
        const velocity = edgePanVelocity({ x: start.x + lastDelta.current.x, y: start.y + lastDelta.current.y }, viewport);
        const seconds = Math.min(now - previous, 40) / 1000;
        if (velocity.x || velocity.y) onPanForDrag(velocity.x * seconds, velocity.y * seconds);
      }
      previous = now;
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [dragActive, onPanForDrag, viewportRef]);

  const handleDragStart = ({ active, activatorEvent }: DragStartEvent) => {
    dragPinchGeneration.current = touchGesture.current.pinchGeneration;
    cancelTouchDrop.current = touchGesture.current.blockDrag;
    if (cancelTouchDrop.current) return;
    lastDelta.current = { x: 0, y: 0 };
    const pointer = activatorEvent instanceof MouseEvent
      ? activatorEvent
      : typeof TouchEvent !== "undefined" && activatorEvent instanceof TouchEvent
        ? activatorEvent.touches[0] ?? activatorEvent.changedTouches[0]
        : null;
    const viewport = viewportRef.current?.getBoundingClientRect();
    startClient.current = pointer ? { x: pointer.clientX, y: pointer.clientY } : null;
    const startPoint = pointer && viewport ? { x: pointer.clientX - viewport.left, y: pointer.clientY - viewport.top } : { x: 0, y: 0 };
    const from = linkSource(active.id);
    const handle = handleRef.current;
    if (from !== null) setDrag({ kind: "link", id: from, dx: 0, dy: 0, hx: handle?.x ?? 0, hy: handle?.y ?? 0, startPoint, startView: view });
    else setDrag({ kind: "move", id: String(active.id), dx: 0, dy: 0, hx: 0, hy: 0, startPoint, startView: view });
    onDragChange?.(true);
  };
  const handleDragMove = ({ delta }: DragMoveEvent) => {
    if (cancelTouchDrop.current || touchGesture.current.pinchGeneration !== dragPinchGeneration.current) return;
    lastDelta.current = delta;
    setDrag((current) => (current ? { ...current, dx: delta.x, dy: delta.y } : current));
  };
  const handleDragCancel = () => {
    cancelTouchDrop.current = false;
    startClient.current = null;
    collisionArgs.current = null;
    setDrag(null);
    onDragChange?.(false);
  };
  const handleDragEnd = ({ active, over, delta }: DragEndEvent) => {
    const start = startClient.current;
    const args = collisionArgs.current;
    const moved = drag ? dragDisplacement(drag.startPoint, delta, drag.startView, view) : null;
    const target = start && args
      ? collisionDetection({ ...args, pointerCoordinates: { x: start.x + delta.x, y: start.y + delta.y } })[0]?.id
      : over?.id;
    startClient.current = null;
    collisionArgs.current = null;
    setDrag(null);
    onDragChange?.(false);
    lastDelta.current = moved ? { x: moved.x * zoom, y: moved.y * zoom } : delta;
    const from = linkSource(active.id);
    if (from !== null) {
      if (target !== undefined && canLink(map, from, String(target))) onLink(from, String(target));
      return;
    }
    const id = String(active.id);
    if (target !== undefined && canMoveUnder(map, id, String(target))) {
      onMove(id, String(target));
      return;
    }
    if (!moved) return;
    if (Math.hypot(moved.x * zoom, moved.y * zoom) < MIN_MOVE) return;
    const placed = layout.nodes.find((p) => p.id === id);
    const parentId = map.nodes[id]?.parentId;
    const parent = parentId ? layout.nodes.find((p) => p.id === parentId) : undefined;
    if (!placed || !parent) return;
    onPlace(id, { x: placed.x + moved.x - parent.x, y: placed.y + moved.y - parent.y });
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      autoScroll={false}
      cancelDrop={() => cancelTouchDrop.current || touchGesture.current.pinchGeneration !== dragPinchGeneration.current}
      accessibility={{
        announcements,
        screenReaderInstructions: {
          draggable:
            "Select the node, then press Tab for its actions: add a child or sibling, move it up or down, indent or outdent it, arrange its branch, lock the side its branch grows towards, or link it to another node. Escape hides the actions. The Position buttons in the inspector nudge it.",
        },
      }}
      onDragStart={handleDragStart}
      onDragMove={handleDragMove}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <svg
        ref={svgRef}
        data-mindmap-canvas=""
        role="group"
        aria-labelledby={captionId}
        width={layout.width}
        height={layout.height}
        viewBox={`${layout.minX} ${layout.minY} ${layout.width} ${layout.height}`}
        style={{ left: layout.minX, top: layout.minY }}
        className="absolute overflow-visible"
      >
        {/* Live and leaving items share one list, so a node that comes back while leaving keeps its element and
            simply turns around. Elements are reused while their props hold still (see `useElementCache`). */}
        {[
          // A connector is named after the node it leads to, so it fades with that node when the search misses it.
          ...liveLayout.edges.map((edge) =>
            edgeElement(
              edge.id,
              { edge, fresh: isFresh(edge.id), leaving: false, faded: matchIds !== null && !matchIds.has(edge.id), transition: inDrag(edge.id) ? INSTANT : transition, onLeft: edgeLeft },
              (props) => <MindMapEdge key={edge.id} {...props} />,
            ),
          ),
          ...leavingEdges.map((edge) =>
            edgeElement(edge.id, { edge, fresh: false, leaving: true, faded: false, transition, onLeft: edgeLeft }, (props) => <MindMapEdge key={edge.id} {...props} />),
          ),
        ]}
        {/* Association links: above the tree's connectors, beneath the nodes. Decorative here — the inspector lists them. */}
        <g aria-hidden="true" data-link-layer="">
          {routes.map((route) =>
            linkElement(route.id, { route, emphasis: emphasisOf(route), marching: marches(route), transition: drag ? INSTANT : transition, onSelect: selectLink, onEdit: editLink }, (props) => (
              <MindMapLink key={route.id} {...props} />
            )),
          )}
          {drag?.kind === "link" && (
            <g className="pointer-events-none text-primary forced-colors:text-[Highlight]">
              <path
                d={`M ${drag.hx} ${drag.hy} L ${drag.hx + (displacement?.x ?? 0)} ${drag.hy + (displacement?.y ?? 0)}`}
                className="fill-none stroke-current"
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeDasharray="0.5 6"
              />
              <circle cx={drag.hx + (displacement?.x ?? 0)} cy={drag.hy + (displacement?.y ?? 0)} r={5} className="fill-current" />
            </g>
          )}
        </g>
        {[
          ...orderedNodes.map((placed) => {
            const node = map.nodes[placed.id];
            if (!node) return null;
            const selected = placed.id === selectedId;
            return nodeElement(
              placed.id,
              {
                placed,
                node,
                isRoot: placed.id === map.rootId,
                selected,
                fresh: isFresh(placed.id),
                leaving: false,
                descendants: descendants.get(placed.id) ?? 0,
                match: matchIds ? matchIds.has(placed.id) : null,
                dropDisabled: drag !== null && (linkFrom !== null ? !canLink(map, linkFrom, placed.id) : !canMoveUnder(map, drag.id, placed.id)),
                dimmed: linkFrom !== null && linkFrom !== placed.id && !canLink(map, linkFrom, placed.id),
                decorScale,
                transition: inDrag(placed.id) ? INSTANT : transition,
                onSelect: selectNode,
                onToggle: toggleNode,
                onReveal: revealNode,
                onHover: hoverNode,
                onLeft: nodeLeft,
                onEdit: editNode,
                onTabToActions: selected ? focusActionBar : undefined,
              },
              (props) => <MindMapNode key={placed.id} {...props} />,
            );
          }),
          // Each as it last was; it shrinks back into its parent and takes no clicks, focus or drops meanwhile.
          ...leavingNodes.map(({ placed, node, descendants: nested }) =>
            nodeElement(
              placed.id,
              {
                placed,
                node,
                isRoot: false,
                selected: false,
                fresh: false,
                leaving: true,
                descendants: nested,
                match: null,
                dropDisabled: true,
                dimmed: false,
                decorScale,
                transition,
                onSelect: selectNode,
                onToggle: toggleNode,
                onReveal: revealNode,
                onHover: hoverNode,
                onLeft: nodeLeft,
                onTabToActions: undefined,
              },
              (props) => <MindMapNode key={placed.id} {...props} />,
            ),
          ),
        ]}
        {selectedPlaced && selectedNode && handleAt && decorScale !== null && (
          // After every node, so it paints over its neighbours; a drag from it draws a link, a click opens the node picker.
          <LinkHandle key={selectedPlaced.id} id={selectedPlaced.id} label={selectedNode.label} x={handleAt.x} y={handleAt.y} scale={decorScale} onPick={pickLinkTarget} />
        )}
      </svg>
      {selectedId && (
        <span id={actionsHintId(selectedId)} className="sr-only">
          Press Tab for the node's actions.
        </span>
      )}
      {selectedPlaced && selectedNode && barAnchor && barShown && (
        // After the SVG in the DOM, so it paints over every node and connector. It steps aside during a drag.
        <div ref={actionBarRef} className="contents">
          <StableNodeActionBar
            key={selectedPlaced.id}
            actions={stableActions}
            label={selectedNode.label}
            isRoot={selectedPlaced.id === map.rootId}
            x={barAnchor.x}
            y={barAnchor.y}
            side={toolbarSide}
            compact={toolbarCompact}
            nodeWidth={selectedPlaced.w}
            nodeHeight={selectedPlaced.h}
            zoom={zoom}
            viewKey={viewKey}
            onFocusNode={focusSelectedNode}
            onTabForward={focusAfterSelected}
            onDismiss={dismissActionBar}
          />
        </div>
      )}
      {selectedRoute && (
        // The picked link's bar: the node's own bar, anchored above the link's middle (its label, when it has one).
        <div ref={actionBarRef} className="contents">
          <StableNodeActionBar
            // Keyed on the pair, not the direction: Reverse keeps the bar (and the focus on it) in place.
            key={[selectedRoute.from, selectedRoute.to].sort().join("|")}
            actions={stableActions}
            linkActions={stableLinkActions}
            label={`from ${map.nodes[selectedRoute.from]?.label ?? ""} to ${map.nodes[selectedRoute.to]?.label ?? ""}`}
            isRoot={false}
            x={selectedRoute.mx}
            y={selectedRoute.my - LINK_BAR_BOX_H / 2}
            side="above"
            compact={toolbarCompact}
            nodeWidth={Math.max(selectedRoute.labelW, LINK_BAR_BOX_H)}
            nodeHeight={LINK_BAR_BOX_H}
            zoom={zoom}
            viewKey={viewKey}
            onFocusNode={focusMap}
            onTabForward={tabPastLinkBar}
            onDismiss={dismissLinkBar}
          />
        </div>
      )}
    </DndContext>
  );
}

interface MindMapEdgeProps {
  edge: PlacedEdge;
  /** New since the last commit: drawn collapsed into its parent, unseen, until the next render grows it out. */
  fresh: boolean;
  /** Gone from the layout: shrinks back into its parent, then reports itself done through `onLeft`. */
  leaving: boolean;
  /** Leads to a node the search does not match: drawn faint, so the connectors into the matches stand out. */
  faded: boolean;
  transition: Transition;
  onLeft: (id: string) => void;
}

/** One connector. Memoised: a commit that leaves this connector's geometry alone leaves its element alone. */
const MindMapEdge = memo(function MindMapEdge({ edge, fresh, leaving, faded, transition, onLeft }: MindMapEdgeProps) {
  useExitFallback(leaving, edge.id, onLeft);
  return (
    <motion.path
      data-edge-id={edge.id}
      aria-hidden="true"
      className={cn("fill-none forced-colors:stroke-[color:CanvasText]", getColor(edge.color).stroke)}
      strokeLinecap="round"
      initial={false}
      animate={fresh || leaving ? { d: edge.collapsedD, opacity: 0, strokeWidth: edge.width } : { d: edge.d, opacity: faded ? FADED_EDGE : 1, strokeWidth: edge.width }}
      transition={transition}
      onAnimationComplete={leaving ? (definition) => isExit(definition) && onLeft(edge.id) : undefined}
    />
  );
});

interface MindMapNodeProps {
  placed: PlacedNode;
  node: MindNode;
  isRoot: boolean;
  selected: boolean;
  /** New since the last commit: sits at its parent's centre, unseen, until the next render grows it into place. */
  fresh: boolean;
  /** Gone from the layout (its branch folded, deleted, undone): shrinks back into its parent, then reports itself done through `onLeft`. */
  leaving: boolean;
  descendants: number;
  /** Whether the node matches the search: true (marked), false (greyed), or null when no search is on. */
  match: boolean | null;
  dropDisabled: boolean;
  /** A link is being dragged and this node cannot be its target. */
  dimmed: boolean;
  /** Scale for the expand/collapse toggle so it stays legible when zoomed out and modest when zoomed in; null hides it. */
  decorScale: number | null;
  transition: Transition;
  /** `byPointer` when a click or tap picked it, so the page can wait out a possible double-click before panning. */
  onSelect: (id: string, byPointer?: boolean) => void;
  onToggle: (id: string) => void;
  onReveal: (id: string) => void;
  /** The pointer entered (id) or left (null) the node. */
  onHover: (id: string | null) => void;
  onLeft: (id: string) => void;
  /** Double-click or double-tap: open the node's details. */
  onEdit?: (id: string) => void;
  /** Set on the selected node only: Tab moves focus to its action bar instead of the next node. */
  onTabToActions?: () => void;
}

/**
 * One node. Memoised: with the layout sharing unmoved placements and the page's handlers made stable, a commit
 * re-renders only the nodes whose own data or place changed — typing in one label touches one node, not all.
 */
const MindMapNode = memo(function MindMapNode({
  placed,
  node,
  isRoot,
  selected,
  fresh,
  leaving,
  descendants,
  match,
  dropDisabled,
  dimmed,
  decorScale,
  transition,
  onSelect,
  onToggle,
  onReveal,
  onHover,
  onLeft,
  onEdit,
  onTabToActions,
}: MindMapNodeProps) {
  const color = getColor(node.color);
  const spec = SIZE_SPECS[node.size];
  const iconEntry = getIcon(node.icon);
  useExitFallback(leaving, node.id, onLeft);
  // A node animating out (its branch collapsed or deleted) is still on screen for a moment; it must not take
  // clicks, focus, or drops meant for whatever is underneath it — typically the toggle that just collapsed it.
  const showToggle = !isRoot && node.children.length > 0 && decorScale !== null;
  const toggleWidth = node.collapsed ? 38 : 22;
  // The toggle sits on the side the branch grows from, between the node and its children.
  const { fx, fy } = directionVector(placed.dir);
  const toggleX = fx * (placed.w / 2) - toggleWidth / 2;
  const toggleY = fy * (placed.h / 2) - 11;
  const CollapseChevron = COLLAPSE_CHEVRON[placed.dir];
  // The node button is both the drag handle (root excluded) and a drop target; the toolbar and inspector remain the keyboard route.
  const { setNodeRef: setDragRef, listeners, isDragging } = useDraggable({ id: node.id, disabled: isRoot || leaving });
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: node.id, disabled: dropDisabled });
  const setRefs = (element: HTMLButtonElement | null) => {
    setDragRef(element);
    setDropRef(element);
  };
  // A search miss is greyed and faded so the matches carry the eye — but drawn at full strength while it is
  // selected, dragged or dropped on (and, below, hovered or focused), so its label and its ring stay legible
  // whenever it is the one being used. It stays selectable throughout.
  const faded = match === false && !selected && !isDragging && !isOver;
  // Under forced colours the user's own contrast is kept for the text; the connectors and the match badges carry the filter.
  const FADED = "opacity-50 hover:opacity-100 focus-visible:opacity-100 forced-colors:opacity-100";

  return (
    <motion.g
      initial={false}
      animate={fresh || leaving ? { x: placed.px, y: placed.py, opacity: 0 } : { x: placed.x, y: placed.y, opacity: 1 }}
      transition={transition}
      onAnimationComplete={leaving ? (definition) => isExit(definition) && onLeft(node.id) : undefined}
      className={cn(leaving && "pointer-events-none")}
    >
      <foreignObject x={-placed.w / 2} y={-placed.h / 2} width={placed.w} height={placed.h} className="overflow-visible">
        <button
          ref={setRefs}
          type="button"
          inert={leaving}
          data-node-id={node.id}
          onClick={(event) => onSelect(node.id, event.detail > 0)}
          onDoubleClick={onEdit && (() => onEdit(node.id))}
          // Keyboard focus brings the node into view; a click doesn't, or the map would slide out from under a double-click.
          onFocus={(event) => {
            if (event.currentTarget.matches(":focus-visible")) onReveal(node.id);
          }}
          onPointerEnter={() => onHover(node.id)}
          onPointerLeave={() => onHover(null)}
          aria-pressed={selected}
          // One string, so screen readers don't hear a gap between the label and its details.
          aria-label={[
            node.label,
            `${IMPORTANCE_LABEL[node.importance]} importance`,
            node.tags.length ? `tagged ${node.tags.join(", ")}` : "",
            descendants ? `${descendants} nested${node.collapsed ? " and hidden" : ""}` : "",
            match === true ? "matches the search" : "",
          ]
            .filter(Boolean)
            .join(", ")}
          aria-describedby={onTabToActions ? actionsHintId(node.id) : undefined}
          style={{ padding: `${spec.padY}px ${spec.padX}px`, fontSize: spec.font, lineHeight: `${spec.line}px` }}
          {...listeners}
          onKeyDown={(event) => {
            // Pointer sensors only, so no drag listener is displaced here.
            if (event.key === "Tab" && !event.shiftKey && onTabToActions) {
              event.preventDefault();
              onTabToActions();
            }
          }}
          className={cn(
            "flex min-h-full w-full touch-manipulation items-center gap-2 border border-transparent text-left shadow-md ring-offset-background transition-[translate,scale,box-shadow,opacity] duration-200 hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            isRoot ? "justify-center rounded-full font-semibold" : "cursor-grab rounded-xl active:cursor-grabbing",
            color.fill,
            node.importance === "high" && "font-semibold",
            node.importance === "low" && "border-dashed border-white/70",
            selected &&
              "ring-2 ring-ring ring-offset-2 forced-colors:outline-2 forced-colors:outline-dashed forced-colors:outline-[color:Highlight]",
            isDragging && "cursor-grabbing shadow-xl ring-2 ring-ring ring-offset-2",
            isOver && "scale-105 ring-4 ring-primary ring-offset-2 forced-colors:outline-4 forced-colors:outline-solid forced-colors:outline-[color:Highlight]",
            // Greyed as well as faded, while matching nodes keep their colour and a marker.
            match === false && "grayscale",
            faded && FADED,
            // Not a target for the link being dragged: greyed like a search miss, so the label keeps its contrast.
            dimmed && "grayscale",
          )}
        >
          {iconEntry && <iconEntry.Icon aria-hidden="true" className="shrink-0" style={{ width: spec.font + 4, height: spec.font + 4 }} />}
          <span className="min-w-0 break-words">{node.label}</span>
          {node.importance === "high" && (
            <Star aria-hidden="true" className="shrink-0 fill-current" style={{ width: spec.font - 2, height: spec.font - 2 }} />
          )}
          {node.tags.length > 0 && <Tag aria-hidden="true" className="shrink-0 opacity-90" style={{ width: spec.font - 2, height: spec.font - 2 }} />}
        </button>
      </foreignObject>
      {match === true && (
        // Beside the button rather than inside it, so it neither takes room from the label nor ends up in a PNG export.
        <foreignObject x={placed.w / 2 - 12} y={-placed.h / 2 - 10} width={22} height={22} className="pointer-events-none overflow-visible">
          <span
            aria-hidden="true"
            className="grid size-[22px] place-items-center rounded-full border-2 border-card bg-foreground text-background shadow-sm forced-colors:border-[color:Canvas] forced-colors:bg-[Highlight] forced-colors:text-[HighlightText]"
          >
            <Search className="size-3" />
          </span>
        </foreignObject>
      )}
      {showToggle && decorScale !== null && (
        <foreignObject {...centeredDecoration(toggleX, toggleY, toggleWidth, LINK_HANDLE_SIZE, decorScale)} className="overflow-visible">
          <button
            type="button"
            inert={leaving}
            onClick={() => onToggle(node.id)}
            aria-expanded={!node.collapsed}
            aria-label={`${node.collapsed ? "Expand" : "Collapse"} branch: ${node.label}`}
            style={{ width: toggleWidth * decorScale, height: LINK_HANDLE_SIZE * decorScale, borderWidth: decorScale, fontSize: 11 * decorScale, paddingInline: 4 * decorScale }}
            className={cn(
              "flex items-center justify-center rounded-full border border-border bg-card font-semibold tabular-nums text-foreground shadow-sm transition-[color,background-color,opacity] hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              // The toggle fades with its node, and comes back with it under the pointer or focus.
              match === false && FADED,
            )}
          >
            {node.collapsed ? `+${descendants}` : <CollapseChevron aria-hidden="true" style={{ width: DECOR_GLYPH * decorScale, height: DECOR_GLYPH * decorScale }} />}
          </button>
        </foreignObject>
      )}
    </motion.g>
  );
});

interface MindMapLinkProps {
  route: RoutedLink;
  emphasis: LinkEmphasis;
  /** The dots travel along the line towards the arrowhead (a CSS animation on the line alone; see `link-march` in index.css). */
  marching: boolean;
  transition: Transition;
  onSelect: (id: string) => void;
  onEdit: (id: string) => void;
}

/**
 * One association link: a dotted line with an open arrowhead at the node it leads to, and its label on a
 * pill halfway along — shown only while the link is drawn at full strength, so a faint link is a trace and
 * not a caption. Every path keeps the same command shape (see `mindmap-links`), so a change of route morphs.
 * Memoised: a commit that leaves the route and its emphasis alone leaves its element alone.
 */
const MindMapLink = memo(function MindMapLink({ route, emphasis, marching, transition, onSelect, onEdit }: MindMapLinkProps) {
  const selected = emphasis === "selected";
  const faint = emphasis === "faint";
  const opacity = (faint ? FAINT_LINK : 1) * (route.attached ? ATTACHED_LINK : 1);
  return (
    <motion.g
      data-link-id={route.id}
      initial={false}
      animate={{ opacity }}
      transition={transition}
      onClick={() => onSelect(route.id)}
      onDoubleClick={() => onEdit(route.id)}
      className={cn("cursor-pointer", selected ? "text-primary forced-colors:text-[Highlight]" : "text-foreground forced-colors:text-[CanvasText]")}
    >
      {/* A wide, unseen stroke so the thin dotted line is easy to click. */}
      <motion.path initial={false} animate={{ d: route.d }} transition={transition} className="fill-none stroke-transparent" strokeWidth={16} strokeLinecap="round" />
      {selected && <motion.path initial={false} animate={{ d: route.d }} transition={transition} className="fill-none stroke-current opacity-25" strokeWidth={9} strokeLinecap="round" />}
      <motion.path
        data-link-line=""
        initial={false}
        animate={{ d: route.d }}
        transition={transition}
        className={cn("fill-none stroke-current", marching && "motion-safe:link-march")}
        strokeWidth={selected ? 2.5 : 2}
        strokeLinecap="round"
        strokeDasharray="0.5 6"
      />
      <motion.path
        initial={false}
        animate={{ d: route.arrowD }}
        transition={transition}
        className="fill-none stroke-current"
        strokeWidth={selected ? 2.5 : 2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {route.label && !faint && (
        <motion.g initial={false} animate={{ x: route.mx, y: route.my }} transition={transition}>
          <rect
            x={-route.labelW / 2}
            y={-LINK_LABEL_HEIGHT / 2}
            width={route.labelW}
            height={LINK_LABEL_HEIGHT}
            rx={LINK_LABEL_HEIGHT / 2}
            className="fill-card stroke-current forced-colors:fill-[color:Canvas]"
            strokeWidth={1}
          />
          <text
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={LINK_LABEL_FONT.size}
            fontWeight={LINK_LABEL_FONT.weight}
            className="fill-foreground select-none forced-colors:fill-[color:CanvasText]"
          >
            {route.label}
          </text>
        </motion.g>
      )}
    </motion.g>
  );
});

interface LinkHandleProps {
  /** The selected node the handle belongs to. */
  id: string;
  label: string;
  /** The handle's centre, in map pixels. */
  x: number;
  y: number;
  /** Enlargement that keeps it at its minimum size on screen when zoomed out. */
  scale: number;
  /** A click (no drag) opens the node picker for this node. */
  onPick: (id: string) => void;
}

/**
 * The small round handle on the selected node a link is dragged from. The keyboard reaches the same thing
 * through the action bar's "Link to another node…", so the handle itself stays out of the tab order.
 */
function LinkHandle({ id, label, x, y, scale, onPick }: LinkHandleProps) {
  const { setNodeRef, listeners, isDragging } = useDraggable({ id: `${LINK_HANDLE_PREFIX}${id}` });
  return (
    <foreignObject {...centeredDecoration(x - LINK_HANDLE_SIZE / 2, y - LINK_HANDLE_SIZE / 2, LINK_HANDLE_SIZE, LINK_HANDLE_SIZE, scale)} className="overflow-visible">
      <button
        ref={setNodeRef}
        type="button"
        tabIndex={-1}
        data-link-handle=""
        aria-label={`Link ${label} to another node: drag to a node, or click to choose one`}
        title="Link to another node"
        onClick={() => onPick(id)}
        style={{ width: LINK_HANDLE_SIZE * scale, height: LINK_HANDLE_SIZE * scale, borderWidth: scale }}
        {...listeners}
        className={cn(
          "grid touch-none place-items-center rounded-full border border-border bg-card text-foreground shadow-sm transition-colors hover:bg-primary hover:text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring forced-colors:border-[color:ButtonText]",
          isDragging && "pointer-events-none opacity-0",
          isDragging ? "cursor-grabbing bg-primary text-primary-foreground" : "cursor-crosshair",
        )}
      >
        <Spline aria-hidden="true" style={{ width: DECOR_GLYPH * scale, height: DECOR_GLYPH * scale }} />
      </button>
    </foreignObject>
  );
}
