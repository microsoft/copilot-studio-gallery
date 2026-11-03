import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { appInstallCommand, appInstallScript } from "../src/lib/appInstall";
import { appSetupSchema } from "../src/lib/schema";

const template = "github:microsoft/copilot-studio-gallery/submissions/ideas/app#main";
const setup = appSetupSchema.parse({ connectors: [{
  connector: "shared_sharepointonline", mode: "table", dataSource: "teamideas",
  table: "Team Ideas", instructions: "Choose your site and list.",
}] });
const installScript = `bundles/ideas-${"a".repeat(64)}.mjs`;

test("cross-platform setup only sequences native commands, with native SharePoint pickers and fixed Dataverse logical names", () => {
  const command = appInstallCommand({ installScript });
  assert.ok(command.startsWith("node --input-type=module -e "));
  assert.ok(command.includes(`https://microsoft.github.io/copilot-studio-gallery/${installScript}`));
  assert.doesNotMatch(command, /npx|\||!|iex|sudo/);
  const script = appInstallScript(template, setup);
  assert.ok(script.includes("app add data-source --connector shared_sharepointonline --as table"));
  assert.doesNotMatch(script, /--table|Team Ideas|app deploy|--mode live|app share|fetch\(|ms\.config|allowedActions/);
  const dataverse = appSetupSchema.parse({ connectors: [{
    connector: "shared_commondataserviceforapps", mode: "table", dataSource: "ideas",
    table: "contoso_idea", instructions: "Choose a connection.",
  }, { connector: "shared_office365", mode: "action", dataSource: "mail", instructions: "Choose a connection." }] });
  assert.match(appInstallScript(template, dataverse), /--as table --table contoso_idea/);
  assert.match(appInstallScript(template, dataverse), /--connector shared_office365 --as action/);
  assert.throws(() => appInstallScript(template, { ...dataverse, connectors: [{ ...dataverse.connectors[0]!, table: "ideas;whoami" }] }), /logical table name/);
  for (const value of [
    "github:microsoft/copilot-studio-gallery/submissions/ideas;whoami/app#main",
    "github:microsoft/copilot-studio-gallery/submissions/../app#main",
    "github:untrusted/repository/submissions/ideas/app#main",
  ]) assert.throws(() => appInstallScript(value, setup));
  for (const value of ["https://untrusted.test/setup.mjs", "bundles/../setup.mjs", `${installScript}';whoami`]) {
    assert.throws(() => appInstallCommand({ installScript: value }));
  }
});

async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), "gallery-sequence-")));
  const script = join(root, "setup.mjs");
  const mock = join(root, "mock.cjs");
  const fetchMock = join(root, "fetch.mjs");
  const log = join(root, "calls.jsonl");
  await writeFile(script, appInstallScript(template, setup));
  await writeFile(fetchMock, `import { readFileSync } from "node:fs";
globalThis.fetch = async (url) => {
  if (url !== process.env.TEST_URL) throw new Error("Unexpected setup URL");
  return { ok: !process.env.TEST_DOWNLOAD_FAILURE, status: 503,
    text: async () => readFileSync(process.env.TEST_SCRIPT, "utf8") };
};`);
  await writeFile(mock, `const fs = require("node:fs");
const path = require("node:path");
const [tool, ...original] = process.argv.slice(2);
const args = tool === "npx" ? original.slice(4) : original;
const name = tool === "npx" ? "ms" : tool;
const stage = [name, ...args.slice(0, 2)].join(" ");
const call = { tool: name, args, cwd: path.relative(process.env.TEST_ROOT, process.cwd()) };
if (stage === "ms app add") call.stdin = fs.readFileSync(0, "utf8");
fs.appendFileSync(process.env.TEST_LOG, JSON.stringify(call) + "\\n");
if (stage === process.env.TEST_FAIL) process.exit(19);
if (stage === "ms app create") fs.mkdirSync(args[2]);
if (stage === "git diff --cached") process.exit(Number(process.env.TEST_DIFF ?? 1));
`);
  for (const tool of ["npx", "npm", "git"]) {
    await writeFile(join(root, process.platform === "win32" ? `${tool}.cmd` : tool), process.platform === "win32"
      ? `@"${process.execPath}" "${mock}" ${tool} %*\r\n`
      : `#!/bin/sh\nexec "${process.execPath}" "${mock}" ${tool} "$@"\n`, { mode: 0o755 });
  }
  const env = {
    ...process.env, PATH: `${root}${delimiter}${process.env.PATH}`, NODE_OPTIONS: `--import=${pathToFileURL(fetchMock).href}`,
    TEST_ROOT: root, TEST_LOG: log, TEST_SCRIPT: script,
    TEST_URL: `https://microsoft.github.io/copilot-studio-gallery/${installScript}`,
  };
  const run = (extra = {}) => {
    const command = appInstallCommand({ installScript });
    const options = { cwd: root, env: { ...env, ...extra }, input: "Native list selection\n", encoding: "utf8" as const };
    return process.platform === "win32"
      ? spawnSync("powershell.exe", ["-NoLogo", "-NoProfile", "-Command", `${command}; exit $LASTEXITCODE`], options)
      : spawnSync(command, { ...options, shell: true });
  };
  const calls = async (): Promise<{ tool: string; args: string[]; cwd: string; stdin?: string }[]> =>
    (await readFile(log, "utf8")).trim().split("\n").map((line) => JSON.parse(line));
  return { root, run, calls };
}

