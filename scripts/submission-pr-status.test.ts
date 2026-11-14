import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parse } from "yaml";
import { assess, collectEvidence, MARKER, QUEUE_LABELS, reconcile, reconcileQueue, render, TaskApi, type Evidence, type Review } from "./submission-pr-status";

const head = "a".repeat(40);
const base = "b".repeat(40);
const old = "c".repeat(40);
const url = "https://github.com/owner/repo/pull/42";
const template = readFileSync(new URL("../.github/pull_request_template.md", import.meta.url), "utf8");
const attested = template.replaceAll("- [ ]", "- [x]");
const statements = attested.split("\n").filter((line) => line.startsWith("- [x]")).map((line) => line.slice(6));
const checkedItem = (statement: string) => `<li class="task-list-item"><input type="checkbox" id="" disabled="" class="task-list-item-checkbox" aria-label="Completed task" checked=""> ${statement}</li>`;
const attestedHTML = `<ul class="contains-task-list">\n${statements.map(checkedItem).join("\n")}\n</ul>`;
const native: Review = { id: 1, author: "copilot-pull-request-reviewer[bot]", human: false, copilot: true, head, state: "COMMENTED", url };
const human: Review = { id: 2, author: "maintainer", human: true, copilot: false, head, state: "APPROVED", url };
const checks = [
  { name: "Guard pull request scope", required: true, state: "SUCCESS", url },
  { name: "Validate, test, and build", required: true, state: "SUCCESS", url },
];

function evidence(): Evidence {
  return {
    pr: { number: 42, head, base, baseBranch: "main", branch: "sample", headRepo: "author/repo", author: "contributor", body: attested, url, draft: false, state: "open", count: 1, labels: [], requested: [] },
    bodyHTML: attestedHTML,
    files: [{ filename: "submissions/sample/README.md", status: "modified" }],
    formats: ["solution"], metadataProblems: [], reviews: [structuredClone(native), structuredClone(human)],
    threads: [], checks: structuredClone(checks), requiredChecks: checks.map((check) => check.name), ci: { state: "success", url },
    mergeState: "CLEAN", decision: "APPROVED",
  };
}

test("ready requires current Copilot evidence, current human approval and GitHub's clean merge state", () => {
  const state = evidence();
  assert.deepEqual(assess(state).labels, [QUEUE_LABELS.ready]);
  assert.match(assess(state).maintainer.join("\n"), /merge manually/);
  for (const change of [
    { decision: "REVIEW_REQUIRED" }, { mergeState: "UNKNOWN" }, { mergeState: "BLOCKED" },
    { mergeState: "BEHIND" }, { checks: checks.slice(0, 1) }, { reviews: [native] },
    { reviews: [native, { ...human, head: old }] },
    { reviews: [{ ...native, head: old }, human] },
    { reviews: [native, { ...human, state: "DISMISSED" }] },
    { reviews: [native, { ...human, author: "contributor" }] },
    { reviews: [native, { ...native, id: 3, state: "DISMISSED" }, human] },
    { reviews: [{ ...native, state: "CHANGES_REQUESTED" }, human] },
    { metadataProblems: ["Missing metadata"] },
    { requiredChecks: [...state.requiredChecks, "Newly required check"] },
  ]) {
    assert.ok(!assess({ ...state, ...change }).labels.includes(QUEUE_LABELS.ready), JSON.stringify(change));
  }
});

test("a new fixed revision awaits rereview instead of repeating old Copilot findings", () => {
  const state = evidence();
  state.reviews = [{ ...native, head: old }];
  state.threads = [{ review: 1, head: old, resolved: false, url, replyByAuthor: true }];
  state.ci = { state: "action_required", url };
  state.checks = [];
  state.decision = "REVIEW_REQUIRED";
  const result = assess(state);
  assert.deepEqual(result.contributor, []);
  assert.match(result.waiting.join(), /current revision|this revision/);
  assert.match(result.maintainer.join(), /authorize.*awaiting approval/);
  assert.match(result.maintainer.join(), /not a test failure/);
  assert.ok(result.labels.includes(QUEUE_LABELS.copilot));
});

