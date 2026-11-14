import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { classifyContributionFiles, METADATA_LABEL, SITE_LABEL, type ChangedFile } from "./contribution-scope.ts";

export const MARKER = "<!-- gallery-submission-tasks:v1 -->";
export const QUEUE_LABELS = {
  contributor: "needs-contributor",
  maintainer: "needs-maintainer",
  copilot: "awaiting-copilot",
  ready: "ready-for-merge",
} as const;
const BOT = "github-actions[bot]";
const COPILOT = "copilot-pull-request-reviewer[bot]";
const SCOPE_CHECK = "Guard pull request scope";
const attestations = {
  solution: ["I successfully imported the submitted solution into a fresh environment containing only its documented prerequisites, without skipping dependency checks."],
  app: [
    "I created a fresh platform-managed app from the submitted source with only its documented prerequisites, regenerated its native data-source clients, and verified authenticated preview and its intended connector operations.",
    "I reviewed all submitted source, generated clients, screenshots, and setup metadata for private data, credentials, and original deployment bindings.",
  ],
};

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected API object");
  return value as Record<string, unknown>;
}
function array(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error("Expected API array");
  return value;
}
function text(value: unknown): string {
  if (typeof value !== "string") throw new Error("Expected API string");
  return value;
}
function integer(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new Error("Expected API integer");
  return value;
}
function boolean(value: unknown): boolean {
  if (typeof value !== "boolean") throw new Error("Expected API boolean");
  return value;
}
function sha(value: unknown): string {
  const result = text(value);
  if (!/^[a-f0-9]{40}$/.test(result)) throw new Error("Invalid API commit SHA");
  return result;
}
function login(value: unknown): string {
  return value === null ? "" : text(object(value).login);
}
export class TaskApi {
  readonly repo: string;
  private readonly token: string;
  private readonly apiUrl: string;
  private readonly request: typeof fetch;

  constructor(
    repo: string,
    token: string,
    apiUrl = "https://api.github.com",
    request: typeof fetch = fetch,
  ) {
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error("Invalid repository");
    if (new URL(apiUrl).protocol !== "https:") throw new Error("GitHub API must use HTTPS");
    this.repo = repo;
    this.token = token;
    this.apiUrl = apiUrl;
    this.request = request;
  }

  async call(path: string, method = "GET", body?: unknown, missingAllowed = false): Promise<unknown> {
    // Restrict writes to this coordinator's comments and queue labels.
    const labelNames = Object.values(QUEUE_LABELS).map(encodeURIComponent).join("|");
    const allowed = method === "GET"
      || (method === "POST" && /^(?:labels|issues\/\d+\/(?:comments|labels))$/.test(path))
      || (method === "PATCH" && /^issues\/comments\/\d+$/.test(path))
      || (method === "DELETE" && new RegExp(`^issues/\\d+/labels/(?:${labelNames})$`).test(path));
    if (!allowed) throw new Error(`Forbidden coordinator operation: ${method} ${path}`);
    return this.send(`/repos/${this.repo}/${path}`, method, body, missingAllowed);
  }

