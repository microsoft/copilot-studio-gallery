import { useEffect, useLayoutEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent, type MouseEvent } from "react";
import { Bold, Code, Italic, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Toggle } from "@/components/ui/toggle";
import { useRovingToolbar } from "@/hooks/use-roving-toolbar";
import {
  elementHasMark,
  pointAtOffset,
  rangeHasMark,
  readRichText,
  renderRichLines,
  renderRichText,
  safeHref,
  serializeRichText,
  setMarkInRange,
  splitRunLines,
  type InlineMark,
  type RichLine,
} from "@/lib/rich-text";
import { cn } from "@/lib/utils";

interface ActiveMarks {
  bold: boolean;
  italic: boolean;
  code: boolean;
  link: boolean;
}

const NO_MARKS: ActiveMarks = { bold: false, italic: false, code: false, link: false };
/** Caret placeholder inside a freshly inserted empty element; stripped when the text is read back. */
const ZWSP = "\u200B";

interface RichTextEditorProps {
  id: string;
  /** Description markup — see `@/lib/rich-text`. */
  value: string;
  onChange: (value: string) => void;
  /** The text lost focus — a natural end to a run of typing. */
  onBlur?: () => void;
  "aria-labelledby": string;
  "aria-describedby"?: string;
  className?: string;
}

function closestWithin(node: Node | null, root: HTMLElement, tag: "A" | "CODE"): HTMLElement | null {
  let current: Node | null = node;
  while (current && current !== root) {
    if (current instanceof HTMLElement && current.tagName === tag) return current;
    current = current.parentNode;
  }
  return null;
}

function unwrap(element: HTMLElement) {
  const parent = element.parentNode;
  if (!parent) return;
  while (element.firstChild) parent.insertBefore(element.firstChild, element);
  parent.removeChild(element);
  parent.normalize();
}

function setSelection(range: Range) {
  const selection = document.getSelection();
  if (!selection) return;
  selection.removeAllRanges();
  selection.addRange(range);
}

function caretAfter(node: Node) {
  const range = document.createRange();
  range.setStartAfter(node);
  range.collapse(true);
  setSelection(range);
}

function caretIn(textNode: Node, offset: number) {
  const range = document.createRange();
  range.setStart(textNode, offset);
  range.collapse(true);
  setSelection(range);
}

function selectContents(node: Node) {
  const range = document.createRange();
  range.selectNodeContents(node);
  setSelection(range);
}

/** True when the (collapsed) range sits at the very end of `element`'s text. */
function atEndOf(element: HTMLElement, range: Range): boolean {
  const rest = document.createRange();
  rest.selectNodeContents(element);
  rest.setStart(range.endContainer, range.endOffset);
  return rest.toString().replace(/\u200B/g, "") === "";
}

const sameMarks = (a: ActiveMarks, b: ActiveMarks) => a.bold === b.bold && a.italic === b.italic && a.code === b.code && a.link === b.link;

function markAncestor(node: Node | null, root: HTMLElement, mark: InlineMark): HTMLElement | null {
  let current: Node | null = node;
  while (current && current !== root) {
    if (current instanceof HTMLElement && elementHasMark(current, mark)) return current;
    current = current.parentNode;
  }
  return null;
}

/** The editor's lines plus the text offsets of the range's ends. */
function readWithRange(root: HTMLElement, range: Range): { lines: RichLine[]; start: number; end: number } {
  const offsets: number[] = [];
  const lines = readRichText(
    root,
    [
      { node: range.startContainer, offset: range.startOffset },
      { node: range.endContainer, offset: range.endOffset },
    ],
    offsets,
  );
  const start = offsets[0] ?? 0;
  return { lines, start, end: Math.max(start, offsets[1] ?? start) };
}

/** Formatting in effect at the selection — including the typing style a collapsed caret picked up from Ctrl+B / Ctrl+I. */
function marksAt(root: HTMLElement, range: Range): ActiveMarks {
  let bold: boolean;
  let italic: boolean;
  if (range.collapsed) {
    bold = markAncestor(range.startContainer, root, "bold") !== null;
    italic = markAncestor(range.startContainer, root, "italic") !== null;
  } else {
    const { lines, start, end } = readWithRange(root, range);
    bold = rangeHasMark(lines, start, end, "bold");
    italic = rangeHasMark(lines, start, end, "italic");
  }
  return {
    bold,
    italic,
    code: closestWithin(range.startContainer, root, "CODE") !== null,
    link: closestWithin(range.startContainer, root, "A") !== null,
  };
}