test("native reapproval still cannot substitute for a human approval", () => {
  const state = evidence();
  state.reviews = [{ ...native, state: "APPROVED" }];
  assert.ok(!assess(state).labels.includes(QUEUE_LABELS.ready));
  assert.ok(!assess(state).labels.includes(QUEUE_LABELS.copilot));
  assert.match(assess(state).maintainer.join(), /formal human approval/);
});

test("a human's Copilot-looking approval text does not count as a native review", () => {
  const state = evidence();
  state.reviews = [{ ...human, state: "COMMENTED", author: "copilot-looking-name" }, human];
  assert.ok(assess(state).labels.includes(QUEUE_LABELS.copilot));
  assert.ok(!assess(state).labels.includes(QUEUE_LABELS.ready));
});

test("pending reviews under either native Copilot login do not request duplicate maintainer action", () => {
  for (const author of ["Copilot", "copilot-pull-request-reviewer[bot]"]) {
    const state = evidence();
    state.reviews = [human];
    state.pr.requested = [author];
    const result = assess(state);
    assert.ok(result.labels.includes(QUEUE_LABELS.copilot));
    assert.doesNotMatch(result.maintainer.join(), /Request a native Copilot review/);
  }
});

test("resolved threads do not waive attestations, CI or approval", () => {
  const state = evidence();
  state.pr.body = "";
  state.bodyHTML = "";
  state.reviews = [native];
  state.threads = [{ review: 1, head, resolved: true, url, replyByAuthor: false }];
  state.ci = { state: "action_required", url };
  assert.ok(assess(state).labels.includes(QUEUE_LABELS.contributor));
  assert.ok(assess(state).labels.includes(QUEUE_LABELS.maintainer));
  assert.ok(!assess(state).labels.includes(QUEUE_LABELS.ready));
});

test("human feedback after contributor replies or revision changes routes confirmation to maintainers", () => {
  for (const followup of [{ head: old, replyByAuthor: false }, { head, replyByAuthor: true }]) {
    const state = evidence();
    state.threads = [{ review: 2, resolved: false, url, ...followup }];
    assert.deepEqual(assess(state).contributor, []);
    assert.match(assess(state).maintainer.join(), /resolve it only if addressed/);
    assert.ok(!assess(state).labels.includes(QUEUE_LABELS.ready));
  }
  const state = evidence();
  state.threads = [{ review: 2, head, resolved: false, url, replyByAuthor: false }];
  assert.match(assess(state).contributor.join(), /fix or clarification/);
});

test("current unresolved Copilot findings permit fixes or discussion without automatically closing threads", () => {
  const state = evidence();
  state.threads = [{ review: 1, head: old, resolved: false, url, replyByAuthor: true }];
  const result = assess(state);
  assert.match(result.contributor.join(), /Address or discuss/);
  assert.match(result.maintainer.join(), /already supplied/);
  assert.ok(!result.labels.includes(QUEUE_LABELS.ready));
});

test("changes-requested reviews remain blockers and later comment-only reviews do not erase them", () => {
  const state = evidence();
  state.reviews.push({ ...human, id: 3, state: "CHANGES_REQUESTED" }, { ...human, id: 4, state: "COMMENTED" });
  assert.match(assess(state).maintainer.join(), /human request for changes/);
  assert.match(assess(state).contributor.join(), /feedback in the review summary/);
  assert.ok(assess(state).labels.includes(QUEUE_LABELS.contributor));
  assert.ok(!assess(state).labels.includes(QUEUE_LABELS.ready));
});

test("summary-only changes requests distinguish old revisions from current contributor work", () => {
  const state = evidence();
  state.reviews = [native, { ...human, head: old, state: "CHANGES_REQUESTED" }];
  assert.deepEqual(assess(state).contributor, []);
  assert.match(assess(state).maintainer.join(), /human request for changes/);
  state.reviews.push({ ...human, id: 3, author: "another-maintainer", state: "CHANGES_REQUESTED" });
  assert.match(assess(state).contributor.join(), /feedback in the review summary/);
  assert.ok(assess(state).labels.includes(QUEUE_LABELS.contributor));
});

