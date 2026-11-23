import { useEffect, useLayoutEffect, useRef, useState, type DragEvent } from "react";

// A drop target for files from the device. It answers only to a drag that carries files —
// never to a node or link handle dragged on the canvas (those move by pointer, not by the
// browser's drag-and-drop) nor to dragged text — and says while such a drag is over the
// element, so the element can show where to drop.

/**
 * `dragover` keeps arriving every few hundred milliseconds while a drag hovers an element. This much
 * silence means the drag ended somewhere the element is not told about — cancelled with Escape, say.
 */
const SETTLE_MS = 800;

export interface FileDropOptions {
  /** The first file dropped. */
  onFile: (file: File) => void;
  /** A drag with files has just come over the element. */
  onEnter?: () => void;
  /** The drag has left, was dropped, or ended elsewhere. */
  onLeave?: () => void;
}

export interface FileDropHandlers {
  onDragOver: (event: DragEvent<HTMLElement>) => void;
  onDragLeave: (event: DragEvent<HTMLElement>) => void;
  onDrop: (event: DragEvent<HTMLElement>) => void;
}

export interface FileDrop {
  /** A drag with files is over the element. */
  active: boolean;
  /** Spread on the element. */
  handlers: FileDropHandlers;
  /** Forget an active drag — when the element goes away under it. */
  reset: () => void;
}

/** Whether a drag carries files from the device (not a node, a link handle, or selected text). */
export function dragHasFiles(transfer: DataTransfer | null): boolean {
  return !!transfer && Array.from(transfer.types).includes("Files");
}

export function useFileDrop({ onFile, onEnter, onLeave }: FileDropOptions): FileDrop {
  const [active, setActive] = useState(false);
  const activeRef = useRef(false);
  const settleTimer = useRef<number | null>(null);
  const latest = useRef({ onEnter, onLeave });
  useLayoutEffect(() => {
    latest.current = { onEnter, onLeave };
  });

  const clearSettle = () => {
    if (settleTimer.current !== null) window.clearTimeout(settleTimer.current);
    settleTimer.current = null;
  };

  const deactivate = () => {
    clearSettle();
    if (!activeRef.current) return;
    activeRef.current = false;
    setActive(false);
    latest.current.onLeave?.();
  };

  // A timer must not fire into a component that is gone.
  useEffect(() => clearSettle, []);

  const handlers: FileDropHandlers = {
    onDragOver: (event) => {
      if (!dragHasFiles(event.dataTransfer)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
      clearSettle();
      settleTimer.current = window.setTimeout(deactivate, SETTLE_MS);
      if (activeRef.current) return;
      activeRef.current = true;
      setActive(true);
      latest.current.onEnter?.();
    },
    onDragLeave: (event) => {
      // Leaving for a child of the element is not leaving the element.
      if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return;
      deactivate();
    },
    onDrop: (event) => {
      if (!dragHasFiles(event.dataTransfer)) return;
      event.preventDefault();
      const picked = event.dataTransfer.files[0];
      deactivate();
      if (picked) onFile(picked);
    },
  };

  return { active, handlers, reset: deactivate };
}
