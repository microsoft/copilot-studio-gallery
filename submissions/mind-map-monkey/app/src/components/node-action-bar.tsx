import { Fragment, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactElement } from "react";
import {
  ArrowBigDown,
  ArrowBigLeft,
  ArrowBigRight,
  ArrowBigUp,
  ArrowDown,
  ArrowLeftRight,
  ArrowUp,
  CornerDownRight,
  Ellipsis,
  GripVertical,
  IndentDecrease,
  IndentIncrease,
  Network,
  Pencil,
  Plus,
  Signpost,
  Spline,
  Trash2,
  X,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useRovingToolbar } from "@/hooks/use-roving-toolbar";
import { NODE_ACTION_BAR_GAP, placeActionBar, type ActionBarSide } from "@/lib/action-bar-placement";
import { DIRECTIONS, DIRECTION_LABEL, isDirection, type Direction } from "@/lib/mindmap-data";
import { cn } from "@/lib/utils";

/** What the selected node may do right now, and what each action does to the map. */
export interface NodeActions {
  canAddSibling: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  canIndent: boolean;
  canOutdent: boolean;
  canDelete: boolean;
  /** Something beneath the node was placed by hand, so there is a branch to tidy. */
  canArrangeBranch: boolean;
  /** The side the node's branch is locked to grow towards; null while it grows away from its parent. */
  direction: Direction | null;
  /** There is at least one other node this one could be linked to. */
  canLink: boolean;
  onAddChild: () => void;
  onAddSibling: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onIndent: () => void;
  onOutdent: () => void;
  onDelete: () => void;
  onArrangeBranch: () => void;
  onSetDirection: (dir: Direction | null) => void;
  /** Choose a node to draw an association link to (the keyboard route; the handle on the node is the pointer one). */
  onLink: () => void;
  /** Open the node's details: the inspector sheet over the map, or its Label field when the details are pinned beside the map. */
  onEdit: () => void;
  /** Offer Edit on the bar — left off while the details panel is pinned beside the map, where it is always in view. */
  showEdit: boolean;
}

/** The picked link's toolbar: the same bar a node has, with what a link can do. */
export interface LinkActions {
  /** Open the link's details, as Edit node does for a node. */
  onEdit: () => void;
  onReverse: () => void;
  onDelete: () => void;
  showEdit: boolean;
}

/** The fly-out's icons: a signpost while the branch follows its parent, a bold arrow for a locked side. */
const DIRECTION_ICON: Record<Direction, LucideIcon> = { right: ArrowBigRight, down: ArrowBigDown, left: ArrowBigLeft, up: ArrowBigUp };

/** The direction control's accessible name — also its tooltip — naming the current setting. */
const directionLabel = (direction: Direction | null): string =>
  direction ? `Branch direction: locked ${DIRECTION_LABEL[direction].toLowerCase()}` : "Branch direction: automatic";

interface NodeActionBarProps {
  actions: NodeActions;
  /** Set while a link is picked: the bar offers the link's actions instead of the node's. */
  linkActions?: LinkActions;
  /** The selected node's label, for the toolbar's accessible name. */
  label: string;
  isRoot: boolean;
  /** Anchor in map pixels: the middle of the node edge the bar sits against. */
  x: number;
  y: number;
  side: ActionBarSide;
  /** On a narrow map (a phone, say) the less-used actions go into a More actions menu so the bar stays on one row. */
  compact?: boolean;
  /** The selected node's size in map pixels, so the bar can be kept off it. */
  nodeWidth: number;
  nodeHeight: number;
  /** Current map zoom; the bar is drawn at screen size whatever the zoom. */
  zoom: number;
  /** Changes whenever the map pans or zooms, so the bar re-checks it still clears the node and the map's edges. */
  viewKey?: string;
  /** Shift+Tab: hand focus back to the node, leaving the bar up. */
  onFocusNode: () => void;
  /** Tab: move on to the node after the selected one; `false` lets the browser decide. */
  onTabForward: () => boolean;
  /** Escape or the close button: hide the bar (the caller returns focus to the node). */
  onDismiss: () => void;
}

// The bar's button count must match `BAR_ITEMS` in `@/lib/action-bar-placement`, which sizes the room kept for it.