test("attestations use GitHub-rendered checked tasks, not code examples or quoted tasks", () => {
  const state = evidence();
  for (const html of [
    "",
    `<pre><code>- [x] ${statements[0]}\n</code></pre>`,
    `<ul><li><div class="highlight"><pre>- [x] ${statements[0]}\n</pre></div></li></ul>`,
    `<pre><code>${attestedHTML.replaceAll("<", "&lt;").replaceAll(">", "&gt;")}</code></pre>`,
    `<blockquote>${attestedHTML}</blockquote>`,
    `<blockquote><blockquote>${attestedHTML}</blockquote>${attestedHTML}</blockquote>`,
    attestedHTML.replaceAll(' checked=""', ""),
  ]) {
    state.bodyHTML = html;
    assert.match(assess(state).contributor.join(), /solution fresh-environment/);
    assert.ok(!assess(state).labels.includes(QUEUE_LABELS.ready));
  }
  state.formats = ["app"];
  state.bodyHTML = checkedItem(statements[0]);
  assert.match(assess(state).contributor.join(), /managed-app fresh-app and source\/privacy/);
  state.bodyHTML = attestedHTML;
  assert.deepEqual(assess(state).contributor, []);
});

test("list-contained Markdown fences cannot satisfy attestations but real tasks after them can", () => {
  const state = evidence();
  for (const marker of ["- ~~~md", "1. ```md", "   - ````md"]) {
    state.pr.body = `${marker}\n  - [x] ${statements[0]}\n  ~~~`;
    state.bodyHTML = `<ul><li><pre><code>- [x] ${statements[0]}\n</code></pre></li></ul>`;
    assert.match(assess(state).contributor.join(), /solution fresh-environment/);
    state.bodyHTML += checkedItem(statements[0]);
    assert.deepEqual(assess(state).contributor, []);
  }
});

test("paragraph-wrapped loose-list tasks satisfy attestations without accepting quoted or unchecked tasks", () => {
  const state = evidence();
  state.formats = ["app"];
  const loose = attestedHTML.replaceAll('<li class="task-list-item">', '<li class="task-list-item">\n<p dir="auto">')
    .replaceAll("</li>", "</p>\n</li>");
  state.bodyHTML = loose;
  assert.deepEqual(assess(state).contributor, []);
  for (const html of [loose.replaceAll(' checked=""', ""), `<blockquote>${loose}</blockquote>`]) {
    state.bodyHTML = html;
    assert.match(assess(state).contributor.join(), /managed-app fresh-app and source\/privacy/);
    assert.ok(!assess(state).labels.includes(QUEUE_LABELS.ready));
  }
});

test("actual required failures, pending runs and unknown check states are not readiness", () => {
  for (const checkState of ["FAILURE", "TIMED_OUT", "IN_PROGRESS", "QUEUED", "CANCELLED", "UNKNOWN"]) {
    const state = evidence();
    state.checks[1].state = checkState;
    const result = assess(state);
    assert.ok(!result.labels.includes(QUEUE_LABELS.ready), checkState);
    if (checkState === "FAILURE") assert.match(result.contributor.join(), /Fix the failing/);
    if (checkState === "IN_PROGRESS") assert.match(result.waiting.join(), /finish/);
  }
  const state = evidence();
  state.checks.push({ name: "Optional preview", state: "FAILURE", required: false, url });
  assert.deepEqual(assess(state).labels, [QUEUE_LABELS.ready]);
});

