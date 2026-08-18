import { readFileSync } from "node:fs";
import { readFile, readdir, lstat, mkdir, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import AdmZip from "adm-zip";
import { XMLParser } from "fast-xml-parser";
import matter from "gray-matter";
import { parse as parseYaml } from "yaml";
import {
  submissionMetadataSchema,
  type AgentPreview,
  type FileSummary,
  type GraphData,
  type GraphEdge,
  type GraphNode,
  type SolutionRecord,
  type SubmissionMetadata,
  type WorkflowPreview,
} from "../src/lib/schema";

const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_TOTAL_BYTES = 25 * 1024 * 1024;
const MAX_TEXT_BYTES = 512 * 1024;
const FIXED_ZIP_DATE = new Date(1980, 0, 1, 0, 0, 0);
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

type UnknownRecord = Record<string, unknown>;

interface SolutionFile {
  absolutePath: string;
  path: string;
  size: number;
}

interface ComponentItem {
  id: string;
  name: string;
  kind: "tool" | "skill" | "connected";
  target?: string;
  owner?: string;
  schemaName?: string;
  operation?: string;
  description?: string;
}

interface BuiltSubmission {
  slug: string;
  record: SolutionRecord;
  guide: string;
  bundle: Buffer;
}

export interface ImportReport {
  imported: string[];
  errors: Record<string, string[]>;
}

export class SubmissionImportError extends Error {
  constructor(readonly errors: Record<string, string[]>) {
    super(
      Object.entries(errors)
        .map(([slug, messages]) => `${slug}:\n${messages.map((message) => `  - ${message}`).join("\n")}`)
        .join("\n"),
    );
  }
}

function record(value: unknown): UnknownRecord | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as UnknownRecord) : undefined;
}

function strings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  return [];
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function valuesForKey(input: unknown, key: string): unknown[] {
  const result: unknown[] = [];
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    const item = record(value);
    if (!item) return;
    for (const [candidate, child] of Object.entries(item)) {
      if (candidate.replace(/^@/, "").toLowerCase() === key.replace(/^@/, "").toLowerCase()) result.push(child);
      visit(child);
    }
  };
  visit(input);
  return result;
}

function firstText(input: unknown, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = valuesForKey(input, key).flatMap(strings).find((text) => text.trim());
    if (value) return value.trim();
  }
  return undefined;
}

function field(item: UnknownRecord, ...names: string[]): unknown {
  for (const [key, value] of Object.entries(item)) {
    if (names.some((name) => key.replace(/^@/, "").toLowerCase() === name.replace(/^@/, "").toLowerCase())) return value;
  }
  return undefined;
}

function scalar(item: UnknownRecord, ...names: string[]): string | undefined {
  const value = field(item, ...names);
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  return undefined;
}

function decodeXmlEntities(value: string): string {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", "\"")
    .replaceAll("&apos;", "'");
}

function safeId(value: string, fallback: string): string {
  const normalized = value.trim().replace(/[^A-Za-z0-9_.:-]+/g, "-").replace(/^-|-$/g, "");
  return normalized || fallback;
}

function textFromNode(value: unknown): string | undefined {
  if (typeof value === "string") return value.trim() || undefined;
  const item = record(value);
  if (!item) return undefined;
  return scalar(item, "#text", "text", "description", "@description", "name", "@name")?.trim() || undefined;
}

function directLocalizedDescription(parent: UnknownRecord): string | undefined {
  const sections = field(parent, "LocalizedNames");
  const localized = (Array.isArray(sections) ? sections : [sections])
    .map(record)
    .flatMap((section) => (section ? [field(section, "LocalizedName")] : []))
    .flatMap((names) => (Array.isArray(names) ? names : [names]))
    .map(textFromNode)
    .find((value): value is string => Boolean(value));
  return localized;
}

function parser(): XMLParser {
  return new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@",
    processEntities: false,
    trimValues: true,
    parseTagValue: false,
  });
}

export function parseXml(xml: string): unknown {
  return parser().parse(xml);
}

function assertDescendant(root: string, candidate: string): void {
  const path = resolve(candidate);
  if (path !== root && !path.startsWith(`${root}${sep}`)) throw new Error(`unsafe path: ${candidate}`);
}

async function collectFiles(root: string): Promise<SolutionFile[]> {
  const resolvedRoot = resolve(root);
  const files: SolutionFile[] = [];
  let total = 0;
  const walk = async (directory: string): Promise<void> => {
    assertDescendant(resolvedRoot, directory);
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const absolutePath = join(directory, entry.name);
      assertDescendant(resolvedRoot, absolutePath);
      const stat = await lstat(absolutePath);
      if (stat.isSymbolicLink()) throw new Error(`symbolic links are not allowed: ${relative(resolvedRoot, absolutePath)}`);
      if (stat.isDirectory()) {
        await walk(absolutePath);
      } else if (stat.isFile()) {
        if (stat.size > MAX_FILE_BYTES) {
          throw new Error(`file exceeds ${MAX_FILE_BYTES} byte limit: ${relative(resolvedRoot, absolutePath)}`);
        }
        total += stat.size;
        if (total > MAX_TOTAL_BYTES) throw new Error(`solution exceeds ${MAX_TOTAL_BYTES} byte total limit`);
        files.push({ absolutePath, path: relative(resolvedRoot, absolutePath).split(sep).join("/"), size: stat.size });
      } else {
        throw new Error(`unsupported filesystem entry: ${relative(resolvedRoot, absolutePath)}`);
      }
    }
  };
  await walk(resolvedRoot);
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

