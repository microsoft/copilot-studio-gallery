import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { act, type ReactElement } from "react";
import type { Root } from "react-dom/client";
import type { useMapView as useMapViewType } from "../src/hooks/use-map-view";

const browser = new Window({ url: "http://localhost/" });
const globals = ["window", "document", "navigator", "Element", "HTMLElement", "Node", "ResizeObserver"] as const;
const previous = new Map(globals.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
let createRoot: typeof import("react-dom/client").createRoot;
let useMapView: typeof useMapViewType;
let root: Root;
let container: HTMLDivElement;

function Harness(): ReactElement {
  const map = useMapView({ minX: -500, minY: -500, width: 1000, height: 1000 }, 0.2, 2.5);
  return (
    <div ref={map.viewportRef} {...map.handlers} data-zoom={map.view.zoom} data-x={map.view.x} data-pinching={map.pinching} data-block-drag={map.touchGesture.current.blockDrag}>
      <button data-node-id="a">Node A</button>
      <button data-node-id="b">Node B</button>
      <button>Other control</button>
    </div>
  );
}

beforeAll(async () => {
  for (const key of globals) Object.defineProperty(globalThis, key, { configurable: true, value: key === "window" ? browser : browser[key] });
  Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { configurable: true, value: true });
  ({ createRoot } = await import("react-dom/client"));
  ({ useMapView } = await import("../src/hooks/use-map-view"));
}, 30000);

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
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function pointer(target: Element, type: string, id: number, x: number) {
  target.dispatchEvent(new browser.PointerEvent(type, { bubbles: true, pointerType: "touch", pointerId: id, clientX: x, clientY: 100 }));
}

describe("map touch gestures", () => {
  test("pinches from nodes without panning on a single node touch", () => {
    const viewport = container.firstElementChild!;
    const [a, b] = Array.from(container.querySelectorAll("button"));
    act(() => {
      pointer(a, "pointerdown", 1, 100);
      pointer(a, "pointermove", 1, 120);
    });
    expect(Number(viewport.getAttribute("data-x"))).toBe(0);
    expect(Number(viewport.getAttribute("data-zoom"))).toBe(1);

    act(() => {
      pointer(b, "pointerdown", 2, 200);
      pointer(a, "pointermove", 1, 80);
      pointer(b, "pointermove", 2, 240);
    });
    expect(Number(viewport.getAttribute("data-zoom"))).toBe(2);
    expect(viewport.getAttribute("data-pinching")).toBe("true");
    expect(viewport.getAttribute("data-block-drag")).toBe("true");

    const x = viewport.getAttribute("data-x");
    act(() => {
      pointer(b, "pointerup", 2, 240);
      pointer(a, "pointermove", 1, 60);
    });
    expect(viewport.getAttribute("data-x")).toBe(x);
    expect(viewport.getAttribute("data-pinching")).toBe("false");
    expect(viewport.getAttribute("data-block-drag")).toBe("true");
    act(() => pointer(a, "pointerup", 1, 60));
  });

  test("pinches when both fingers start on the same node", () => {
    const viewport = container.firstElementChild!;
    const node = container.querySelector("button")!;
    act(() => {
      pointer(node, "pointerdown", 1, 100);
      pointer(node, "pointerdown", 2, 200);
      pointer(node, "pointermove", 1, 125);
      pointer(node, "pointermove", 2, 175);
    });
    expect(Number(viewport.getAttribute("data-zoom"))).toBe(0.5);
    act(() => {
      pointer(node, "pointerup", 1, 125);
      pointer(node, "pointerup", 2, 175);
    });
  });

  test("does not start a pinch on unrelated controls", () => {
    const viewport = container.firstElementChild!;
    const [a, , control] = Array.from(container.querySelectorAll("button"));
    act(() => {
      pointer(a, "pointerdown", 1, 100);
      pointer(control, "pointerdown", 2, 200);
      pointer(control, "pointermove", 2, 260);
    });
    expect(Number(viewport.getAttribute("data-zoom"))).toBe(1);
    expect(viewport.getAttribute("data-pinching")).toBe("false");
    act(() => pointer(a, "pointerup", 1, 100));
  });

  test("pinches when one touch starts on the background and the other on a node", () => {
    const viewport = container.firstElementChild as HTMLDivElement;
    viewport.setPointerCapture = () => {};
    viewport.hasPointerCapture = () => false;
    const node = container.querySelector("button")!;
    act(() => {
      pointer(viewport, "pointerdown", 1, 100);
      pointer(node, "pointerdown", 2, 200);
      pointer(viewport, "pointermove", 1, 75);
      pointer(node, "pointermove", 2, 225);
    });
    expect(Number(viewport.getAttribute("data-zoom"))).toBe(1.5);
    act(() => {
      pointer(node, "pointerup", 2, 225);
      pointer(viewport, "pointerup", 1, 75);
    });
  });
});