interface Call { path: string; method: string; body: Record<string, unknown> }
function mock() {
  const state = evidence();
  const pr = {
    number: 42, head: { sha: head, ref: "sample", repo: { full_name: "author/repo" } },
    base: { sha: base, ref: "main" }, user: { login: "contributor" }, body: attested, html_url: url,
    draft: false, state: "open", changed_files: 1, labels: [] as Array<{ name: string }>, requested_reviewers: [],
  };
  const comments: Array<Record<string, unknown>> = [];
  const labels: Array<{ name: string }> = Object.values(QUEUE_LABELS).map((name) => ({ name }));
  const calls: Call[] = [];
  const overrides = new Map<string, () => unknown>();
  const api = new TaskApi("owner/repo", "token", undefined, async (input, init) => {
    assert.equal(init?.redirect, "error");
    const target = new URL(String(input));
    const path = target.pathname.replace("/repos/owner/repo/", "") + target.search;
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {};
    calls.push({ path, method, body });
    const key = `${method} ${path}`;
    const overridden = overrides.get(key)?.();
    if (overridden !== undefined) return overridden instanceof Response ? overridden : Response.json(overridden);
    if (path === "/graphql") {
      const query = String(body.query);
      const node = {
        body: pr.body, bodyHTML: state.bodyHTML,
        headRefOid: head, baseRefOid: base, mergeStateStatus: state.mergeState, reviewDecision: state.decision,
        commits: { nodes: [{ commit: { statusCheckRollup: { contexts: {
          totalCount: state.checks.length, pageInfo: { hasNextPage: false, endCursor: null },
          nodes: state.checks.map((check) => ({ name: check.name, status: "COMPLETED", conclusion: check.state, detailsUrl: url, isRequired: check.required })),
        } } } }] },
        reviewThreads: { totalCount: 0, pageInfo: { hasNextPage: false, endCursor: null }, nodes: [] },
      };
      assert.match(query, /^\s*query/);
      return Response.json({ data: { repository: { pullRequest: node } } });
    }
    if (method === "GET") {
      if (path === "pulls/42") return Response.json(pr);
      if (path === "rules/branches/main") return Response.json([{ type: "required_status_checks", parameters: {
        required_status_checks: state.requiredChecks.map((context) => ({ context })),
      } }]);
      if (path === "pulls/42/files?per_page=100&page=1") return Response.json(state.files);
      if (path === "issues/42/comments?per_page=100&page=1") return Response.json(comments);
      if (path === "issues/42/labels?per_page=100&page=1") return Response.json(pr.labels);
      if (path.startsWith("issues?state=closed&labels=")) return Response.json([]);
      if (path === "labels?per_page=100&page=1") return Response.json(labels);
      if (path.startsWith("contents/")) {
        const content = Buffer.from(JSON.stringify({ submissionType: state.formats[0] === "app" ? "managed-app" : "solution" }));
        return Response.json({ type: "file", encoding: "base64", content: content.toString("base64"), size: content.length });
      }
      if (path === "pulls/42/reviews?per_page=100&page=1") return Response.json(state.reviews.map((review) => ({
        id: review.id, user: { login: review.author, type: review.human ? "User" : "Bot" },
        commit_id: review.head, state: review.state, is_copilot_code_review: review.copilot, html_url: review.url,
      })));
      if (path.startsWith("actions/workflows/ci.yml/runs?")) return Response.json({
        total_count: 2,
        workflow_runs: [
          { id: 1, head_sha: head, head_branch: "sample", head_repository: { full_name: "author/repo" }, conclusion: state.ci?.state, status: "completed", html_url: url, pull_requests: [] },
          { id: 2, head_sha: head, head_branch: "unrelated", head_repository: { full_name: "elsewhere/repo" }, conclusion: "action_required", html_url: url },
        ],
      });
    } else {
      if (method === "POST" && path === "issues/42/comments") {
        const comment = { id: 12, body: body.body, user: { login: "github-actions[bot]", type: "Bot" } };
        comments.push(comment);
        return Response.json(comment);
      }
      if (method === "PATCH" && path === "issues/comments/12") {
        comments.find((comment) => comment.id === 12)!.body = body.body;
        return Response.json({});
      }
      if (method === "POST" && path === "issues/42/labels") {
        assert.ok(Array.isArray(body.labels));
        pr.labels.push(...body.labels.map((name: string) => ({ name })));
        return Response.json({});
      }
      if (method === "DELETE" && path.startsWith("issues/42/labels/")) {
        pr.labels = pr.labels.filter((label) => label.name !== decodeURIComponent(path.split("/").at(-1)!));
        return new Response(null, { status: 204 });
      }
      if (method === "POST" && path === "labels") {
        labels.push({ name: String(body.name) });
        return Response.json({});
      }
    }
    throw new Error(`Unexpected request: ${key}`);
  });
  return { api, state, pr, comments, labels, calls, overrides };
}
const writes = (calls: Call[]) => calls.filter((call) => call.method !== "GET" && call.path !== "/graphql");

