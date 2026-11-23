/**
 * Description markup: plain text with **bold**, *italic*, `code` and [links](https://…), one line per
 * Mermaid `%%` comment in the saved file. The inspector edits it as formatted text; these helpers turn
 * the markup into inline runs, runs into editable DOM, and edited DOM back into the same markup, so a
 * description written in the earlier markup-only field reads back exactly as it did.
 */

export interface InlineRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
  href?: string;
}

/** One line of a description. */
export type RichLine = InlineRun[];

type Marks = Omit<InlineRun, "text">;

const LINK = /^\[([^\]\n]+)\]\(([^)\s]+)\)/;
/** Characters that open markup; a backslash in front keeps them literal. */
const MARKUP_CHAR = /[\\*`[]/;
const BLOCK_TAGS = new Set(["DIV", "P", "LI", "UL", "OL", "H1", "H2", "H3", "H4", "H5", "H6", "BLOCKQUOTE", "PRE", "SECTION", "ARTICLE", "TABLE", "TR", "TD", "TH"]);

/** Absolute http(s) or mailto URLs only; anything else is shown as text and never followed. */
export function safeHref(url: string): string | null {
  try {
    const parsed = new URL(url.trim());
    return ["http:", "https:", "mailto:"].includes(parsed.protocol) ? parsed.href : null;
  } catch {
    return null;
  }
}

/** Index of `delimiter` at or after `from`, skipping backslash-escaped characters; -1 when absent. */
function findDelimiter(text: string, delimiter: string, from: number): number {
  for (let i = from; i <= text.length - delimiter.length; i++) {
    if (text[i] === "\\") {
      i++;
      continue;
    }
    if (text.startsWith(delimiter, i)) return i;
  }
  return -1;
}

function parseInline(text: string, marks: Marks, out: InlineRun[]): void {
  let plain = "";
  const flush = () => {
    if (plain) out.push({ ...marks, text: plain });
    plain = "";
  };
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === "\\" && i + 1 < text.length && MARKUP_CHAR.test(text[i + 1])) {
      plain += text[i + 1];
      i += 2;
      continue;
    }
    if (ch === "`" && !marks.code) {
      const end = findDelimiter(text, "`", i + 1);
      if (end > i + 1) {
        flush();
        out.push({ ...marks, code: true, text: text.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }
    if (ch === "[" && !marks.href) {
      const match = LINK.exec(text.slice(i));
      if (match) {
        flush();
        out.push({ ...marks, href: match[2], text: match[1] });
        i += match[0].length;
        continue;
      }
    }
    if (ch === "*") {
      let delimiter: "***" | "**" | "*" | null = null;
      if (text.startsWith("***", i) && !marks.bold && !marks.italic) delimiter = "***";
      else if (text.startsWith("**", i) && !marks.bold) delimiter = "**";
      else if (!text.startsWith("**", i) && !marks.italic) delimiter = "*";
      if (delimiter) {
        const start = i + delimiter.length;
        const end = findDelimiter(text, delimiter, start);
        // Emphasis hugs its text: an opener is followed by a non-space and a closer preceded by one.
        if (end > start && !/\s/.test(text[start]) && !/\s/.test(text[end - 1])) {
          flush();
          const inner: Marks = { ...marks };
          if (delimiter !== "*") inner.bold = true;
          if (delimiter !== "**") inner.italic = true;
          parseInline(text.slice(start, end), inner, out);
          i = end + delimiter.length;
          continue;
        }
      }
    }
    plain += ch;
    i++;
  }
  flush();
}

/** Markup → lines of inline runs. */
export function parseRichText(markup: string): RichLine[] {
  return markup.split("\n").map((line) => {
    const runs: RichLine = [];
    parseInline(line, {}, runs);
    return runs;
  });
}

const sameMarks = (a: Marks, b: Marks) => !!a.bold === !!b.bold && !!a.italic === !!b.italic && !!a.code === !!b.code && (a.href ?? "") === (b.href ?? "");

function mergeRuns(line: RichLine): RichLine {
  const merged: RichLine = [];
  for (const run of line) {
    const last = merged[merged.length - 1];
    if (last && sameMarks(last, run)) last.text += run.text;
    else merged.push({ ...run });
  }
  return merged;
}

const escapePlain = (text: string) => text.replace(/[\\*`[]/g, (ch) => `\\${ch}`);
/** A link target must not contain whitespace or parentheses to read back; encode them. */
const markupHref = (href: string) => href.replace(/[\s()]/g, (ch) => (ch === "(" ? "%28" : ch === ")" ? "%29" : "%20"));

function wrapRun(run: InlineRun): string {
  const lead = /^\s*/.exec(run.text)?.[0] ?? "";
  const trail = /\s*$/.exec(run.text.slice(lead.length))?.[0] ?? "";
  const core = run.text.slice(lead.length, run.text.length - trail.length);
  if (!core) return run.text;
  let out: string;
  if (run.href) out = `[${core.replace(/[[\]]/g, " ")}](${markupHref(run.href)})`;
  else if (run.code) out = `\`${core.replace(/`/g, "'")}\``;
  else out = escapePlain(core);
  if (run.italic) out = `*${out}*`;
  if (run.bold) out = `**${out}**`;
  return lead + out + trail;
}

