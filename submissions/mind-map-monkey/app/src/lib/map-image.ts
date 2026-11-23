import { UserFacingError } from "@/lib/app-errors";
import type { MindMapLayout } from "@/lib/mindmap-data";
import { LINK_LABEL_FONT, LINK_LABEL_HEIGHT, type RoutedLink } from "@/lib/mindmap-links";

// The map as a PNG. Connectors and node boxes come from the layout (exact positions, even mid-animation);
// everything inside a node — its colours, text and icons — is read from the live elements on the page, so the
// picture carries what the user actually sees in the current theme. The page owns the canvas: it passes an
// off-screen one together with its 2D context, and this module only paints and encodes.

/** Device pixels per map pixel: twice the on-screen size at 100% zoom, so text stays crisp when pasted. */
const IMAGE_SCALE = 2;
/** The largest bitmap the export builds; a very large map is drawn at a lower scale rather than failing. */
const MAX_IMAGE_PIXELS = 24_000_000;
const MIN_SCALE = 0.5;
/** Soft drop shadow under each node, like the one on screen. */
const SHADOW = { color: "rgba(0, 0, 0, 0.18)", blur: 8, offsetY: 2 };
/** Links in the picture: a still image has no hover, so every link is drawn legibly, a little lighter than full. */
const LINK_ALPHA = 0.85;
const ATTACHED_LINK_ALPHA = 0.55;

export interface MapImageSource {
  /** The live map SVG: nodes and connectors are located and styled from its elements. */
  svg: SVGSVGElement;
  layout: MindMapLayout;
  /** The zoom the SVG is displayed at; screen measurements are divided by it to get map pixels. */
  zoom: number;
  /** Association links to draw — dotted, with their labels — as routed on `layout`; none while they are hidden. */
  links?: RoutedLink[];
}

/** The picture could not be made; the message says why in plain words. */
export class MapImageError extends UserFacingError {}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A button drawn into the picture: its box in map pixels and its on-screen rect, which inner positions are measured against. */
interface Panel {
  element: HTMLElement;
  box: Box;
  screen: DOMRect;
  shadow: boolean;
}

interface IconJob {
  panel: Panel;
  element: SVGSVGElement;
  image: Promise<HTMLImageElement | null>;
}

const isTransparent = (color: string) => color === "transparent" || /^rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*0\s*\)$/.test(color);

function roundedRect(context: CanvasRenderingContext2D, box: Box, radius: number) {
  const r = Math.max(0, Math.min(radius, box.w / 2, box.h / 2));
  const { x, y, w, h } = box;
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + w, y, x + w, y + h, r);
  context.arcTo(x + w, y + h, x, y + h, r);
  context.arcTo(x, y + h, x, y, r);
  context.arcTo(x, y, x + w, y, r);
  context.closePath();
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new MapImageError("An icon could not be drawn."));
    image.src = url;
  });
}

/**
 * A standalone copy of an inline icon, with the colours it has on screen written in as attributes (its
 * classes mean nothing outside the page), drawn at `width` × `height` device pixels.
 */