async function rejectSymlinks(root: string): Promise<void> {
  const resolvedRoot = resolve(root);
  const walk = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      assertDescendant(resolvedRoot, path);
      const stat = await lstat(path);
      if (stat.isSymbolicLink()) throw new Error(`symbolic links are not allowed: ${relative(resolvedRoot, path)}`);
      if (stat.isDirectory()) await walk(path);
    }
  };
  const stat = await lstat(resolvedRoot);
  if (stat.isSymbolicLink()) throw new Error("submission directory must not be a symbolic link");
  await walk(resolvedRoot);
}

function requiredFile(files: SolutionFile[], name: string): SolutionFile {
  const file = files.find((item) => item.path.toLowerCase() === name.toLowerCase());
  if (!file) throw new Error(`missing required solution/${name}`);
  return file;
}

async function readText(file: SolutionFile): Promise<string> {
  if (file.size > MAX_TEXT_BYTES) throw new Error(`text file is too large to inspect: ${file.path}`);
  return readFile(file.absolutePath, "utf8");
}

export function deriveSolutionFields(solutionXml: unknown, _customizationsXml: unknown): {
  uniqueName: string;
  displayName: string;
  version: string;
  publisher?: string;
} {
  const manifest = valuesForKey(solutionXml, "SolutionManifest").map(record).find((value): value is UnknownRecord => Boolean(value));
  const uniqueName = manifest ? scalar(manifest, "UniqueName") : undefined;
  const version = manifest ? scalar(manifest, "Version") : undefined;
  const localized = manifest ? directLocalizedDescription(manifest) : undefined;
  const publisherNode = manifest ? record(field(manifest, "Publisher")) : undefined;
  const publisher = publisherNode
    ? directLocalizedDescription(publisherNode) ?? scalar(publisherNode, "PublisherName", "UniqueName")
    : undefined;
  if (!uniqueName) throw new Error("solution.xml does not contain SolutionManifest/UniqueName");
  if (!version) throw new Error("solution.xml does not contain SolutionManifest/Version");
  return { uniqueName, displayName: localized ?? uniqueName, version, publisher };
}

function categoryFor(path: string): string {
  const lower = path.toLowerCase();
  if (lower === "solution.xml" || lower === "customizations.xml") return "solution";
  if (lower.startsWith("bots/")) return "bot";
  if (lower.startsWith("botcomponents/")) return "component";
  if (lower.startsWith("workflows/")) return "workflow";
  if (/\.(png|jpe?g|gif|svg|ico|zip|pdf)$/i.test(lower)) return "asset";
  return "other";
}

export function filesManifest(files: SolutionFile[]): FileSummary[] {
  return files.map(({ path, size }) => ({ path, category: categoryFor(path), size }));
}

function inspectComponentValue(value: unknown, source: string): ComponentItem[] {
  const items: ComponentItem[] = [];
  const visit = (candidate: unknown, index: number): void => {
    if (Array.isArray(candidate)) {
      candidate.forEach((child, childIndex) => visit(child, childIndex));
      return;
    }
    const item = record(candidate);
    if (!item) return;
    const type = scalar(item, "$kind", "kind", "type", "@type") ?? "";
    const name = scalar(item, "name", "displayName", "toolName", "schemaName", "@name") ?? "";
    const combined = `${type} ${name}`.toLowerCase();
    const target = scalar(item, "agentName", "targetAgent", "connectedAgent", "botSchemaName", "schemaName");
    const kind: ComponentItem["kind"] | undefined = combined.includes("connectedagenttool")
      ? "connected"
      : combined.includes("skill")
        ? "skill"
        : combined.includes("tool")
          ? "tool"
          : undefined;
    if (kind) {
      const label = name || type || `${kind}-${index}`;
      const schemaName = scalar(item, "schemaName", "toolSchemaName");
      const operation = scalar(item, "operationName", "operation");
      items.push({
        id: safeId(`${source}-${label}`, `${source}-${index}`),
        name: label,
        kind,
        target,
        ...(schemaName ? { schemaName } : {}),
        ...(operation ? { operation } : {}),
      });
    }
    Object.values(item).forEach((child, childIndex) => visit(child, childIndex));
  };
  visit(value, 0);
  return items;
}

function componentOwner(value: string): string {
  return value.match(/^(.+?)\.(?:tool|skill|component)(?:\.|$)/i)?.[1]?.toLowerCase() ?? value.toLowerCase();
}

