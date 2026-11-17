import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { checkEvaluationEvidence } from "./check-evaluation-evidence";

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