test("reconciliation updates its own comment/labels only and unchanged repeat runs produce no writes", async () => {
  const fixture = mock();
  fixture.comments.push({ id: 7, body: `${MARKER}\nSpoofed`, user: { login: "visitor", type: "User" } });
  fixture.pr.labels.push({ name: "keep-this-label" });
  const first = await reconcile(fixture.api, 42);
  assert.match(first, new RegExp(head));
  assert.equal(fixture.comments.length, 2);
  assert.equal(fixture.comments[0].body, `${MARKER}\nSpoofed`);
  assert.ok(fixture.pr.labels.some((label) => label.name === "keep-this-label"));
  const count = writes(fixture.calls).length;
  await reconcile(fixture.api, 42);
  assert.equal(writes(fixture.calls).length, count);
});

test("read-only preview makes no mutations and works without installing dependencies", async () => {
  const fixture = mock();
  assert.match(await reconcile(fixture.api, 42, true), /merge manually/);
  assert.deepEqual(writes(fixture.calls), []);
  const workflow = readFileSync(new URL("../.github/workflows/submission-pr-status.yml", import.meta.url), "utf8");
  assert.doesNotMatch(workflow, /npm|--import tsx/);
});

test("blocked CI with no jobs/checks and empty pull_requests is assigned to the maintainer", async () => {
  const fixture = mock();
  fixture.state.ci = { state: "action_required", url };
  fixture.state.checks = [];
  const result = await reconcile(fixture.api, 42, true);
  assert.match(result, /authorize.*awaiting approval/);
  assert.doesNotMatch(result, /Fix the failing/);
});

test("both submission formats use metadata, not guesses from which payload files changed", async () => {
  const fixture = mock();
  fixture.state.formats = ["app"];
  fixture.pr.body = "";
  fixture.state.bodyHTML = "";
  assert.match(await reconcile(fixture.api, 42, true), /managed-app fresh-app and source\/privacy/);
});

test("missing and unknown-format metadata become explicit contributor tasks, never a successful default", async () => {
  const fixture = mock();
  const path = `GET contents/submissions/sample/metadata.json?ref=${head}`;
  fixture.overrides.set(path, () => new Response(null, { status: 404 }));
  assert.match(await reconcile(fixture.api, 42, true), /Add the required gallery metadata/);
  const content = Buffer.from('{"submissionType":"invented"}');
  fixture.overrides.set(path, () => ({ type: "file", encoding: "base64", size: content.length, content: content.toString("base64") }));
  assert.match(await reconcile(fixture.api, 42, true), /unknown `submissionType`/);
  assert.deepEqual(writes(fixture.calls), []);
});

test("valid non-object metadata JSON becomes a contributor task rather than a failed assessment", async () => {
  for (const value of [null, [], 42, true, "sample"]) {
    const fixture = mock();
    const content = Buffer.from(JSON.stringify(value));
    fixture.overrides.set(`GET contents/submissions/sample/metadata.json?ref=${head}`, () => ({
      type: "file", encoding: "base64", size: content.length, content: content.toString("base64"),
    }));
    const result = await reconcile(fixture.api, 42);
    assert.match(result, /Correct .* to a JSON object/);
    assert.ok(fixture.pr.labels.some((label) => label.name === QUEUE_LABELS.contributor));
    assert.ok(!fixture.pr.labels.some((label) => label.name === QUEUE_LABELS.ready));
    assert.doesNotMatch(result, /Assessment failed/);
  }
});