async function componentItems(files: SolutionFile[]): Promise<ComponentItem[]> {
  const result: ComponentItem[] = [];
  const directories = [...new Set(files.filter((file) => file.path.toLowerCase().startsWith("botcomponents/")).map((file) => dirname(file.path)))];
  for (const directory of directories) {
    const componentFiles = files.filter((file) => dirname(file.path) === directory);
    const definition = componentFiles.find((file) => basename(file.path).toLowerCase() === "botcomponent.xml");
    if (!definition) continue;
    try {
      const parsed = record(parseXml(await readText(definition)));
      const component = parsed ? record(field(parsed, "botcomponent")) : undefined;
      if (!component) continue;
      const componentType = scalar(component, "componenttype");
      if (componentType && componentType !== "9") continue;

      const schemaName = scalar(component, "@schemaname", "schemaname") ?? basename(directory);
      const parentBot = record(field(component, "parentbotid"));
      const owner = (parentBot ? scalar(parentBot, "schemaname", "@schemaname") : undefined) ?? componentOwner(schemaName);
      if (!owner) continue;

      const dataFile = componentFiles.find((file) => basename(file.path).toLowerCase() === "data");
      let data: UnknownRecord = {};
      if (dataFile) {
        const parsedData = parseYaml(await readText(dataFile));
        data = record(parsedData) ?? {};
      }
      if (!componentType) {
        const rootItems = inspectComponentValue(component, definition.path).map((item) => ({
          ...item,
          owner,
          schemaName,
        }));
        const dataItems = dataFile
          ? inspectComponentValue(data, dataFile.path).map((item) => ({ ...item, owner }))
          : [];
        result.push(...rootItems, ...dataItems);
        continue;
      }
      const dataKind = scalar(data, "kind", "$kind") ?? "";
      const combined = `${schemaName} ${dataKind}`.toLowerCase();
      const kind: ComponentItem["kind"] | undefined =
        combined.includes("connectedagenttool") || combined.includes(".tool.connected-agent.")
          ? "connected"
          : combined.includes(".skill.") || combined.includes("inlineagentskill")
            ? "skill"
            : combined.includes(".tool.") || combined.includes("mcptool")
              ? "tool"
              : undefined;
      if (!kind) continue;

      const rawName = scalar(component, "name") ?? schemaName;
      const description = scalar(component, "description");
      const target = scalar(data, "botSchemaName", "targetAgent", "agentName");
      const operation = scalar(data, "operationId", "operationName");
      result.push({
        id: safeId(schemaName, basename(directory)),
        name: decodeXmlEntities(rawName),
        kind,
        owner,
        schemaName,
        ...(target ? { target } : {}),
        ...(operation ? { operation } : {}),
        ...(description ? { description: decodeXmlEntities(description) } : {}),
      });
    } catch (error) {
      throw new Error(`cannot parse component ${definition.path}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return result;
}

export function layoutAgentGraph(nodes: GraphNode[], edges: GraphEdge[]): GraphData {
  const ordered = [...nodes].sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  const nodeById = new Map(ordered.map((node) => [node.id, node]));
  const agents = ordered.filter((node) => node.type === "agent");
  const agentIds = new Set(agents.map((agent) => agent.id));
  const incomingAgents = new Set(
    edges
      .filter((edge) => agentIds.has(edge.source) && agentIds.has(edge.target))
      .map((edge) => edge.target),
  );
  const roots = agents.filter((agent) => !incomingAgents.has(agent.id));
  if (roots.length === 0 && agents[0]) roots.push(agents[0]);

  const outgoing = new Map<string, string[]>();
  for (const edge of edges) {
    const targets = outgoing.get(edge.source) ?? [];
    targets.push(edge.target);
    outgoing.set(edge.source, targets);
  }
  for (const targets of outgoing.values()) {
    targets.sort((a, b) => {
      const left = nodeById.get(a);
      const right = nodeById.get(b);
      return (left?.type ?? "").localeCompare(right?.type ?? "")
        || (left?.name ?? "").localeCompare(right?.name ?? "")
        || a.localeCompare(b);
    });
  }

  const positions = new Map<string, { x: number; y: number }>();
  const centerPosition = (x: number, y: number) => ({ x: x - 112, y: y - 36 });
  const pointOnCircle = (center: { x: number; y: number }, radius: number, angle: number) => ({
    x: center.x + Math.cos(angle) * radius,
    y: center.y + Math.sin(angle) * radius,
  });

  const placeAgent = (
    agentId: string,
    center: { x: number; y: number },
    depth: number,
    outwardAngle = -Math.PI / 2,
  ): void => {
    if (positions.has(agentId)) return;
    positions.set(agentId, centerPosition(center.x, center.y));
    const children = (outgoing.get(agentId) ?? [])
      .filter((id) => nodeById.has(id) && !positions.has(id));
    const components = children.filter((id) => !agentIds.has(id));
    const connectedAgents = children.filter((id) => agentIds.has(id));
    const ringAngle = (id: string): number => {
      const index = children.indexOf(id);
      if (children.length === 1) return -Math.PI / 2;
      if (children.length === 2) return Math.PI * index;
      return -Math.PI / 2 + (Math.PI * 2 * index) / children.length;
    };

    components.forEach((id, index) => {
      const angle = depth === 0
        ? ringAngle(id)
        : outwardAngle - Math.PI / 3 + (Math.PI * 2 / 3) * ((index + 1) / (components.length + 1));
      const point = pointOnCircle(center, depth === 0 ? 220 : 170, angle);
      positions.set(id, centerPosition(point.x, point.y));
    });

    connectedAgents.forEach((id, index) => {
      const angle = depth === 0
        ? ringAngle(id)
        : connectedAgents.length === 1
          ? outwardAngle
          : outwardAngle - Math.PI / 3 + (Math.PI * 2 / 3) * ((index + 1) / (connectedAgents.length + 1));
      const point = pointOnCircle(center, depth === 0 ? 360 : 300, angle);
      placeAgent(id, point, depth + 1, angle);
    });
  };

  roots.forEach((root, index) => {
    const centerX = (index - (roots.length - 1) / 2) * 1_350;
    placeAgent(root.id, { x: centerX, y: 0 }, 0);
  });

  agents.filter((agent) => !positions.has(agent.id)).forEach((agent, index) => {
    placeAgent(agent.id, { x: index * 1_350, y: 1_100 }, 0);
  });

  const unplaced = ordered.filter((node) => !positions.has(node.id));
  unplaced.forEach((node, index) => {
    const point = pointOnCircle({ x: 0, y: 0 }, 580, -Math.PI / 2 + (Math.PI * 2 * index) / Math.max(unplaced.length, 1));
    positions.set(node.id, centerPosition(point.x, point.y));
  });

  return {
    nodes: ordered.map((node) => ({ ...node, position: positions.get(node.id) ?? node.position })),
    edges: [...edges].sort((a, b) => a.id.localeCompare(b.id)),
  };
}

export function normalizeAgentComponents(agentId: string, items: ComponentItem[]): {
  tools: ComponentItem[];
  skills: ComponentItem[];
  connected: ComponentItem[];
  nodes: GraphNode[];
  edges: GraphEdge[];
} {
  const unique = (kind: ComponentItem["kind"]) =>
    [
      ...new Map(
        items
          .filter((item) => item.kind === kind)
          .map((item) => [item.schemaName ?? item.id, item]),
      ).values(),
    ];
  const tools = unique("tool");
  const skills = unique("skill");
  const connected = unique("connected");
  const nodes: GraphNode[] = [
    ...tools.map((item) => ({
      id: `tool:${item.id}`,
      name: item.name,
      type: "tool",
      position: { x: 0, y: 0 },
      details: {
        kind: item.kind,
        ...(item.schemaName ? { schemaName: item.schemaName } : {}),
        ...(item.operation ? { operation: item.operation } : {}),
        ...(item.description ? { description: item.description } : {}),
      },
    })),
    ...skills.map((item) => ({
      id: `skill:${item.id}`,
      name: item.name,
      type: "skill",
      position: { x: 0, y: 0 },
      details: {
        kind: item.kind,
        ...(item.schemaName ? { schemaName: item.schemaName } : {}),
        ...(item.description ? { description: item.description } : {}),
      },
    })),
  ];
  const edges: GraphEdge[] = [
    ...tools.map((item) => ({ id: `${agentId}-uses-${item.id}`, source: agentId, target: `tool:${item.id}`, label: "uses" })),
    ...skills.map((item) => ({ id: `${agentId}-includes-${item.id}`, source: agentId, target: `skill:${item.id}`, label: "includes" })),
  ];
  return { tools, skills, connected, nodes, edges };
}

function readConfigStrings(config: unknown, keys: string[]): string[] {
  const found: string[] = [];
  for (const key of keys) found.push(...valuesForKey(config, key).flatMap(strings).map((value) => value.trim()).filter(Boolean));
  return [...new Set(found)];
}

function valuesAtPath(value: unknown, path: string[]): unknown[] {
  let values = [value];
  for (const segment of path) {
    values = values.flatMap((candidate) => {
      const item = record(candidate);
      const next = item ? field(item, segment) : undefined;
      return next === undefined ? [] : Array.isArray(next) ? next : [next];
    });
  }
  return values;
}

function configurationModel(config: unknown): string | undefined {
  return [
    ...valuesAtPath(config, ["agentSettings", "model", "series"]).flatMap(strings),
    ...readConfigStrings(config, ["modelName"]),
  ]
    .map((value) => value.trim())
    .find(Boolean);
}

function configurationInstructions(config: unknown): string | undefined {
  const segments = valuesAtPath(config, ["agentSettings", "instructions", "segments"])
    .flatMap((segment) => (Array.isArray(segment) ? segment : [segment]))
    .map(record)
    .flatMap((segment) => (segment ? [scalar(segment, "value")] : []))
    .filter((value): value is string => Boolean(value));
  return [...segments, ...readConfigStrings(config, ["systemPrompt", "instruction"])]
    .map((value) => value.trim())
    .filter(Boolean)
    .join("\n") || undefined;
}

function configurationChannels(config: unknown): string[] {
  const candidates = [...valuesAtPath(config, ["agentSettings", "channels"]), ...valuesForKey(config, "channels")];
  const channels = candidates.flatMap((candidate) => {
    const entries = Array.isArray(candidate) ? candidate : [candidate];
    return entries.map(record).flatMap((entry) => (entry ? [scalar(entry, "channelId", "id", "name")] : strings(entry)));
  });
  return [...new Set(channels.filter((value): value is string => Boolean(value)).map((value) => value.trim()).filter(Boolean))];
}

function componentBelongsToAgent(component: ComponentItem, schemaName: string, directory: string): boolean {
  if (!component.owner) return false;
  const owner = component.owner.toLowerCase();
  return owner === schemaName.toLowerCase() || owner === basename(directory).toLowerCase();
}

export async function inspectAgents(files: SolutionFile[]): Promise<{ agents: AgentPreview[]; graph: GraphData }> {
  const botDirectories = [...new Set(files.filter((file) => /^bots\/[^/]+\/bot\.xml$/i.test(file.path)).map((file) => dirname(file.path)))].sort();
  const components = await componentItems(files);
  const graphNodes: GraphNode[] = [];
  const graphEdges: GraphEdge[] = [];
  const agents: AgentPreview[] = [];
  for (const directory of botDirectories) {
    const bot = files.find((file) => file.path.toLowerCase() === `${directory}/bot.xml`.toLowerCase());
    if (!bot) continue;
    const id = safeId(basename(directory), `agent-${agents.length + 1}`);
    let botXml: unknown;
    try {
      botXml = parseXml(await readText(bot));
    } catch (error) {
      throw new Error(`cannot parse ${bot.path}: ${error instanceof Error ? error.message : String(error)}`);
    }
    const configFile = files.find((file) => file.path.toLowerCase() === `${directory}/configuration.json`.toLowerCase());
    let config: unknown = {};
    if (configFile) {
      try {
        config = JSON.parse(await readText(configFile));
      } catch (error) {
        throw new Error(`cannot parse ${configFile.path}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    const schemaName = firstText(botXml, ["SchemaName", "UniqueName"]) ?? id;
    const name = decodeXmlEntities(firstText(botXml, ["Name", "DisplayName"]) ?? id);
    const componentData = [
      ...components.filter((component) => componentBelongsToAgent(component, schemaName, directory)),
    ];
    const normalized = normalizeAgentComponents(`agent:${id}`, componentData);
    const model = configurationModel(config);
    const instructions = configurationInstructions(config);
    const channels = configurationChannels(config);
    const agent: AgentPreview = {
      id,
      schemaName,
      name,
      ...(model ? { model } : {}),
      ...(instructions ? { instructions: instructions.slice(0, 2_000) } : {}),
      channels,
      toolCount: normalized.tools.length,
      skillCount: normalized.skills.length,
      connectedAgentCount: normalized.connected.length,
    };
    agents.push(agent);
    graphNodes.push({
      id: `agent:${id}`,
      name,
      type: "agent",
      position: { x: 0, y: 0 },
      details: {
        ...(agent.model ? { model: agent.model } : {}),
        ...(agent.instructions ? { instructions: agent.instructions } : {}),
        channels: agent.channels,
        toolCount: agent.toolCount,
        skillCount: agent.skillCount,
        connectedAgentCount: agent.connectedAgentCount,
      },
    }, ...normalized.nodes);
    graphEdges.push(...normalized.edges);
    for (const connection of normalized.connected) {
      const targetId = `agent:${safeId(connection.target ?? connection.name, connection.id)}`;
      if (!graphNodes.some((node) => node.id === targetId)) {
        graphNodes.push({
          id: targetId,
          name: connection.target ?? connection.name,
          type: "agent",
          position: { x: 0, y: 0 },
          details: { channels: [], toolCount: 0, skillCount: 0, connectedAgentCount: 0 },
        });
      }
      graphEdges.push({ id: `agent:${id}-delegates-${connection.id}`, source: `agent:${id}`, target: targetId, label: "delegates" });
    }
  }
  return { agents, graph: layoutAgentGraph([...new Map(graphNodes.map((node) => [node.id, node])).values()], graphEdges) };
}

function workflowMappings(customizations: unknown): Map<string, { id: string; name: string }> {
  const mappings = new Map<string, { id: string; name: string }>();
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) return value.forEach(visit);
    const item = record(value);
    if (!item) return;
    const jsonFileName = scalar(item, "JsonFileName");
    const name = scalar(item, "Name");
    const id = scalar(item, "WorkflowId") ?? name;
    if (jsonFileName && name && id) mappings.set(basename(jsonFileName).toLowerCase(), { id, name });
    Object.values(item).forEach(visit);
  };
  visit(customizations);
  return mappings;
}