test("one pasted command preserves native prompt input, enters the created folder, and sequences pack/save/build/preview", async () => {
  const { root, run, calls } = await fixture();
  try {
    const result = run();
    assert.equal(result.status, 0, result.stderr);
    const actual = await calls();
    assert.deepEqual(actual.map((call) => `${call.tool} ${call.args.slice(0, 2).join(" ")}`), [
      "ms auth login", "ms auth status", "ms app create", "ms app add", "npm install", "ms app pack",
      "git add --all", "git diff --cached", "git commit -m", "git push --set-upstream", "ms app build", "ms app play",
    ]);
    assert.deepEqual(actual[2]!.args, ["app", "create", "./ideas", "--repo", "native", "--template", template]);
    assert.equal(actual[3]!.stdin, "Native list selection\n");
    assert.ok(actual.slice(3).every((call) => call.cwd === "ideas"));
    assert.deepEqual(actual.find((call) => call.args[0] === "push")!.args, ["push", "--set-upstream", "origin", "HEAD"]);
    assert.deepEqual(actual.at(-1)!.args, ["app", "play", "--mode", "preview"]);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("every native failure stops the sequence and propagates its exit code without recreating or deleting anything", async () => {
  for (const stage of ["ms auth login", "ms app create", "ms app add", "npm install", "ms app pack",
    "git add --all", "git commit -m", "git push --set-upstream", "ms app build", "ms app play"]) {
    const { root, run, calls } = await fixture();
    try {
      const result = run({ TEST_FAIL: stage });
      assert.equal(result.status, 19, result.stderr);
      assert.match(result.stderr, /Setup stopped/);
      const last = (await calls()).at(-1)!;
      assert.equal(`${last.tool} ${last.args.slice(0, 2).join(" ")}`, stage);
    } finally { await rm(root, { recursive: true, force: true }); }
  }
});

test("a no-op commit is skipped, a Git diff failure stops, and download errors never start setup", async () => {
  for (const diff of ["0", "2"]) {
    const { root, run, calls } = await fixture();
    try {
      const result = run({ TEST_DIFF: diff });
      assert.equal(result.status, Number(diff), result.stderr);
      const actual = await calls();
      assert.ok(actual.every((call) => call.args[0] !== "commit"));
      assert.equal(actual.at(-1)!.args[0], diff === "0" ? "app" : "diff");
    } finally { await rm(root, { recursive: true, force: true }); }
  }
  const { root, run } = await fixture();
  try {
    const result = run({ TEST_DOWNLOAD_FAILURE: "1" });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Setup download failed: 503/);
    await assert.rejects(readFile(join(root, "calls.jsonl")), { code: "ENOENT" });
  } finally { await rm(root, { recursive: true, force: true }); }
});
