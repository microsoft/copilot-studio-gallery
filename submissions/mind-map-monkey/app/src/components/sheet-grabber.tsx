import { useRef, type PointerEvent } from "react";

/** How far (px) or how fast (px/ms) a downward swipe must go to close the sheet. */
const CLOSE_DISTANCE = 80;
const CLOSE_SPEED = 0.5;

interface SheetGrabberProps {
  /** Called once a swipe down passes the distance or speed threshold. */
  onClose: () => void;
}

/**
 * The pill at the top of a bottom sheet. Dragging it moves the sheet with the finger; letting go far or fast
 * enough closes it, otherwise the sheet springs back. Pointer-only: the sheet's Close button and Escape are the
 * keyboard and screen-reader routes, so the grabber is hidden from assistive technology.
 */
export function SheetGrabber({ onClose }: SheetGrabberProps) {
  const drag = useRef<{ id: number; y: number; t: number; dy: number } | null>(null);

  const sheetOf = (element: HTMLElement) => element.closest<HTMLElement>("[data-slot='sheet-content']");

  const move = (event: PointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (!current || current.id !== event.pointerId) return;
    current.dy = Math.max(0, event.clientY - current.y);
    const sheet = sheetOf(event.currentTarget);
    if (sheet) sheet.style.transform = `translateY(${current.dy}px)`;
  };

  const end = (event: PointerEvent<HTMLDivElement>, cancelled: boolean) => {
    const current = drag.current;
    if (!current || current.id !== event.pointerId) return;
    drag.current = null;
    const sheet = sheetOf(event.currentTarget);
    const speed = current.dy / Math.max(1, event.timeStamp - current.t);
    if (!cancelled && (current.dy > CLOSE_DISTANCE || (current.dy > 16 && speed > CLOSE_SPEED))) {
      onClose();
      // The closing animation starts from where the finger left it.
      return;
    }
    if (sheet) {
      sheet.style.transition = "transform 150ms ease-out";
      sheet.style.transform = "";
      window.setTimeout(() => {
        sheet.style.transition = "";
      }, 160);
    }
  };

  return (
    <div
      aria-hidden="true"
      data-testid="sheet-grabber"
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
          // The pointer is already gone; the drag simply ends with no move.
        }
        drag.current = { id: event.pointerId, y: event.clientY, t: event.timeStamp, dy: 0 };
        const sheet = sheetOf(event.currentTarget);
        if (sheet) sheet.style.transition = "none";
      }}
      onPointerMove={move}
      onPointerUp={(event) => end(event, false)}
      onPointerCancel={(event) => end(event, true)}
      className="sticky top-0 z-10 flex h-6 shrink-0 cursor-grab touch-none items-center justify-center bg-card active:cursor-grabbing"
    >
      <span className="h-1.5 w-10 rounded-full bg-muted-foreground/40" />
    </div>
  );
}