export function extractSavedGraph(value: unknown): UnknownRecord {
  const preferred: UnknownRecord[] = [];
  const fallback: UnknownRecord[] = [];
  const isGraph = (candidate: unknown): candidate is UnknownRecord => {
    const item = record(candidate);
    return Boolean(item && typeof item.name === "string" && Array.isArray(item.nodes) && Array.isArray(item.edges));
  };
  const visit = (candidate: unknown): void => {
    if (Array.isArray(candidate)) return candidate.forEach(visit);
    const item = record(candidate);
    if (!item) return;
    if (isGraph(item)) fallback.push(item);
    const associatedData = record(field(item, "associatedData"));
    const graph = associatedData ? field(associatedData, "graph") : undefined;
    if (isGraph(graph)) preferred.push(graph);
    Object.values(item).forEach(visit);
  };
  visit(value);
  const matches = preferred.length > 0 ? preferred : fallback;
  if (matches.length !== 1) throw new Error(`expected exactly one saved designer graph, found ${matches.length}`);
  return matches[0];
}

function safeValue(value: unknown): string | undefined {
  if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") return undefined;
  return String(value).slice(0, 400);
}

function allowedScalars(config: UnknownRecord, names: string[]): Record<string, unknown> {
  const details: Record<string, unknown> = {};
  for (const name of names) {
    const value = safeValue(field(config, name));
    if (value !== undefined) details[name] = value;
  }
  return details;
}

