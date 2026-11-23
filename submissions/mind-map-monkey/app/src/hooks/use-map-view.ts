import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useAppStore } from "@/lib/store";

/** Padded bounding box of the content, in map pixels. */
export interface MapBounds {
  minX: number;
  minY: number;
  width: number;
  height: number;
}

/** Where the map's origin lands in the viewport (`x`, `y`, viewport pixels) and how large it is drawn. */
export interface MapView {
  x: number;
  y: number;
  zoom: number;
}

/** A node's centre and size, in map pixels. */
export interface MapRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Point {
  x: number;
  y: number;
}

interface Size {
  width: number;
  height: number;
}

/** One pan or pinch, measured from the view and pointer positions when it (re)started. */
interface Gesture {
  view: MapView;
  start: Map<number, Point>;
}

export interface TouchGesture {
  blockDrag: boolean;
  pinchGeneration: number;
}

/** How much of the map must stay inside the viewport, so a pan can never lose it. */
const EDGE_MARGIN = 48;
/** Inset a focused node is brought inside. */
const REVEAL_PAD = 24;
/** Breathing room around a fitted map. */
const FIT_PAD = 24;
/** Arrow-key pan, in viewport pixels (Shift multiplies it by four). */
const KEY_STEP = 48;
export const ZOOM_STEP = 1.2;
/** Length of an eased pan or fit, in milliseconds. */
const GLIDE_MS = 360;

const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function clampView(view: MapView, size: Size, bounds: MapBounds): MapView {
  if (!size.width || !size.height) return view;
  const left = bounds.minX * view.zoom;
  const right = (bounds.minX + bounds.width) * view.zoom;
  const top = bounds.minY * view.zoom;
  const bottom = (bounds.minY + bounds.height) * view.zoom;
  return {
    x: clamp(view.x, EDGE_MARGIN - right, size.width - EDGE_MARGIN - left),
    y: clamp(view.y, EDGE_MARGIN - bottom, size.height - EDGE_MARGIN - top),
    zoom: view.zoom,
  };
}

/** The view at `zoom`, keeping the map point under `anchor` (viewport pixels) where it is. */
function zoomAround(view: MapView, zoom: number, anchor: Point): MapView {
  const mapX = (anchor.x - view.x) / view.zoom;
  const mapY = (anchor.y - view.y) / view.zoom;
  return { x: anchor.x - mapX * zoom, y: anchor.y - mapY * zoom, zoom };
}

const midpoint = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/** Extra viewport pixels `reveal` keeps clear around a node, beyond its usual inset. */
export interface RevealMargin {
  /** Both sides, unless `left` or `right` says otherwise for its side. */
  x?: number;
  left?: number;
  right?: number;
  top?: number;
  bottom?: number;
}

/** A pointer that travels further than this between press and release was a pan, not a click. */
const CLICK_SLOP = 4;

/**
 * Pan and zoom for an unbounded map canvas. Drag the background, press the arrow keys, Shift + scroll
 * or scroll sideways to pan; scroll (with or without Ctrl/⌘ — a trackpad pinch arrives that way), or
 * press + / − to zoom; 0 fits the whole map. The content is positioned with a CSS transform rather
 * than a scroll box, so every part of the map is reachable.
 */
