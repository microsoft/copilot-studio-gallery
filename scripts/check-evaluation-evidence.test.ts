import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { checkEvaluationEvidence } from "./check-evaluation-evidence";
import { evaluationWaiver, EVALUATION_WAIVER_LABEL } from "./evaluation-waiver";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const waiverBody = "## Evaluation waiver\nReason: File attachments are unsupported.\nAlternative evidence: submissions/sample/evaluations/manual-run.csv\n";

test("waivers need an exact maintainer label and one section with a reason and alternative evidence", () => {
  for (const labels of [[], ["not-allow-evaluation-waiver"]]) {
    assert.deepEqual(evaluationWaiver(labels, waiverBody), { approved: false, errors: [] });
  }
  for (const body of [
    "",
    "Reason: unsupported\nAlternative evidence: actual run",
    "## Evaluation waiver\nReason:\nAlternative evidence: actual run",
    "## Evaluation waiver\nReason: unsupported\nAlternative evidence: \n",
    "## Evaluation waiver\nReason: unsupported\n## Other\nAlternative evidence: actual run",
    "## Evaluation waiver\nReason: unsupported\n# Other\nAlternative evidence: actual run",
    waiverBody + waiverBody,
    waiverBody + "## Evaluation waiver",
    waiverBody + "Reason: another reason\n",
  ]) {
    const result = evaluationWaiver([EVALUATION_WAIVER_LABEL], body);
    assert.equal(result.approved, false, body);
    assert.ok(result.errors.length, body);
  }
  for (const body of [waiverBody, waiverBody.replace(/\n/g, "\r\n")]) {
    assert.deepEqual(evaluationWaiver([EVALUATION_WAIVER_LABEL], body), { approved: true, errors: [] });
  }
});

test("requires a CSV for changed standalone agents, but not embedded nodes, workflows, or apps", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "gallery-evaluations-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const path of [
    "standalone/solution/bots/helper/bot.xml",
    "embedded/solution/botcomponents/node/data",
    "workflow/solution/Workflows/flow.json",
    "app/app/package.json",
    "unchanged/solution/bots/helper/bot.xml",
  ]) {
    const file = join(root, "submissions", path);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, "fixture");
  }
  const errors = await checkEvaluationEvidence(root, [
    "submissions/standalone/README.md",
    "submissions/standalone/metadata.json",
    "submissions/embedded/README.md",
    "submissions/workflow/README.md",
    "submissions/app/README.md",
    "CONTRIBUTING.md",
  ]);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /^standalone:.*results CSV/);
  assert.deepEqual(await checkEvaluationEvidence(root, ["submissions/deleted/README.md"]), []);
});

test("accepts nonempty CSV without judging scores, and rejects absent, empty, or symlinked evidence", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "gallery-evaluations-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const bot = join(root, "submissions/sample/solution/bots/helper");
  const evaluations = join(root, "submissions/sample/evaluations");
  await mkdir(bot, { recursive: true });
  await mkdir(evaluations);
  await writeFile(join(bot, "bot.xml"), "<bot/>");
  const paths = ["submissions/sample/README.md"];
  await writeFile(join(evaluations, "results.json"), "{}");
  await writeFile(join(evaluations, "empty.csv"), "");
  assert.equal((await checkEvaluationEvidence(root, paths)).length, 1);
  await symlink(join(bot, "bot.xml"), join(evaluations, "linked.csv"));
  assert.equal((await checkEvaluationEvidence(root, paths)).length, 1);
  await writeFile(join(evaluations, "results.CSV"), "question,actualResponse,result_1\nExample,Response,Fail\n");
  assert.deepEqual(await checkEvaluationEvidence(root, paths), []);
});

test("matches the importer's case-insensitive bot paths", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "gallery-evaluations-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const bot = join(root, "submissions/sample/solution/Bots/helper");
  await mkdir(bot, { recursive: true });
  await writeFile(join(bot, "Bot.XML"), "<bot/>");
  assert.equal((await checkEvaluationEvidence(root, ["submissions/sample/README.md"])).length, 1);
});

test("CI applies the waiver and fails again when its label or evidence is removed", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "gallery-evaluations-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: "pipe" }).trim();
  git("init", "--quiet");
  git("config", "user.name", "Test");
  git("config", "user.email", "test@example.com");
  git("commit", "--quiet", "--allow-empty", "-m", "base");
  const base = git("rev-parse", "HEAD");
  const bot = join(root, "submissions/sample/solution/bots/helper");
  await mkdir(bot, { recursive: true });
  await writeFile(join(bot, "bot.xml"), "<bot/>");
  git("add", "submissions");
  git("commit", "--quiet", "-m", "submission");
  const eventPath = join(root, "event.json");
  const run = () => execFileSync(process.execPath, [
    "--import", import.meta.resolve("tsx"),
    fileURLToPath(new URL("./check-evaluation-evidence.ts", import.meta.url)), base,
  ], {
    cwd: root, encoding: "utf8", stdio: "pipe",
    env: { ...process.env, GITHUB_EVENT_NAME: "pull_request", GITHUB_EVENT_PATH: eventPath },
  });
  const event = async (labels: string[], body: string) => writeFile(eventPath, JSON.stringify({
    pull_request: { labels: labels.map((name) => ({ name })), body },
  }));
  await event([EVALUATION_WAIVER_LABEL], waiverBody);
  assert.match(run(), /requirement waived/);
  await event([], waiverBody);
  assert.throws(run, /requires a nonempty results CSV/);
  await event([EVALUATION_WAIVER_LABEL], "## Evaluation waiver\nReason: unsupported\n");
  assert.throws(run, /Alternative evidence/);
});