async function iconImage(element: SVGSVGElement, width: number, height: number): Promise<HTMLImageElement | null> {
  const style = getComputedStyle(element);
  const clone = element.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.removeAttribute("class");
  clone.removeAttribute("style");
  clone.setAttribute("width", String(Math.max(1, Math.round(width))));
  clone.setAttribute("height", String(Math.max(1, Math.round(height))));
  clone.setAttribute("color", style.color);
  clone.setAttribute("stroke", style.stroke);
  clone.setAttribute("fill", style.fill);
  const markup = new XMLSerializer().serializeToString(clone);
  const url = URL.createObjectURL(new Blob([markup], { type: "image/svg+xml;charset=utf-8" }));
  try {
    return await loadImage(url);
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** The page background behind the map, so the picture sits on the same colour the user sees. */
function pageBackground(): string {
  const color = getComputedStyle(document.body).backgroundColor;
  return color && !isTransparent(color) ? color : "#ffffff";
}

/** Paint the whole map onto `canvas` through `context` and return it as a PNG. */
export async function exportMapPng(canvas: HTMLCanvasElement, context: CanvasRenderingContext2D, source: MapImageSource): Promise<Blob> {
  const { svg, layout, zoom, links = [] } = source;
  if (!layout.nodes.length || layout.width <= 0 || layout.height <= 0) throw new MapImageError("There is nothing to draw yet.");
  if (!(zoom > 0)) throw new MapImageError("The map could not be measured.");
  await document.fonts.ready;

  const scale = Math.max(MIN_SCALE, Math.min(IMAGE_SCALE, Math.sqrt(MAX_IMAGE_PIXELS / (layout.width * layout.height))));
  canvas.width = Math.ceil(layout.width * scale);
  canvas.height = Math.ceil(layout.height * scale);

  // Each node's inner content is measured against its own button, so a node still animating into place is
  // drawn at its final position, with its contents laid out as they are on screen.
  const panels: Panel[] = [];
  const icons: IconJob[] = [];
  for (const placed of layout.nodes) {
    const button = svg.querySelector<HTMLElement>(`button[data-node-id="${CSS.escape(placed.id)}"]`);
    if (!button) continue;
    const screen = button.getBoundingClientRect();
    const node: Panel = {
      element: button,
      screen,
      shadow: true,
      box: { x: placed.x - placed.w / 2, y: placed.y - placed.h / 2, w: screen.width / zoom, h: screen.height / zoom },
    };
    panels.push(node);
    // A collapsed branch shows how many items are folded away; the expanded toggle is a control, not content.
    const folded = button.closest("g")?.querySelector<HTMLElement>('button[aria-expanded="false"]');
    if (folded) {
      const rect = folded.getBoundingClientRect();
      panels.push({
        element: folded,
        screen: rect,
        shadow: false,
        box: { x: node.box.x + (rect.left - screen.left) / zoom, y: node.box.y + (rect.top - screen.top) / zoom, w: rect.width / zoom, h: rect.height / zoom },
      });
    }
  }
  for (const panel of panels) {
    for (const element of Array.from(panel.element.querySelectorAll("svg"))) {
      if (element.closest(".sr-only")) continue;
      const rect = element.getBoundingClientRect();
      icons.push({ panel, element, image: iconImage(element, (rect.width / zoom) * scale, (rect.height / zoom) * scale) });
    }
  }
  const images = new Map<SVGSVGElement, HTMLImageElement | null>();
  await Promise.all(icons.map(async (job) => images.set(job.element, await job.image)));

  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = pageBackground();
  context.fillRect(0, 0, canvas.width, canvas.height);
  // From here on, drawing happens in map pixels.
  context.setTransform(scale, 0, 0, scale, -layout.minX * scale, -layout.minY * scale);

  for (const edge of layout.edges) {
    const path = svg.querySelector(`path[data-edge-id="${CSS.escape(edge.id)}"]`);
    const stroke = path ? getComputedStyle(path).stroke : "";
    context.strokeStyle = stroke && stroke !== "none" ? stroke : "#64748b";
    context.lineWidth = edge.width;
    context.lineCap = "round";
    context.stroke(new Path2D(edge.d));
  }

  // Links above the connectors and beneath the nodes, as on screen; their colour is read from the live line.
  if (links.length) {
    const body = getComputedStyle(document.body);
    const textColor = body.color || "#0f172a";
    const font = `${LINK_LABEL_FONT.weight} ${LINK_LABEL_FONT.size}px ${body.fontFamily || "sans-serif"}`;
    const background = pageBackground();
    for (const link of links) {
      const line = svg.querySelector(`[data-link-id="${CSS.escape(link.id)}"] [data-link-line]`);
      const stroke = line ? getComputedStyle(line).stroke : "";
      context.save();
      context.globalAlpha = link.attached ? ATTACHED_LINK_ALPHA : LINK_ALPHA;
      context.strokeStyle = stroke && stroke !== "none" ? stroke : textColor;
      context.lineWidth = 2;
      context.lineCap = "round";
      context.lineJoin = "round";
      context.setLineDash([0.5, 6]);
      context.stroke(new Path2D(link.d));
      context.setLineDash([]);
      context.stroke(new Path2D(link.arrowD));
      if (link.label) {
        const w = link.labelW;
        const h = LINK_LABEL_HEIGHT;
        roundedRect(context, { x: link.mx - w / 2, y: link.my - h / 2, w, h }, h / 2);
        context.fillStyle = background;
        context.fill();
        context.lineWidth = 1;
        context.stroke();
        context.fillStyle = textColor;
        context.font = font;
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.fillText(link.label, link.mx, link.my);
      }
      context.restore();
    }
  }

  for (const panel of panels) {
    drawPanel(context, panel, zoom, scale, images);
  }

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new MapImageError("The image could not be encoded as a PNG.");
  return blob;
}

function drawPanel(context: CanvasRenderingContext2D, panel: Panel, zoom: number, scale: number, images: Map<SVGSVGElement, HTMLImageElement | null>) {
  const style = getComputedStyle(panel.element);
  const radius = parseFloat(style.borderTopLeftRadius) || 0;

  context.save();
  if (panel.shadow) {
    context.shadowColor = SHADOW.color;
    context.shadowBlur = SHADOW.blur * scale;
    context.shadowOffsetY = SHADOW.offsetY * scale;
  }
  context.fillStyle = isTransparent(style.backgroundColor) ? "rgba(0, 0, 0, 0)" : style.backgroundColor;
  roundedRect(context, panel.box, radius);
  context.fill();
  context.restore();

  const borderWidth = parseFloat(style.borderTopWidth) || 0;
  if (borderWidth > 0 && style.borderTopStyle !== "none" && !isTransparent(style.borderTopColor)) {
    context.save();
    if (style.borderTopStyle === "dashed") context.setLineDash([borderWidth * 3, borderWidth * 2]);
    context.strokeStyle = style.borderTopColor;
    context.lineWidth = borderWidth;
    const inset = borderWidth / 2;
    roundedRect(context, { x: panel.box.x + inset, y: panel.box.y + inset, w: panel.box.w - borderWidth, h: panel.box.h - borderWidth }, radius - inset);
    context.stroke();
    context.restore();
  }

  /** A screen point inside the panel, in map pixels. */
  const toMap = (clientX: number, clientY: number) => ({
    x: panel.box.x + (clientX - panel.screen.left) / zoom,
    y: panel.box.y + (clientY - panel.screen.top) / zoom,
  });

  const drawText = (text: Text) => {
    const parent = text.parentElement;
    const content = text.data;
    if (!parent || !content.trim()) return;
    const textStyle = getComputedStyle(parent);
    context.font = `${textStyle.fontStyle} ${textStyle.fontWeight} ${textStyle.fontSize} ${textStyle.fontFamily}`;
    context.fillStyle = textStyle.color;
    context.textBaseline = "alphabetic";
    const metrics = context.measureText("Hg");
    const ascent = metrics.fontBoundingBoxAscent || (parseFloat(textStyle.fontSize) || 14) * 0.8;
    const drawFragment = (fragment: string, rect: DOMRect) => {
      const { x, y } = toMap(rect.left, rect.top);
      context.fillText(fragment, x, y + ascent);
    };
    // Word by word at each word's own on-screen position, so line breaks fall exactly where the browser put them.
    const range = document.createRange();
    const words = /\S+/g;
    for (let match = words.exec(content); match; match = words.exec(content)) {
      const word = match[0];
      range.setStart(text, match.index);
      range.setEnd(text, match.index + word.length);
      const rects = Array.from(range.getClientRects());
      if (rects.length === 1) {
        drawFragment(word, rects[0]);
        continue;
      }
      // A word broken across lines: group its characters by the line they landed on.
      let fragment = "";
      let fragmentRect: DOMRect | null = null;
      for (let i = 0; i < word.length; i++) {
        range.setStart(text, match.index + i);
        range.setEnd(text, match.index + i + 1);
        const rect = range.getBoundingClientRect();
        if (fragmentRect && Math.abs(rect.top - fragmentRect.top) > 1) {
          drawFragment(fragment, fragmentRect);
          fragment = "";
          fragmentRect = null;
        }
        fragmentRect ??= rect;
        fragment += word[i];
      }
      if (fragmentRect && fragment) drawFragment(fragment, fragmentRect);
    }
  };

  const drawContents = (element: Element) => {
    for (const child of Array.from(element.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) {
        drawText(child as Text);
      } else if (child instanceof SVGSVGElement) {
        const image = images.get(child);
        if (!image) continue;
        const rect = child.getBoundingClientRect();
        const { x, y } = toMap(rect.left, rect.top);
        context.drawImage(image, x, y, rect.width / zoom, rect.height / zoom);
      } else if (child instanceof HTMLElement && !child.classList.contains("sr-only")) {
        drawContents(child);
      }
    }
  };
  drawContents(panel.element);
}

/** Put the PNG on the clipboard; false when this browser or page does not allow image clipboard writes. */
export async function copyPngToClipboard(blob: Blob): Promise<boolean> {
  if (typeof ClipboardItem === "undefined" || !navigator.clipboard?.write) return false;
  try {
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    return true;
  } catch {
    return false;
  }
}

/** Start a download of `blob` under `fileName`. */
export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
