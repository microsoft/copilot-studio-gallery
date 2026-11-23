import { afterAll, beforeAll, describe, expect, spyOn, test } from "bun:test";
import { Window } from "happy-dom";
import { renderToStaticMarkup } from "react-dom/server";
import type { MindMapLayout } from "../src/lib/mindmap-data";

const browser = new Window({ url: "http://localhost/" });
const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
let MapThumbnail: typeof import("../src/components/map-thumbnail").MapThumbnail;
let createBlankMap: typeof import("../src/lib/mindmap-data").createBlankMap;
let updateNode: typeof import("../src/lib/mindmap-data").updateNode;
let SIZE_SPECS: typeof import("../src/lib/mindmap-data").SIZE_SPECS;
let textMeasure: typeof import("../src/lib/text-measure");

beforeAll(async () => {
  Object.defineProperty(globalThis, "window", { configurable: true, value: browser });
  ({ MapThumbnail } = await import("../src/components/map-thumbnail"));
  ({ createBlankMap, updateNode, SIZE_SPECS } = await import("../src/lib/mindmap-data"));
  textMeasure = await import("../src/lib/text-measure");
});

afterAll(() => {
  if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
  else Reflect.deleteProperty(globalThis, "window");
  browser.close();
});

const layout: MindMapLayout = {
  nodes: [{ id: "root", x: 0, y: 0, w: 100, h: 40, side: "right", dir: "right", manual: false, px: 0, py: 0 }],
  edges: [],
  minX: -50,
  minY: -20,
  width: 100,
  height: 40,
};

function renderLabel(label: string) {
  const blank = createBlankMap();
  const map = updateNode(blank, blank.rootId, { label });
  const placed = { ...layout, nodes: [{ ...layout.nodes[0], id: map.rootId }] };
  const html = renderToStaticMarkup(<MapThumbnail map={map} layout={placed} id="test" />);
  return { text: html.match(/<text[^>]*>(.*?)<\/text>/)?.[1], node: map.nodes[map.rootId] };
}

describe("map thumbnail labels", () => {
  test("leaves a fitting label intact", () => {
    expect(renderLabel("  Hi  ").text).toBe("Hi");
  });

  test("fits a long label using a bounded number of measurements", () => {
    const measure = spyOn(textMeasure, "measureTextWidth");
    try {
      const { text, node } = renderLabel("a".repeat(20_000));
      expect(measure.mock.calls.length).toBeLessThan(20);
      expect(text).toMatch(/^a+…$/);
      const spec = SIZE_SPECS[node.size];
      const font = { size: spec.font, weight: 600 };
      expect(textMeasure.measureTextWidth(text!, font)).toBeLessThanOrEqual(100 - spec.padX * 2);
      expect(textMeasure.measureTextWidth(`${text!.slice(0, -1)}a…`, font)).toBeGreaterThan(100 - spec.padX * 2);
    } finally {
      measure.mockRestore();
    }
  });
});
