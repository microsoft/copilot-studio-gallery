import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import test from "node:test";
import { APP_INSTALLERS, appInstallCommand, appInstallInputs, type AppInstallPlatform } from "../src/lib/appInstall";
import { appSetupSchema } from "../src/lib/schema";

const template = "github:microsoft/copilot-studio-gallery/submissions/ideas/app#main";
const setup = appSetupSchema.parse({ connectors: [{
  connector: "shared_sharepointonline", mode: "table", dataSource: "teamideas",
  table: "Team Ideas", instructions: "Choose your site and list.",
}] });
const app = { template, app: setup };
const powershell = process.platform === "win32" ? "powershell.exe" : process.env.PWSH;

test("shared shell installers receive validated inputs, not per-submission executable code", () => {
  for (const platform of ["macos", "windows"] as const) {
    const command = appInstallCommand(app, platform);
    assert.ok(command.includes(APP_INSTALLERS[platform]));
    assert.doesNotMatch(command, /node --|\.mjs|--table|Team Ideas/);
    assert.ok(command.includes("shared_sharepointonline:table"));
    assert.ok(command.includes("ideas"));
  }
  const dataverse = appSetupSchema.parse({ connectors: [{
    connector: "shared_commondataserviceforapps", mode: "table", dataSource: "ideas",
    table: "contoso_idea", instructions: "Choose a connection.",
  }, { connector: "shared_office365", mode: "action", dataSource: "mail", instructions: "Choose a connection." }] });
  assert.deepEqual(appInstallInputs(template, dataverse), [
    "ideas", "shared_commondataserviceforapps:table:contoso_idea", "shared_office365:action",
  ]);
  assert.throws(() => appInstallInputs(template, { ...dataverse, connectors: [{ ...dataverse.connectors[0]!, table: "ideas;whoami" }] }), /logical table name/);
  for (const value of [
    "github:microsoft/copilot-studio-gallery/submissions/ideas;whoami/app#main",
    "github:microsoft/copilot-studio-gallery/submissions/../app#main",
    "github:untrusted/repository/submissions/ideas/app#main",
  ]) assert.throws(() => appInstallInputs(value, setup));
});

