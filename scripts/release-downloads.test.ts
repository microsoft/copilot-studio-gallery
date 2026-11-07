import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir, mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { parse } from "yaml";
import {
  downloadSnapshotSchema, releaseDownloadUrl, submissionDownload, type DownloadAsset,
} from "../src/lib/downloads";
import { GitHub, GitHubError, collectDownloads, loadSnapshot, publishBundles, readBundles, saveSnapshot } from "./release-downloads";

const sha = "a".repeat(40);
const tag = `gallery-bundles-${sha}-1`;
const bytes = Buffer.from("deterministic ZIP fixture");
const hash = createHash("sha256").update(bytes).digest("hex");
const bundle = { slug: "sample", hash, bytes };
const date = "2026-11-07T12:00:01.000Z";
const release = { id: 1, tag_name: tag, draft: false, published_at: "2026-11-07T12:00:00Z" };
const entry: DownloadAsset = {
  slug: "sample", hash, assetId: 10, releaseId: 1, tag,
  url: releaseDownloadUrl("sample", hash, tag), size: bytes.length, publishedAt: release.published_at, count: 3,
};
const apiAsset = {
  id: entry.assetId, name: `sample-${hash}.zip`, state: "uploaded", size: bytes.length,
  browser_download_url: entry.url, digest: `sha256:${hash}`, download_count: 5,
};
const snapshot = () => downloadSnapshotSchema.parse({ schemaVersion: 1, collectedAt: date, assets: [entry] });

type Handler = (path: string, init: RequestInit) => unknown | Response;
function client(handler: Handler) {
  const calls: Array<{ path: string; init: RequestInit }> = [];
  const github = new GitHub("test-token", async (input, init = {}) => {
    const url = new URL(String(input));
    const path = url.pathname.replace("/repos/microsoft/copilot-studio-gallery", "") + url.search;
    calls.push({ path, init });
    const result = handler(path, init);
    return result instanceof Response ? result : Response.json(result);
  }, async () => {});
  return { github, calls };
}
const now = () => new Date(date);

test("submission totals include old versions, preserve measured zero, and select the current hash", () => {
  const oldHash = "b".repeat(64);
  const old = { ...entry, hash: oldHash, assetId: 11, url: releaseDownloadUrl("sample", oldHash, tag), count: 7 };
  const data = downloadSnapshotSchema.parse({ schemaVersion: 1, collectedAt: date, assets: [entry, old] });
  assert.equal(submissionDownload(data, "sample", hash).count, 10);
  assert.equal(submissionDownload(data, "sample", hash).url, entry.url);
  assert.equal(submissionDownload({ ...data, assets: [{ ...entry, count: 0 }] }, "sample", hash).count, 0);
  assert.throws(() => submissionDownload(data, "sample", "c".repeat(64)), /current ZIP/);
});

test("snapshot validation rejects forged URLs, duplicate identities, invalid counts and future timestamps", () => {
  for (const asset of [
    { ...entry, url: "https://example.com/sample.zip" }, { ...entry, count: -1 },
    { ...entry, count: 1.5 }, { ...entry, publishedAt: "2027-01-01T00:00:00Z" },
    { ...entry, count: Number.MAX_SAFE_INTEGER + 1 },
  ]) assert.throws(() => downloadSnapshotSchema.parse({ ...snapshot(), assets: [asset] }));
  assert.throws(() => downloadSnapshotSchema.parse({ ...snapshot(), assets: [entry, entry] }));
  assert.throws(() => downloadSnapshotSchema.parse({ ...snapshot(), assets: [{ ...entry, count: Number.MAX_SAFE_INTEGER }, {
    ...entry, assetId: 12, hash: "c".repeat(64), url: releaseDownloadUrl("sample", "c".repeat(64), tag), count: 1,
  }] }));
  assert.doesNotThrow(() => downloadSnapshotSchema.parse({ ...snapshot(), collectedAt: "2026-11-07T12:00:00.500Z" }));
});

test("unchanged ZIP versions do not call GitHub or create releases", async () => {
  const { github, calls } = client(() => { throw new Error("Unexpected API call"); });
  assert.deepEqual(await publishBundles(github, snapshot(), [bundle], sha), [entry]);
  assert.equal(calls.length, 0);
});