function safeParameters(value: unknown): Record<string, string> {
  const parameterEntries: [string, unknown][] = [];
  if (Array.isArray(value)) {
    for (const item of value.map(record)) {
      const name = item ? scalar(item, "name") : undefined;
      const parameterValue = item ? field(item, "value") : undefined;
      if (name && parameterValue !== undefined) parameterEntries.push([name, parameterValue]);
    }
  } else {
    const parameters = record(value);
    if (!parameters) return {};
    parameterEntries.push(...Object.entries(parameters));
  }
  const safe: Record<string, string> = {};
  for (const [key, parameter] of parameterEntries) {
    if (/connection|schema|icon|(?:id|guid)$/i.test(key)) continue;
    const scalarValue = safeValue(parameter);
    if (scalarValue !== undefined && Object.keys(safe).length < 25) safe[key] = scalarValue;
  }
  return safe;
}

function toolsSummary(value: unknown): string[] {
  const tools = Array.isArray(value) ? value : [];
  return tools
    .map(record)
    .flatMap((tool) => (tool ? [scalar(tool, "displayName", "name", "schemaName", "botSchemaName")] : []))
    .filter((name): name is string => Boolean(name))
    .slice(0, 20);
}

function configText(config: UnknownRecord, name: string): string | undefined {
  const value = field(config, name);
  const direct = safeValue(value);
  if (direct !== undefined) return direct;
  const item = record(value);
  if (!item) return undefined;
  const series = safeValue(field(item, "series", "value"));
  if (series !== undefined) return series;
  const segments = array(field(item, "segments"))
    .map(record)
    .flatMap((segment) => (segment ? [safeValue(field(segment, "value"))] : []))
    .filter((segment): segment is string => Boolean(segment));
  return segments.length > 0 ? segments.join("\n").slice(0, 400) : undefined;
}