  private async send(path: string, method: string, body?: unknown, missingAllowed = false): Promise<unknown> {
    const response = await this.request(`${this.apiUrl}${path}`, {
      method,
      headers: { Authorization: `Bearer ${this.token}`, Accept: "application/vnd.github+json", "Content-Type": "application/json" },
      redirect: "error",
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (missingAllowed && response.status === 404) return undefined;
    if (!response.ok) throw new Error(`GitHub API ${response.status}: ${method} ${path}`);
    if (response.status === 204) return undefined;
    return response.json();
  }

  async pages(path: string, key?: string): Promise<unknown[]> {
    const results: unknown[] = [];
    for (let page = 1; page <= 100; page++) {
      const data = await this.call(`${path}${path.includes("?") ? "&" : "?"}per_page=100&page=${page}`);
      const batch = array(key ? object(data)[key] : data);
      results.push(...batch);
      if (key && integer(object(data).total_count) > 10_000) throw new Error("API result exceeds pagination limit");
      if (batch.length < 100) {
        if (key && results.length !== integer(object(data).total_count)) throw new Error("Incomplete API pagination");
        return results;
      }
    }
    throw new Error("API pagination limit exceeded");
  }

  async graph(query: string, variables: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (!/^\s*query\b/.test(query)) throw new Error("Only GraphQL queries are allowed");
    const result = object(await this.send("/graphql", "POST", { query, variables }));
    if (result.errors !== undefined) throw new Error("GitHub GraphQL query failed");
    return object(object(result.data).repository);
  }

  url(value: unknown): string {
    const result = new URL(text(value));
    const host = new URL(this.apiUrl).hostname === "api.github.com" ? "github.com" : new URL(this.apiUrl).hostname;
    if (result.protocol !== "https:" || result.hostname !== host || !result.pathname.startsWith(`/${this.repo}/`)) {
      throw new Error("Unexpected GitHub evidence URL");
    }
    return result.href;
  }
}

interface Pull {
  number: number;
  head: string;
  base: string;
  baseBranch: string;
  branch: string;
  headRepo: string;
  author: string;
  body: string;
  url: string;
  draft: boolean;
  state: string;
  count: number;
  labels: string[];
  requested: string[];
}
function pull(api: TaskApi, value: unknown): Pull {
  const pr = object(value);
  const head = object(pr.head);
  return {
    number: integer(pr.number), head: sha(head.sha), base: sha(object(pr.base).sha), baseBranch: text(object(pr.base).ref),
    branch: text(head.ref), headRepo: head.repo === null ? "" : text(object(head.repo).full_name),
    author: login(pr.user), body: pr.body === null ? "" : text(pr.body), url: api.url(pr.html_url),
    draft: boolean(pr.draft), state: text(pr.state), count: integer(pr.changed_files),
    labels: array(pr.labels).map((label) => text(object(label).name)),
    requested: array(pr.requested_reviewers).map(login),
  };
}

export interface Review {
  id: number;
  author: string;
  human: boolean;
  copilot: boolean;
  head: string;
  state: string;
  url: string;
}
export interface Thread {
  review: number | null;
  url: string;
  resolved: boolean;
  replyByAuthor: boolean;
  head: string | null;
}
export interface Check {
  name: string;
  required: boolean;
  state: string;
  url: string;
}
export interface Evidence {
  pr: Pull;
  files: ChangedFile[];
  formats: Array<keyof typeof attestations>;
  metadataProblems: string[];
  reviews: Review[];
  threads: Thread[];
  checks: Check[];
  requiredChecks: string[];
  ci: { state: string; url: string } | null;
  mergeState: string;
  decision: string | null;
}

const summaryQuery = `query($owner:String!,$name:String!,$number:Int!,$after:String) {
  repository(owner:$owner,name:$name) { pullRequest(number:$number) {
    headRefOid baseRefOid mergeStateStatus reviewDecision
    commits(last:1) { nodes { commit { statusCheckRollup {
      contexts(first:100,after:$after) { totalCount pageInfo { hasNextPage endCursor }
        nodes {
          ... on CheckRun { name status conclusion detailsUrl isRequired(pullRequestNumber:$number) }
          ... on StatusContext { context state targetUrl isRequired(pullRequestNumber:$number) }
        }
      }
    } } } }
  } }
}`;
const threadsQuery = `query($owner:String!,$name:String!,$number:Int!,$after:String) {
  repository(owner:$owner,name:$name) { pullRequest(number:$number) {
    headRefOid baseRefOid
    reviewThreads(first:100,after:$after) { totalCount pageInfo { hasNextPage endCursor }
      nodes { isResolved comments(first:1) { nodes {
        url pullRequestReview { databaseId commit { oid } }
      } } lastReply:comments(last:1) { nodes { author { login } } } }
    }
  } }
}`;

async function graphPages(api: TaskApi, pr: Pull, query: string, read: (node: Record<string, unknown>) => unknown): Promise<unknown[]> {
  const [owner, name] = api.repo.split("/");
  let after: string | null = null;
  const cursors = new Set<string>();
  const results: unknown[] = [];
  for (let page = 0; page < 100; page++) {
    const node = object((await api.graph(query, { owner, name, number: pr.number, after })).pullRequest);
    if (sha(node.headRefOid) !== pr.head || sha(node.baseRefOid) !== pr.base) throw new Error("PR revision changed during assessment");
    const value = read(node);
    if (value === null) return results;
    const connection = object(value);
    results.push(...array(connection.nodes));
    const info = object(connection.pageInfo);
    if (!boolean(info.hasNextPage)) {
      if (results.length !== integer(connection.totalCount)) throw new Error("Incomplete GraphQL pagination");
      return results;
    }
    after = text(info.endCursor);
    if (!after || cursors.has(after)) throw new Error("Repeated GraphQL cursor");
    cursors.add(after);
  }
  throw new Error("GraphQL pagination limit exceeded");
}

export async function collectEvidence(api: TaskApi, pr: Pull, files: ChangedFile[]): Promise<Evidence> {
  const formats = new Set<keyof typeof attestations>();
  const metadataProblems: string[] = [];
  const requiredChecks = [...new Set(array(await api.call(`rules/branches/${encodeURIComponent(pr.baseBranch)}`))
    .map(object).flatMap((rule) => text(rule.type) === "required_status_checks"
      ? array(object(rule.parameters).required_status_checks).map((check) => text(object(check).context)) : []))];
  const scope = classifyContributionFiles(files);
  for (const slug of scope.slugs) {
    const path = `submissions/${slug}/metadata.json`;
    const removed = files.some((file) => file.filename === path && file.status === "removed");
    const ref = removed ? pr.base : pr.head;
    const response = await api.call(`contents/${path}?ref=${ref}`, "GET", undefined, true);
    if (response === undefined) {
      metadataProblems.push(`Add the required gallery metadata at \`${path}\`, or remove that extra submission folder if it was copied accidentally.`);
      continue;
    }
    const content = object(response);
    if (content.type !== "file" || content.encoding !== "base64" || integer(content.size) > 512 * 1024) throw new Error("Invalid submission metadata content");
    const data = Buffer.from(text(content.content), "base64");
    if (data.length !== content.size) throw new Error("Incomplete submission metadata");
    let parsed: unknown;
    try {
      parsed = JSON.parse(data.toString("utf8"));
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
      metadataProblems.push(`Correct invalid JSON in \`${path}\`; the submission format and attestations cannot yet be assessed.`);
      continue;
    }
    const metadata = object(parsed);
    if (metadata.submissionType !== undefined && metadata.submissionType !== "solution" && metadata.submissionType !== "managed-app") {
      metadataProblems.push(`Correct the unknown \`submissionType\` in \`${path}\`; the submission format and attestations cannot yet be assessed.`);
      continue;
    }
    formats.add(metadata.submissionType === "managed-app" ? "app" : "solution");
  }
  const reviews = (await api.pages(`pulls/${pr.number}/reviews`)).map((value): Review => {
    const review = object(value);
    const user = review.user === null ? null : object(review.user);
    const author = login(review.user);
    const copilot = review.is_copilot_code_review === true || (review.is_copilot_code_review === undefined && author === COPILOT);
    return {
      id: integer(review.id), author, human: !copilot && user?.type === "User", copilot,
      head: sha(review.commit_id), state: text(review.state),
      url: api.url(review.html_url),
    };
  });
  let mergeState = "UNKNOWN";
  let decision: string | null = null;
  const checks = (await graphPages(api, pr, summaryQuery, (node) => {
    mergeState = text(node.mergeStateStatus);
    decision = node.reviewDecision === null ? null : text(node.reviewDecision);
    const commit = object(object(array(object(node.commits).nodes)[0]).commit);
    return commit.statusCheckRollup === null ? null : object(commit.statusCheckRollup).contexts;
  })).map((value): Check => {
    const check = object(value);
    const run = check.name !== undefined;
    return {
      name: text(run ? check.name : check.context), required: boolean(check.isRequired),
      state: text(run ? (check.status === "COMPLETED" ? check.conclusion : check.status) : check.state),
      url: `${pr.url}/checks`,
    };
  });
  const threads = (await graphPages(api, pr, threadsQuery, (node) => node.reviewThreads)).map((value): Thread => {
    const thread = object(value);
    const first = object(array(object(thread.comments).nodes)[0]);
    const last = object(array(object(thread.lastReply).nodes)[0]);
    return {
      review: first.pullRequestReview === null ? null : integer(object(first.pullRequestReview).databaseId),
      url: api.url(first.url), resolved: boolean(thread.isResolved),
      replyByAuthor: login(last.author) === pr.author,
      head: first.pullRequestReview === null || object(first.pullRequestReview).commit === null
        ? null : sha(object(object(first.pullRequestReview).commit).oid),
    };
  });
  const runs = (await api.pages(`actions/workflows/ci.yml/runs?event=pull_request&head_sha=${pr.head}`, "workflow_runs"))
    .map(object)
    .filter((run) => sha(run.head_sha) === pr.head && run.head_branch === pr.branch
      && run.head_repository !== null && object(run.head_repository).full_name === pr.headRepo)
    .sort((a, b) => integer(b.id) - integer(a.id));
  const latest = runs[0];
  return {
    pr, files, formats: [...formats], metadataProblems, reviews, threads, checks, requiredChecks, mergeState, decision,
    ci: latest ? { state: text(latest.conclusion ?? latest.status), url: api.url(latest.html_url) } : null,
  };
}

export interface Assessment {
  contributor: string[];
  maintainer: string[];
  waiting: string[];
  labels: string[];
}

export function assess(evidence: Evidence): Assessment {
  const { pr, reviews, threads, checks, ci } = evidence;
  const contributor: string[] = [...evidence.metadataProblems];
  const maintainer: string[] = [];
  const waiting: string[] = [];
  const scope = classifyContributionFiles(evidence.files);
  if (scope.slugs.size > 1) contributor.push("Keep this contribution to one submission, or ask a maintainer to review its maintenance scope.");
  // Ignore HTML comments and fenced examples rather than accepting copied template text.
  const body = pr.body.replace(/<!--[\s\S]*?(?:-->|$)/g, "").replace(/^(`{3,}|~{3,})[\s\S]*?^\1.*$/gm, "");
  const checked = new Set(body.split(/\r?\n/).flatMap((line) => {
    const match = /^\s*-\s+\[[xX]\]\s+(.+?)\s*$/.exec(line);
    return match ? [match[1]] : [];
  }));
  for (const format of evidence.formats) {
    if (attestations[format].some((statement) => !checked.has(statement))) {
      contributor.push(`Complete the ${format === "app" ? "managed-app fresh-app and source/privacy" : "solution fresh-environment import"} attestations in the PR body. Only check them after doing the documented test/review.`);
    }
  }

  const latestCopilot = reviews.filter((review) => review.copilot && review.head === pr.head && review.state !== "PENDING")
    .sort((a, b) => b.id - a.id)[0];
  const currentCopilot = latestCopilot !== undefined && ["COMMENTED", "APPROVED", "CHANGES_REQUESTED"].includes(latestCopilot.state);
  if (!currentCopilot) {
    if (!pr.requested.includes(COPILOT)) maintainer.push(`Request a native Copilot review of the current revision in [Reviewers](${pr.url}). Enable **Review new pushes** for future fixes if it is not configured.`);
    waiting.push("A native Copilot review of this revision is still needed. Earlier findings are not assumed fixed or still applicable.");
  }
  const copilotIds = new Set(reviews.filter((review) => review.copilot).map((review) => review.id));
  if (latestCopilot?.state === "CHANGES_REQUESTED") {
    contributor.push(`Address or discuss [Copilot's request for changes](${latestCopilot.url}); request a rereview after the agreed remedy.`);
  }
  const open = threads.filter((thread) => !thread.resolved);
  const copilot = open.filter((thread) => thread.review !== null && copilotIds.has(thread.review));
  const human = open.filter((thread) => thread.review === null || !copilotIds.has(thread.review));
  if (copilot.length && currentCopilot) {
    contributor.push(`Address or discuss [unresolved Copilot findings](${copilot[0].url}) (${copilot.length} threads); do not repeat already supplied fixes.`);
    maintainer.push(`If a fix or explanation is already supplied, review it and resolve the [remaining Copilot discussion](${copilot[0].url}) rather than asking for the same fix again.`);
  }
  if (human.length) {
    const followup = human.find((thread) => thread.replyByAuthor || (thread.head !== null && thread.head !== pr.head));
    if (followup) maintainer.push(`Review the contributor's reply/new revision against the [open human discussion](${followup.url}) and resolve it only if addressed.`);
    const awaitingAuthor = human.find((thread) => !thread.replyByAuthor && (thread.head === null || thread.head === pr.head));
    if (awaitingAuthor) {
      contributor.push(`Respond to the [open human review discussion](${awaitingAuthor.url}) with a fix or clarification.`);
    }
  }
  const latestHuman = new Map<string, Review>();
  for (const review of [...reviews].sort((a, b) => a.id - b.id)) {
    if (review.human && ["APPROVED", "CHANGES_REQUESTED", "DISMISSED"].includes(review.state)) latestHuman.set(review.author, review);
  }
  const changes = [...latestHuman.values()].find((review) => review.state === "CHANGES_REQUESTED");
  if (changes) maintainer.push(`Follow up on [the human request for changes](${changes.url}); only that reviewer/maintainer can confirm the remaining concern is addressed.`);

  const required = checks.filter((check) => check.required);
  const missing = evidence.requiredChecks.filter((name) => !required.some((check) => check.name === name));
  const pending = required.filter((check) => ["PENDING", "QUEUED", "IN_PROGRESS", "EXPECTED", "WAITING", "REQUESTED"].includes(check.state));
  const failures = required.filter((check) => !["SUCCESS", "NEUTRAL", "SKIPPED", ...pending.map((item) => item.state)].includes(check.state));
  for (const check of failures) {
    if (["FAILURE", "ERROR", "TIMED_OUT", "STARTUP_FAILURE"].includes(check.state)) {
      contributor.push(`Fix the failing [${check.name === SCOPE_CHECK ? "contribution scope check" : "required check"}](${check.url}); ask a maintainer if this is an infrastructure or authorized-scope issue.`);
    } else {
      maintainer.push(`Inspect the [incomplete required check](${check.url}) (${check.state}) and decide whether a rerun is appropriate.`);
    }
  }
  if (ci?.state === "action_required") maintainer.push(`Inspect and authorize the [fork CI run awaiting approval](${ci.url}). This is not a test failure.`);
  else if (missing.length && !pending.length) maintainer.push(`Inspect [missing required checks](${pr.url}/checks) (${missing.join(", ")}); start/authorize CI or investigate the missing scope check as appropriate.`);
  if (pending.length || (ci && ["queued", "in_progress", "waiting", "pending", "requested"].includes(ci.state))) {
    waiting.push(`Wait for [current CI/checks](${ci?.url ?? `${pr.url}/checks`}) to finish.`);
  }

  const approved = evidence.decision === "APPROVED"
    && [...latestHuman.values()].some((review) => review.state === "APPROVED" && review.head === pr.head && review.author !== pr.author);
  if (!approved) maintainer.push(`After reviewing the evidence, submit a formal human approval of this revision in [Files changed](${pr.url}/files), or explain the specific remaining blocker. Copilot comments are not that approval.`);
  if (evidence.mergeState === "DIRTY" || evidence.mergeState === "BEHIND") {
    contributor.push(`Resolve merge conflicts or update the branch against the base branch (${evidence.mergeState}); new commits need fresh checks and review.`);
  } else if (!["CLEAN", "BLOCKED", "UNSTABLE", "HAS_HOOKS"].includes(evidence.mergeState)) {
    maintainer.push(`GitHub merge state is ${evidence.mergeState}; inspect [merge requirements](${pr.url}) before proceeding.`);
  }
  if (["BLOCKED", "UNSTABLE", "HAS_HOOKS"].includes(evidence.mergeState)) {
    maintainer.push(`Inspect GitHub's [remaining merge requirements](${pr.url}); the task queue does not bypass repository rules.`);
  }
  const ready = contributor.length === 0 && maintainer.length === 0 && waiting.length === 0
    && currentCopilot && open.length === 0 && !changes && approved
    && !missing.length && !failures.length && !pending.length && evidence.mergeState === "CLEAN";
  if (ready) maintainer.push(`Perform the final review and [merge manually](${pr.url}) when satisfied.`);
  const labels = ready ? [QUEUE_LABELS.ready] : [
    ...(contributor.length ? [QUEUE_LABELS.contributor] : []),
    ...(maintainer.length ? [QUEUE_LABELS.maintainer] : []),
    ...(!currentCopilot ? [QUEUE_LABELS.copilot] : []),
  ];
  return { contributor, maintainer, waiting, labels };
}

export function render(pr: Pull, assessment: Assessment): string {
  const section = (name: string, tasks: string[]) => `### ${name}\n${tasks.length ? tasks.map((task) => `- [ ] ${task}`).join("\n") : "No task identified."}`;
  return `${MARKER}
## Submission next steps
Assessed head \`${pr.head}\` against base \`${pr.base}\`. Informational only: GitHub's live merge requirements remain authoritative.

${section("Contributor", assessment.contributor)}

${section("Maintainer", assessment.maintainer)}

${section("Waiting on automation", assessment.waiting)}

This comment is updated in place. Tasks may overlap; nobody is automatically assigned. CI authorization, formal approval, and merge stay manual. Checked attestations are contributor statements, not automated certification.
`;
}

function ownedComment(value: unknown) {
  const comment = object(value);
  const user = comment.user === null ? null : object(comment.user);
  return user?.login === BOT && user.type === "Bot" && typeof comment.body === "string" && comment.body.startsWith(MARKER);
}

async function writeComment(api: TaskApi, number: number, comments: unknown[], body: string, dryRun: boolean) {
  const existing = comments.filter(ownedComment);
  if (existing.length > 1) throw new Error("Duplicate coordinator comments; maintainer cleanup required");
  const comment = existing.length ? object(existing[0]) : undefined;
  if (comment?.body === body || dryRun) return;
  if (comment) await api.call(`issues/comments/${integer(comment.id)}`, "PATCH", { body });
  else await api.call(`issues/${number}/comments`, "POST", { body });
}

async function writeLabels(api: TaskApi, pr: Pull, desired: string[], dryRun: boolean) {
  if (dryRun) return;
  for (const label of Object.values(QUEUE_LABELS)) {
    if (pr.labels.includes(label) && !desired.includes(label)) {
      await api.call(`issues/${pr.number}/labels/${encodeURIComponent(label)}`, "DELETE", undefined, true);
    }
  }
  const add = desired.filter((label) => !pr.labels.includes(label));
  if (add.length) {
    const available = (await api.pages("labels")).map((value) => text(object(value).name));
    for (const name of add.filter((name) => !available.includes(name))) {
      await api.call("labels", "POST", { name, color: name === QUEUE_LABELS.ready ? "2da44e" : "fbca04", description: "Informational submission task queue; not an approval or merge gate." });
    }
    await api.call(`issues/${pr.number}/labels`, "POST", { labels: add });
  }
}

function fingerprint(pr: Pull): string {
  return JSON.stringify([pr.head, pr.base, pr.baseBranch, pr.body, pr.state, pr.draft, [...pr.labels].sort(), [...pr.requested].sort()]);
}

export async function reconcile(api: TaskApi, number: number, dryRun = false): Promise<string> {
  if (!Number.isSafeInteger(number) || number < 1) throw new Error("Invalid PR number");
  let initial: Pull | undefined;
  let comments: unknown[] = [];
  let commentsLoaded = false;
  let tracking = false;
  try {
    initial = pull(api, await api.call(`pulls/${number}`));
    tracking = initial.labels.some((label) => Object.values<string>(QUEUE_LABELS).includes(label));
    const files = (await api.pages(`pulls/${number}/files`)).map((value): ChangedFile => {
      const file = object(value);
      return { filename: text(file.filename), status: text(file.status), ...(file.previous_filename === undefined ? {} : { previous_filename: text(file.previous_filename) }) };
    });
    if (initial.count > 3000 || files.length !== initial.count) throw new Error("Incomplete changed-file list");
    const scope = classifyContributionFiles(files);
    const maintenance = scope.slugs.size > 1 && initial.labels.includes(scope.payloadChanges ? SITE_LABEL : METADATA_LABEL);
    const eligible = initial.baseBranch === "main" && scope.slugs.size > 0 && scope.sites.length === 0 && scope.contracts.length === 0 && !maintenance;
    const tracked = initial.labels.some((label) => Object.values<string>(QUEUE_LABELS).includes(label));
    if (!eligible && !tracked) return "Out of scope";
    tracking = true;
    comments = await api.pages(`issues/${number}/comments`);
    commentsLoaded = true;
    let body: string;
    let evidence: Evidence | undefined;
    let labels: string[] = [];
    if (!eligible || initial.draft || initial.state !== "open") {
      body = `${MARKER}\n## Submission next steps\nTask routing is paused: this PR is ${!eligible ? "outside ordinary contribution scope" : initial.draft ? "a draft" : "closed"}. Ordinary maintainer review and GitHub merge requirements still apply.\n`;
      if (!tracked && !comments.some(ownedComment)) return "Not tracking draft/closed PR";
    } else {
      evidence = await collectEvidence(api, initial, files);
      const assessment = assess(evidence);
      body = render(initial, assessment);
      labels = assessment.labels;
    }
    const live = pull(api, await api.call(`pulls/${number}`));
    if (fingerprint(live) !== fingerprint(initial)) throw new Error("PR state changed during assessment");
    if (evidence) {
      const [owner, name] = api.repo.split("/");
      const state = object((await api.graph(`query($owner:String!,$name:String!,$number:Int!) {
        repository(owner:$owner,name:$name) { pullRequest(number:$number) {
          headRefOid baseRefOid mergeStateStatus reviewDecision
        } }
      }`, { owner, name, number })).pullRequest);
      if (sha(state.headRefOid) !== live.head || sha(state.baseRefOid) !== live.base
        || state.mergeStateStatus !== evidence.mergeState || state.reviewDecision !== evidence.decision) {
        throw new Error("PR merge/review state changed during assessment");
      }
    }
    await writeLabels(api, live, labels, dryRun);
    await writeComment(api, number, comments, body, dryRun);
    return body;
  } catch (error) {
    if (initial && !dryRun) {
      // Invalidate a previous readiness claim even when fresh evidence is unavailable.
      try {
        await api.call(`issues/${number}/labels/${encodeURIComponent(QUEUE_LABELS.ready)}`, "DELETE", undefined, true);
        if (tracking && commentsLoaded) {
          await writeComment(api, number, comments, `${MARKER}\n## Submission next steps\nAssessment failed or changed while being read. Previous readiness is withdrawn. Maintainer: inspect the [Submission PR tasks workflow](${new URL(initial.url).origin}/${api.repo}/actions/workflows/submission-pr-status.yml) and rerun it; do not rely on the previous checklist.\n`, false);
        }
        if (tracking) {
          const retained = initial.labels.filter((label) => label !== QUEUE_LABELS.ready && Object.values<string>(QUEUE_LABELS).includes(label));
          await writeLabels(api, { ...initial, labels: initial.labels.filter((label) => label !== QUEUE_LABELS.ready) },
            [...new Set([...retained, QUEUE_LABELS.maintainer])], false);
        }
      } catch (cleanup) {
        throw new AggregateError([error, cleanup], `Assessment failed: ${String(error)}; readiness invalidation failed: ${String(cleanup)}`);
      }
    }
    throw error;
  }
}

async function main() {
  const token = process.env.GH_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY;
  if (!token || !repo) throw new Error("GH_TOKEN and GITHUB_REPOSITORY are required");
  const api = new TaskApi(repo, token, process.env.GITHUB_API_URL);
  const dryRun = process.argv.includes("--dry-run") || process.env.DRY_RUN === "true";
  if (!dryRun && process.env.GITHUB_ACTIONS !== "true") throw new Error("Local use requires --dry-run; publish only through the trusted GitHub Actions workflow");
  const event = process.env.GITHUB_EVENT_PATH ? object(JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, "utf8"))) : {};
  const requested = process.env.PR_NUMBER || (event.pull_request ? String(object(event.pull_request).number) : "");
  const numbers = requested ? [Number(requested)] : (await api.pages("pulls?state=open&base=main")).map((value) => integer(object(value).number));
  const errors: string[] = [];
  for (const number of numbers) {
    try {
      console.log(`#${number}: ${await reconcile(api, number, dryRun)}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`#${number}: ${message}`);
      errors.push(`#${number}: ${message}`);
    }
  }
  if (errors.length) throw new Error(errors.join("\n"));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