interface Call { tool: string; args: string[]; cwd: string; stdin?: string }
async function fixture(platform: AppInstallPlatform) {
  const root = await realpath(await mkdtemp(join(tmpdir(), "gallery-shell-")));
  const bin = join(root, "bin");
  await mkdir(bin);
  const script = resolve("public", APP_INSTALLERS[platform]);
  const mock = join(root, "mock.cjs");
  const log = join(root, "calls.jsonl");
  await writeFile(mock, `const fs = require("node:fs");
const path = require("node:path");
const [tool, ...original] = process.argv.slice(2);
const args = tool === "npx" ? original.slice(4) : original;
const name = tool === "npx" ? "ms" : tool;
const stage = [name, ...args.slice(0, 2)].join(" ");
const call = { tool: name, args, cwd: path.relative(process.env.TEST_ROOT, process.cwd()) };
if (stage === "ms app add") call.stdin = fs.readFileSync(0, "utf8");
fs.appendFileSync(process.env.TEST_LOG, JSON.stringify(call) + "\\n");
const installed = name => path.join(process.env.TEST_ROOT, "installed-" + name);
const missing = name => (process.env.TEST_MISSING || "").split(",").includes(name) && !fs.existsSync(installed(name));
if (stage === process.env.TEST_FAIL || name === process.env.TEST_FAIL) process.exit(19);
if (tool === "uname") { console.log(process.env.TEST_OS || "Darwin"); process.exit(); }
if (tool === "node") { if (missing("node")) process.exit(1); console.log(fs.existsSync(installed("node")) ? "v24.22.1" : process.env.TEST_NODE_VERSION || "v24.22.1"); process.exit(); }
if (tool === "brew" && args[0] === "--prefix") {
  console.log((args[1] === "node@24" ? process.env.TEST_NODE_PREFIX : args.length === 1 ? process.env.TEST_BREW_PREFIX : undefined) || process.env.TEST_ROOT);
  process.exit();
}
if (tool === "brew" || tool === "winget") {
  const id = tool === "brew" ? args.at(-1) : args[args.indexOf("--id") + 1];
  const tools = { "node@24": ["node"], "git": ["git"], "git-credential-manager": ["gcm"],
    "OpenJS.NodeJS.LTS": ["node"], "Git.Git": ["git", "gcm"], "Git.GCM": ["gcm"] }[id];
  if (!tools) throw new Error("Unexpected installer: " + id);
  if (process.env.TEST_INSTALL_NO_EFFECT) process.exit();
  for (const name of tools) fs.writeFileSync(installed(name), "");
  process.exit();
}
if (tool === "git" && args[0] === "--version") { if (missing("git")) process.exit(1); console.log(fs.existsSync(installed("git")) ? "git version 2.56.0" : process.env.TEST_GIT_VERSION || "git version 2.56.0"); process.exit(); }
if (tool === "git" && args[0].startsWith("credential-manager")) {
  if (missing("gcm")) process.exit(1);
  if (args[1] === "configure") fs.writeFileSync(installed("configured"), "");
  process.exit();
}
if (stage === "git config --get-all") {
  if (process.env.TEST_UNCONFIGURED && !fs.existsSync(installed("configured"))) process.exit(1);
  console.log("manager"); process.exit();
}
if (tool === "curl") {
  if (process.env.TEST_DOWNLOAD_FAILURE) process.exit(22);
  if (args[1] !== process.env.TEST_URL) throw new Error("Unexpected download URL");
  if (process.env.TEST_EMPTY_DOWNLOAD) { fs.writeFileSync(args[args.indexOf("-o") + 1], ""); process.exit(); }
  fs.copyFileSync(process.env.TEST_SCRIPT, args[args.indexOf("-o") + 1]); process.exit();
}
if (stage === "ms app create") fs.mkdirSync(args[2]);
if (stage === "git diff --cached") process.exit(Number(process.env.TEST_DIFF ?? 1));
`);
  const tools = ["npx", "npm", "npx.cmd", "npm.cmd", "git", "node", "brew", "winget", "uname", "curl"];
  for (const tool of tools) {
    await writeFile(join(bin, tool), `#!/bin/sh\nexec "${process.execPath}" "${mock}" ${tool} "$@"\n`, { mode: 0o755 });
  }
  const env = {
    ...process.env, PATH: `${bin}${delimiter}${process.env.PATH}`, OS: "Windows_NT",
    TEST_ROOT: root, TEST_LOG: log, TEST_SCRIPT: script, TEST_APPROVAL: "y",
    TEST_URL: `https://microsoft.github.io/copilot-studio-gallery/${APP_INSTALLERS[platform]}`,
  };
  const quote = (value: string) => `'${value.replaceAll("'", "''")}'`;
  const proxy = tools.map(tool => `function global:${tool} { & ${quote(process.execPath)} ${quote(mock)} '${tool.endsWith(".cmd") ? tool.slice(0, -4) : tool}' @args }`).join("\n");
  const windowsPrefix = `$ErrorActionPreference = 'Stop'
${proxy}
function Read-Host { return $env:TEST_APPROVAL }
function Invoke-WebRequest {
  param([switch]$UseBasicParsing, [Parameter(Position=0)][string]$Uri)
  if ($env:TEST_DOWNLOAD_FAILURE) { throw 'Setup download failed: 503' }
  if ($Uri -ne $env:TEST_URL) { throw 'Unexpected installer URL' }
  $bytes = [IO.File]::ReadAllBytes($env:TEST_SCRIPT)
  if ($env:TEST_EMPTY_DOWNLOAD) { $bytes = [byte[]]@() }
  return @{ RawContentStream = [IO.MemoryStream]::new([byte[]]$bytes) }
}
`;
  const run = (extra: Record<string, string | undefined> = {}, command = appInstallCommand(app, platform)) => {
    const confirmations = extra.TEST_MISSING || extra.TEST_UNCONFIGURED || extra.TEST_NODE_VERSION || extra.TEST_GIT_VERSION
      ? `${Array(4).fill(extra.TEST_APPROVAL ?? "y").join("\n")}\n` : "";
    const options = { cwd: root, env: { ...env, ...extra }, input: `${confirmations}Native list selection\n`, encoding: "utf8" as const };
    return platform === "windows"
      ? spawnSync(powershell!, ["-NoLogo", "-NoProfile", "-Command", `${windowsPrefix}${command}; exit $LASTEXITCODE`], options)
      : spawnSync("bash", ["-c", command], options);
  };
  const calls = async (): Promise<Call[]> => {
    try { return (await readFile(log, "utf8")).trim().split("\n").map(line => JSON.parse(line)); }
    catch (error) { if (error instanceof Error && "code" in error && error.code === "ENOENT") return []; throw error; }
  };
  return { root, run, calls };
}
const workflow = (calls: Call[]) => {
  const start = calls.findIndex(call => call.tool === "ms");
  return start < 0 ? [] : calls.slice(start);
};

