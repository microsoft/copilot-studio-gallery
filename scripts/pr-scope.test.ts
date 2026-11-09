import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parse } from "yaml";
import {
  checkContributionPolicy,
  GitHubPolicyApi,
  inspectPullRequest,
  METADATA_LABEL,
  SITE_LABEL,
  type ChangedFile,
  type MetadataChange,
} from "./contribution-policy";

const file = (filename: string, status = "modified", previous_filename?: string): ChangedFile => ({ filename, status, previous_filename });
const metadataPath = "submissions/sample/metadata.json";
const submission = file(metadataPath);
const policy = (files: ChangedFile[], labels: string[] = [], metadata: MetadataChange[] = []) => checkContributionPolicy(files, labels, metadata);
const metadataChange = (head: Record<string, unknown>, base?: Record<string, unknown>): MetadataChange => ({ path: metadataPath, base, head });

test("ordinary single submissions and regenerated outputs need no labels", () => {
  assert.deepEqual(policy([submission, file("submissions/sample/solution/solution.xml"), file("src/content/solutions/sample.json")]), []);
  assert.deepEqual(policy([submission], [], [metadataChange({ category: "HR", featured: false })]), []);
});

test("metadata and site labels authorize independent boundaries on every PR", () => {
  const contract = file("src/lib/submissionMetadata.ts");
  const site = file("src/pages/index.astro");
  for (const path of ["src/lib/schema.ts", "scripts/import-submissions.ts", ".github/workflows/ci.yml", "CONTRIBUTING.md", "public/installers/setup.sh"]) {
    assert.match(policy([file(path)]).join("\n"), /allow-site-changes/);
    assert.deepEqual(policy([file(path)], [SITE_LABEL]), []);
    assert.match(policy([file(path)], [METADATA_LABEL]).join("\n"), /allow-site-changes/);
  }
  assert.match(policy([contract]).join("\n"), /allow-metadata-changes/);
  assert.deepEqual(policy([contract], [METADATA_LABEL]), []);
  assert.match(policy([contract], [SITE_LABEL]).join("\n"), /allow-metadata-changes/);
  assert.equal(policy([contract, site]).length, 2);
  assert.deepEqual(policy([contract, site, submission], [METADATA_LABEL, SITE_LABEL]), []);
});

test("shared metadata guidance and template metadata need the metadata label", () => {
  for (const path of ["submissions/README.md", "submissions/_template/metadata.json"]) {
    assert.match(policy([file(path)]).join("\n"), /allow-metadata-changes/);
    assert.deepEqual(policy([file(path)], [METADATA_LABEL]), []);
  }
});

test("legacy override, partial label names, and label removal do not authorize changes", () => {
  const site = file("src/pages/index.astro");
  for (const labels of [[], ["allow-mixed-changes"], ["not-allow-site-changes"], [METADATA_LABEL]]) {
    assert.match(policy([site], labels).join("\n"), /allow-site-changes/);
  }
  assert.deepEqual(policy([site], [SITE_LABEL]), []);
  assert.notDeepEqual(policy([site], []), []);
});

test("deleted and renamed files are classified using both names", () => {
  assert.match(policy([file("src/pages/old.astro", "removed")]).join("\n"), /allow-site-changes/);
  const rename = file(metadataPath, "renamed", "src/lib/submissionMetadata.ts");
  assert.match(policy([rename]).join("\n"), /allow-metadata-changes/);
  assert.deepEqual(policy([rename], [METADATA_LABEL]), []);
  assert.match(policy([file(metadataPath, "renamed", "src/lib/old.ts")]).join("\n"), /allow-site-changes/);
});