/** Lines of inline runs → markup. */
export function serializeRichText(lines: RichLine[]): string {
  return lines.map((line) => mergeRuns(line).map(wrapRun).join("")).join("\n");
}

function runToDom(run: InlineRun): Node {
  let node: Node = document.createTextNode(run.text);
  const wrap = (tag: string) => {
    const element = document.createElement(tag);
    element.appendChild(node);
    node = element;
  };
  if (run.code) wrap("code");
  if (run.italic) wrap("em");
  if (run.bold) wrap("strong");
  const href = run.href ? safeHref(run.href) : null;
  if (href) {
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.appendChild(node);
    node = anchor;
  }
  return node;
}

/** Replace `root`'s content with the markup, one block per line, ready for in-place editing. */
export function renderRichText(root: HTMLElement, markup: string): void {
  renderRichLines(root, parseRichText(markup));
}

/** Replace `root`'s content with the lines, one block per line. */
export function renderRichLines(root: HTMLElement, lines: RichLine[]): void {
  root.replaceChildren(
    ...lines.map((line) => {
      const block = document.createElement("div");
      if (!line.some((run) => run.text)) block.appendChild(document.createElement("br"));
      for (const run of line) if (run.text) block.appendChild(runToDom(run));
      return block;
    }),
  );
}

export type InlineMark = "bold" | "italic";

const isBold = (element: HTMLElement) => {
  const weight = element.style.fontWeight;
  return element.tagName === "B" || element.tagName === "STRONG" || weight === "bold" || weight === "bolder" || Number(weight) >= 600;
};

const isItalic = (element: HTMLElement) => element.tagName === "I" || element.tagName === "EM" || element.style.fontStyle === "italic";

/** True when the element itself applies the mark. */
export function elementHasMark(element: HTMLElement, mark: InlineMark): boolean {
  return mark === "bold" ? isBold(element) : isItalic(element);
}

/** Visit every run overlapping [start, end) in the text offsets `readRichText` reports (one per character, one per line break). */
function eachRunIn(lines: RichLine[], start: number, end: number, visit: (run: InlineRun, from: number, to: number) => void) {
  let pos = 0;
  for (const line of lines) {
    for (const run of line) {
      const from = Math.max(start, pos);
      const to = Math.min(end, pos + run.text.length);
      if (from < to) visit(run, from - pos, to - pos);
      pos += run.text.length;
    }
    pos++;
  }
}

/** True when every character in [start, end) carries the mark (and there is at least one). */
export function rangeHasMark(lines: RichLine[], start: number, end: number, mark: InlineMark): boolean {
  let any = false;
  let all = true;
  eachRunIn(lines, start, end, (run) => {
    any = true;
    if (!run[mark]) all = false;
  });
  return any && all;
}

/** The lines with the mark set (or cleared) on every character in [start, end). */
export function setMarkInRange(lines: RichLine[], start: number, end: number, mark: InlineMark, on: boolean): RichLine[] {
  let pos = 0;
  return lines.map((line) => {
    const out: RichLine = [];
    for (const run of line) {
      const from = Math.max(start, pos) - pos;
      const to = Math.min(end, pos + run.text.length) - pos;
      pos += run.text.length;
      if (from >= to) {
        out.push(run);
        continue;
      }
      if (from > 0) out.push({ ...run, text: run.text.slice(0, from) });
      out.push({ ...run, text: run.text.slice(from, to), [mark]: on || undefined });
      if (to < run.text.length) out.push({ ...run, text: run.text.slice(to) });
    }
    pos++;
    return mergeRuns(out);
  });
}