test("macos: installing Node preserves an existing compatible Git and its credential manager", { skip: process.platform === "win32" }, async () => {
  const { root, run, calls } = await fixture("macos");
  try {
    const brewPrefix = join(root, "homebrew");
    const nodePrefix = join(root, "node");
    await mkdir(join(brewPrefix, "bin"), { recursive: true });
    await mkdir(join(nodePrefix, "bin"), { recursive: true });
    await writeFile(join(brewPrefix, "bin", "git"), "#!/bin/sh\nexit 42\n", { mode: 0o755 });
    for (const tool of ["node", "npm", "npx"]) {
      await writeFile(join(nodePrefix, "bin", tool), await readFile(join(root, "bin", tool)), { mode: 0o755 });
    }
    const result = run({ TEST_MISSING: "node", TEST_BREW_PREFIX: brewPrefix, TEST_NODE_PREFIX: nodePrefix });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const installs = (await calls()).filter(call => call.tool === "brew" && call.args[0] === "install");
    assert.deepEqual(installs.map(call => call.args), [["install", "node@24"]]);
  } finally { await rm(root, { recursive: true, force: true }); }
});

for (const platform of ["macos", "windows"] as const) {
  const skip = platform === "macos" ? process.platform === "win32" : !powershell;
  test(`${platform}: pasted bootstrap preserves native input and pack/save/build/preview sequencing`, { skip }, async () => {
    const { root, run, calls } = await fixture(platform);
    try {
      const result = run();
      assert.equal(result.status, 0, result.stdout + result.stderr);
      const actual = workflow(await calls());
      assert.deepEqual(actual.map(call => `${call.tool} ${call.args.slice(0, 2).join(" ")}`), [
        "ms auth login", "ms auth status", "ms app create", "ms app add", "npm install", "ms app pack",
        "git add --all", "git diff --cached", "git commit -m", "git push --set-upstream", "ms app build", "ms app play",
      ]);
      assert.deepEqual(actual[2]!.args, ["app", "create", "./ideas", "--repo", "native", "--template", template]);
      assert.equal(actual[3]!.stdin, "Native list selection\n");
      assert.ok(actual.slice(3).every(call => call.cwd === "ideas"));
      assert.deepEqual(actual[3]!.args, ["app", "add", "data-source", "--connector", "shared_sharepointonline", "--as", "table"]);
      assert.deepEqual(actual.at(-1)!.args, ["app", "play", "--mode", "preview"]);
      assert.ok(!(await calls()).some(call => ["brew", "winget"].includes(call.tool)));
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  test(`${platform}: native failures and Git diff errors stop immediately with their exit codes`, { skip }, async () => {
    for (const stage of ["ms auth login", "ms auth status", "ms app create", "ms app add", "npm install",
      "ms app pack", "git add --all", "git commit -m", "git push --set-upstream", "ms app build", "ms app play", "diff"]) {
      const { root, run, calls } = await fixture(platform);
      try {
        const result = run(stage === "diff" ? { TEST_DIFF: "2" } : { TEST_FAIL: stage });
        assert.equal(result.status, stage === "diff" ? 2 : 19, result.stdout + result.stderr);
        const last = workflow(await calls()).at(-1)!;
        assert.equal(`${last.tool} ${last.args.slice(0, 2).join(" ")}`, stage === "diff" ? "git diff --cached" : stage);
      } finally { await rm(root, { recursive: true, force: true }); }
    }
  });

  test(`${platform}: no-op commits are skipped and download failure never starts setup`, { skip }, async () => {
    for (const extra of [{ TEST_DIFF: "0" }, { TEST_DOWNLOAD_FAILURE: "1" }, { TEST_EMPTY_DOWNLOAD: "1" }]) {
      const { root, run, calls } = await fixture(platform);
      try {
        const result = run(extra);
        const actual = workflow(await calls());
        if ("TEST_DIFF" in extra) {
          assert.equal(result.status, 0, result.stdout + result.stderr);
          assert.ok(actual.every(call => call.args[0] !== "commit"));
        } else {
          assert.notEqual(result.status, 0);
          assert.deepEqual(actual, []);
        }
      } finally { await rm(root, { recursive: true, force: true }); }
    }
  });

  test(`${platform}: missing prerequisites are installed before authentication and failed installs stop`, { skip }, async () => {
    for (const fail of [false, true]) {
      const { root, run, calls } = await fixture(platform);
      try {
        const result = run({ TEST_MISSING: "node,git,gcm", ...(fail ? { TEST_FAIL: platform === "macos" ? "brew install node@24" : "winget" } : {}) });
        assert.equal(result.status, fail ? 19 : 0, result.stdout + result.stderr);
        const actual = await calls();
        const installs = actual.filter(call => ["brew", "winget"].includes(call.tool) && call.args[0] !== "--prefix");
        assert.ok(installs.length > 0);
        if (fail) assert.deepEqual(workflow(actual), []);
        else assert.ok(actual.findIndex(call => call.tool === "ms") > actual.lastIndexOf(installs.at(-1)!));
      } finally { await rm(root, { recursive: true, force: true }); }
    }
  });

  test(`${platform}: outdated tools and a missing standalone GCM are installed before cloud creation`, { skip }, async () => {
    for (const extra of [{ TEST_NODE_VERSION: "v22.23.4", TEST_GIT_VERSION: "git version 2.20.0" }, { TEST_MISSING: "gcm" }]) {
      const { root, run, calls } = await fixture(platform);
      try {
        const result = run(extra);
        assert.equal(result.status, 0, result.stdout + result.stderr);
        const actual = await calls();
        const installs = actual.filter(call => ["brew", "winget"].includes(call.tool) && call.args[0] !== "--prefix");
        assert.ok(installs.length > 0);
        if ("TEST_MISSING" in extra && platform === "windows") {
          assert.ok(installs.some(call => call.args.includes("Git.GCM")));
          assert.ok(installs.every(call => !call.args.includes("Git.Git")));
        }
      } finally { await rm(root, { recursive: true, force: true }); }
    }
  });

  test(`${platform}: installing tools and changing GCM configuration require consent`, { skip }, async () => {
    for (const extra of [{ TEST_MISSING: "node", TEST_APPROVAL: "n" }, { TEST_UNCONFIGURED: "1", TEST_APPROVAL: "n" }, { TEST_UNCONFIGURED: "1" }]) {
      const { root, run, calls } = await fixture(platform);
      try {
        const result = run(extra);
        assert.equal(result.status, "TEST_APPROVAL" in extra ? 1 : 0, result.stdout + result.stderr);
        const actual = await calls();
        const configured = actual.some(call => call.tool === "git" && call.args[1] === "configure");
        if ("TEST_APPROVAL" in extra) {
          assert.deepEqual(workflow(actual), []);
          assert.equal(configured, false);
          assert.ok(!actual.some(call => ["brew", "winget"].includes(call.tool)));
        } else assert.equal(configured, true);
      } finally { await rm(root, { recursive: true, force: true }); }
    }
  });

  test(`${platform}: a successful package-manager exit is not enough if the prerequisite is still missing`, { skip }, async () => {
    const { root, run, calls } = await fixture(platform);
    try {
      const result = run({ TEST_MISSING: "node", TEST_INSTALL_NO_EFFECT: "1" });
      assert.notEqual(result.status, 0);
      assert.match(result.stdout + result.stderr, /still unavailable/);
      assert.deepEqual(workflow(await calls()), []);
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  test(`${platform}: connectorless apps and fixed Dataverse/action inputs use the same installer`, { skip }, async () => {
    for (const connectors of [[], [{
      connector: "shared_commondataserviceforapps", mode: "table", dataSource: "ideas", table: "contoso_idea", instructions: "Choose connection.",
    }, { connector: "shared_office365", mode: "action", dataSource: "mail", instructions: "Choose connection." }]]) {
      const { root, run, calls } = await fixture(platform);
      try {
        const command = appInstallCommand({ template, app: appSetupSchema.parse({ connectors }) }, platform);
        const result = run({}, command);
        assert.equal(result.status, 0, result.stdout + result.stderr);
        const actual = (await calls()).filter(call => call.tool === "ms" && call.args[1] === "add");
        assert.equal(actual.length, connectors.length);
        if (connectors.length) {
          assert.deepEqual(actual[0]!.args.slice(-2), ["--table", "contoso_idea"]);
          assert.deepEqual(actual[1]!.args.slice(-2), ["--as", "action"]);
        }
      } finally { await rm(root, { recursive: true, force: true }); }
    }
  });

  test(`${platform}: malformed inputs and existing destinations fail before modifying tools or cloud resources`, { skip }, async () => {
    for (const kind of ["input", "binding", "destination"]) {
      const { root, run, calls } = await fixture(platform);
      try {
        if (kind === "destination") await mkdir(join(root, "ideas"));
        let command = appInstallCommand(app, platform);
        if (kind === "input") command = command.replace(platform === "macos" ? "ideas shared_" : "'ideas'", platform === "macos" ? "../escape shared_" : "'../escape'");
        if (kind === "binding") command = command.replace("shared_sharepointonline:table", "shared_sharepointonline:action:Title");
        const result = run({}, command);
        assert.notEqual(result.status, 0, result.stdout + result.stderr);
        assert.deepEqual(workflow(await calls()), []);
        assert.ok(!(await calls()).some(call => ["brew", "winget"].includes(call.tool)));
      } finally { await rm(root, { recursive: true, force: true }); }
    }
  });
}

test("Bash installer explicitly rejects Linux before prerequisite or cloud changes", { skip: process.platform === "win32" }, async () => {
  const { root, run, calls } = await fixture("macos");
  try {
    const result = run({ TEST_OS: "Linux" });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Linux is not supported/);
    assert.deepEqual(workflow(await calls()), []);
  } finally { await rm(root, { recursive: true, force: true }); }
});