test("multiple submission entries require the applicable maintenance approval", () => {
  const second = file("submissions/second/metadata.json");
  assert.match(policy([submission, second]).join("\n"), /allow-metadata-changes/);
  assert.deepEqual(policy([submission, second], [METADATA_LABEL]), []);
  assert.match(policy([submission, second], [SITE_LABEL]).join("\n"), /allow-metadata-changes/);
  const payload = file("submissions/second/solution/solution.xml");
  assert.match(policy([submission, payload], [METADATA_LABEL]).join("\n"), /allow-site-changes/);
  assert.deepEqual(policy([submission, payload], [SITE_LABEL]), []);
});

test("generated-only edits are rejected even with scope labels", () => {
  for (const path of ["src/content/solutions/sample.json", "src/content/guides/sample.md", "public/bundles/sample.zip"]) {
    assert.match(policy([file(path)], [METADATA_LABEL, SITE_LABEL]).join("\n"), /corresponding submission source/);
  }
});

test("badges are compared to base, not trusted from submitted metadata", () => {
  for (const head of [{ featured: true }, { hackathon: "winner" }, { hackathon: "hacker" }]) {
    assert.match(policy([submission], [], [metadataChange(head)]).join("\n"), /allow-metadata-changes/);
    assert.match(policy([submission], [SITE_LABEL], [metadataChange(head)]).join("\n"), /allow-metadata-changes/);
    assert.deepEqual(policy([submission], [METADATA_LABEL], [metadataChange(head)]), []);
  }
  assert.deepEqual(policy([submission], [], [metadataChange({ featured: false }, {})]), []);
  assert.deepEqual(policy([submission], [], [metadataChange({}, { featured: false })]), []);
  assert.deepEqual(policy([submission], [], [metadataChange({ featured: true, hackathon: "winner" }, { featured: true, hackathon: "winner" })]), []);
  assert.match(policy([submission], [], [metadataChange({ hackathon: "winner" }, { hackathon: "hacker" })]).join("\n"), /hackathon/);
  assert.match(policy([submission], [], [metadataChange({}, { featured: true })]).join("\n"), /featured/);
  assert.deepEqual(policy([file(metadataPath, "removed")], [], [{ path: metadataPath, base: { featured: true } }]), []);
});

test("unknown categories and metadata fields cannot be self-authorized", () => {
  for (const head of [{ category: "Retail" }, { inventedBadge: true }]) {
    assert.notDeepEqual(policy([submission], [], [metadataChange(head)]), []);
    assert.notDeepEqual(policy([submission], [SITE_LABEL], [metadataChange(head)]), []);
    assert.deepEqual(policy([submission], [METADATA_LABEL], [metadataChange(head)]), []);
  }
});

const baseSha = "a".repeat(40);
const headSha = "b".repeat(40);
const pr = (count: number, labels: string[] = []) => ({
  state: "open", changed_files: count, labels: labels.map((name) => ({ name })),
  base: { sha: baseSha }, head: { sha: headSha },
});
function apiWith(handler: (path: string) => unknown | Response): GitHubPolicyApi {
  return new GitHubPolicyApi("owner/repo", "test-token", "https://api.github.test",
    async (url, init) => {
      assert.equal(init?.redirect, "error");
      const data = handler(new URL(String(url)).pathname.replace("/repos/owner/repo/", "") + new URL(String(url)).search);
      return data instanceof Response ? data : Response.json(data);
    });
}
const content = (value: unknown) => {
  const bytes = Buffer.from(JSON.stringify(value));
  return { type: "file", encoding: "base64", size: bytes.length, content: bytes.toString("base64") };
};

test("GitHub policy paginates actual PR files and compares base/head metadata", async () => {
  const calls: string[] = [];
  const api = apiWith((path) => {
    calls.push(path);
    if (path === "pulls/1") return pr(101);
    if (path.endsWith("page=1")) return [submission, ...Array.from({ length: 99 }, (_, i) => file(`submissions/sample/solution/${i}.xml`))];
    if (path.endsWith("page=2")) return [file("submissions/sample/README.md")];
    return content(path.endsWith(baseSha) ? { featured: false } : { featured: true });
  });
  assert.match((await inspectPullRequest(api, 1, { base: baseSha, head: headSha })).join("\n"), /featured/);
  assert.ok(calls.some((path) => path.endsWith("page=2")));
});

