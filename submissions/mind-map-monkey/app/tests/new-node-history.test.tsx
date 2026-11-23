import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { act } from "react";
import type { Root } from "react-dom/client";
import type { useHistory as useHistoryType } from "../src/hooks/use-history";
import type { MindMap } from "../src/lib/mindmap-data";

const browser = new Window({ url: "http://localhost/" });
const globals = ["window", "document", "navigator", "Element", "HTMLElement", "Node"] as const;
const previous = new Map(globals.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
let createRoot: typeof import("react-dom/client").createRoot;
let useHistory: typeof useHistoryType;
let addChild: typeof import("../src/lib/mindmap-data").addChild;
let createBlankMap: typeof import("../src/lib/mindmap-data").createBlankMap;
let removeNode: typeof import("../src/lib/mindmap-data").removeNode;
let updateNode: typeof import("../src/lib/mindmap-data").updateNode;
let root: Root;
let container: HTMLDivElement;
let history: ReturnType<typeof useHistoryType<MindMap>>;

function Harness() {
  history = useHistory(createBlankMap);
  return null;
}

beforeAll(async () => {
  for (const key of globals) Object.defineProperty(globalThis, key, { configurable: true, value: key === "window" ? browser : browser[key] });
  Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { configurable: true, value: true });
  ({ createRoot } = await import("react-dom/client"));
  ({ useHistory } = await import("../src/hooks/use-history"));
  ({ addChild, createBlankMap, removeNode, updateNode } = await import("../src/lib/mindmap-data"));
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
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const equal = (a: MindMap, b: MindMap) => JSON.stringify(a) === JSON.stringify(b);

describe("cancelling a new node", () => {
  test("removes creation and its edits without leaving an undo or redo step", () => {
    const before = history.present;
    const added = addChild(before, before.rootId);
    act(() => history.commit(added.map));
    act(() => history.commit((map) => updateNode(map, added.id, { label: "Draft" })));
    act(() => history.discard((map) => removeNode(map, added.id), equal));
    expect(history.present).toBe(before);
    expect(history.canUndo).toBe(false);
    expect(history.canRedo).toBe(false);
  });

  test("retains unrelated changes and their undo and redo history", () => {
    const rootId = history.present.rootId;
    act(() => history.commit((map) => updateNode(map, rootId, { label: "Earlier edit" })));
    const added = addChild(history.present, rootId);
    act(() => history.commit(added.map));
    act(() => history.commit((map) => updateNode(map, added.id, { label: "Draft" })));
    act(() => history.commit((map) => updateNode(map, rootId, { label: "Later edit" })));
    act(() => history.discard((map) => removeNode(map, added.id), equal));
    expect(history.present.nodes[rootId].label).toBe("Later edit");
    act(() => history.undo());
    expect(history.present.nodes[rootId].label).toBe("Earlier edit");
    expect(history.present.nodes[added.id]).toBeUndefined();
    act(() => history.redo());
    expect(history.present.nodes[rootId].label).toBe("Later edit");
    expect(history.present.nodes[added.id]).toBeUndefined();
  });
});
