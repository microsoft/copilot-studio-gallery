import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { Window } from "happy-dom";
import { act } from "react";
import type { Root } from "react-dom/client";
import type { DriveFileRef } from "../src/lib/onedrive-files";

const browser = new Window({ url: "https://preview.example/v1/preview/test-token/dev/?file=old" });
const globals = ["window", "document", "navigator", "Element", "HTMLElement", "Node", "localStorage"] as const;
const previous = new Map(globals.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
const previousAct = Object.getOwnPropertyDescriptor(globalThis, "IS_REACT_ACT_ENVIRONMENT");
const writeText = mock(async (_text: string) => {});
let createRoot: typeof import("react-dom/client").createRoot;
let MemoryRouter: typeof import("react-router-dom").MemoryRouter;
let useAppAddress: typeof import("../src/hooks/use-share-link").useAppAddress;
let useShareLink: typeof import("../src/hooks/use-share-link").useShareLink;
let useAppStore: typeof import("../src/lib/store").useAppStore;
let root: Root;
let container: HTMLDivElement;
let appAddress: ReturnType<typeof useAppAddress>;
let sharing: ReturnType<typeof useShareLink>;

const file: DriveFileRef = { id: "file-id", name: "Map.mmd", path: "/Maps/Map.mmd" };
const published = "https://play.preview.managedapps.cloud.microsoft/apps/11111111-1111-1111-1111-111111111111";
const custom = "https://apps.example/mind-map/";

function Harness() {
  appAddress = useAppAddress();
  sharing = useShareLink();
  return null;
}

function Preview() {
  return (
    <MemoryRouter basename="/v1/preview/test-token/dev" initialEntries={["/v1/preview/test-token/dev/"]}>
      <Harness />
    </MemoryRouter>
  );
}

beforeAll(async () => {
  for (const key of globals) Object.defineProperty(globalThis, key, { configurable: true, value: key === "window" ? browser : browser[key] });
  Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { configurable: true, value: true });
  Object.defineProperty(browser.navigator, "clipboard", { configurable: true, value: { writeText } });
  mock.module("../src/lib/host-info", () => ({
    loadHostContext: mock(async () => { throw new Error("Host unavailable"); }),
  }));
  mock.module("../src/lib/standalone", () => ({ STANDALONE: false }));
  mock.module("../src/lib/console-capture", () => ({ reportPrivateRuntimeError: mock(() => {}) }));
  ({ createRoot } = await import("react-dom/client"));
  ({ MemoryRouter } = await import("react-router-dom"));
  ({ useAppAddress, useShareLink } = await import("../src/hooks/use-share-link"));
  ({ useAppStore } = await import("../src/lib/store"));
});

afterAll(() => {
  mock.restore();
  for (const key of globals) {
    const descriptor = previous.get(key);
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
  if (previousAct) Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", previousAct);
  else Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT");
  browser.close();
});

beforeEach(() => {
  writeText.mockClear();
  useAppStore.setState({ customAddress: null, publishedAddress: null });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  useAppStore.setState({ customAddress: null, publishedAddress: undefined });
  browser.localStorage.clear();
});

function render() {
  act(() => root.render(<Preview />));
}

async function share() {
  await act(async () => { await sharing.share(file); });
}

describe("share app addresses", () => {
  test("never copies the preview URL after published address resolution fails", async () => {
    useAppStore.setState({ publishedAddress: undefined });
    await act(async () => { root.render(<Preview />); });
    expect(appAddress.resolving).toBe(false);
    expect(appAddress.address).toBeNull();
    expect(appAddress.defaultAddress).toBeNull();
    await share();
    expect(writeText).not.toHaveBeenCalled();
    expect(sharing.target).toEqual({ file, status: "pending" });
  });

  test("never copies the preview URL when no published or custom address exists", async () => {
    render();
    await share();
    expect(appAddress.address).toBeNull();
    expect(writeText).not.toHaveBeenCalled();
  });

  test("copies the published app address rather than the preview URL", async () => {
    useAppStore.setState({ publishedAddress: published });
    render();
    await share();
    expect(writeText).toHaveBeenCalledWith(`${published}?file=file-id&path=%2FMaps%2FMap.mmd`);
    expect(sharing.target?.status).toBe("copied");
  });

  test("uses a custom address without a published address and ahead of a published address", async () => {
    useAppStore.setState({ customAddress: custom });
    render();
    await share();
    act(() => useAppStore.setState({ publishedAddress: published }));
    await share();
    expect(writeText.mock.calls).toEqual([
      [`${custom}?file=file-id&path=%2FMaps%2FMap.mmd`],
      [`${custom}?file=file-id&path=%2FMaps%2FMap.mmd`],
    ]);
    expect(appAddress.defaultAddress).toBe(published);
  });

  test("clearing the custom address disables copying when no published address exists", async () => {
    useAppStore.setState({ customAddress: custom });
    render();
    act(() => appAddress.setCustomAddress(null));
    await share();
    expect(appAddress.address).toBeNull();
    expect(writeText).not.toHaveBeenCalled();
  });

  test("clearing the custom address restores the published address", async () => {
    useAppStore.setState({ customAddress: custom, publishedAddress: published });
    render();
    act(() => appAddress.setCustomAddress(null));
    await share();
    expect(writeText).toHaveBeenCalledWith(`${published}?file=file-id&path=%2FMaps%2FMap.mmd`);
  });
});
