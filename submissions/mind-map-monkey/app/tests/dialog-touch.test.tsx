import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { act, createRef } from "react";
import type { Root } from "react-dom/client";
import { useDialogTouch } from "../src/hooks/use-dialog-touch";

const browser = new Window({ url: "http://localhost/" });
const globals = ["window", "document", "navigator", "Element", "HTMLElement", "Node"] as const;
const previous = new Map(globals.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
let createRoot: typeof import("react-dom/client").createRoot;
let container: HTMLDivElement;
let root: Root;
let dialog: HTMLDivElement;
let child: HTMLDivElement;
const forwardedRef = createRef<HTMLDivElement>();

function Harness() {
  const ref = useDialogTouch(forwardedRef);
  return <div ref={ref}><div data-testid="folder-list" /></div>;
}

beforeAll(async () => {
  for (const key of globals) Object.defineProperty(globalThis, key, { configurable: true, value: key === "window" ? browser : browser[key] });
  Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { configurable: true, value: true });
  ({ createRoot } = await import("react-dom/client"));
});

afterAll(() => {
  for (const key of globals) {
    const descriptor = previous.get(key);
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
  Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT");
  browser.close();
});

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => root.render(<Harness />));
  dialog = container.firstElementChild as HTMLDivElement;
  child = dialog.firstElementChild as HTMLDivElement;
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function touchMove(count: number) {
  const event = new browser.Event("touchmove", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "touches", { value: Array.from({ length: count }, () => ({})) });
  child.dispatchEvent(event);
  return event;
}

describe("dialog touch handling", () => {
  test("allows single-finger scrolling and blocks a pinch inside a nested list", () => {
    expect(touchMove(1).defaultPrevented).toBe(false);
    expect(touchMove(2).defaultPrevented).toBe(true);
    expect(touchMove(1).defaultPrevented).toBe(false);
  });

  test("blocks Safari gesture zoom and removes handlers and forwarded ref on unmount", () => {
    expect(forwardedRef.current).toBe(dialog);
    const gesture = new browser.Event("gesturestart", { bubbles: true, cancelable: true });
    child.dispatchEvent(gesture);
    expect(gesture.defaultPrevented).toBe(true);
    act(() => root.unmount());
    expect(forwardedRef.current).toBeNull();
    const after = new browser.Event("gesturestart", { bubbles: true, cancelable: true });
    child.dispatchEvent(after);
    expect(after.defaultPrevented).toBe(false);
  });
});