test("publisher uploads into a draft, verifies hash, then publishes without changing latest", async () => {
  const { github, calls } = client((path, init) => {
    if (path.startsWith("/releases?")) return [];
    if (path === "/releases" && init.method === "POST") {
      assert.equal(JSON.parse(String(init.body)).draft, true);
      assert.equal(JSON.parse(String(init.body)).target_commitish, sha);
      return { ...release, draft: true, published_at: null };
    }
    if (path === "/releases/1/assets?per_page=100&page=1") return [];
    if (path.startsWith("/releases/1/assets?name=")) {
      assert.equal(init.method, "POST");
      assert.ok(init.body instanceof Uint8Array);
      assert.deepEqual(Buffer.from(init.body), bytes);
      return apiAsset;
    }
    if (path === "/releases/1" && init.method === "PATCH") {
      assert.deepEqual(JSON.parse(String(init.body)), { draft: false, make_latest: "false" });
      return release;
    }
    throw new Error(`Unexpected call: ${path}`);
  });
  const result = await publishBundles(github, { ...snapshot(), assets: [] }, [bundle], sha);
  assert.equal(result[0]?.assetId, 10);
  assert.equal(result[0]?.count, 0);
  assert.equal(calls.filter((call) => call.init.method === "POST").length, 2);
});

test("publisher recovers an already published batch without mutating it", async () => {
  const { github, calls } = client((path) => path.startsWith("/releases?") ? [release] : [apiAsset]);
  const result = await publishBundles(github, { ...snapshot(), assets: [] }, [bundle], sha);
  assert.equal(result.length, 1);
  assert.ok(calls.every((call) => call.init.method === "GET"));
});

test("publisher splits 1,001 new versions at the exact 1,000-asset release limit", async () => {
  let releases = 0;
  let assetId = 0;
  const uploads = new Map<number, number>();
  const { github } = client((path, init) => {
    if (path.startsWith("/releases?")) return [];
    if (path === "/releases" && init.method === "POST") {
      releases++;
      return { ...release, id: releases, tag_name: JSON.parse(String(init.body)).tag_name, draft: true, published_at: null };
    }
    if (path.includes("per_page=")) return [];
    const releaseId = Number(path.split("/")[2]);
    const batchTag = `gallery-bundles-${sha}-${releaseId}`;
    if (path.includes("?name=")) {
      const name = new URL(`https://example.com${path}`).searchParams.get("name")!;
      uploads.set(releaseId, (uploads.get(releaseId) ?? 0) + 1);
      return { ...apiAsset, id: ++assetId, name,
        browser_download_url: `https://github.com/microsoft/copilot-studio-gallery/releases/download/${batchTag}/${name}` };
    }
    return { ...release, id: releaseId, tag_name: batchTag };
  });
  const bundles = Array.from({ length: 1001 }, (_, index) => ({ ...bundle, slug: `sample-${index}` }));
  const result = await publishBundles(github, { ...snapshot(), assets: [] }, bundles, sha);
  assert.equal(result.length, 1001);
  assert.deepEqual([...uploads], [[1, 1000], [2, 1]]);
});

test("digest mismatch fails before release publication; uncertain writes are not retried", async () => {
  const { github, calls } = client((path) => {
    if (path.startsWith("/releases?")) return [{ ...release, draft: true, published_at: null }];
    return [{ ...apiAsset, digest: `sha256:${"f".repeat(64)}` }];
  });
  await assert.rejects(publishBundles(github, { ...snapshot(), assets: [] }, [bundle], sha), /digest mismatch/);
  assert.ok(calls.every((call) => call.init.method === "GET"));
  const failing = client(() => new Response("", { status: 503 }));
  await assert.rejects(failing.github.request("/releases", "POST", {}), GitHubError);
  assert.equal(failing.calls.length, 1);
});

test("missing digest is verified through a tokenless approved CDN redirect", async () => {
  const { github, calls } = client((path, init) => {
    if (path.startsWith("/releases?")) return [release];
    if (path.startsWith("/releases/1/assets?")) return [{ ...apiAsset, digest: null }];
    if (path === "/releases/assets/10") return new Response(null, {
      status: 302, headers: { location: "https://release-assets.githubusercontent.com/example/zip" },
    });
    assert.equal(new Headers(init.headers).has("authorization"), false);
    return new Response(new Uint8Array(bytes));
  });
  await publishBundles(github, { ...snapshot(), assets: [] }, [bundle], sha);
  assert.equal(calls.length, 4);
  const unsafe = client(() => new Response(null, { status: 302, headers: { location: "https://example.com/zip" } }));
  await assert.rejects(unsafe.github.download(10), /redirect host/);
  assert.equal(unsafe.calls.length, 1);
});