/** Runs that carry line breaks (pasted text) split into separate lines; offsets are unchanged. */
export function splitRunLines(lines: RichLine[]): RichLine[] {
  const out: RichLine[] = [];
  for (const line of lines) {
    let current: RichLine = [];
    for (const run of line) {
      const parts = run.text.split("\n");
      parts.forEach((text, i) => {
        if (i > 0) {
          out.push(current);
          current = [];
        }
        if (text) current.push({ ...run, text });
      });
    }
    out.push(current);
  }
  return out;
}

export interface TextPoint {
  node: Node;
  offset: number;
}

/** The DOM point at a text offset in content drawn by `renderRichLines` — the inverse of the offsets `readRichText` reports. */
export function pointAtOffset(root: HTMLElement, offset: number): TextPoint {
  let lineStart = 0;
  const blocks = Array.from(root.children);
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
    let pos = lineStart;
    let last: Text | null = null;
    for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
      if (offset <= pos + node.data.length) return { node, offset: offset - pos };
      pos += node.data.length;
      last = node;
    }
    if (offset <= pos || i === blocks.length - 1) return last ? { node: last, offset: last.data.length } : { node: block, offset: 0 };
    lineStart = pos + 1;
  }
  return { node: root, offset: root.childNodes.length };
}

const hasBlockChild = (parent: Node | null) => parent instanceof HTMLElement && Array.from(parent.children).some((child) => BLOCK_TAGS.has(child.tagName));

/**
 * Read the edited DOM back into lines of inline runs: blocks and <br> end lines; b/i/code/a carry marks.
 * Each of `points` gets its text offset in `offsets` (one per character, one per line break).
 */
export function readRichText(root: HTMLElement, points: TextPoint[] = [], offsets: number[] = []): RichLine[] {
  const lines: RichLine[] = [];
  let current: RichLine = [];
  let lineEnded = true;
  let pos = 0;
  const endLine = () => {
    lines.push(current);
    current = [];
    lineEnded = true;
    pos++;
  };
  const clean = (text: string) => text.replace(/\u200B/g, "").replace(/\u00A0/g, " ");
  const locate = (node: Node, offset: number, at: number) => {
    points.forEach((point, k) => {
      if (offsets[k] === undefined && point.node === node && point.offset === offset) offsets[k] = at;
    });
  };
  const visitChildren = (parent: Node, marks: Marks) => {
    parent.childNodes.forEach((child, index) => {
      locate(parent, index, pos);
      visit(child, marks);
    });
    locate(parent, parent.childNodes.length, pos);
  };
  const visit = (node: Node, marks: Marks) => {
    if (node.nodeType === Node.TEXT_NODE) {
      // Zero-width spaces are caret placeholders from the editor; non-breaking spaces are how browsers keep runs of spaces.
      const raw = node.nodeValue ?? "";
      const text = clean(raw);
      const skip = !text || (!text.trim() && hasBlockChild(node.parentNode));
      points.forEach((point, k) => {
        if (offsets[k] === undefined && point.node === node) offsets[k] = pos + (skip ? 0 : clean(raw.slice(0, point.offset)).length);
      });
      if (skip) return;
      current.push({ ...marks, text });
      pos += text.length;
      lineEnded = false;
      return;
    }
    if (!(node instanceof HTMLElement)) return;
    if (node.tagName === "BR") {
      // A trailing <br> only props its block open; one with content after it breaks the line.
      if (node.nextSibling) endLine();
      return;
    }
    if (BLOCK_TAGS.has(node.tagName)) {
      if (current.length) endLine();
      lineEnded = false;
      visitChildren(node, marks);
      if (!lineEnded) endLine();
      return;
    }
    const next: Marks = { ...marks };
    if (isBold(node)) next.bold = true;
    if (isItalic(node)) next.italic = true;
    if (node.tagName === "CODE" || node.tagName === "KBD" || node.tagName === "SAMP") next.code = true;
    const href = node.tagName === "A" ? node.getAttribute("href") : null;
    if (href) next.href = href;
    visitChildren(node, next);
  };
  visitChildren(root, {});
  if (current.length) endLine();
  return lines;
}