function safeWorkflowDetails(node: UnknownRecord, type: string): Record<string, unknown> {
  const data = record(field(node, "data"));
  const config = data ? record(field(data, "config")) ?? data : record(field(node, "config")) ?? node;
  const lower = type.toLowerCase();
  let details: Record<string, unknown>;
  if (lower.includes("note") || scalar(config, "markdown") !== undefined) {
    details = allowedScalars(config, ["markdown", "color"]);
  } else if (lower.includes("connector") || lower.includes("openapi") || scalar(config, "apiName") !== undefined) {
    details = allowedScalars(config, ["displayName", "apiName", "operationName", "operationType"]);
    const parameters = safeParameters(field(config, "parameters"));
    if (Object.keys(parameters).length > 0) details.parameters = parameters;
  } else if (lower.includes("agent") || scalar(config, "botSchemaName") !== undefined) {
    details = allowedScalars(config, ["botSchemaName", "mode"]);
    for (const name of ["model", "instructions", "inlineInstructions"]) {
      const value = configText(config, name);
      if (value !== undefined) details[name] = value;
    }
    const tools = toolsSummary(field(config, "tools"));
    if (tools.length > 0) details.tools = tools;
  } else if (lower.includes("condition")) {
    details = allowedScalars(config, ["expression", "condition"]);
  } else if (lower.includes("loop") || lower.includes("foreach")) {
    details = allowedScalars(config, ["expression"]);
  } else if (lower.includes("variable")) {
    details = allowedScalars(config, ["name", "type", "value"]);
  } else if (lower.includes("end")) {
    details = allowedScalars(config, ["runStatus"]);
  } else if (lower.includes("classif") || lower.includes("input") || lower.includes("model")) {
    details = allowedScalars(config, ["category", "input", "model"]);
  } else if (lower.includes("trigger")) {
    details = allowedScalars(config, ["method", "operation", "description"]);
  } else {
    details = allowedScalars(config, ["category", "input", "model", "description"]);
  }
  return details;
}

