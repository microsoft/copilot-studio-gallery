import assert from "node:assert/strict";
import { cp, lstat, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import AdmZip from "adm-zip";
import {
  SubmissionImportError,
  deriveSolutionFields,
  deterministicZip,
  extractSavedGraph,
  importSubmissions,
  layoutAgentGraph,
  normalizeAgentComponents,
  normalizeWorkflowGraph,
  parseXml,
} from "./import-submissions";

const fixture = join(process.cwd(), "scripts/fixtures/reduced-solution");
const workspace = join(process.cwd(), "scripts/fixtures/.import-test-workspace");

async function setup(): Promise<void> {
  await rm(workspace, { recursive: true, force: true });
  await mkdir(join(workspace, "submissions"), { recursive: true });
  await cp(fixture, join(workspace, "submissions/demo-agent"), { recursive: true });
}

test.beforeEach(setup);
test.after(async () => rm(workspace, { recursive: true, force: true }));

test("imports metadata while retaining derived solution identity", async () => {
  const report = await importSubmissions({ root: workspace });
  assert.deepEqual(report.imported, ["demo-agent"]);
  const record = JSON.parse(await (await import("node:fs/promises")).readFile(join(workspace, "src/content/solutions/demo-agent.json"), "utf8"));
  assert.equal(record.name, "Catalog name wins");
  assert.equal(record.uniqueName, "Demo_Agent_Solution");
  assert.equal(record.version, "2.3.4.5");
  assert.equal(record.publisher, "Contoso");
  assert.equal(record.bundle, "bundles/demo-agent.zip");
  assert.equal(record.componentCount, 1);
  const support = record.agents.find((agent: { schemaName: string }) => agent.schemaName === "support_agent");
  const other = record.agents.find((agent: { schemaName: string }) => agent.schemaName === "other_agent");
  assert.deepEqual(support, {
    id: "support",
    schemaName: "support_agent",
    name: "Support Agent",
    model: "gpt-4.1",
    instructions: "Help customers\nwith support requests.",
    channels: ["web", "teams"],
    toolCount: 1,
    skillCount: 1,
    connectedAgentCount: 1,
  });
  assert.equal(other.toolCount, 1);
  assert.equal(other.skillCount, 0);
  assert.equal(other.connectedAgentCount, 0);
  assert.deepEqual(record.agentGraph.nodes.find((node: { id: string }) => node.id === "agent:support").details, {
    model: "gpt-4.1",
    instructions: "Help customers\nwith support requests.",
    channels: ["web", "teams"],
    toolCount: 1,
    skillCount: 1,
    connectedAgentCount: 1,
  });
  assert.deepEqual(record.agentGraph.nodes.find((node: { name: string }) => node.name === "Knowledge Search").details, {
    kind: "tool",
    schemaName: "support_agent.tool.knowledge",
  });
  assert.ok(record.agentGraph.nodes.every((node: { position: { x: number; y: number } }) => Number.isFinite(node.position.x) && Number.isFinite(node.position.y)));
  assert.equal(record.agentGraph.edges.filter((edge: { label: string; source: string }) => edge.source === "agent:support").length, 3);
  assert.equal(record.workflows[0].name, "Branched workflow");
  const workflowNodes = record.workflows[0].graph.nodes;
  assert.deepEqual(workflowNodes.find((node: { id: string }) => node.id === "respond").details, {
    displayName: "Reply",
    apiName: "shared_teams",
    operationName: "postMessage",
    operationType: "action",
    parameters: { message: "Done" },
  });
  assert.deepEqual(workflowNodes.find((node: { id: string }) => node.id === "escalate").details, {
    botSchemaName: "manager_agent",
    mode: "delegate",
    tools: ["Search"],
  });
});

test("check mode validates inputs without requiring or writing generated artifacts", async () => {
  const report = await importSubmissions({ root: workspace, check: true });
  assert.deepEqual(report.imported, ["demo-agent"]);
  await assert.rejects(() => lstat(join(workspace, "src/content/solutions/demo-agent.json")));
  await assert.rejects(() => lstat(join(workspace, "src/content/guides/demo-agent.md")));
  await assert.rejects(() => lstat(join(workspace, "public/bundles/demo-agent.zip")));
  await mkdir(join(workspace, "src/content/solutions"), { recursive: true });
  await writeFile(join(workspace, "src/content/solutions/stale.json"), "{}");
  await importSubmissions({ root: workspace, check: true });
  await lstat(join(workspace, "src/content/solutions/stale.json"));
});

test("ignores hidden and template submission directories", async () => {
  await mkdir(join(workspace, "submissions/_template"), { recursive: true });
  await mkdir(join(workspace, "submissions/.draft"), { recursive: true });
  const report = await importSubmissions({ root: workspace, check: true });
  assert.deepEqual(report.imported, ["demo-agent"]);
});

test("maps XML components and normalizes tools, skills, and delegation", () => {
  const xml = parseXml("<root><Thing><Name>Example</Name></Thing></root>");
  assert.equal((xml as { root: { Thing: { Name: string } } }).root.Thing.Name, "Example");
  const normalized = normalizeAgentComponents("agent:one", [
    { id: "tool", name: "Search", kind: "tool" },
    { id: "skill", name: "Triage", kind: "skill" },
    { id: "connected", name: "Escalation", kind: "connected", target: "Manager" },
  ]);
  assert.equal(normalized.tools.length, 1);
  assert.equal(normalized.skills.length, 1);
  assert.equal(normalized.connected.length, 1);
  assert.deepEqual(normalized.edges.map((edge) => edge.label), ["uses", "includes"]);
});

test("centers primary agents and arranges capabilities around them", () => {
  const graph = layoutAgentGraph([
    { id: "agent:primary", name: "Primary", type: "agent", position: { x: 0, y: 0 }, details: {} },
    { id: "tool:search", name: "Search", type: "tool", position: { x: 0, y: 0 }, details: {} },
    { id: "skill:triage", name: "Triage", type: "skill", position: { x: 0, y: 0 }, details: {} },
    { id: "agent:delegate", name: "Delegate", type: "agent", position: { x: 0, y: 0 }, details: {} },
    { id: "tool:notify", name: "Notify", type: "tool", position: { x: 0, y: 0 }, details: {} },
  ], [
    { id: "primary-search", source: "agent:primary", target: "tool:search", label: "uses" },
    { id: "primary-triage", source: "agent:primary", target: "skill:triage", label: "includes" },
    { id: "primary-delegate", source: "agent:primary", target: "agent:delegate", label: "delegates" },
    { id: "delegate-notify", source: "agent:delegate", target: "tool:notify", label: "uses" },
  ]);
  const position = (id: string) => graph.nodes.find((node) => node.id === id)?.position;
  assert.deepEqual(position("agent:primary"), { x: -112, y: -36 });
  assert.notDeepEqual(position("tool:search"), position("agent:primary"));
  assert.notDeepEqual(position("skill:triage"), position("agent:primary"));
  assert.ok((position("agent:delegate")?.y ?? 0) < -300);
  assert.ok((position("tool:notify")?.y ?? 0) < (position("agent:delegate")?.y ?? 0));
  assert.deepEqual(graph.edges.map((edge) => edge.id), [
    "delegate-notify",
    "primary-delegate",
    "primary-search",
    "primary-triage",
  ]);
});

test("derives display and publisher only from the solution manifest", () => {
  const solution = parseXml(`
    <ImportExportXml><SolutionManifest><UniqueName>solution_name</UniqueName><Version>1.0.0.0</Version>
      <LocalizedNames><LocalizedName description="Solution title" /></LocalizedNames>
      <Publisher><UniqueName>publisher_unique</UniqueName><LocalizedNames><LocalizedName description="Publisher title" /></LocalizedNames></Publisher>
    </SolutionManifest><LocalizedNames><LocalizedName description="Wrong title" /></LocalizedNames></ImportExportXml>`);
  assert.deepEqual(deriveSolutionFields(solution, {}), {
    uniqueName: "solution_name",
    displayName: "Solution title",
    version: "1.0.0.0",
    publisher: "Publisher title",
  });
});

test("extracts one saved graph and retains unknown workflow node types", () => {
  const graph = extractSavedGraph({
    unrelated: { name: "Not the saved graph", nodes: [], edges: [] },
    trigger: {
      metadata: {
        associatedData: {
          graph: {
            name: "Saved",
            nodes: [
              { id: "a", name: "Start", type: "trigger" },
              { id: "b", name: "Novel", type: "future-widget", position: { x: 9, y: 3 } },
            ],
            edges: [{ source: "a", target: "b", sourceHandle: "yes" }],
          },
        },
      },
    },
  });
  const normalized = normalizeWorkflowGraph(graph);
  assert.equal(normalized.nodes[1].type, "future-widget");
  assert.equal(normalized.edges[0].sourceHandle, "yes");
});

test("rejects a workflow without exactly one saved graph", () => {
  assert.throws(() => extractSavedGraph({ name: "no graph", nodes: [] }), /exactly one saved designer graph/);
});

test("rejects invalid metadata, unsafe slugs, and symlinks", async () => {
  await writeFile(join(workspace, "submissions/demo-agent/metadata.json"), "{}");
  await assert.rejects(() => importSubmissions({ root: workspace }), SubmissionImportError);
  await setup();
  await symlink("../metadata.json", join(workspace, "submissions/demo-agent/solution/linked.xml"));
  await assert.rejects(() => importSubmissions({ root: workspace }), /symbolic links are not allowed/);
  assert.equal((await lstat(join(workspace, "submissions/demo-agent/solution/linked.xml"))).isSymbolicLink(), true);
});

test("builds deterministic solution-only zip and cleans stale outputs", async () => {
  await importSubmissions({ root: workspace });
  const solutionRoot = join(workspace, "submissions/demo-agent/solution");
  const files = [
    { absolutePath: join(solutionRoot, "customizations.xml"), path: "customizations.xml", size: 1 },
    { absolutePath: join(solutionRoot, "solution.xml"), path: "solution.xml", size: 1 },
  ];
  assert.deepEqual(deterministicZip(files, solutionRoot), deterministicZip([...files].reverse(), solutionRoot));
  const zip = new AdmZip(await (await import("node:fs/promises")).readFile(join(workspace, "public/bundles/demo-agent.zip")));
  assert.equal(zip.getEntry("metadata.json"), null);
  assert.equal(zip.getEntry("README.md"), null);
  await writeFile(join(workspace, "src/content/solutions/stale.json"), "{}");
  await writeFile(join(workspace, "src/content/guides/stale.md"), "stale");
  await mkdir(join(workspace, "public/bundles"), { recursive: true });
  await writeFile(join(workspace, "public/bundles/stale.zip"), "stale");
  await importSubmissions({ root: workspace });
  await assert.rejects(() => lstat(join(workspace, "src/content/solutions/stale.json")));
});
