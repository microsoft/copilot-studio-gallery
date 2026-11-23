// Text widths for the map layout. Each label is measured by the browser in the font it is drawn in, through a
// 2D context the shell registers from its hidden canvas (see `@/components/text-measurer`), and every result
// is cached per font and string, so a layout costs one lookup per node. Where no context is registered — a
// headless check, a test, a render before the shell's canvas exists — a deterministic per-character estimate
// stands in. The web font arrives after the first layout: when it lands the cache is dropped and the
// `generation` moves on, and layouts keyed on it (`useMindMapLayout`) are recomputed.

/** The font a run of text is measured in: CSS pixels and weight; the family is the page's own. */
export interface TextFont {
  size: number;
  weight: number;
}

let context: CanvasRenderingContext2D | null = null;
let family: string | null = null;
let appliedFont = "";
const cache = new Map<string, number>();
/** Entries kept before the cache starts over — every keystroke in a label adds a few. */
const CACHE_LIMIT = 20_000;
let generation = 0;
const listeners = new Set<() => void>();
let fontsWatched = false;

function invalidate() {
  cache.clear();
  appliedFont = "";
  generation += 1;
  for (const listener of listeners) listener();
}

/** Re-measure once the page's web fonts have loaded (and whenever another face lands later). */
function watchFonts() {
  if (fontsWatched || typeof document === "undefined" || !("fonts" in document)) return;
  fontsWatched = true;
  document.fonts.ready.then(invalidate).catch(() => undefined);
  document.fonts.addEventListener("loadingdone", invalidate);
}

/** The shell hands over (or takes back) the context labels are measured with; measurements start over with it. */
export function registerTextMeasureContext(next: CanvasRenderingContext2D | null) {
  if (next === context) return;
  context = next;
  family = null;
  watchFonts();
  invalidate();
}

/** Changes whenever measurements may differ from before: a context arrived or left, or fonts finished loading. */
export function textMeasureGeneration(): number {
  return generation;
}

export function subscribeTextMeasure(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** True while labels are measured by the browser rather than estimated. */
export function isTextMeasureExact(): boolean {
  return context !== null;
}

function pageFontFamily(): string {
  if (typeof document === "undefined" || !document.body) return "sans-serif";
  return getComputedStyle(document.body).fontFamily || "sans-serif";
}

function measureWithContext(text: string, font: TextFont, ctx: CanvasRenderingContext2D): number {
  family ??= pageFontFamily();
  const css = `${font.weight} ${font.size}px ${family}`;
  if (css !== appliedFont) {
    ctx.font = css;
    appliedFont = css;
  }
  return ctx.measureText(text).width;
}

// ---------- Fallback estimate ----------
// Advance widths in em for a humanist sans at regular weight, by character class; anything else counts as an
// average lower-case letter. Deterministic, so a layout without a browser is the same every time.

const EM_WIDTHS: Record<string, number> = {
  " ": 0.26,
  i: 0.26,
  j: 0.26,
  l: 0.26,
  "!": 0.28,
  ".": 0.28,
  ",": 0.28,
  ":": 0.28,
  ";": 0.28,
  "'": 0.22,
  "|": 0.26,
  I: 0.3,
  t: 0.34,
  f: 0.34,
  r: 0.38,
  "(": 0.34,
  ")": 0.34,
  "[": 0.34,
  "]": 0.34,
  "-": 0.36,
  "/": 0.36,
  "\\": 0.36,
  s: 0.5,
  z: 0.5,
  c: 0.52,
  J: 0.48,
  m: 0.86,
  w: 0.78,
  M: 0.84,
  W: 0.94,
  "@": 0.96,
  "%": 0.86,
  "—": 1,
  "…": 0.9,
};
const UPPER = /\p{Lu}/u;
const DIGIT = /\p{Nd}/u;
/** East Asian scripts: full-width glyphs, and a line may break between any two of them. */
export const WIDE_SCRIPT = /[\u1100-\u11FF\u2E80-\uA4CF\uAC00-\uD7AF\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFF60\uFFE0-\uFFE6]/u;

function estimateWidth(text: string, font: TextFont): number {
  let em = 0;
  for (const char of text) {
    const known = EM_WIDTHS[char];
    if (known !== undefined) em += known;
    else if (WIDE_SCRIPT.test(char)) em += 1;
    else if (UPPER.test(char)) em += 0.66;
    else if (DIGIT.test(char)) em += 0.58;
    else em += 0.56;
  }
  // Heavier weights set wider.
  const weightFactor = font.weight >= 600 ? 1.05 : 1;
  return em * font.size * weightFactor;
}

/** Width in CSS pixels of `text` set on one line in `font`, as the browser lays it out. */
export function measureTextWidth(text: string, font: TextFont): number {
  const key = `${font.weight}|${font.size}|${text}`;
  const cached = cache.get(key);
  if (cached !== undefined) return cached;
  const width = context ? measureWithContext(text, font, context) : estimateWidth(text, font);
  if (cache.size >= CACHE_LIMIT) cache.clear();
  cache.set(key, width);
  return width;
}
