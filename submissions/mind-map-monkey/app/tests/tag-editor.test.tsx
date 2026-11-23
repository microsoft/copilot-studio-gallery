import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { act, useState } from "react";
import type { Root } from "react-dom/client";

const browser = new Window({ url: "http://localhost/" });
const globals = ["window", "document", "navigator", "Element", "HTMLElement", "Node"] as const;
const previous = new Map(globals.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
let createRoot: typeof import("react-dom/client").createRoot;
let TagEditor: typeof import("../src/components/tag-editor").TagEditor;
let root: Root;
let container: HTMLDivElement;
let savedTags: string[];

function Harness({ initialTags }: { initialTags: string[] }) {
  const [tags, setTags] = useState(initialTags);
  savedTags = tags;
  return <TagEditor tags={tags} suggestions={[]} onChange={setTags} onFind={() => {}} />;
}

beforeAll(async () => {
  for (const key of globals) Object.defineProperty(globalThis, key, { configurable: true, value: key === "window" ? browser : browser[key] });
  Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { configurable: true, value: true });
  ({ createRoot } = await import("react-dom/client"));
  ({ TagEditor } = await import("../src/components/tag-editor"));
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
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function pasteTags(tags: string[], value: string) {
  act(() => root.render(<Harness initialTags={tags} />));
  const input = container.querySelector("input")!;
  const setValue = Object.getOwnPropertyDescriptor(browser.HTMLInputElement.prototype, "value")!.set!;
  act(() => {
    setValue.call(input, value);
    input.dispatchEvent(new browser.Event("input", { bubbles: true }));
  });
  return input;
}

describe("adding tags near the limit", () => {
  test("keeps all existing tags when pasted additions exceed remaining capacity", () => {
    const tags = Array.from({ length: 23 }, (_, index) => `z${String(index).padStart(2, "0")}`);
    const input = pasteTags(tags, "beta,alpha,");
    expect(savedTags).toEqual(["beta", ...tags]);
    expect(input.disabled).toBe(true);
    expect(container.querySelector('[role="status"]')!.textContent).toBe("Added #beta.");
  });

  test("normalizes and deduplicates additions before counting available slots", () => {
    const tags = Array.from({ length: 22 }, (_, index) => `z${String(index).padStart(2, "0")}`);
    pasteTags(tags, "#Z00,###,#Beta,beta,Alpha,extra,");
    expect(savedTags).toEqual(["alpha", "beta", ...tags]);
    expect(container.querySelector('[role="status"]')!.textContent).toBe("Added #beta, #alpha.");
  });

  test("does not let a long list of existing tags hide a new addition", () => {
    const tags = Array.from({ length: 23 }, (_, index) => `z${String(index).padStart(2, "0")}`);
    pasteTags(tags, `${[...tags, "Z00", "zz-new"].join(",")},`);
    expect(savedTags).toEqual([...tags, "zz-new"]);
  });
});