export function useMapView(bounds: MapBounds, zoomMin: number, zoomMax: number) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [view, setViewState] = useState<MapView>({ x: 0, y: 0, zoom: 1 });
  const [size, setSize] = useState<Size>({ width: 0, height: 0 });
  const [panning, setPanning] = useState(false);
  const [fitTick, setFitTick] = useState(0);
  const viewRef = useRef(view);
  const sizeRef = useRef(size);
  const boundsRef = useRef(bounds);
  const fitRequested = useRef(true);
  const pointers = useRef(new Map<number, Point>());
  const panPointers = useRef(new Set<number>());
  const gesture = useRef<Gesture | null>(null);
  const touchGesture = useRef<TouchGesture>({ blockDrag: false, pinchGeneration: 0 });
  const [pinching, setPinching] = useState(false);
  /** Whether the pointer gesture in progress (or the one that just ended) moved the map. */
  const moved = useRef(false);
  /** The eased move in progress: its frame request and where it is heading. */
  const glide = useRef<{ frame: number; target: MapView } | null>(null);

  useLayoutEffect(() => {
    viewRef.current = view;
  }, [view]);
  useLayoutEffect(() => {
    sizeRef.current = size;
  }, [size]);
  useLayoutEffect(() => {
    boundsRef.current = bounds;
  }, [bounds]);

  const applyView = useCallback((update: (previous: MapView) => MapView, unbounded = false) => {
    setViewState((previous) => {
      const updated = update(previous);
      const next = unbounded ? updated : clampView(updated, sizeRef.current, boundsRef.current);
      viewRef.current = next;
      return next;
    });
  }, []);

  const stopGlide = useCallback(() => {
    if (!glide.current) return;
    cancelAnimationFrame(glide.current.frame);
    glide.current = null;
  }, []);

  /** Move the view at once — for gestures, keys and the wheel, which also cut short any eased move. */
  const setView = useCallback(
    (update: (previous: MapView) => MapView) => {
      stopGlide();
      applyView(update);
    },
    [applyView, stopGlide],
  );

  const panForDrag = useCallback((dx: number, dy: number) => {
    stopGlide();
    applyView((previous) => ({ ...previous, x: previous.x + dx, y: previous.y + dy }), true);
  }, [applyView, stopGlide]);

  const constrain = useCallback(() => setView((previous) => previous), [setView]);

  /**
   * Ease the view towards `update(view)` — where an eased move is already heading, if one is under way.
   * Jumps straight there when Reduce motion is on in Settings.
   */
  const glideView = useCallback(
    (update: (previous: MapView) => MapView) => {
      const from = viewRef.current;
      const target = clampView(update(glide.current?.target ?? from), sizeRef.current, boundsRef.current);
      stopGlide();
      if (target.x === from.x && target.y === from.y && target.zoom === from.zoom) return;
      if (useAppStore.getState().reduceMotion) {
        applyView(() => target);
        return;
      }
      const start = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / GLIDE_MS);
        const k = easeOutCubic(t);
        applyView(() => ({
          x: from.x + (target.x - from.x) * k,
          y: from.y + (target.y - from.y) * k,
          zoom: from.zoom + (target.zoom - from.zoom) * k,
        }));
        if (t < 1 && glide.current) glide.current.frame = requestAnimationFrame(step);
        else glide.current = null;
      };
      glide.current = { frame: requestAnimationFrame(step), target };
    },
    [applyView, stopGlide],
  );

  useEffect(() => stopGlide, [stopGlide]);

  useLayoutEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const measure = () =>
      setSize((previous) => {
        const width = el.clientWidth;
        const height = el.clientHeight;
        return previous.width === width && previous.height === height ? previous : { width, height };
      });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  /** Centre the whole map, zoomed out as far as needed (never past 100%); eased unless `instant`. */
  const fit = useCallback((instant = false) => {
    const current = sizeRef.current;
    const box = boundsRef.current;
    if (!current.width || !current.height || !box.width || !box.height) return;
    const raw = Math.min((current.width - FIT_PAD * 2) / box.width, (current.height - FIT_PAD * 2) / box.height);
    const zoom = clamp(Math.floor(raw * 20) / 20, zoomMin, Math.min(1, zoomMax));
    const target = () => ({
      x: current.width / 2 - (box.minX + box.width / 2) * zoom,
      y: current.height / 2 - (box.minY + box.height / 2) * zoom,
      zoom,
    });
    if (instant) setView(target);
    else glideView(target);
  }, [setView, glideView, zoomMin, zoomMax]);

  /** Fit once the next layout and viewport size are known — for a freshly opened or imported map. */
  const requestFit = useCallback(() => {
    fitRequested.current = true;
    setFitTick((tick) => tick + 1);
  }, []);

  useLayoutEffect(() => {
    if (!fitRequested.current || !size.width || !size.height) return;
    fitRequested.current = false;
    fit(true);
  }, [size, bounds, fitTick, fit]);

  const zoomBy = useCallback(
    (factor: number) => {
      setView((previous) => {
        const current = sizeRef.current;
        return zoomAround(previous, clamp(previous.zoom * factor, zoomMin, zoomMax), { x: current.width / 2, y: current.height / 2 });
      });
    },
    [setView, zoomMin, zoomMax],
  );

  /**
   * Pan just enough to bring a node fully into view, if it isn't already. `margin` asks for extra room
   * beside or above/below it (for a toolbar attached to the node); it shrinks when the viewport is too
   * small to grant it, so a narrow screen never fights over the node itself. The pan is eased.
   */
  const reveal = useCallback(
    (rect: MapRect, margin: RevealMargin = {}) => {
      glideView((previous) => {
        const current = sizeRef.current;
        if (!current.width || !current.height) return previous;
        const w = rect.w * previous.zoom;
        const h = rect.h * previous.zoom;
        // A margin asked for on one side alone may take all the spare width; a symmetric one gets half per side.
        const spareX = Math.max(0, current.width - w - REVEAL_PAD * 2);
        const padLeft = REVEAL_PAD + clamp(margin.left ?? margin.x ?? 0, 0, margin.left === undefined ? spareX / 2 : spareX);
        const padRight = REVEAL_PAD + clamp(margin.right ?? margin.x ?? 0, 0, margin.right === undefined ? spareX / 2 : spareX);
        const spareY = Math.max(0, current.height - h - REVEAL_PAD * 2);
        const padTop = REVEAL_PAD + clamp(margin.top ?? 0, 0, spareY);
        const padBottom = REVEAL_PAD + clamp(margin.bottom ?? 0, 0, spareY);
        const left = previous.x + (rect.x - rect.w / 2) * previous.zoom;
        const right = left + w;
        const top = previous.y + (rect.y - rect.h / 2) * previous.zoom;
        const bottom = top + h;
        const dx = left < padLeft ? padLeft - left : right > current.width - padRight ? current.width - padRight - right : 0;
        const dy = top < padTop ? padTop - top : bottom > current.height - padBottom ? current.height - padBottom - bottom : 0;
        return dx || dy ? { ...previous, x: previous.x + dx, y: previous.y + dy } : previous;
      });
    },
    [glideView],
  );

  // Wheel needs a non-passive listener so the page doesn't scroll or zoom underneath the map.
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = el.getBoundingClientRect();
      const unit = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16 : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? rect.height : 1;
      const modified = event.ctrlKey || event.metaKey;
      // Shift + scroll pans sideways (browsers often deliver it as deltaX already); a mostly-horizontal
      // trackpad swipe or tilt wheel pans too. Everything else — a plain wheel notch, a vertical swipe, a
      // pinch (which arrives as Ctrl + wheel) — zooms around the pointer.
      if (!modified && (event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY))) {
        const sideways = event.shiftKey && !event.deltaX;
        const dx = (sideways ? event.deltaY : event.deltaX) * unit;
        const dy = (sideways ? 0 : event.deltaY) * unit;
        setView((previous) => ({ ...previous, x: previous.x - dx, y: previous.y - dy }));
        return;
      }
      const factor = Math.exp(-event.deltaY * unit * 0.0022);
      const anchor = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      setView((previous) => zoomAround(previous, clamp(previous.zoom * factor, zoomMin, zoomMax), anchor));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [setView, zoomMin, zoomMax]);

  const localPoint = (event: ReactPointerEvent<HTMLDivElement>): Point => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  /** Restart the gesture from the current view whenever the set of fingers or buttons changes. */
  const rebase = () => {
    gesture.current = { view: viewRef.current, start: new Map(pointers.current) };
  };

  // A single finger on a node belongs to the node; two fingers can pinch from nodes or the background.
  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0 && event.button !== 1) return;
    const target = event.target instanceof Element ? event.target : null;
    const control = target?.closest("button, a, input, textarea, select, [role='toolbar'], [role='menu'], [data-link-id]");
    const nodeTouch = event.pointerType === "touch" && !!target?.closest("button[data-node-id], [data-link-handle]");
    if (control && !nodeTouch) return;
    stopGlide();
    pointers.current.set(event.pointerId, localPoint(event));
    if (!nodeTouch) {
      panPointers.current.add(event.pointerId);
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    if (pointers.current.size === 1) {
      moved.current = false;
      if (nodeTouch) return;
    } else if (event.pointerType === "touch") {
      touchGesture.current.blockDrag = true;
      touchGesture.current.pinchGeneration++;
      setPinching(true);
    }
    rebase();
    setPanning(true);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, localPoint(event));
    const active = gesture.current;
    if (!active) return;
    const points = [...active.start.keys()]
      .map((id) => ({ start: active.start.get(id), now: pointers.current.get(id) }))
      .filter((point): point is { start: Point; now: Point } => point.start !== undefined && point.now !== undefined);
    if (points.length >= 2) {
      // Two fingers: zoom by the change in their distance, keeping the map under their midpoint still.
      moved.current = true;
      const [a, b] = points;
      const startDistance = Math.hypot(b.start.x - a.start.x, b.start.y - a.start.y) || 1;
      const distance = Math.hypot(b.now.x - a.now.x, b.now.y - a.now.y);
      const zoom = clamp(active.view.zoom * (distance / startDistance), zoomMin, zoomMax);
      const startMid = midpoint(a.start, b.start);
      const nowMid = midpoint(a.now, b.now);
      const mapX = (startMid.x - active.view.x) / active.view.zoom;
      const mapY = (startMid.y - active.view.y) / active.view.zoom;
      setView(() => ({ x: nowMid.x - mapX * zoom, y: nowMid.y - mapY * zoom, zoom }));
    } else if (points.length === 1) {
      const [point] = points;
      if (Math.hypot(point.now.x - point.start.x, point.now.y - point.start.y) > CLICK_SLOP) moved.current = true;
      setView(() => ({ ...active.view, x: active.view.x + (point.now.x - point.start.x), y: active.view.y + (point.now.y - point.start.y) }));
    }
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.delete(event.pointerId);
    panPointers.current.delete(event.pointerId);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (pointers.current.size < 2) setPinching(false);
    if (pointers.current.size >= 2 || (pointers.current.size === 1 && panPointers.current.has([...pointers.current.keys()][0]))) {
      rebase();
    } else {
      gesture.current = null;
      setPanning(false);
    }
    if (!pointers.current.size) touchGesture.current.blockDrag = false;
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.target instanceof Element && event.target.closest("input, textarea, select, [contenteditable='true']")) return;
    const step = event.shiftKey ? KEY_STEP * 4 : KEY_STEP;
    switch (event.key) {
      case "ArrowLeft":
        setView((previous) => ({ ...previous, x: previous.x + step }));
        break;
      case "ArrowRight":
        setView((previous) => ({ ...previous, x: previous.x - step }));
        break;
      case "ArrowUp":
        setView((previous) => ({ ...previous, y: previous.y + step }));
        break;
      case "ArrowDown":
        setView((previous) => ({ ...previous, y: previous.y - step }));
        break;
      case "+":
      case "=":
        zoomBy(ZOOM_STEP);
        break;
      case "-":
      case "_":
        zoomBy(1 / ZOOM_STEP);
        break;
      case "0":
        fit();
        break;
      default:
        return;
    }
    event.preventDefault();
  };

  /** In a click handler: true when the press that led to it dragged the map, so it was a pan rather than a click. */
  const wasPan = () => moved.current;

  return {
    viewportRef,
    view,
    /** The viewport's size in screen pixels (zero until first measured). */
    size,
    panning,
    pinching,
    touchGesture,
    transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`,
    zoomBy,
    fit,
    requestFit,
    reveal,
    panForDrag,
    constrain,
    wasPan,
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp, onKeyDown },
  };
}
