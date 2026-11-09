import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { galleryRoute } from "../src/lib/analytics";

const base = "/copilot-studio-gallery/";

test("gallery routes respect the deployment prefix and never collect contributor identities", () => {
  assert.deepEqual(galleryRoute(`${base}solutions/oddly/`, base), { page_type: "solution", solution_slug: "oddly" });
  assert.deepEqual(galleryRoute(base, base), { page_type: "gallery" });
  assert.deepEqual(galleryRoute(base.slice(0, -1), base), { page_type: "gallery" });
  assert.deepEqual(galleryRoute(`${base}contributors/`, base), { page_type: "contributors" });
  assert.deepEqual(galleryRoute(`${base}contributors/example`, base), { page_type: "contributor_profile" });
  assert.deepEqual(galleryRoute("/contributors", "/"), { page_type: "contributors" });
  for (const path of ["/other/solutions/oddly", "/copilot-studio-gallery-extra/", `${base}solutions/oddly/files`]) {
    assert.deepEqual(galleryRoute(path, base), { page_type: "other" });
  }
});

function script(path: string, production = true) {
  const file = readFileSync(new URL(path, import.meta.url), "utf8");
  const source = file.match(/<script>\s*([\s\S]*?)<\/script>/g)?.at(-1)?.replace(/^<script>|<\/script>$/g, "");
  assert.ok(source);
  return ts.transpileModule(source.replaceAll("import.meta.env.PROD", String(production))
    .replaceAll("import.meta.env.BASE_URL", JSON.stringify(base)), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
}

class Control {
  dataset: Record<string, string> = {};
  attributes = new Map<string, string>();
  handlers = new Map<string, (event?: { preventDefault(): void; defaultPrevented?: boolean }) => unknown>();
  classList = { toggle() {} };
  checked = false;
  disabled = true;
  value = "";
  textContent = "";
  className = "";
  title = "";
  focused = false;
  selected = false;
  tabIndex = -1;
  href = "";
  addEventListener(name: string, handler: (event?: { preventDefault(): void; defaultPrevented?: boolean }) => unknown) { this.handlers.set(name, handler); }
  setAttribute(key: string, value: string) { this.attributes.set(key, value); }
  removeAttribute(key: string) { this.attributes.delete(key); }
  getAttribute(key: string) { return this.attributes.get(key); }
  focus() { this.focused = true; }
  select() { this.selected = true; }
}

function downloadFixture(production = true, clipboardFails = false) {
  const ack = new Control();
  const download = new Control();
  download.dataset.downloadUrl = "/bundle.zip";
  const input = new Control();
  input.dataset.installValue = "private command content";
  const status = new Control();
  const command = {
    getAttribute: () => "macos",
    querySelector: (selector: string) => selector === "textarea" ? input : status,
  };
  const button = Object.assign(new Control(), { closest: () => command });
  button.dataset.copyLabel = "Copy setup command";
  const root = {
    dataset: { submissionType: "managed-app", downloadSurface: "app-sidebar" },
    querySelector: (selector: string) => selector === "[data-trust-ack]" ? ack : {},
    querySelectorAll: (selector: string) => ({
      "[data-download-gated]": [download], "[data-install-value]": [input], "[data-copy-install]": [button],
    })[selector],
  };
  const events: { event: string; context: unknown }[] = [];
  const writes: string[] = [];
  runInNewContext(script("../src/components/SolutionDownload.astro", production), {
    exports: {},
    require: () => ({ galleryRoute, trackGalleryEvent: (event: string, context: unknown) => events.push({ event, context }) }),
    document: { querySelectorAll: () => [root] },
    window: { location: { pathname: `${base}solutions/oddly/` }, addEventListener() {}, clearTimeout() {}, setTimeout: () => 1 },
    navigator: { clipboard: { async writeText(value: string) {
      if (clipboardFails) throw new Error("Clipboard denied");
      writes.push(value);
    } } },
  });
  return { ack, download, input, button, status, events, writes };
}

test("downloads and copies remain gated; only explicit acknowledgement changes emit a funnel step", async () => {
  const fixture = downloadFixture();
  assert.equal(fixture.events.length, 0);
  assert.equal(fixture.input.value, "");
  let prevented = false;
  fixture.download.handlers.get("click")!({ preventDefault() { prevented = true; } });
  await fixture.button.handlers.get("click")!();
  assert.equal(prevented, true);
  assert.equal(fixture.events.length, 0);
  assert.equal(fixture.writes.length, 0);
  fixture.ack.checked = true;
  fixture.ack.handlers.get("change")!();
  assert.equal(fixture.button.disabled, false);
  fixture.download.handlers.get("click")!({ preventDefault() {} });
  fixture.download.handlers.get("click")!({ preventDefault() {}, defaultPrevented: true });
  await fixture.button.handlers.get("click")!();
  assert.deepEqual(fixture.events.map(({ event }) => event), [
    "trust_acknowledged", "download_requested", "install_script_copy_clicked", "install_script_copied",
  ]);
  assert.deepEqual(structuredClone(fixture.events.at(-1)?.context), {
    page_type: "solution", solution_slug: "oddly", submission_type: "managed-app",
    download_surface: "app-sidebar", install_platform: "macos",
  });
  assert.doesNotMatch(JSON.stringify(fixture.events), /private command/);
});

test("clipboard failure is not a conversion and retains the manual-copy fallback", async () => {
  const fixture = downloadFixture(true, true);
  fixture.ack.checked = true;
  fixture.ack.handlers.get("change")!();
  await fixture.button.handlers.get("click")!();
  assert.deepEqual(fixture.events.map(({ event }) => event), [
    "trust_acknowledged", "install_script_copy_clicked", "install_script_copy_failed",
  ]);
  assert.equal(fixture.input.selected, true);
  assert.match(fixture.status.textContent, /Clipboard unavailable/);
});

test("development interactions do not emit production analytics", async () => {
  const fixture = downloadFixture(false);
  fixture.ack.checked = true;
  fixture.ack.handlers.get("change")!();
  fixture.download.handlers.get("click")!({ preventDefault() {} });
  await fixture.button.handlers.get("click")!();
  assert.deepEqual(fixture.events, []);
  assert.equal(fixture.writes.length, 1);
});

test("Clarity receives tags before events and tolerates an absent client without initializing tracking", () => {
  const source = readFileSync(new URL("../src/lib/analytics.ts", import.meta.url), "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const calls: unknown[][] = [];
  for (const window of [undefined, {}, { clarity: (...args: unknown[]) => calls.push(args) }]) {
    const exports: { trackGalleryEvent?: (event: string, context: unknown) => void } = {};
    runInNewContext(output, { exports, window });
    exports.trackGalleryEvent!("install_script_copied", { install_platform: "macos", solution_slug: undefined });
  }
  assert.deepEqual(calls, [["set", "install_platform", "macos"], ["event", "install_script_copied"]]);
});

function navigationFixture(path: string, production = true) {
  const events: { event: string; context: unknown }[] = [];
  const handlers = new Map<string, (event: unknown) => void>();
  class Link {
    constructor(public href: string, public dataset: Record<string, string> = {}) {}
    closest() { return this; }
  }
  runInNewContext(script("../src/layouts/Layout.astro", production), {
    exports: {}, URL, Element: Link,
    require: () => ({ galleryRoute, trackGalleryEvent: (event: string, context: unknown) => events.push({ event, context }) }),
    window: { location: { origin: "https://example.test", pathname: path } },
    document: {
      querySelector: () => path.includes("/solutions/") ? { dataset: { submissionType: "managed-app" } } : null,
      getElementById: () => null,
      addEventListener: (name: string, handler: (event: unknown) => void) => handlers.set(name, handler),
    },
  });
  const activate = (href: string, options: { type?: string; button?: number; defaultPrevented?: boolean; dataset?: Record<string, string> } = {}) => {
    const { type = "click", button = 0, defaultPrevented = false, dataset = {} } = options;
    handlers.get(type)?.({ type, button, defaultPrevented, target: new Link(href, dataset) });
  };
  return { events, activate };
}

test("shared navigation tracks contributor exploration, samples, and contribution interest without URL query data", () => {
  const { events, activate } = navigationFixture(`${base}contributors/`);
  const url = (path: string) => `https://example.test${base}${path}`;
  activate(url("contributors/example/"));
  activate(url("solutions/oddly/?private=value"), { type: "auxclick", button: 1 });
  activate("https://github.com/example", { dataset: { contributorAction: "contributor_github_click" } });
  activate(url("?author=example"), { dataset: { contributorAction: "contributor_filter_click" } });
  activate("https://github.com/microsoft/copilot-studio-gallery/blob/main/CONTRIBUTING.md");
  activate(url("contributors"));
  activate(url("contributors"), { defaultPrevented: true });
  activate(url("contributors"), { type: "auxclick", button: 2 });
  activate("https://unrelated.test/solutions/oddly");
  assert.deepEqual(events.map(({ event }) => event), [
    "contributors_view", "contributor_profile_click", "solution_click",
    "contributor_github_click", "contributor_filter_click", "contribution_guide_clicked", "contributors_click",
  ]);
  assert.deepEqual(structuredClone(events[2]?.context), { page_type: "contributors", solution_slug: "oddly" });
  assert.doesNotMatch(JSON.stringify(events), /private|example|author/);
});

test("direct detail arrivals emit a conversion entry with submission type, but development page views do not", () => {
  assert.deepEqual(structuredClone(navigationFixture(`${base}solutions/oddly/`).events), [{
    event: "solution_view", context: { page_type: "solution", solution_slug: "oddly", submission_type: "managed-app" },
  }]);
  assert.deepEqual(navigationFixture(base, false).events, []);
});