test("site, dependency and mixed changes are excluded; multiple ordinary submissions remain visible", async () => {
  for (const files of [
    [{ filename: "package-lock.json", status: "modified" }],
    [{ filename: "src/pages/index.astro", status: "modified" }],
    [{ filename: "submissions/_template/metadata.json", status: "modified" }],
    [...evidence().files, { filename: "CONTRIBUTING.md", status: "modified" }],
  ]) {
    const fixture = mock();
    fixture.state.files = files;
    fixture.pr.changed_files = files.length;
    assert.equal(await reconcile(fixture.api, 42), "Out of scope");
    assert.deepEqual(writes(fixture.calls), []);
  }
  const fixture = mock();
  fixture.state.files.push({ filename: "submissions/second/README.md", status: "modified" });
  fixture.pr.changed_files = 2;
  assert.match(await reconcile(fixture.api, 42, true), /one submission/);
  fixture.pr.labels.push({ name: "allow-metadata-changes" });
  assert.equal(await reconcile(fixture.api, 42), "Out of scope");
});

test("tracked PRs that become drafts or leave scope retire only coordinator labels", async () => {
  const fixture = mock();
  await reconcile(fixture.api, 42);
  fixture.pr.draft = true;
  fixture.pr.labels.push({ name: "keep-this-label" });
  assert.match(await reconcile(fixture.api, 42), /routing is paused/);
  assert.deepEqual(fixture.pr.labels, [{ name: "keep-this-label" }]);
  assert.equal(fixture.comments.length, 1);
});

test("queue reconciliation retires tracked PRs retargeted away from main", async () => {
  const fixture = mock();
  await reconcile(fixture.api, 42);
  fixture.pr.base.ref = "release";
  fixture.pr.labels.push({ name: "keep-this-label" });
  fixture.overrides.set("GET pulls?state=open&per_page=100&page=1", () => [{ number: 42 }]);
  await reconcileQueue(fixture.api);
  assert.deepEqual(fixture.pr.labels, [{ name: "keep-this-label" }]);
  assert.match(String(fixture.comments[0].body), /outside ordinary contribution scope/);
  assert.equal(fixture.comments.length, 1);
});

test("queue sweeps recover superseded closure events without processing issues or duplicate PRs", async () => {
  const fixture = mock();
  await reconcile(fixture.api, 42);
  fixture.pr.state = "closed";
  fixture.pr.changed_files = 10_000;
  fixture.pr.labels.push({ name: "keep-this-label" });
  fixture.overrides.set("GET pulls?state=open&per_page=100&page=1", () => []);
  const closed = { number: 42, pull_request: { url } };
  for (const label of [QUEUE_LABELS.ready, QUEUE_LABELS.maintainer]) {
    fixture.overrides.set(`GET issues?state=closed&labels=${encodeURIComponent(label)}&per_page=100&page=1`,
      () => [closed, { number: 43 }]);
  }
  const previous = fixture.calls.length;
  await reconcileQueue(fixture.api);
  assert.deepEqual(fixture.pr.labels, [{ name: "keep-this-label" }]);
  assert.match(String(fixture.comments[0].body), /this PR is closed/);
  const reads = fixture.calls.slice(previous).filter((call) => call.method === "GET");
  assert.equal(reads.filter((call) => call.path === "pulls/42").length, 2);
  assert.ok(!reads.some((call) => call.path === "pulls/43" || call.path.startsWith("pulls/42/files")));
});

test("later comment/file pages are read and bot impersonation cannot suppress a checklist", async () => {
  const fixture = mock();
  fixture.pr.changed_files = 101;
  fixture.overrides.set("GET pulls/42/files?per_page=100&page=1", () => Array.from({ length: 100 }, () => evidence().files[0]));
  fixture.overrides.set("GET pulls/42/files?per_page=100&page=2", () => evidence().files);
  fixture.overrides.set("GET issues/42/comments?per_page=100&page=1", () => Array.from({ length: 100 }, () => ({ body: MARKER, user: { login: "github-actions[bot]", type: "User" } })));
  fixture.overrides.set("GET issues/42/comments?per_page=100&page=2", () => [{ id: 12, body: render(evidence().pr, assess(evidence())), user: { login: "github-actions[bot]", type: "Bot" } }]);
  await reconcile(fixture.api, 42);
  assert.ok(!writes(fixture.calls).some((call) => call.path.endsWith("/comments")));
});

