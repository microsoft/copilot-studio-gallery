import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cp, lstat, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import AdmZip from "adm-zip";
import { collectCategories } from "../src/lib/catalog";
import { isMcpNode } from "../src/lib/graphVisuals";
import { solutionSchema } from "../src/lib/schema";
import {
  SubmissionImportError,
  deriveSolutionFields,
  deterministicZip,
  extractSavedGraph,
  importSubmissions,
  inspectConnectors,
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
  assert.equal(record.category, "Customer service");
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
  assert.equal(record.previewWorkflow, record.workflows[0].id);
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

test("selects a non-first hero workflow by ID or name and publishes its canonical ID", async () => {
  const submission = join(workspace, "submissions/demo-agent");
  const metadataPath = join(submission, "metadata.json");
  const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
  const customizationsPath = join(submission, "solution/customizations.xml");
  await cp(join(submission, "solution/Workflows/branched.json"), join(submission, "solution/Workflows/alternate.json"));
  const customizations = await readFile(customizationsPath, "utf8");
  await writeFile(customizationsPath, customizations.replace("</Workflows>", "<Workflow><Name>Second workflow</Name><JsonFileName>alternate.json</JsonFileName><WorkflowId>workflow-002</WorkflowId></Workflow></Workflows>"));

  for (const previewWorkflow of ["workflow-002", "  Second workflow  "]) {
    await writeFile(metadataPath, JSON.stringify({ ...metadata, previewWorkflow }));
    await importSubmissions({ root: workspace });
    const record = JSON.parse(await readFile(join(workspace, "src/content/solutions/demo-agent.json"), "utf8"));
    assert.equal(record.workflows[0].id, "workflow-001");
    assert.equal(record.previewWorkflow, "workflow-002");
    const zip = new AdmZip(await readFile(join(workspace, "public/bundles/demo-agent.zip")));
    assert.equal(zip.getEntry("metadata.json"), null);
  }
});

test("rejects invalid hero selections rather than falling back to another workflow", async () => {
  const metadataPath = join(workspace, "submissions/demo-agent/metadata.json");
  const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
  for (const previewWorkflow of ["missing-workflow", "", "   ", 7, null]) {
    await writeFile(metadataPath, JSON.stringify({ ...metadata, previewWorkflow }));
    await assert.rejects(() => importSubmissions({ root: workspace, check: true }), /previewWorkflow/);
  }
});

test("rejects missing hero selections in both CI command paths without writing artifacts", async () => {
  const metadataPath = join(workspace, "submissions/demo-agent/metadata.json");
  const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
  delete metadata.previewWorkflow;
  await writeFile(metadataPath, JSON.stringify(metadata));

  for (const check of [false, true]) {
    await assert.rejects(() => importSubmissions({ root: workspace, check }), /previewWorkflow is required in metadata\.json/);
    const result = spawnSync(process.execPath, [
      "--import", "tsx", join(process.cwd(), "scripts/import-submissions.ts"), ...(check ? ["--check"] : []),
    ], { cwd: workspace, encoding: "utf8", timeout: 30_000 });
    assert.ifError(result.error);
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /demo-agent/);
    assert.match(result.stderr, /previewWorkflow is required in metadata\.json/);
    assert.equal(result.stdout, "");
  }
  await assert.rejects(() => lstat(join(workspace, "src/content/solutions/demo-agent.json")));
  await assert.rejects(() => lstat(join(workspace, "src/content/guides/demo-agent.md")));
  await assert.rejects(() => lstat(join(workspace, "public/bundles/demo-agent.zip")));
});

test("generated content requires a valid hero ID only when workflows are present", async () => {
  await importSubmissions({ root: workspace });
  const record = JSON.parse(await readFile(join(workspace, "src/content/solutions/demo-agent.json"), "utf8"));
  solutionSchema.parse(record);
  assert.throws(() => solutionSchema.parse({ ...record, previewWorkflow: undefined }), /previewWorkflow is required/);
  assert.throws(() => solutionSchema.parse({ ...record, previewWorkflow: "missing" }), /previewWorkflow must identify/);
  assert.throws(() => solutionSchema.parse({ ...record, previewWorkflow: "Branched workflow" }), /previewWorkflow must identify/);
  const agentOnly = { ...record, workflows: [], workflowCount: 0, previewWorkflow: undefined };
  solutionSchema.parse(agentOnly);
  assert.throws(() => solutionSchema.parse({ ...agentOnly, previewWorkflow: record.previewWorkflow }), /previewWorkflow must identify/);
});

test("imports a hackathon award and rejects unknown awards", async () => {
  const metadataPath = join(workspace, "submissions/demo-agent/metadata.json");
  const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
  await writeFile(metadataPath, JSON.stringify({ ...metadata, hackathon: "winner" }));
  await importSubmissions({ root: workspace });
  const record = JSON.parse(await readFile(join(workspace, "src/content/solutions/demo-agent.json"), "utf8"));
  assert.equal(solutionSchema.parse(record).hackathon, "winner");

  await writeFile(metadataPath, JSON.stringify({ ...metadata, hackathon: "champion" }));
  await assert.rejects(() => importSubmissions({ root: workspace, check: true }), /hackathon must be one of/);
});