export function normalizeWorkflowGraph(graph: UnknownRecord): GraphData {
  const rawNodes = array(graph.nodes).map(record).filter((node): node is UnknownRecord => Boolean(node));
  const nodes = rawNodes.map((node, index): GraphNode => {
    const id = safeId(scalar(node, "id", "nodeId") ?? `node-${index + 1}`, `node-${index + 1}`);
    const data = record(field(node, "data"));
    const name = scalar(node, "name", "displayName", "label") ?? (data ? scalar(data, "name", "displayName", "label") : undefined) ?? id;
    const type = scalar(node, "type", "kind") ?? (data ? scalar(data, "type", "kind") : undefined) ?? "generic";
    const position = record(field(node, "position", "layout"));
    const x = Number(scalar(position ?? {}, "x") ?? scalar(node, "x") ?? index * 220);
    const y = Number(scalar(position ?? {}, "y") ?? scalar(node, "y") ?? 0);
    return { id, name, type, position: { x: Number.isFinite(x) ? x : index * 220, y: Number.isFinite(y) ? y : 0 }, details: safeWorkflowDetails(node, type) };
  });
  const knownIds = new Set(nodes.map((node) => node.id));
  const edges = array(graph.edges).map(record).filter((edge): edge is UnknownRecord => Boolean(edge)).flatMap((edge, index): GraphEdge[] => {
    const source = safeId(scalar(edge, "source") ?? "", "");
    const target = safeId(scalar(edge, "target") ?? "", "");
    if (!source || !target || !knownIds.has(source) || !knownIds.has(target)) return [];
    const sourceHandle = scalar(edge, "sourceHandle");
    const targetHandle = scalar(edge, "targetHandle");
    return [{ id: safeId(scalar(edge, "id") ?? `${source}-${target}-${index}`, `edge-${index}`), source, target, ...(sourceHandle ? { sourceHandle } : {}), ...(targetHandle ? { targetHandle } : {}) }];
  });
  return { nodes, edges };
}

export async function inspectWorkflows(files: SolutionFile[], customizations: unknown): Promise<WorkflowPreview[]> {
  const mappings = workflowMappings(customizations);
  const workflowFiles = files.filter((file) => /^workflows\/[^/]+\.json$/i.test(file.path));
  const workflows: WorkflowPreview[] = [];
  for (const file of workflowFiles) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(await readText(file));
    } catch (error) {
      throw new Error(`cannot parse workflow ${file.path}: ${error instanceof Error ? error.message : String(error)}`);
    }
    let saved: UnknownRecord;
    try {
      saved = extractSavedGraph(parsed);
    } catch (error) {
      throw new Error(`${file.path}: ${error instanceof Error ? error.message : String(error)}`);
    }
    const graph = normalizeWorkflowGraph(saved);
    const mapping = mappings.get(basename(file.path).toLowerCase());
    const starting = graph.nodes.find((node) => !graph.edges.some((edge) => edge.target === node.id) || /trigger|start/i.test(node.type));
    workflows.push({
      id: mapping?.id ?? safeId(basename(file.path, ".json"), `workflow-${workflows.length + 1}`),
      name: mapping?.name ?? String(saved.name),
      ...(starting ? { trigger: starting.name } : {}),
      nodeCount: graph.nodes.length,
      edgeCount: graph.edges.length,
      graph,
    });
  }
  return workflows.sort((a, b) => a.name.localeCompare(b.name));
}

function rootComponentCount(customizations: unknown): number | undefined {
  const roots = valuesForKey(customizations, "RootComponents");
  for (const root of roots) {
    const components = valuesForKey(root, "RootComponent");
    const count = components.reduce<number>(
      (total, component) => total + (Array.isArray(component) ? component.length : 1),
      0,
    );
    if (count > 0) return count;
  }
  return undefined;
}

export function deterministicZip(files: SolutionFile[], solutionRoot: string): Buffer {
  const zip = new AdmZip();
  for (const file of [...files].sort((a, b) => a.path.localeCompare(b.path))) {
    const archivePath = file.path.replaceAll("\\", "/");
    if (archivePath.startsWith("/") || archivePath.split("/").includes("..")) throw new Error(`unsafe archive path: ${archivePath}`);
    assertDescendant(resolve(solutionRoot), file.absolutePath);
    const data = readFileSync(file.absolutePath);
    zip.addFile(archivePath, data, "", 0o100644);
  }
  for (const entry of zip.getEntries()) {
    entry.header.time = FIXED_ZIP_DATE;
    entry.header.attr = 0o100644;
  }
  return zip.toBuffer();
}

