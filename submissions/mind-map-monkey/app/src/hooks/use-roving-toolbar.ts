import { useRef, useState, type FocusEvent, type KeyboardEvent } from "react";

/**
 * One tab stop for a horizontal toolbar: Tab lands on the current item, the arrow keys (and Home / End)
 * move between items, and the item used last becomes the tab stop. Spread `onKeyDown` / `onFocus` on the
 * `role="toolbar"` element and give each item `ref={register(i)}` and `tabIndex={tabIndex(i)}`.
 */
export function useRovingToolbar(count: number) {
  const [index, setIndex] = useState(0);
  const items = useRef<Array<HTMLElement | null>>([]);
  const active = Math.min(index, Math.max(0, count - 1));

  const focusItem = (position: number) => {
    setIndex(position);
    items.current[position]?.focus({ preventScroll: true });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (!count || !items.current.includes(event.target as HTMLElement)) return;
    let next: number;
    switch (event.key) {
      case "ArrowRight":
        next = (active + 1) % count;
        break;
      case "ArrowLeft":
        next = (active - 1 + count) % count;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = count - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    focusItem(next);
  };

  const onFocus = (event: FocusEvent<HTMLElement>) => {
    const position = items.current.indexOf(event.target as HTMLElement);
    if (position >= 0 && position !== active) setIndex(position);
  };

  return {
    active,
    focusItem,
    onKeyDown,
    onFocus,
    register:
      (position: number) =>
      (element: HTMLElement | null): void => {
        items.current[position] = element;
      },
    tabIndex: (position: number) => (position === active ? 0 : -1),
  };
}