test("keeps agent-only submissions valid but rejects a workflow selection on them", async () => {
  const metadataPath = join(workspace, "submissions/demo-agent/metadata.json");
  const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
  delete metadata.previewWorkflow;
  await writeFile(metadataPath, JSON.stringify(metadata));
  await rm(join(workspace, "submissions/demo-agent/solution/Workflows/branched.json"));
  await importSubmissions({ root: workspace, check: true });
  await importSubmissions({ root: workspace });
  const record = JSON.parse(await readFile(join(workspace, "src/content/solutions/demo-agent.json"), "utf8"));
  assert.equal(record.previewWorkflow, undefined);
  await writeFile(metadataPath, JSON.stringify({ ...metadata, previewWorkflow: "workflow-001" }));
  await assert.rejects(() => importSubmissions({ root: workspace, check: true }), /previewWorkflow.*does not match/);
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

test("seeded demos satisfy the explicit hero requirement", async () => {
  const result = spawnSync(process.execPath, [
    "--import", "tsx", join(process.cwd(), "scripts/seed-demo-submissions.ts"),
  ], { cwd: workspace, encoding: "utf8", timeout: 30_000 });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  const report = await importSubmissions({ root: workspace, check: true });
  assert.ok(report.imported.includes("customer-support-triage"));
  assert.ok(report.imported.includes("invoice-exception-handler"));
  assert.ok(report.imported.includes("knowledge-gap-finder"));
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

test("distinguishes MCP servers from ordinary tools and connectors", () => {
  assert.equal(isMcpNode({
    id: "tool:mcp",
    name: "Warehouse MCP Server",
    type: "tool",
    position: { x: 0, y: 0 },
    details: { operation: "InvokeMCP" },
  }), true);
  assert.equal(isMcpNode({
    id: "connector:email",
    name: "Send email",
    type: "connector",
    position: { x: 0, y: 0 },
    details: { operation: "send" },
  }), false);
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

test("preserves saved loop containers and relative child positions, ordering parents first", () => {
  const graph = normalizeWorkflowGraph({
    nodes: [
      { id: "keep-price", name: "Set SKU: Keep price", type: "variable", parentId: "loop", position: { x: 396, y: 439 }, measured: { width: 240, height: 66 }, data: { config: {} } },
      { id: "start", name: "Start", type: "start", position: { x: 248, y: 461 } },
      { id: "loop", name: "Loop over each active SKU", type: "loop", position: { x: 1248, y: 301 }, width: 1907, height: 697, style: { background: "private-style" } },
      { id: "note", type: "canvasNote", parentId: "loop", position: { x: 900, y: 400 } },
    ],
    edges: [
      { id: "enter", source: "start", target: "loop", targetHandle: "external-input" },
      { id: "iterate", source: "loop", target: "keep-price", sourceHandle: "internal-source" },
      { id: "return", source: "keep-price", target: "loop", targetHandle: "internal-target" },
    ],
  });
  assert.deepEqual(graph.nodes.map((node) => node.id), ["loop", "keep-price", "start"]);
  assert.deepEqual(graph.nodes[0], {
    id: "loop", name: "Loop over each active SKU", type: "loop", position: { x: 1248, y: 301 },
    width: 1907, height: 697, details: {},
  });
  assert.deepEqual(graph.nodes[1], {
    id: "keep-price", name: "Set SKU: Keep price", type: "variable", position: { x: 396, y: 439 },
    parentId: "loop", details: {},
  });
  assert.equal(graph.edges[0].targetHandle, "external-input");
  assert.equal(graph.edges[1].sourceHandle, "internal-source");
  assert.equal(graph.edges[2].targetHandle, "internal-target");
  assert.equal(JSON.stringify(graph).includes("private-style"), false);
});

test("preserves nested containers with saved measured dimensions and legacy parentNode references", () => {
  const graph = normalizeWorkflowGraph({
    nodes: [
      { id: "step", type: "connector", parentId: "inner", position: { x: 40, y: 80 } },
      { id: "inner", type: "loop", parentNode: "outer", position: { x: 80, y: 120 }, measured: { width: 500, height: 300 } },
      { id: "outer", type: "loop", position: { x: 1000, y: 500 }, measured: { width: 1000, height: 600 } },
    ],
    edges: [],
  });
  assert.deepEqual(graph.nodes.map(({ id, parentId, position, width, height }) => ({ id, parentId, position, width, height })), [
    { id: "outer", parentId: undefined, position: { x: 1000, y: 500 }, width: 1000, height: 600 },
    { id: "inner", parentId: "outer", position: { x: 80, y: 120 }, width: 500, height: 300 },
    { id: "step", parentId: "inner", position: { x: 40, y: 80 }, width: undefined, height: undefined },
  ]);
});

test("rejects broken workflow hierarchies instead of overlapping children on the main canvas", () => {
  assert.throws(() => normalizeWorkflowGraph({ nodes: [{ id: "step", parentId: "missing" }], edges: [] }), /missing container missing/);
  assert.throws(() => normalizeWorkflowGraph({ nodes: [{ id: "step" }, { id: "step" }], edges: [] }), /duplicate node ids/);
  assert.throws(() => normalizeWorkflowGraph({
    nodes: [
      { id: "a", parentId: "b", width: 600, height: 400 },
      { id: "b", parentId: "a", width: 600, height: 400 },
    ],
    edges: [],
  }), /hierarchy contains a cycle/);
  for (const width of [undefined, 0, -1, "Infinity", "not a number"]) {
    assert.throws(() => normalizeWorkflowGraph({
      nodes: [{ id: "loop", width, height: 400 }, { id: "step", parentId: "loop" }],
      edges: [],
    }), /missing valid saved dimensions/);
  }
});

test("drops designer notes from workflow graphs", () => {
  const graph = normalizeWorkflowGraph({
    nodes: [
      { id: "start", name: "Start", type: "start", position: { x: 0, y: 0 } },
      { id: "note", name: "Remember this", type: "canvasNote", position: { x: 50, y: 50 } },
      { id: "end", name: "End", type: "end", position: { x: 100, y: 0 } },
    ],
    edges: [
      { id: "flow", source: "start", target: "end" },
      { id: "annotation", source: "note", target: "end" },
    ],
  });
  assert.deepEqual(graph.nodes.map((node) => node.id), ["start", "end"]);
  assert.deepEqual(graph.edges.map((edge) => edge.id), ["flow"]);
});

test("reads custom connectors packaged in the solution and flags MCP servers", async () => {
  const connectorDir = join(workspace, "connector-check/Connector");
  await mkdir(connectorDir, { recursive: true });
  const definitions = {
    "new_warehouse-20mcp": { info: { title: "Warehouse MCP", description: "Stock and fulfilment tools." }, paths: { "/mcp": { post: { "x-ms-agentic-protocol": "mcp-streamable-1.0" } } } },
    "new_weather": { info: { title: "Weather API" }, paths: { "/forecast": { get: {} } } },
  };
  const files = [];
  for (const [id, definition] of Object.entries(definitions)) {
    const absolutePath = join(connectorDir, `${id}_openapidefinition.json`);
    await writeFile(absolutePath, JSON.stringify(definition));
    files.push({ absolutePath, path: `Connector/${id}_openapidefinition.json`, size: 1 });
  }
  files.push({ absolutePath: join(connectorDir, "ignored.csx"), path: "Connector/new_weather_customcodeblobcontent.csx", size: 1 });
  assert.deepEqual(await inspectConnectors(files), [
    { id: "new_warehouse-20mcp", name: "Warehouse MCP", description: "Stock and fulfilment tools.", mcp: true },
    { id: "new_weather", name: "Weather API", mcp: false },
  ]);
});

test("accepts a missing category but only one category from the fixed list", async () => {
  const metadataPath = join(workspace, "submissions/demo-agent/metadata.json");
  const { readFile } = await import("node:fs/promises");
  const { category: _omitted, ...withoutCategory } = JSON.parse(await readFile(metadataPath, "utf8"));
  await writeFile(metadataPath, JSON.stringify(withoutCategory));
  await importSubmissions({ root: workspace, check: true });
  const metadata = withoutCategory;
  for (const category of ["", "Not a category", "Agent building", "agent building", "Agent Building ", ["HR"]]) {
    await writeFile(metadataPath, JSON.stringify({ ...metadata, category }));
    await assert.rejects(() => importSubmissions({ root: workspace, check: true }), /invalid metadata\.json/);
  }
  await writeFile(metadataPath, JSON.stringify({ ...metadata, category: "Finance" }));
  await importSubmissions({ root: workspace, check: true });
});

test("imports Agent Building into generated content and category discovery", async () => {
  const metadataPath = join(workspace, "submissions/demo-agent/metadata.json");
  const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
  await writeFile(metadataPath, JSON.stringify({ ...metadata, category: "Agent Building" }));
  await importSubmissions({ root: workspace, check: true });
  await importSubmissions({ root: workspace });
  const record = solutionSchema.parse(JSON.parse(await readFile(join(workspace, "src/content/solutions/demo-agent.json"), "utf8")));
  assert.equal(record.category, "Agent Building");
  const categories = new Map(collectCategories([{ id: "demo-agent", collection: "solutions", data: record }]));
  assert.equal(categories.get("Agent Building"), 1);
  assert.equal(categories.get("Customer service"), 0);
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