interface ActionItem {
  key: string;
  label: string;
  Icon: LucideIcon;
  enabled: boolean;
  /** What the button does; the direction item has none — its button opens the fly-out instead. */
  run?: () => void;
  destructive?: boolean;
  /** A divider is drawn before this item. */
  divider?: boolean;
}

export function NodeActionBar({
  actions,
  linkActions,
  label,
  isRoot,
  x,
  y,
  side,
  compact = false,
  nodeWidth,
  nodeHeight,
  zoom,
  viewKey,
  onFocusNode,
  onTabForward,
  onDismiss,
}: NodeActionBarProps) {
  const edit: ActionItem = { key: "edit", label: "Edit node", Icon: Pencil, enabled: true, run: actions.onEdit };
  const addChild: ActionItem = { key: "add-child", label: "Add child", Icon: CornerDownRight, enabled: true, run: actions.onAddChild };
  const arrange: ActionItem = {
    key: "arrange",
    label: isRoot ? "Auto-arrange" : "Arrange branch",
    Icon: Network,
    enabled: actions.canArrangeBranch,
    run: actions.onArrangeBranch,
  };
  const direction: ActionItem = {
    key: "direction",
    label: directionLabel(actions.direction),
    Icon: actions.direction ? DIRECTION_ICON[actions.direction] : Signpost,
    enabled: true,
  };
  const link: ActionItem = { key: "link", label: "Link to another node…", Icon: Spline, enabled: actions.canLink, run: actions.onLink };
  const close: ActionItem = { key: "close", label: "Hide actions", Icon: X, enabled: true, run: onDismiss, divider: true };
  const addSibling: ActionItem = { key: "add-sibling", label: "Add sibling", Icon: Plus, enabled: actions.canAddSibling, run: actions.onAddSibling };
  const remove: ActionItem = { key: "delete", label: "Delete", Icon: Trash2, enabled: actions.canDelete, run: actions.onDelete, destructive: true, divider: true };
  const rearrange: ActionItem[] = [
    { key: "move-up", label: "Move up", Icon: ArrowUp, enabled: actions.canMoveUp, run: actions.onMoveUp },
    { key: "move-down", label: "Move down", Icon: ArrowDown, enabled: actions.canMoveDown, run: actions.onMoveDown },
    { key: "indent", label: "Indent", Icon: IndentIncrease, enabled: actions.canIndent, run: actions.onIndent },
    { key: "outdent", label: "Outdent", Icon: IndentDecrease, enabled: actions.canOutdent, run: actions.onOutdent },
    arrange,
  ];
  const more: ActionItem = { key: "more", label: "More actions", Icon: Ellipsis, enabled: true };
  const editItems = actions.showEdit ? [edit] : [];
  // The root has no siblings and no parent, and deals its branches all around itself: only Add child, linking and arranging the whole map apply.
  const items: ActionItem[] = linkActions
    ? [
        ...(linkActions.showEdit ? [{ key: "edit", label: "Edit link", Icon: Pencil, enabled: true, run: linkActions.onEdit }] : []),
        { key: "reverse", label: "Reverse direction", Icon: ArrowLeftRight, enabled: true, run: linkActions.onReverse },
        { key: "delete", label: "Remove link", Icon: Trash2, enabled: true, run: linkActions.onDelete, destructive: true, divider: true },
        close,
      ]
    : isRoot
    ? [...editItems, addChild, link, arrange, close]
    : compact
      ? [...editItems, addChild, addSibling, link, more, remove, close]
      : [...editItems, addChild, addSibling, ...rearrange, direction, link, remove, close];
  const toolbar = useRovingToolbar(items.length);
  const barRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  /**
   * Where the bar ended up, in screen pixels from the anchor: measured after it renders, and moved to another side
   * of the node when the chosen one would cover the node or leave the map.
   */
  const [placed, setPlaced] = useState<{ side: ActionBarSide; dx: number; dy: number } | null>(null);
  useLayoutEffect(() => {
    const bar = barRef.current;
    const anchor = anchorRef.current;
    const frame = bar?.closest<HTMLElement>("[data-map-viewport]");
    if (!bar || !anchor || !frame) return;
    const a = anchor.getBoundingClientRect();
    const w = nodeWidth * zoom;
    const h = nodeHeight * zoom;
    // The anchor is the middle of the node edge on `side`; the node's box follows from it.
    const left = side === "left" ? a.left : side === "right" ? a.left - w : a.left - w / 2;
    const top = side === "above" ? a.top : side === "below" ? a.top - h : a.top - h / 2;
    const next = placeActionBar(
      { left, top, right: left + w, bottom: top + h },
      { width: bar.offsetWidth, height: bar.offsetHeight },
      frame.getBoundingClientRect(),
      side,
    );
    const value = { side: next.side, dx: next.left - a.left, dy: next.top - a.top };
    setPlaced((previous) =>
      previous && previous.side === value.side && Math.abs(previous.dx - value.dx) < 0.5 && Math.abs(previous.dy - value.dy) < 0.5 ? previous : value,
    );
    // `viewKey` changes as the map pans or zooms: the node moves on screen without any of its map coordinates changing.
  }, [x, y, zoom, side, nodeWidth, nodeHeight, items.length, viewKey]);
  /** How far the grip has dragged the bar from where it was placed, in screen pixels; kept until another node is selected. */
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const gripDrag = useRef<{ pointer: number; startX: number; startY: number; from: { x: number; y: number }; bar: DOMRect; frame: DOMRect } | null>(null);
  const onGripDown = (event: PointerEvent<HTMLDivElement>) => {
    const frame = barRef.current?.closest<HTMLElement>("[data-map-viewport]");
    if (!barRef.current || !frame || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    gripDrag.current = {
      pointer: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      from: offset,
      bar: barRef.current.getBoundingClientRect(),
      frame: frame.getBoundingClientRect(),
    };
  };
  const onGripMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = gripDrag.current;
    if (!drag || drag.pointer !== event.pointerId) return;
    // Kept wholly inside the map, so the grip can always be reached again.
    const dx = Math.min(Math.max(event.clientX - drag.startX, drag.frame.left - drag.bar.left), drag.frame.right - drag.bar.right);
    const dy = Math.min(Math.max(event.clientY - drag.startY, drag.frame.top - drag.bar.top), drag.frame.bottom - drag.bar.bottom);
    setOffset({ x: drag.from.x + dx, y: drag.from.y + dy });
  };
  const onGripUp = (event: PointerEvent<HTMLDivElement>) => {
    if (gripDrag.current?.pointer === event.pointerId) gripDrag.current = null;
  };
  const shownSide = placed?.side ?? side;
  const popoverSide = shownSide === "below" ? "bottom" : "top";

  /** The direction item's fly-out around its trigger button. Its keys stay inside it: Escape closes the menu, not the bar. */
  const directionMenu = (trigger: ReactElement) => (
    <DropdownMenu modal={false}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side={popoverSide}>{direction.label}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent side={popoverSide} align="center" className="w-48" onKeyDown={(event) => event.stopPropagation()}>
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Branch grows</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup value={actions.direction ?? "auto"} onValueChange={(value) => actions.onSetDirection(isDirection(value) ? value : null)}>
          <DropdownMenuRadioItem value="auto">
            <Signpost aria-hidden="true" />
            Automatic
          </DropdownMenuRadioItem>
          {DIRECTIONS.map((dir) => {
            const Icon = DIRECTION_ICON[dir];
            return (
              <DropdownMenuRadioItem key={dir} value={dir}>
                <Icon aria-hidden="true" />
                {DIRECTION_LABEL[dir]}
              </DropdownMenuRadioItem>
            );
          })}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  /** The compact bar's More actions menu: the rearranging actions, then the branch direction inline (a fly-out has no room on a phone). */
  const moreMenu = (trigger: ReactElement) => (
    <DropdownMenu modal={false}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side={popoverSide}>{more.label}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent side={popoverSide} align="center" collisionPadding={8} className="w-52" onKeyDown={(event) => event.stopPropagation()}>
        {rearrange.map((item) => (
          <DropdownMenuItem key={item.key} disabled={!item.enabled} onSelect={() => item.run?.()}>
            <item.Icon aria-hidden="true" />
            {item.label}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Branch grows</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={actions.direction ?? "auto"} onValueChange={(value) => actions.onSetDirection(isDirection(value) ? value : null)}>
          <DropdownMenuRadioItem value="auto">
            <Signpost aria-hidden="true" />
            Automatic
          </DropdownMenuRadioItem>
          {DIRECTIONS.map((dir) => {
            const Icon = DIRECTION_ICON[dir];
            return (
              <DropdownMenuRadioItem key={dir} value={dir}>
                <Icon aria-hidden="true" />
                {DIRECTION_LABEL[dir]}
              </DropdownMenuRadioItem>
            );
          })}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onDismiss();
      return;
    }
    if (event.key === "Tab" && event.shiftKey) {
      event.preventDefault();
      event.stopPropagation();
      onFocusNode();
      return;
    }
    if (event.key === "Tab") {
      if (onTabForward()) event.preventDefault();
      return;
    }
    toolbar.onKeyDown(event);
  };

  const scale = 1 / zoom;
  const placement: Record<ActionBarSide, string> = {
    above: `translate(-50%, calc(-100% - ${NODE_ACTION_BAR_GAP}px))`,
    below: `translate(-50%, ${NODE_ACTION_BAR_GAP}px)`,
    left: `translate(calc(-100% - ${NODE_ACTION_BAR_GAP}px), -50%)`,
    right: `translate(${NODE_ACTION_BAR_GAP}px, -50%)`,
  };

  return (
    <div ref={anchorRef} className="pointer-events-none absolute top-0 left-0 size-0" style={{ transform: `translate(${x}px, ${y}px)` }}>
      <TooltipProvider>
        <div
          role="toolbar"
          aria-label={linkActions ? `Actions for the link ${label}` : `Actions for ${label}`}
          aria-orientation="horizontal"
          ref={barRef}
          onKeyDown={onKeyDown}
          onFocus={toolbar.onFocus}
          style={{
            transform: placed
              ? `scale(${scale}) translate(${placed.dx + offset.x}px, ${placed.dy + offset.y}px)`
              : `scale(${scale}) ${placement[side]}`,
            transformOrigin: "0 0",
          }}
          className="pointer-events-auto absolute top-0 left-0 flex w-max max-w-[calc(100vw-1rem)] flex-nowrap items-center justify-center gap-0.5 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95 motion-reduce:animate-none"
        >
          {/* Pointer only: the bar already follows the node, so the keyboard has no need to move it. */}
          <div
            aria-hidden="true"
            title="Drag to move the toolbar (double-click to put it back)"
            onPointerDown={onGripDown}
            onPointerMove={onGripMove}
            onPointerUp={onGripUp}
            onPointerCancel={onGripUp}
            onDoubleClick={() => setOffset({ x: 0, y: 0 })}
            className="flex h-8 w-5 shrink-0 cursor-grab touch-none items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground active:cursor-grabbing"
          >
            <GripVertical className="size-4" />
          </div>
          {items.map((item, position) => {
            const button = (
              <Button
                ref={toolbar.register(position)}
                tabIndex={toolbar.tabIndex(position)}
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={item.label}
                aria-disabled={item.enabled ? undefined : true}
                onClick={
                  item.run &&
                  (() => {
                    if (item.enabled) item.run?.();
                  })
                }
                className={cn("aria-disabled:opacity-50", item.destructive && "text-destructive hover:text-destructive")}
              >
                <item.Icon aria-hidden="true" />
              </Button>
            );
            return (
              <Fragment key={item.key}>
                {item.divider && <span aria-hidden="true" className="mx-0.5 h-5 border-l border-border" />}
                {item.key === direction.key ? (
                  directionMenu(button)
                ) : item.key === more.key ? (
                  moreMenu(button)
                ) : (
                  <Tooltip>
                    <TooltipTrigger asChild>{button}</TooltipTrigger>
                    <TooltipContent side={popoverSide}>{item.label}</TooltipContent>
                  </Tooltip>
                )}
              </Fragment>
            );
          })}
        </div>
      </TooltipProvider>
    </div>
  );
}
