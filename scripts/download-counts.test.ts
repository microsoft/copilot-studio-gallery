import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as counts from "../src/lib/download-counts";

const now = Date.now();
const asOf = new Date(now - 60_000).toISOString();
const trackedSince = new Date(now - 86_400_000).toISOString();
const snapshot = (count = 5, collectedAt = new Date(now).toISOString()) => ({
  schemaVersion: 1, collectedAt, submissions: [{ slug: "sample", count }],
});

test("compact snapshots validate version, slugs, identities, safe totals, timestamps and allowlisted fields", () => {
  for (const value of [
    null, {}, { ...snapshot(), schemaVersion: 2 }, { ...snapshot(), collectedAt: "yesterday" },
    { ...snapshot(), collectedAt: "2026-02-30T00:00:00Z" }, { ...snapshot(), assets: [] },
    { ...snapshot(), submissions: [{ slug: "../sample", count: 5 }] },
    { ...snapshot(), submissions: [{ slug: "sample", count: 5, assetId: 10 }] },
    { ...snapshot(), submissions: [...snapshot().submissions, ...snapshot().submissions] },
    ...[-1, 1.5, Number.MAX_SAFE_INTEGER + 1, Infinity, "5"].map((count) => ({
      ...snapshot(), submissions: [{ slug: "sample", count }],
    })),
  ]) assert.throws(() => counts.downloadCountsSchema.parse(value));
  assert.doesNotThrow(() => counts.downloadCountsSchema.parse(snapshot(0)));
  assert.doesNotThrow(() => counts.downloadCountsSchema.parse(snapshot(Number.MAX_SAFE_INTEGER)));
});

test("refresh accepts newer nondecreasing totals, including measured zero, but rejects stale or conflicting metrics", () => {
  assert.deepEqual(counts.refreshedDownloadCount(snapshot(), "sample", { count: 3, asOf }, now), { count: 5, asOf: snapshot().collectedAt });
  assert.equal(counts.refreshedDownloadCount(snapshot(0), "sample", { count: 0, asOf }, now).count, 0);
  assert.equal(counts.refreshedDownloadCount(snapshot(3, asOf), "sample", { count: 3, asOf }, now).count, 3);
  for (const value of [
    snapshot(2), snapshot(5, asOf), snapshot(5, new Date(now - 120_000).toISOString()),
    snapshot(5, new Date(now + 1).toISOString()),
    snapshot(5, new Date(now - counts.DOWNLOAD_COUNTS_MAX_AGE_MS - 1).toISOString()),
    { ...snapshot(), submissions: [] },
  ]) assert.throws(() => counts.refreshedDownloadCount(value, "sample", { count: 3, asOf }, now));
  const oldest = new Date(now - counts.DOWNLOAD_COUNTS_MAX_AGE_MS).toISOString();
  assert.doesNotThrow(() => counts.refreshedDownloadCount(snapshot(5, oldest), "sample", {
    count: 3, asOf: new Date(Date.parse(oldest) - 1).toISOString(),
  }, now));
});

class Metric {
  dataset = { slug: "sample", count: "3", asOf, trackedSince };
  title = counts.downloadCountExplanation(trackedSince, asOf);
  isConnected = true;
  label = { textContent: "3 downloads" };
  explanation = { textContent: this.title };
  time = { textContent: asOf, dateTime: asOf };
  querySelector(selector: string): { textContent: string } | null {
    return selector === "[data-count-label]" ? this.label
      : selector === "[data-count-explanation]" ? this.explanation : this.time;
  }
}

function fixture(result: unknown | Response = snapshot()) {
  let elements = [new Metric()];
  const errors: unknown[][] = [];
  const calls: { url: string; options: RequestInit }[] = [];
  const exports: { refreshDownloadCounts?: (document: object) => Promise<void> } = {};
  const source = readFileSync("src/lib/download-count-client.ts", "utf8");
  runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, {
    exports, require: () => counts, AbortSignal,
    console: { error: (...args: unknown[]) => errors.push(args) },
    fetch: async (url: string, options: RequestInit) => {
      calls.push({ url, options });
      if (result instanceof Error) throw result;
      return result instanceof Response ? result : Response.json(result);
    },
  });
  assert.ok(exports.refreshDownloadCounts);
  const refresh = exports.refreshDownloadCounts;
  const document = { querySelectorAll: () => elements };
  return { metric: elements[0]!, errors, calls, run: () => refresh(document), navigate: () => {
    elements[0]!.isConnected = false;
    elements = [new Metric()];
    return elements[0]!;
  } };
}

test("browser refresh updates count, tooltip and accessible time with a credential-free fixed snapshot request", async () => {
  const f = fixture();
  await f.run();
  assert.equal(f.metric.label.textContent, "5 downloads");
  assert.equal(f.metric.time.dateTime, snapshot().collectedAt);
  assert.equal(f.metric.time.textContent, snapshot().collectedAt);
  assert.equal(f.metric.title, counts.downloadCountExplanation(trackedSince, snapshot().collectedAt));
  assert.equal(f.metric.explanation.textContent, f.metric.title);
  assert.equal(f.metric.dataset.count, "5");
  assert.equal(f.metric.dataset.asOf, snapshot().collectedAt);
  assert.equal(f.errors.length, 0);
  assert.equal(f.calls[0]?.url, counts.DOWNLOAD_COUNTS_URL);
  assert.equal(f.calls[0]?.options.credentials, "omit");
  assert.equal(f.calls[0]?.options.redirect, "error");
  assert.equal(f.calls[0]?.options.cache, "no-cache");
  assert.equal(f.calls[0]?.options.headers, undefined);
  assert.ok(f.calls[0]?.options.signal);
});

test("HTTP, network, malformed, stale, older, missing and decreased snapshots preserve every rendered field and log failures", async () => {
  for (const result of [
    new Response("", { status: 404 }), new Error("Network blocked"),
    new Response("{"), {}, snapshot(2), snapshot(5, trackedSince),
    snapshot(5, new Date(now - counts.DOWNLOAD_COUNTS_MAX_AGE_MS - 1).toISOString()),
    { ...snapshot(), submissions: [] },
  ]) {
    const f = fixture(result);
    const original = JSON.stringify(f.metric);
    await f.run();
    assert.equal(JSON.stringify(f.metric), original);
    assert.equal(f.errors.length, 1);
    assert.match(String(f.errors[0]?.[0]), /preserving the rendered snapshot/);
  }
});

test("initial and Astro navigation events initialize each rendered metric once, including new detail pages", async () => {
  const f = fixture();
  await Promise.all([f.run(), f.run()]);
  assert.equal(f.calls.length, 1);
  const next = f.navigate();
  await f.run();
  assert.equal(f.calls.length, 2);
  assert.equal(next.label.textContent, "5 downloads");
  const component = readFileSync("src/components/DownloadCount.astro", "utf8");
  assert.match(component, /document.addEventListener\("astro:page-load"/);
  assert.match(component, /void refreshDownloadCounts\(document\)/);
});

test("missing controls and detached pages are not partially updated", async () => {
  const missing = fixture();
  missing.metric.querySelector = () => null;
  const original = JSON.stringify(missing.metric);
  await missing.run();
  assert.equal(JSON.stringify(missing.metric), original);
  assert.equal(missing.errors.length, 1);
  const detached = fixture();
  detached.metric.isConnected = false;
  await detached.run();
  assert.equal(detached.metric.label.textContent, "3 downloads");
});