async function buildSubmission(repositoryRoot: string, slug: string): Promise<BuiltSubmission> {
  if (!slugPattern.test(slug)) throw new Error("slug must be lowercase kebab-case");
  const submissionPath = resolve(repositoryRoot, "submissions", slug);
  const solutionRoot = resolve(submissionPath, "solution");
  assertDescendant(resolve(repositoryRoot, "submissions"), submissionPath);
  await rejectSymlinks(submissionPath);
  const metadataPath = join(submissionPath, "metadata.json");
  let metadata: SubmissionMetadata;
  try {
    metadata = submissionMetadataSchema.parse(JSON.parse(await readFile(metadataPath, "utf8")));
  } catch (error) {
    const description = error instanceof Error ? error.message : String(error);
    throw new Error(`invalid metadata.json: ${description}`);
  }
  let files: SolutionFile[];
  try {
    const stat = await lstat(solutionRoot);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("solution must be a directory and not a symbolic link");
    files = await collectFiles(solutionRoot);
  } catch (error) {
    throw new Error(`invalid solution payload: ${error instanceof Error ? error.message : String(error)}`);
  }
  const solutionXml = parseXml(await readText(requiredFile(files, "solution.xml")));
  const customizationsXml = parseXml(await readText(requiredFile(files, "customizations.xml")));
  const derived = deriveSolutionFields(solutionXml, customizationsXml);
  const [{ agents, graph }, workflows] = await Promise.all([inspectAgents(files), inspectWorkflows(files, customizationsXml)]);
  if (agents.length === 0 && workflows.length === 0) throw new Error("solution must contain at least one agent or workflow");
  const manifest = filesManifest(files);
  const componentCount = rootComponentCount(solutionXml) ?? manifest.filter((file) => ["bot", "component", "workflow"].includes(file.category)).length;
  const record: SolutionRecord = {
    ...metadata,
    uniqueName: derived.uniqueName,
    version: derived.version,
    ...(derived.publisher ? { publisher: derived.publisher } : {}),
    bundle: `bundles/${slug}.zip`,
    agentCount: agents.length,
    workflowCount: workflows.length,
    componentCount,
    agents,
    agentGraph: graph,
    workflows,
    files: manifest,
  };
  const readmePath = join(submissionPath, "README.md");
  let body = `# ${metadata.name}\n\n${metadata.description}\n`;
  try {
    body = matter(await readFile(readmePath, "utf8")).content.trim() || body;
  } catch {
    // README is optional.
  }
  const guideBody = body.trim().replace(/^#\s+.+?(?:\r?\n){1,2}/, "");
  const guide = matter.stringify(`${guideBody}\n`, { title: metadata.name, slug, solution: derived.uniqueName });
  return { slug, record, guide, bundle: deterministicZip(files, solutionRoot) };
}

async function existingSlugs(directory: string, extension: string): Promise<string[]> {
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    return entries.filter((entry) => entry.isFile() && entry.name.endsWith(extension)).map((entry) => basename(entry.name, extension));
  } catch {
    return [];
  }
}

async function writeIfChanged(path: string, content: Buffer | string): Promise<void> {
  let existing: Buffer | undefined;
  try {
    existing = await readFile(path);
  } catch {
    // Missing is handled below.
  }
  const expected = typeof content === "string" ? Buffer.from(content) : content;
  if (!existing || !existing.equals(expected)) {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, expected);
  }
}

export async function importSubmissions(options: { root?: string; check?: boolean } = {}): Promise<ImportReport> {
  const root = resolve(options.root ?? process.cwd());
  const submissionsRoot = join(root, "submissions");
  const errors: Record<string, string[]> = {};
  let entries: string[] = [];
  try {
    entries = (await readdir(submissionsRoot, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith("_") && !entry.name.startsWith("."))
      .map((entry) => entry.name)
      .sort();
  } catch {
    entries = [];
  }
  const built: BuiltSubmission[] = [];
  for (const slug of entries) {
    try {
      built.push(await buildSubmission(root, slug));
    } catch (error) {
      (errors[slug] ??= []).push(error instanceof Error ? error.message : String(error));
    }
  }
  if (Object.keys(errors).length > 0) throw new SubmissionImportError(errors);
  if (options.check) return { imported: built.map((item) => item.slug), errors };
  const solutionDir = join(root, "src/content/solutions");
  const guideDir = join(root, "src/content/guides");
  const bundleDir = join(root, "public/bundles");
  for (const submission of built) {
    await writeIfChanged(join(solutionDir, `${submission.slug}.json`), `${JSON.stringify(submission.record, null, 2)}\n`);
    await writeIfChanged(join(guideDir, `${submission.slug}.md`), submission.guide);
    await writeIfChanged(join(bundleDir, `${submission.slug}.zip`), submission.bundle);
  }
  const expectedSlugs = new Set(built.map((item) => item.slug));
  for (const [directory, extension] of [[solutionDir, ".json"], [guideDir, ".md"], [bundleDir, ".zip"]] as const) {
    for (const slug of await existingSlugs(directory, extension)) {
      if (expectedSlugs.has(slug) || slug === ".gitkeep") continue;
      await rm(join(directory, `${slug}${extension}`));
    }
  }
  if (Object.keys(errors).length > 0) throw new SubmissionImportError(errors);
  return { imported: built.map((item) => item.slug), errors };
}

const isCli = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  const check = process.argv.slice(2).includes("--check");
  importSubmissions({ check })
    .then((report) => console.log(`${check ? "Checked" : "Imported"} ${report.imported.length} submission(s).`))
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
