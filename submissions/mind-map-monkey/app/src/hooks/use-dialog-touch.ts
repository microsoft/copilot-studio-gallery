import { useCallback, type Ref } from "react";

/** Keep dialog scrolling native while blocking browser pinch zoom within the dialog. */
export function useDialogTouch(ref?: Ref<HTMLDivElement>) {
  return useCallback((element: HTMLDivElement | null) => {
    if (!element) {
      if (typeof ref === "function") ref(null);
      else if (ref) ref.current = null;
      return;
    }

    const cleanupRef = typeof ref === "function" ? ref(element) : undefined;
    if (ref && typeof ref !== "function") ref.current = element;

    const onTouchMove = (event: TouchEvent) => {
      if (event.touches.length > 1 && event.cancelable) event.preventDefault();
    };
    const onGesture = (event: Event) => {
      if (event.cancelable) event.preventDefault();
    };
    element.addEventListener("touchmove", onTouchMove, { passive: false });
    element.addEventListener("gesturestart", onGesture);
    element.addEventListener("gesturechange", onGesture);

    return () => {
      element.removeEventListener("touchmove", onTouchMove);
      element.removeEventListener("gesturestart", onGesture);
      element.removeEventListener("gesturechange", onGesture);
      if (typeof cleanupRef === "function") cleanupRef();
      else if (typeof ref === "function") ref(null);
      else if (ref) ref.current = null;
    };
  }, [ref]);
}