test("failed retirement comments retain a recovery label even when the initial snapshot had it", async () => {
  for (const original of [QUEUE_LABELS.ready, QUEUE_LABELS.maintainer]) {
    const fixture = mock();
    await reconcile(fixture.api, 42);
    fixture.pr.state = "closed";
    fixture.pr.labels = [{ name: original }, { name: "keep-this-label" }];
    fixture.overrides.set("PATCH issues/comments/12", () => new Response(null, { status: 503 }));
    await assert.rejects(reconcile(fixture.api, 42), /503/);
    assert.ok(!fixture.pr.labels.some((label) => label.name === QUEUE_LABELS.ready));
    assert.ok(fixture.pr.labels.some((label) => label.name === QUEUE_LABELS.maintainer));
    assert.ok(fixture.pr.labels.some((label) => label.name === "keep-this-label"));
    fixture.overrides.delete("PATCH issues/comments/12");
    await reconcile(fixture.api, 42);
    assert.deepEqual(fixture.pr.labels, [{ name: "keep-this-label" }]);
    assert.match(String(fixture.comments[0].body), /this PR is closed/);
  }
});

test("rendered attestations require a matching raw PR body", async () => {
  const fixture = mock();
  fixture.pr.body = "";
  await assert.rejects(collectEvidence(fixture.api, evidence().pr, evidence().files), /PR body changed/);
});

test("revision races fail visibly and withdraw previous readiness, even in-place comments", async () => {
  const fixture = mock();
  await reconcile(fixture.api, 42);
  let reads = 0;
  fixture.overrides.set("GET pulls/42", () => {
    reads++;
    return reads === 1 ? fixture.pr : { ...fixture.pr, head: { ...fixture.pr.head, sha: old } };
  });
  await assert.rejects(reconcile(fixture.api, 42), /state changed/);
  assert.ok(!fixture.pr.labels.some((label) => label.name === QUEUE_LABELS.ready));
  assert.ok(fixture.pr.labels.some((label) => label.name === QUEUE_LABELS.maintainer));
  assert.match(String(fixture.comments[0].body), /Previous readiness is withdrawn/);
});

test("a failed initial PR fetch still withdraws readiness using the validated PR number", async () => {
  const fixture = mock();
  await reconcile(fixture.api, 42);
  fixture.pr.labels.push({ name: "keep-this-label" });
  fixture.overrides.set("GET pulls/42", () => new Response(null, { status: 503 }));
  const previous = fixture.calls.length;
  await assert.rejects(reconcile(fixture.api, 42), /503/);
  assert.ok(!fixture.pr.labels.some((label) => label.name === QUEUE_LABELS.ready));
  assert.ok(fixture.pr.labels.some((label) => label.name === "keep-this-label"));
  assert.equal(fixture.comments.length, 1);
  assert.deepEqual(writes(fixture.calls.slice(previous)).map((call) => call.method), ["DELETE"]);
  const count = fixture.calls.length;
  await assert.rejects(reconcile(fixture.api, 0), /Invalid PR number/);
  assert.equal(fixture.calls.length, count);
});

test("same-head review/merge-state changes are rechecked before publishing readiness", async () => {
  const fixture = mock();
  fixture.overrides.set("POST /graphql", () => {
    const query = String(fixture.calls.at(-1)!.body.query);
    if (query.includes("commits(") || query.includes("reviewThreads(")) return undefined;
    return { data: { repository: { pullRequest: {
      headRefOid: head, baseRefOid: base, mergeStateStatus: "BLOCKED", reviewDecision: "REVIEW_REQUIRED",
    } } } };
  });
  await assert.rejects(reconcile(fixture.api, 42, true), /merge\/review state changed/);
  assert.deepEqual(writes(fixture.calls), []);
});