/** Toolbar buttons keep the editor's selection: focus stays where the text is. */
const keepSelection = (event: MouseEvent) => event.preventDefault();

/**
 * Formatted description editing in place: bold, italic, code and links, with Ctrl/⌘ + B, I, E and K.
 * `value` is the markup the map stores and saves; the editor reads it in and writes it back on every edit.
 */
export function RichTextEditor({ id, value, onChange, onBlur, className, "aria-labelledby": labelledBy, "aria-describedby": describedBy }: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const lastEmitted = useRef<string | null>(null);
  const savedRange = useRef<Range | null>(null);
  const [marks, setMarks] = useState<ActiveMarks>(NO_MARKS);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);
  const toolbar = useRovingToolbar(4);

  // Only a value the editor did not just emit re-renders the content, so the caret never jumps mid-word. When
  // that happens while the text is being edited (an undo or redo), the caret goes to the end of the new text.
  useLayoutEffect(() => {
    const el = editorRef.current;
    if (!el || value === lastEmitted.current) return;
    renderRichText(el, value);
    lastEmitted.current = value;
    if (document.activeElement === el) {
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      setSelection(range);
    }
  }, [value]);

  const emit = () => {
    const el = editorRef.current;
    if (!el) return;
    const markup = serializeRichText(readRichText(el));
    lastEmitted.current = markup;
    onChange(markup);
  };

  const refreshMarks = () => {
    const el = editorRef.current;
    const selection = document.getSelection();
    if (!el || !selection || !selection.rangeCount) return;
    const next = marksAt(el, selection.getRangeAt(0));
    setMarks((previous) => (sameMarks(previous, next) ? previous : next));
  };

  useEffect(() => {
    const onSelectionChange = () => {
      const el = editorRef.current;
      const selection = document.getSelection();
      if (!el || !selection || !selection.rangeCount) return;
      const range = selection.getRangeAt(0);
      if (!el.contains(range.commonAncestorContainer)) return;
      savedRange.current = range.cloneRange();
      const next = marksAt(el, range);
      setMarks((previous) => (sameMarks(previous, next) ? previous : next));
    };
    document.addEventListener("selectionchange", onSelectionChange);
    return () => document.removeEventListener("selectionchange", onSelectionChange);
  }, []);

  /** Focus the editor and put back the selection a toolbar or popover interaction interrupted. */
  const restoreSelection = (): Range | null => {
    const el = editorRef.current;
    const selection = document.getSelection();
    if (!el || !selection) return null;
    el.focus({ preventScroll: true });
    if (selection.rangeCount && el.contains(selection.getRangeAt(0).commonAncestorContainer)) return selection.getRangeAt(0);
    const saved = savedRange.current;
    if (saved && el.contains(saved.commonAncestorContainer)) {
      setSelection(saved);
      return saved;
    }
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    setSelection(range);
    return range;
  };

  /** Redraw the content from `lines`, select [start, end) and save the result. */
  const redraw = (lines: RichLine[], start: number, end: number) => {
    const el = editorRef.current;
    if (!el) return;
    renderRichLines(el, lines);
    const from = pointAtOffset(el, start);
    const to = pointAtOffset(el, end);
    const range = document.createRange();
    range.setStart(from.node, from.offset);
    range.setEnd(to.node, to.offset);
    setSelection(range);
    emit();
  };

  /** A collapsed caret: start or stop the mark for what is typed next. */
  const toggleTypingMark = (el: HTMLElement, range: Range, mark: InlineMark) => {
    const holder = document.createTextNode(ZWSP);
    const existing = markAncestor(range.startContainer, el, mark);
    if (existing) {
      if (!atEndOf(existing, range)) {
        // Split the marked element at the caret so the text after it keeps the mark.
        const tail = document.createRange();
        tail.selectNodeContents(existing);
        tail.setStart(range.startContainer, range.startOffset);
        const rest = existing.cloneNode(false) as HTMLElement;
        rest.appendChild(tail.extractContents());
        existing.after(rest);
      }
      existing.after(holder);
    } else {
      const wrapper = document.createElement(mark === "bold" ? "strong" : "em");
      wrapper.appendChild(holder);
      range.insertNode(wrapper);
    }
    caretIn(holder, 1);
  };

  const toggleInline = (mark: InlineMark) => {
    const el = editorRef.current;
    const range = restoreSelection();
    if (!el || !range) return;
    if (range.collapsed) {
      toggleTypingMark(el, range, mark);
    } else {
      const { lines, start, end } = readWithRange(el, range);
      redraw(setMarkInRange(lines, start, end, mark, !rangeHasMark(lines, start, end, mark)), start, end);
    }
    refreshMarks();
  };

  const toggleCode = () => {
    const el = editorRef.current;
    const range = restoreSelection();
    if (!el || !range) return;
    const existing = closestWithin(range.commonAncestorContainer, el, "CODE");
    if (existing) {
      if (range.collapsed && atEndOf(existing, range)) {
        const exit = document.createTextNode(ZWSP);
        existing.after(exit);
        caretIn(exit, 1);
      } else {
        unwrap(existing);
      }
    } else if (range.collapsed) {
      const code = document.createElement("code");
      const text = document.createTextNode(ZWSP);
      code.appendChild(text);
      range.insertNode(code);
      caretIn(text, 1);
    } else {
      const code = document.createElement("code");
      code.textContent = range.toString();
      range.deleteContents();
      range.insertNode(code);
      selectContents(code);
    }
    emit();
    refreshMarks();
  };

  const openLink = () => {
    const el = editorRef.current;
    const range = savedRange.current;
    const existing = el && range ? closestWithin(range.commonAncestorContainer, el, "A") : null;
    setLinkUrl(existing?.getAttribute("href") ?? "");
    setLinkError(null);
    setLinkOpen(true);
  };

  const applyLink = () => {
    const typed = linkUrl.trim();
    const href = safeHref(/^[a-z][a-z0-9+.-]*:/i.test(typed) ? typed : `https://${typed}`);
    if (!typed || !href) {
      setLinkError("Enter a web address such as example.com, https://example.com or mailto:name@example.com.");
      return;
    }
    setLinkOpen(false);
    const el = editorRef.current;
    const range = restoreSelection();
    if (!el || !range) return;
    const existing = closestWithin(range.commonAncestorContainer, el, "A");
    if (existing) {
      existing.setAttribute("href", href);
    } else {
      const anchor = document.createElement("a");
      anchor.href = href;
      if (range.collapsed) {
        anchor.textContent = href;
        range.insertNode(anchor);
        caretAfter(anchor);
      } else {
        anchor.textContent = range.toString();
        range.deleteContents();
        range.insertNode(anchor);
        selectContents(anchor);
      }
    }
    emit();
    refreshMarks();
  };

  const removeLink = () => {
    setLinkOpen(false);
    const el = editorRef.current;
    const range = restoreSelection();
    if (!el || !range) return;
    const existing = closestWithin(range.commonAncestorContainer, el, "A");
    if (existing) unwrap(existing);
    emit();
    refreshMarks();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return;
    switch (event.key.toLowerCase()) {
      case "b":
        toggleInline("bold");
        break;
      case "i":
        toggleInline("italic");
        break;
      case "e":
        toggleCode();
        break;
      case "k":
        openLink();
        break;
      default:
        return;
    }
    event.preventDefault();
  };

  // Pasted content arrives as plain text, so nothing outside the four supported marks can creep in.
  const onPaste = (event: ClipboardEvent<HTMLDivElement>) => {
    event.preventDefault();
    const el = editorRef.current;
    const text = event.clipboardData.getData("text/plain").replace(/\r\n?/g, "\n");
    const range = text && el ? restoreSelection() : null;
    if (!el || !range) return;
    range.deleteContents();
    const node = document.createTextNode(text);
    range.insertNode(node);
    const offsets: number[] = [];
    const lines = splitRunLines(readRichText(el, [{ node, offset: text.length }], offsets));
    const caret = offsets[0] ?? 0;
    redraw(lines, caret, caret);
  };

  const linkInputId = `${id}-link-url`;
  const linkErrorId = `${id}-link-error`;

  return (
    <div className={cn("rounded-md border border-input shadow-xs dark:bg-input/30", className)}>
      <div
        role="toolbar"
        aria-label="Formatting"
        aria-controls={id}
        aria-orientation="horizontal"
        onKeyDown={toolbar.onKeyDown}
        onFocus={toolbar.onFocus}
        className="flex flex-wrap items-center gap-0.5 border-b border-input p-1"
      >
        <Toggle
          ref={toolbar.register(0)}
          tabIndex={toolbar.tabIndex(0)}
          size="sm"
          pressed={marks.bold}
          onPressedChange={() => toggleInline("bold")}
          onMouseDown={keepSelection}
          aria-label="Bold"
          aria-keyshortcuts="Control+B"
          title="Bold (Ctrl+B)"
        >
          <Bold aria-hidden="true" />
        </Toggle>
        <Toggle
          ref={toolbar.register(1)}
          tabIndex={toolbar.tabIndex(1)}
          size="sm"
          pressed={marks.italic}
          onPressedChange={() => toggleInline("italic")}
          onMouseDown={keepSelection}
          aria-label="Italic"
          aria-keyshortcuts="Control+I"
          title="Italic (Ctrl+I)"
        >
          <Italic aria-hidden="true" />
        </Toggle>
        <Toggle
          ref={toolbar.register(2)}
          tabIndex={toolbar.tabIndex(2)}
          size="sm"
          pressed={marks.code}
          onPressedChange={toggleCode}
          onMouseDown={keepSelection}
          aria-label="Code"
          aria-keyshortcuts="Control+E"
          title="Code (Ctrl+E)"
        >
          <Code aria-hidden="true" />
        </Toggle>
        <Popover open={linkOpen} onOpenChange={(open) => (open ? openLink() : setLinkOpen(false))}>
          <PopoverTrigger asChild>
            <Button
              ref={toolbar.register(3)}
              tabIndex={toolbar.tabIndex(3)}
              type="button"
              variant="ghost"
              size="icon-sm"
              onMouseDown={keepSelection}
              aria-label="Link"
              aria-keyshortcuts="Control+K"
              title="Link (Ctrl+K)"
              className={cn(marks.link && "bg-accent text-accent-foreground")}
            >
              <Link2 aria-hidden="true" />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            className="w-80"
            onCloseAutoFocus={(event) => {
              // Back to the text, not the toolbar button, whether the link was applied or the popover dismissed.
              event.preventDefault();
              restoreSelection();
            }}
          >
            <form
              className="space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                applyLink();
              }}
            >
              <div className="space-y-1.5">
                <Label htmlFor={linkInputId}>Web address</Label>
                <Input
                  id={linkInputId}
                  type="text"
                  inputMode="url"
                  autoComplete="off"
                  placeholder="https://example.com"
                  value={linkUrl}
                  onChange={(event) => {
                    setLinkUrl(event.target.value);
                    setLinkError(null);
                  }}
                  aria-invalid={linkError ? true : undefined}
                  aria-describedby={linkError ? linkErrorId : undefined}
                />
                {linkError && (
                  <p id={linkErrorId} role="alert" className="text-xs text-destructive">
                    {linkError}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                {marks.link && (
                  <Button type="button" variant="ghost" size="sm" onClick={removeLink}>
                    Remove link
                  </Button>
                )}
                <Button type="submit" size="sm">
                  {marks.link ? "Update link" : "Add link"}
                </Button>
              </div>
            </form>
          </PopoverContent>
        </Popover>
      </div>
      <div
        ref={editorRef}
        id={id}
        role="textbox"
        aria-multiline="true"
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        contentEditable
        suppressContentEditableWarning
        spellCheck
        onInput={emit}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        className="min-h-28 px-3 py-2 text-sm leading-relaxed break-words whitespace-pre-wrap outline-none focus-visible:outline-solid focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring [&_a]:font-medium [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2 [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.85em]"
      />
    </div>
  );
}