test("failed zero-byte staging assets can be repaired only inside a draft", async () => {
  const { github, calls } = client((path, init) => {
    if (path.startsWith("/releases?")) return [{ ...release, draft: true, published_at: null }];
    if (path === "/releases/1/assets?per_page=100&page=1") return [{ ...apiAsset, state: "starter", size: 0 }];
    if (init.method === "DELETE") return new Response(null, { status: 204 });
    if (init.method === "POST") return apiAsset;
    if (init.method === "PATCH") return release;
    throw new Error(path);
  });
  await publishBundles(github, { ...snapshot(), assets: [] }, [bundle], sha);
  assert.equal(calls.filter((call) => call.init.method === "DELETE").length, 1);
  const published = client((path) => path.startsWith("/releases?") ? [release] : [{ ...apiAsset, state: "starter", size: 0 }]);
  await assert.rejects(publishBundles(published.github, { ...snapshot(), assets: [] }, [bundle], sha), /identity or size/);
  assert.ok(published.calls.every((call) => call.init.method === "GET"));
});

test("collector paginates assets and preserves older version counters", async () => {
  const second = { ...entry, slug: "another", assetId: 110, url: releaseDownloadUrl("another", hash, tag), count: 2 };
  const { github, calls } = client((path) => {
    if (path === "/releases/1") return release;
    if (path.endsWith("page=1")) return Array.from({ length: 100 }, (_, index) => ({ ...apiAsset, id: index + 10 }));
    return [{ ...apiAsset, id: 110, name: `another-${hash}.zip`, browser_download_url: second.url }];
  });
  const result = await collectDownloads(github, [entry, second], now);
  assert.equal(result.assets.length, 2);
  assert.deepEqual(result.assets.map((asset) => asset.count), [5, 5]);
  assert.equal(calls.length, 3);
  assert.equal(entry.count, 3);
});

test("collector fails on missing, decreased, changed or non-public assets without modifying the previous snapshot", async () => {
  for (const asset of [undefined, { ...apiAsset, download_count: 1 }, { ...apiAsset, size: 999 }]) {
    const { github } = client((path) => path === "/releases/1" ? release : asset ? [asset] : []);
    await assert.rejects(collectDownloads(github, [entry], now));
    assert.equal(entry.count, 3);
  }
  const { github } = client(() => ({ ...release, draft: true }));
  await assert.rejects(collectDownloads(github, [entry], now), /not public/);
});

test("data branch bootstrap is explicit; corrupt or missing existing data never defaults to zero", async () => {
  const absent = client(() => new Response("", { status: 404 }));
  assert.deepEqual((await loadSnapshot(absent.github)).snapshot.assets, []);
  const corrupt = client((path) => path.startsWith("/git/ref") ? { object: { sha } } : {});
  await assert.rejects(loadSnapshot(corrupt.github));
  const missing = client((path) => path.startsWith("/git/ref") ? { object: { sha } } : new Response("", { status: 404 }));
  await assert.rejects(loadSnapshot(missing.github), GitHubError);
  const valid = client((path, init) => {
    if (path.startsWith("/git/ref")) return { object: { sha } };
    assert.equal(new Headers(init.headers).get("accept"), "application/vnd.github.raw+json");
    return snapshot();
  });
  assert.deepEqual((await loadSnapshot(valid.github)).snapshot, snapshot());
});

test("snapshot writes are non-force commits on the data branch and surface concurrent write rejection", async () => {
  const { github, calls } = client((path, init) => {
    if (path.startsWith("/git/commits/")) return { tree: { sha } };
    if (path === "/git/trees") {
      assert.equal(JSON.parse(String(init.body)).tree[0].path, "downloads.json");
      return { sha };
    }
    if (path === "/git/commits") {
      assert.deepEqual(JSON.parse(String(init.body)).parents, [sha]);
      return { sha: "b".repeat(40) };
    }
    assert.deepEqual(JSON.parse(String(init.body)), { sha: "b".repeat(40), force: false });
    return new Response("", { status: 422 });
  });
  await assert.rejects(saveSnapshot(github, snapshot(), sha), GitHubError);
  assert.equal(calls.at(-1)?.path, "/git/refs/heads/download-stats");
});