test("missing pages, invalid metadata and denied API access never produce readiness", async () => {
  const missing = mock();
  missing.pr.changed_files = 2;
  await assert.rejects(reconcile(missing.api, 42, true), /Incomplete changed-file/);
  const invalid = mock();
  invalid.overrides.set(`GET contents/submissions/sample/metadata.json?ref=${head}`, () => ({ type: "symlink" }));
  await assert.rejects(reconcile(invalid.api, 42, true), /Invalid submission/);
  const denied = new TaskApi("owner/repo", "token", undefined, async () => new Response(null, { status: 403 }));
  await assert.rejects(reconcile(denied, 42, true), /403/);
  assert.deepEqual(writes(missing.calls), []);
  assert.deepEqual(writes(invalid.calls), []);
});

test("GraphQL failures and repeated pagination cursors fail visibly", async () => {
  const fixture = mock();
  fixture.overrides.set("POST /graphql", () => ({ errors: [{ message: "Denied" }] }));
  await assert.rejects(reconcile(fixture.api, 42, true), /GraphQL query failed/);
  fixture.overrides.set("POST /graphql", () => {
    const threads = String(fixture.calls.at(-1)!.body.query).includes("reviewThreads");
    return { data: { repository: { pullRequest: {
      body: attested, bodyHTML: attestedHTML,
      headRefOid: head, baseRefOid: base, mergeStateStatus: "CLEAN", reviewDecision: "APPROVED",
      commits: { nodes: [{ commit: { statusCheckRollup: null } }] },
      ...(threads ? { reviewThreads: {
        totalCount: 200, nodes: [], pageInfo: { hasNextPage: true, endCursor: "same" },
      } } : {}),
    } } } };
  });
  await assert.rejects(collectEvidence(fixture.api, evidence().pr, evidence().files), /Repeated GraphQL cursor/);
  let calls = 0;
  const pages = new TaskApi("owner/repo", "token", undefined, async () => {
    calls++;
    return Response.json({ total_count: 101, workflow_runs: calls === 1 ? Array.from({ length: 100 }, () => ({})) : [] });
  });
  await assert.rejects(pages.pages("actions/runs", "workflow_runs"), /Incomplete API pagination/);
});

test("the API write allowlist forbids authorizing runs, reviewing, merging and GraphQL mutations", async () => {
  const fixture = mock();
  for (const [path, method] of [
    ["actions/runs/123/approve", "POST"], ["pulls/42/reviews", "POST"],
    ["pulls/42/merge", "PUT"], ["statuses/" + head, "POST"],
    ["issues/42/labels/keep-this-label", "DELETE"],
  ]) await assert.rejects(fixture.api.call(path, method), /Forbidden coordinator operation/);
  await assert.rejects(fixture.api.graph("mutation { dangerous }", {}), /Only GraphQL queries/);
  assert.deepEqual(fixture.calls, []);
});

test("workflow uses only trusted main code, metadata permissions, supported triggers and serialized writes", () => {
  const workflow = parse(readFileSync(new URL("../.github/workflows/submission-pr-status.yml", import.meta.url), "utf8"));
  assert.deepEqual(workflow.permissions, { contents: "read", actions: "read", checks: "read", statuses: "read", issues: "read", "pull-requests": "write" });
  assert.equal(workflow.concurrency["cancel-in-progress"], false);
  assert.equal(workflow.on.schedule[0].cron, "*/15 * * * *");
  assert.ok(workflow.on.pull_request_target);
  assert.equal(workflow.on.pull_request_target.branches, undefined);
  assert.ok(workflow.on.pull_request_target.types.includes("edited"));
  assert.ok(!workflow.on.pull_request);
  assert.deepEqual(workflow.on.workflow_run.workflows, ["CI", "Contribution policy"]);
  const steps = workflow.jobs.reconcile.steps;
  assert.equal(steps[0].with.ref, "main");
  assert.equal(steps[0].with["persist-credentials"], false);
  assert.equal(steps[1].with["node-version"], 24);
  assert.equal(steps[2].run, "node scripts/submission-pr-status.ts");
  assert.equal(workflow.on.workflow_dispatch.inputs.dry_run.default, true);
});