test("policy fails closed on API errors, truncated files, stale revisions, and changing labels", async () => {
  const failed = apiWith(() => new Response("denied", { status: 403 }));
  await assert.rejects(() => inspectPullRequest(failed, 1), /GitHub API 403/);
  const incomplete = apiWith((path) => path === "pulls/1" ? pr(2) : [submission]);
  await assert.rejects(() => inspectPullRequest(incomplete, 1), /Incomplete PR file list/);
  const stale = apiWith(() => pr(0));
  await assert.rejects(() => inspectPullRequest(stale, 1, { base: baseSha, head: "c".repeat(40) }), /base or head changed/);
  let reads = 0;
  const relabeled = apiWith((path) => path === "pulls/1" ? pr(0, ++reads === 1 ? [SITE_LABEL] : []) : []);
  await assert.rejects(() => inspectPullRequest(relabeled, 1), /labels changed/);
  await assert.rejects(() => inspectPullRequest(stale, 0), /Invalid PR number/);
});

test("metadata reads accept absent base files but reject invalid or oversized data", async () => {
  const missing = apiWith(() => new Response("", { status: 404 }));
  assert.equal(await missing.metadata(metadataPath, baseSha), undefined);
  for (const value of [
    { type: "symlink", encoding: "base64", size: 2, content: "e30=" },
    { type: "file", encoding: "base64", size: 600_000, content: "e30=" },
    { type: "file", encoding: "base64", size: 20, content: "e30=" },
    content([]),
  ]) {
    await assert.rejects(() => apiWith(() => value).metadata(metadataPath, headSha));
  }
});

test("workflow uses trusted base code, a head commit status, and no PR code execution", () => {
  const workflow = parse(readFileSync(new URL("../.github/workflows/contribution-policy.yml", import.meta.url), "utf8"));
  assert.ok(workflow.on.pull_request_target);
  assert.ok(workflow.on.pull_request_target.types.includes("edited"));
  assert.ok(workflow.on.pull_request_target.types.includes("unlabeled"));
  assert.deepEqual(workflow.permissions, { contents: "read", "pull-requests": "read", statuses: "write" });
  const steps = workflow.jobs["guard-scope"].steps;
  const checkout = steps.find((step: { uses?: string }) => step.uses?.startsWith("actions/checkout@"));
  assert.equal(checkout.with.ref, "${{ github.event.pull_request.base.sha }}");
  assert.equal(checkout.with["persist-credentials"], false);
  const commands = steps.filter((step: { run?: string }) => step.run).map((step: { run: string }) => step.run).join("\n");
  assert.equal(commands.includes("pull_request.head"), false);
  assert.ok(commands.includes("node --import tsx scripts/contribution-policy.ts"));
  assert.equal((commands.match(/context='Guard pull request scope'/g) ?? []).length, 2);
  const reporting = steps.find((step: { name: string }) => step.name === "Publish required head status");
  assert.equal(reporting.env.HEAD_SHA, "${{ github.event.pull_request.head.sha }}");
  assert.equal(reporting.if, "${{ always() && !cancelled() }}");
});

test("fork CI regenerates build inputs without committing to forks", () => {
  const ci = parse(readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8"));
  assert.equal(ci.jobs["guard-scope"], undefined);
  const steps = ci.jobs.build.steps;
  const index = steps.findIndex((step: { run?: string }) => step.run === "npm run import:submissions");
  assert.ok(index >= 0);
  assert.equal(steps[index].if, undefined);
  assert.ok(index < steps.findIndex((step: { run?: string }) => step.run === "npm run check"));
  assert.ok(index < steps.findIndex((step: { run?: string }) => step.run === "npm run build"));
  const commit = steps.find((step: { name: string }) => step.name === "Commit generated content");
  assert.equal(commit.if, "github.event.pull_request.head.repo.full_name == github.repository");
});