test("read retries honor bounded rate limits and never expose token values in errors", async () => {
  let attempts = 0;
  const { github } = client(() => ++attempts < 3 ? new Response("", { status: 429, headers: { "retry-after": "1" } }) : []);
  assert.deepEqual(await github.request("/releases"), []);
  assert.equal(attempts, 3);
  const blocked = client(() => new Response("", { status: 429, headers: { "retry-after": "3600" } }));
  await assert.rejects(blocked.github.request("/releases"), (error: unknown) => {
    assert.ok(error instanceof GitHubError);
    assert.ok(!error.message.includes("test-token"));
    return true;
  });
  assert.equal(blocked.calls.length, 1);
});

test("release operations refuse local and PR execution before making network requests", () => {
  const result = spawnSync(process.execPath, ["--import", "tsx", "scripts/release-downloads.ts", "publish", "/unused.json"], {
    encoding: "utf8", env: { ...process.env, GITHUB_ACTIONS: "false" },
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /trusted main workflow/);
});

test("the bundle inventory excludes demos and validates actual ZIP bytes", async () => {
  const root = await mkdtemp(join(tmpdir(), "release-bundles-"));
  try {
    await mkdir(join(root, "src/content/solutions"), { recursive: true });
    await mkdir(join(root, "public/bundles"), { recursive: true });
    const paths = await readdir("src/content/solutions");
    const source = JSON.parse(await readFile(join("src/content/solutions", paths.find((name) => name.endsWith(".json"))!), "utf8"));
    const record = { ...source, tags: ["sample"], bundle: "bundles/sample.zip", bundleSha256: hash };
    await writeFile(join(root, "src/content/solutions/sample.json"), JSON.stringify(record));
    await writeFile(join(root, "src/content/solutions/demo.json"), JSON.stringify({ ...record, tags: ["demo"] }));
    await writeFile(join(root, "public/bundles/sample.zip"), bytes);
    assert.equal((await readBundles(root)).length, 1);
    await writeFile(join(root, "public/bundles/sample.zip"), "changed");
    await assert.rejects(readBundles(root), /hash mismatch/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("workflow sequencing isolates PRs, serializes data writes and explicitly refreshes Pages", async () => {
  const deploy = parse(await readFile(".github/workflows/deploy.yml", "utf8"));
  const stats = parse(await readFile(".github/workflows/download-stats.yml", "utf8"));
  const ci = await readFile(".github/workflows/ci.yml", "utf8");
  assert.equal(deploy.concurrency["cancel-in-progress"], false);
  assert.deepEqual(deploy.jobs.build.concurrency, stats.jobs.collect.concurrency);
  assert.equal(deploy.jobs.build.permissions.contents, "write");
  assert.equal(stats.jobs.collect.permissions.actions, "write");
  const steps = deploy.jobs.build.steps;
  const publishing = steps.findIndex((step: { run?: string }) => step.run?.includes("release-downloads.ts publish"));
  const build = steps.findIndex((step: { run?: string }) => step.run === "npm run build");
  assert.ok(publishing > steps.findIndex((step: { run?: string }) => step.run === "npm run check"));
  assert.ok(build > publishing);
  assert.equal(steps[build].env.GALLERY_REQUIRE_RELEASES, "true");
  assert.equal(stats.jobs.collect.steps.at(-1).run, "gh workflow run deploy.yml --ref main");
  assert.ok(!ci.includes("release-downloads"));
});

test("download counts are wired only into submission detail pages, not gallery cards", async () => {
  const [solution, app, card, count, download, json] = await Promise.all([
    readFile("src/pages/solutions/[slug].astro", "utf8"), readFile("src/components/ManagedAppDetail.astro", "utf8"),
    readFile("src/components/SolutionCard.astro", "utf8"), readFile("src/components/DownloadCount.astro", "utf8"),
    readFile("src/components/SolutionDownload.astro", "utf8"), readFile("src/pages/solutions.json.ts", "utf8"),
  ]);
  assert.match(solution, /<DownloadCount download=\{data.download\}/);
  assert.match(app, /<DownloadCount download=\{app.download\}/);
  assert.ok(!card.includes("DownloadCount"));
  assert.match(count, /download &&/);
  assert.match(count, /ZIP/);
  assert.match(count, /datetime=\{download.asOf\}/);
  assert.match(download, /solution.download\?\.url \?\? withBase/);
  assert.match(json, /download: solution.data.download/);
});
