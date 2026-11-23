import {
  BookOpen,
  Calendar,
  Code,
  Flag,
  Globe,
  Heart,
  Lightbulb,
  Megaphone,
  Rocket,
  Settings,
  ShieldCheck,
  Star,
  Target,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { WIDE_SCRIPT, measureTextWidth, type TextFont } from "@/lib/text-measure";
import { UserFacingError } from "@/lib/app-errors";
import { MAX_MAP_DEPTH, MAX_MAP_NODES, assertTextSize } from "@/lib/map-limits";

// ---------- Model ----------

export type NodeSize = "small" | "medium" | "large";
export type Importance = "low" | "medium" | "high";

/** A side of a node: the one its branch grows towards, or the one of its parent it sits on. */
export type Direction = "right" | "down" | "left" | "up";
/** Clockwise from the right, matching screen angles (y grows downwards). */
export const DIRECTIONS: readonly Direction[] = ["right", "down", "left", "up"];
export const DIRECTION_LABEL: Record<Direction, string> = { right: "Right", down: "Down", left: "Left", up: "Up" };

export function isDirection(value: unknown): value is Direction {
  return typeof value === "string" && (DIRECTIONS as readonly string[]).includes(value);
}

/** Where a hand-placed node sits: its centre relative to its parent's centre, in map pixels. */
export interface NodeOffset {
  x: number;
  y: number;
}

/**
 * An association: a dotted line from the node that carries it to another node, usually in a different
 * branch, to show the two are related without making one part of the other. It reads from the carrying
 * node to `to`, so a label such as "depends on" has a direction.
 */
export interface NodeLink {
  /** The node the link leads to. */
  to: string;
  /** A short note on the relation ("depends on"); empty for a bare line. */
  label: string;
}

export interface MindNode {
  id: string;
  parentId: string | null;
  children: string[];
  label: string;
  /** Plain text with **bold**, *italic*, `code` and [links](https://…). */
  description: string;
  color: string;
  icon: string | null;
  size: NodeSize;
  importance: Importance;
  collapsed: boolean;
  /** Lower-case keywords for finding and filtering, sorted and without duplicates (see `normalizeTag`). */
  tags: string[];
  /** Association links leading from this node, sorted by target and never two to the same node (see `normalizeLinks`). */
  links: NodeLink[];
  /** Set once the node was dragged into place; absent nodes follow the automatic layout. */
  offset?: NodeOffset;
  /**
   * The side the node's branch grows towards, locked: its children line up on that side wherever the node
   * is dragged. Absent nodes grow away from their parent — the side of it they sit on.
   */
  dir?: Direction;
}

export interface MindMap {
  rootId: string;
  nodes: Record<string, MindNode>;
}

export interface NodeColor {
  name: string;
  /** Background + text classes for a node body (white on a -700 shade, or brand tokens). */
  fill: string;
  /** Stroke classes for the connector leading into the node. */
  stroke: string;
}

const BRAND_COLOR: NodeColor = {
  name: "Brand",
  fill: "bg-primary text-primary-foreground",
  stroke: "stroke-primary",
};

export const NODE_COLORS: Record<string, NodeColor> = {
  brand: BRAND_COLOR,
  sky: { name: "Sky", fill: "bg-sky-700 text-white", stroke: "stroke-sky-600 dark:stroke-sky-400" },
  teal: { name: "Teal", fill: "bg-teal-700 text-white", stroke: "stroke-teal-600 dark:stroke-teal-400" },
  emerald: { name: "Emerald", fill: "bg-emerald-700 text-white", stroke: "stroke-emerald-600 dark:stroke-emerald-400" },
  lime: { name: "Lime", fill: "bg-lime-700 text-white", stroke: "stroke-lime-600 dark:stroke-lime-400" },
  amber: { name: "Amber", fill: "bg-amber-700 text-white", stroke: "stroke-amber-600 dark:stroke-amber-400" },
  orange: { name: "Orange", fill: "bg-orange-700 text-white", stroke: "stroke-orange-600 dark:stroke-orange-400" },
  rose: { name: "Rose", fill: "bg-rose-700 text-white", stroke: "stroke-rose-600 dark:stroke-rose-400" },
  fuchsia: { name: "Fuchsia", fill: "bg-fuchsia-700 text-white", stroke: "stroke-fuchsia-600 dark:stroke-fuchsia-400" },
  violet: { name: "Violet", fill: "bg-violet-700 text-white", stroke: "stroke-violet-600 dark:stroke-violet-400" },
  slate: { name: "Graphite", fill: "bg-slate-700 text-white", stroke: "stroke-slate-500 dark:stroke-slate-400" },
};
export const COLOR_KEYS = Object.keys(NODE_COLORS);

export function getColor(key: string): NodeColor {
  return NODE_COLORS[key] ?? BRAND_COLOR;
}

export interface NodeIcon {
  name: string;
  Icon: LucideIcon;
  aliases: string[];
}

export const NODE_ICONS: Record<string, NodeIcon> = {
  lightbulb: { name: "Idea", Icon: Lightbulb, aliases: ["idea", "bulb"] },
  target: { name: "Goal", Icon: Target, aliases: ["goal", "bullseye"] },
  flag: { name: "Milestone", Icon: Flag, aliases: ["milestone"] },
  star: { name: "Star", Icon: Star, aliases: ["favorite"] },
  book: { name: "Book", Icon: BookOpen, aliases: ["read", "docs"] },
  users: { name: "People", Icon: Users, aliases: ["people", "team", "group"] },
  rocket: { name: "Launch", Icon: Rocket, aliases: ["launch"] },
  heart: { name: "Heart", Icon: Heart, aliases: ["love"] },
  settings: { name: "Settings", Icon: Settings, aliases: ["cog", "gear"] },
  calendar: { name: "Calendar", Icon: Calendar, aliases: ["date", "schedule"] },
  code: { name: "Code", Icon: Code, aliases: ["dev", "terminal"] },
  globe: { name: "Globe", Icon: Globe, aliases: ["world", "web"] },
  megaphone: { name: "Announcement", Icon: Megaphone, aliases: ["bullhorn", "marketing"] },
  shield: { name: "Security", Icon: ShieldCheck, aliases: ["security", "lock"] },
  wallet: { name: "Budget", Icon: Wallet, aliases: ["money", "budget", "dollar"] },
};
export const ICON_KEYS = Object.keys(NODE_ICONS);

export function getIcon(key: string | null): NodeIcon | undefined {
  return key ? NODE_ICONS[key] : undefined;
}

export const SIZE_LABEL: Record<NodeSize, string> = { small: "Small", medium: "Medium", large: "Large" };
export const IMPORTANCE_LABEL: Record<Importance, string> = { low: "Low", medium: "Medium", high: "High" };

// ---------- Tags ----------
// A tag is a short lower-case keyword. In the file a node's tags sit on one `%% @tags a, b` comment line
// (see the codec), so the same spelling rules apply to tags typed in the inspector and tags read from a file.

/** Longest tag kept; the rest is cut off. */
export const TAG_MAX_LENGTH = 40;
/** Most tags one node carries. */
export const MAX_TAGS_PER_NODE = 24;
/** Everything a tag may not contain: anything but letters, marks, digits, `-`, `_`, `.`, `+` and `/`. */
const TAG_DISALLOWED = /[^\p{L}\p{M}\p{N}\-_.+/]/gu;

/**
 * One tag as it is stored and written: trimmed, a leading `#` dropped, lower-case, inner whitespace turned
 * into hyphens, disallowed characters removed, hyphen runs collapsed, and cut to `TAG_MAX_LENGTH`.
 * `null` when nothing is left — so `#`, `,` or an empty string add no tag.
 */
export function normalizeTag(raw: string): string | null {
  const tag = raw
    .trim()
    .replace(/^#+/, "")
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(TAG_DISALLOWED, "")
    .replace(/-{2,}/g, "-")
    .slice(0, TAG_MAX_LENGTH)
    .replace(/^-+|-+$/g, "");
  return tag || null;
}

/** Tags cleaned, without duplicates and sorted, so one set of tags always reads and writes the same way. */
export function normalizeTags(raw: readonly string[]): string[] {
  const seen = new Set<string>();
  for (const entry of raw) {
    const tag = normalizeTag(entry);
    if (tag) seen.add(tag);
  }
  return [...seen].sort().slice(0, MAX_TAGS_PER_NODE);
}

/** Tags from a comma-separated list — as typed, or as read from a `%% @tags` line. */
export function parseTagList(text: string): string[] {
  return normalizeTags(text.split(","));
}

const sameTags = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((tag, i) => tag === b[i]);

/** The same map with every node's tags present and normalised — a draft stored before tags existed has none. */
export function withNormalizedTags(map: MindMap): MindMap {
  const nodes: Record<string, MindNode> = {};
  let changed = false;
  for (const node of Object.values(map.nodes)) {
    const raw: unknown = (node as Partial<MindNode>).tags;
    const given = Array.isArray(raw) ? raw.filter((tag): tag is string => typeof tag === "string") : [];
    const tags = normalizeTags(given);
    if (Array.isArray(raw) && sameTags(given, tags) && given.length === raw.length) {
      nodes[node.id] = node;
    } else {
      nodes[node.id] = { ...node, tags };
      changed = true;
    }
  }
  return changed ? { ...map, nodes } : map;
}

// ---------- Links ----------
// A link lives on the node it leads from. In the file it is one `%% @link <target> | <label>` comment line
// under that node (see the codec), so a link needs nothing but a target the file also has. Links never
// place a node: the layout ignores them, and they are routed around the placed nodes afterwards.

/** Longest link label kept; the rest is cut off. */
export const LINK_LABEL_MAX_LENGTH = 60;

/** A link label as it is stored and written: one line, single spaces, trimmed, cut to `LINK_LABEL_MAX_LENGTH`. */
export function normalizeLinkLabel(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().slice(0, LINK_LABEL_MAX_LENGTH).trim();
}

/** The identity of a link, as the canvas and the inspector name it. */
export function linkId(from: string, to: string): string {
  return `${from}\u2192${to}`;
}

/** A link with the node it leads from, as the canvas and inspector list them. */
export interface MapLink extends NodeLink {
  id: string;
  from: string;
}

/**
 * Links cleaned for one node: labels normalised, self-links and links to nodes not in the map dropped, one
 * link per target (the first wins), sorted by target so the same set always reads and writes the same way.
 */
export function normalizeLinks(id: string, raw: readonly NodeLink[], nodes: Record<string, MindNode>): NodeLink[] {
  const byTarget = new Map<string, NodeLink>();
  for (const entry of raw) {
    if (!entry || typeof entry.to !== "string" || entry.to === id || !nodes[entry.to] || byTarget.has(entry.to)) continue;
    byTarget.set(entry.to, { to: entry.to, label: normalizeLinkLabel(typeof entry.label === "string" ? entry.label : "") });
  }
  return [...byTarget.values()].sort((a, b) => (a.to < b.to ? -1 : a.to > b.to ? 1 : 0));
}

const sameLinks = (a: readonly NodeLink[], b: readonly NodeLink[]) => a.length === b.length && a.every((link, i) => link.to === b[i].to && link.label === b[i].label);

/**
 * The same map with every node's links present and valid — a draft stored before links existed has none, and
 * a link whose target is gone (deleted on one side of a merge, say) goes with it.
 */
export function withValidLinks(map: MindMap): MindMap {
  const nodes: Record<string, MindNode> = {};
  let changed = false;
  for (const node of Object.values(map.nodes)) {
    const raw: unknown = (node as Partial<MindNode>).links;
    const given = Array.isArray(raw) ? (raw as NodeLink[]) : [];
    const links = normalizeLinks(node.id, given, map.nodes);
    if (Array.isArray(raw) && sameLinks(given, links)) {
      nodes[node.id] = node;
    } else {
      nodes[node.id] = { ...node, links };
      changed = true;
    }
  }
  return changed ? { ...map, nodes } : map;
}

/** Every link in the map, in tree order of the node it leads from. */
export function allLinks(map: MindMap): MapLink[] {
  const links: MapLink[] = [];
  const seen = new Set<string>();
  const stack = [map.rootId];
  while (stack.length) {
    const id = stack.pop() as string;
    if (seen.has(id)) continue;
    seen.add(id);
    const node = map.nodes[id];
    if (!node) continue;
    for (const link of node.links) if (map.nodes[link.to]) links.push({ id: linkId(id, link.to), from: id, ...link });
    for (let i = node.children.length - 1; i >= 0; i--) stack.push(node.children[i]);
  }
  return links;
}

/** The links touching a node: those it leads from, then those leading to it. */
export function linksAt(map: MindMap, id: string): MapLink[] {
  const node = map.nodes[id];
  if (!node) return [];
  const own = node.links.filter((link) => map.nodes[link.to]).map((link) => ({ id: linkId(id, link.to), from: id, ...link }));
  const incoming: MapLink[] = [];
  for (const other of Object.values(map.nodes)) {
    if (other.id === id) continue;
    for (const link of other.links) if (link.to === id) incoming.push({ id: linkId(other.id, id), from: other.id, ...link });
  }
  return [...own, ...incoming];
}

/** The link named by `id`, whichever node carries it. */
export function findLink(map: MindMap, id: string): MapLink | null {
  const at = id.indexOf("\u2192");
  if (at < 0) return null;
  const from = id.slice(0, at);
  const to = id.slice(at + 1);
  const link = map.nodes[from]?.links.find((entry) => entry.to === to);
  return link && map.nodes[to] ? { id, from, ...link } : null;
}

/** True when a link already runs between the two nodes, in either direction. */
export function areLinked(map: MindMap, a: string, b: string): boolean {
  return !!map.nodes[a]?.links.some((link) => link.to === b) || !!map.nodes[b]?.links.some((link) => link.to === a);
}

/** Why two nodes cannot be linked, in plain words — or null when they can. */
export function linkRefusal(map: MindMap, from: string, to: string): string | null {
  const source = map.nodes[from];
  const target = map.nodes[to];
  if (!source || !target) return "That node is no longer in the map.";
  if (from === to) return "A node can't be linked to itself.";
  if (source.parentId === to || target.parentId === from) return "Those nodes are already joined by the tree.";
  if (areLinked(map, from, to)) return "Those nodes are already linked.";
  return null;
}

export function canLink(map: MindMap, from: string, to: string): boolean {
  return linkRefusal(map, from, to) === null;
}

/** A dotted link from `from` to `to`; the map unchanged when the two cannot be linked. */
export function addLink(map: MindMap, from: string, to: string, label = ""): MindMap {
  if (!canLink(map, from, to)) return map;
  const source = map.nodes[from];
  const links = normalizeLinks(from, [...source.links, { to, label }], map.nodes);
  return { ...map, nodes: { ...map.nodes, [from]: { ...source, links } } };
}

export function removeLink(map: MindMap, from: string, to: string): MindMap {
  const source = map.nodes[from];
  if (!source?.links.some((link) => link.to === to)) return map;
  return { ...map, nodes: { ...map.nodes, [from]: { ...source, links: source.links.filter((link) => link.to !== to) } } };
}

export function setLinkLabel(map: MindMap, from: string, to: string, label: string): MindMap {
  const source = map.nodes[from];
  const next = normalizeLinkLabel(label);
  if (!source?.links.some((link) => link.to === to && link.label !== next)) return map;
  return { ...map, nodes: { ...map.nodes, [from]: { ...source, links: source.links.map((link) => (link.to === to ? { ...link, label: next } : link)) } } };
}

/** The same link reading the other way: carried by `to`, leading to `from`, with its label. */
export function reverseLink(map: MindMap, from: string, to: string): MindMap {
  const link = map.nodes[from]?.links.find((entry) => entry.to === to);
  if (!link || !map.nodes[to]) return map;
  const without = removeLink(map, from, to);
  const target = without.nodes[to];
  const links = normalizeLinks(to, [...target.links, { to: from, label: link.label }], without.nodes);
  return { ...without, nodes: { ...without.nodes, [to]: { ...target, links } } };
}

/** `nodes` with every link leading to one of `gone` removed. */
function withoutLinksTo(nodes: Record<string, MindNode>, gone: ReadonlySet<string>): Record<string, MindNode> {
  for (const node of Object.values(nodes)) {
    if (node.links.some((link) => gone.has(link.to))) nodes[node.id] = { ...node, links: node.links.filter((link) => !gone.has(link.to)) };
  }
  return nodes;
}

// ---------- Help map ----------
// The map the editor shows when no draft is stored and no OneDrive file is open — and what `File → Open help
// map` brings back: the app's own help, written as a mind map so every feature it describes is also in use.
// Authored as a flat list in reading order: a node's parent is listed before it, children keep the order they
// are listed in, and a node takes its top-level branch's colour unless it names one itself.

function makeNode(
  id: string,
  parentId: string | null,
  children: string[],
  label: string,
  description: string,
  color: string,
  icon: string | null,
  size: NodeSize,
  importance: Importance,
  tags: string[] = [],
  links: NodeLink[] = [],
): MindNode {
  return { id, parentId, children, label, description, color, icon, size, importance, collapsed: false, tags: normalizeTags(tags), links };
}

/** One node of the help map as it is authored; what is left out follows from its place in the tree. */
interface HelpEntry {
  id: string;
  /** The entry listed before it that it sits under; null for the root. */
  parent: string | null;
  label: string;
  /** Description markup (see `@/lib/rich-text`), one entry per line. */
  text: string[];
  /** Named on the root and on each top-level branch; everything beneath a branch inherits it. */
  color?: string;
  icon?: string | null;
  size?: NodeSize;
  importance?: Importance;
  tags?: string[];
  links?: NodeLink[];
  dir?: Direction;
}

const HELP_ENTRIES: HelpEntry[] = [
  {
    id: "help",
    parent: null,
    label: "Mind Map Monkey help",
    icon: "book",
    text: [
      "This map is the **help for Mind Map Monkey** — and an ordinary map, so everything it describes is in use right here. Edit it, add to it, or replace it with `File → New map`, `File → Open from OneDrive…` or `File → Import Mermaid file or code…`; `File → Open help map` brings it back.",
      "Each branch has its own color, and the icon on a branch says what it covers: Idea for *Start here*, Settings for *Build the map*, Goal for *Arrange*, Globe for *Navigate*, Security for *Save and share*, People for *Links*, Code for *Undo and export*, Launch for *Keyboard*.",
      "Tags: `#shortcut` marks a node that teaches a key or key combination, `#tip` a detail that is easy to miss, `#onedrive` anything that touches the file on OneDrive. A star on a node means *High* importance — the three things to look at first.",
    ],
  },

  {
    id: "start",
    parent: "help",
    label: "Start here",
    color: "amber",
    icon: "lightbulb",
    importance: "high",
    text: [
      "Three things first: select a node to work on it, read and edit its details in the inspector panel, and save it once the map matters — until then it lives only in this browser.",
    ],
  },
  {
    id: "start-what",
    parent: "start",
    label: "What this map is",
    tags: ["tip"],
    text: [
      "A help file written as a mind map. Every feature it explains is also used in it: branch colors, icons, tags, labelled links between branches, locked branch directions and formatted descriptions like this one. Select any node to see how it is set up.",
    ],
  },
  {
    id: "start-edit",
    parent: "start",
    label: "Edit or replace it",
    tags: ["tip"],
    text: [
      "This is a normal map: change anything, or start over with `File → New map`. `File → Open help map` brings this map back at any time; it replaces whatever is open, so save your own map first.",
    ],
  },
  {
    id: "start-open",
    parent: "start",
    label: "Open another map",
    tags: ["onedrive"],
    text: [
      "`File → Open from OneDrive…` browses your OneDrive for a map saved as text — `.mmd`, `.mermaid`, `.md`, `.markdown` or `.txt` — and opens it. `File → Import Mermaid file or code…` brings in a map from this device — a `.mmd`, `.mermaid`, `.md` or `.txt` file chosen in the dialog or dropped on it or on the canvas — or pasted Mermaid `mindmap` code; the result replaces the current map as a new draft, named after the file, that `File → Save…` keeps. A map someone shared as a link opens on its own.",
    ],
  },

  {
    id: "build",
    parent: "help",
    label: "Build the map",
    color: "sky",
    icon: "settings",
    dir: "right",
    text: [
      "Everything starts from the selected node: its floating toolbar changes the tree, and the inspector edits its content and look. This branch is locked to grow *Right*, so it reads as a list — see *Lock a direction* under Arrange.",
    ],
  },
  {
    id: "build-select",
    parent: "build",
    label: "Select a node",
    importance: "high",
    tags: ["tip"],
    text: [
      "Click a node on the canvas. A toolbar appears beside it with its actions, and the inspector — pinned beside the map on a wide screen, or opened over the map by **Edit node** or a double-click or double-tap when unpinned or on a phone — shows its **Label**, **Description**, **Tags**, **Links**, **Color**, **Icon**, **Size** and **Importance** — and, for every node but the root, its **Position** and **Branch direction**. `Escape`, a click on the background or **Hide actions** puts the toolbar away; selecting a node brings it back. On a wide screen the pin at the top of the details panel switches between keeping it beside the map and opening it only when you edit; an unpinned panel closes with its cross or a click on the map.",
    ],
  },
  {
    id: "build-toolbar",
    parent: "build",
    label: "Floating toolbar",
    text: [
      "**Edit node**, **Add child**, **Add sibling**, **Move up**, **Move down**, **Indent**, **Outdent**, **Arrange branch**, **Branch direction**, **Link to another node…**, **Delete** and **Hide actions**, each with a tooltip; an action that does not apply is greyed out. Double-clicking or double-tapping a node does the same as **Edit node**. The root offers only **Edit node**, **Add child**, **Link to another node…**, **Auto-arrange** and **Hide actions**.",
            "If the toolbar is in the way, drag the grip at its left end to move it; it keeps that spot beside the node until you select another one. Double-click the grip to put it back.",
    ],
  },
  {
    id: "build-add",
    parent: "build-toolbar",
    label: "Add child or sibling",
    text: [
      "**Add child** puts a new node named *New idea* under the selected one; **Add sibling** puts it right after it. The inspector opens with the label ready to type over. Choose **Done** to keep it or **Cancel new node** to remove it. Closing the inspector also keeps it. A child takes its parent's color; a sibling takes the color and size of the node it was added beside.",
    ],
  },
  {
    id: "build-move",
    parent: "build-toolbar",
    label: "Move, indent, outdent",
    text: [
      "**Move up** and **Move down** swap a node with the sibling before or after it. **Indent** makes it the last child of the sibling above it; **Outdent** lifts it one level up, right after its parent. Indenting or outdenting a pinned node returns it to the automatic layout.",
    ],
  },
  {
    id: "build-delete",
    parent: "build-toolbar",
    label: "Delete",
    text: [
      "Removes the node and everything beneath it. A node with nothing beneath it goes at once; a branch asks first and says how many nested items go with it. Links into the deleted branch go too. The root cannot be deleted, and **Undo** brings a deleted branch back.",
    ],
  },
  {
    id: "build-inspector",
    parent: "build",
    label: "Inspector",
    text: ["The panel beside the canvas that edits the selected node or link. Use its delete icon to remove a node. On a narrow screen it slides up from the bottom; tap outside it, swipe its handle down or press **Close** to put it away. **File → Export Mermaid** shows the whole map as code."],
  },
  {
    id: "build-text",
    parent: "build-inspector",
    label: "Label and description",
    tags: ["shortcut"],
    links: [{ to: "history-mermaid", label: "saved as comment lines" }],
    text: [
      "**Label** is the text on the node; it grows as you type. **Description** holds the detail, with **Bold** `Ctrl+B`, *Italic* `Ctrl+I`, `Code` `Ctrl+E` and a web **Link** `Ctrl+K` from the small toolbar above the text — on a Mac, `⌘` stands in for `Ctrl`. Descriptions are not drawn on the canvas; they travel as comment lines in the Mermaid code.",
    ],
  },
  {
    id: "build-color",
    parent: "build-inspector",
    label: "Color and icon",
    text: [
      "**Color** picks one of eleven fills, and the connector leading into the node takes the color too. **Apply to branch** gives the same color to everything beneath the node. **Icon** puts one of fifteen small symbols in front of the label, chosen by name. New children inherit the color but not the icon.",
    ],
  },
  {
    id: "build-size",
    parent: "build-inspector",
    label: "Size and importance",
    text: [
      "**Size** — Small, Medium or Large — sets the node's text size and width. **Importance** marks it: *High* is bold with a star, *Medium* is plain and *Low* has a dashed border; in the Mermaid code they are the `))bang((`, `(rounded)` and `[square]` shapes.",
    ],
  },
  {
    id: "build-tags",
    parent: "build-inspector",
    label: "Tags",
    tags: ["tip"],
    text: [
      "Short lower-case keywords for finding and filtering. `Enter` or a comma adds the one you typed, `Backspace` in the empty field removes the last, and clicking a tag chip opens Find for that tag. A tagged node shows a small tag mark. Try `#tip` — it is on this node.",
    ],
  },

  {
    id: "arrange",
    parent: "help",
    label: "Arrange",
    color: "orange",
    icon: "target",
    dir: "left",
    text: [
      "The layout is automatic: branches are dealt around the root, and thicker connectors lead to branches with more items beneath them. Drag, lock or fold to shape it yourself. This branch is locked to grow *Left*.",
    ],
  },
  {
    id: "arrange-pin",
    parent: "arrange",
    label: "Drag to pin",
    text: [
      "Drag a node and drop it on the background: it stays where it landed, relative to its parent, and its branch comes with it. Hold it near the edge of the canvas to pan farther. In the inspector's **Position** group the arrow buttons nudge it by `24` px and **Reset position** returns it to the automatic layout. The root cannot be dragged.",
    ],
  },
  {
    id: "arrange-nest",
    parent: "arrange",
    label: "Drop to nest",
    text: [
      "Drop a node onto another node to make it that node's last child; a ring shows the target while you hover over it. A node cannot be dropped into its own branch, and dropping it onto its own parent moves it to the end of its siblings.",
    ],
  },
  {
    id: "arrange-branch",
    parent: "arrange",
    label: "Arrange branch",
    text: [
      "**Arrange branch** on a node's toolbar — or in the inspector's **Position** group — returns everything beneath the node to the automatic layout while the node itself stays put. On the root the same button is **Auto-arrange**, and `View → Auto-arrange` returns every pinned node in the map.",
    ],
  },
  {
    id: "arrange-dir",
    parent: "arrange",
    label: "Lock a direction",
    text: [
      "**Branch direction** on the toolbar — a signpost while automatic, a bold arrow once locked — or the **Branch direction** group in the inspector fixes the side a node's children line up on: Right, Down, Left or Up. *Automatic* lets them grow away from the parent again; the root takes no lock. In this map *Build the map* is locked Right and *Arrange* is locked Left, which is why they read as lists below the root. In the Mermaid code a lock is the comment line `%% @dir left` under the node, and a pinned position is `%% @at x,y`.",
    ],
  },
  {
    id: "arrange-fold",
    parent: "arrange",
    label: "Collapse and expand",
    tags: ["tip"],
    text: [
      "The small round button on the far side of a node with children folds its branch away; folded, it reads `+N` with the number of hidden items, and the caption below the canvas counts them. `View → Collapse all branches` and `View → Expand all branches` fold and unfold the whole map. Folding is view state and is not written to the file.",
    ],
  },

  {
    id: "navigate",
    parent: "help",
    label: "Navigate",
    color: "emerald",
    icon: "globe",
    text: ["Move around a large map with the mouse, a trackpad, touch or the keyboard, and find nodes by text or tag."],
  },
  {
    id: "navigate-zoom",
    parent: "navigate",
    label: "Zoom and fit",
    tags: ["shortcut"],
    text: [
      "A plain mouse wheel or a trackpad swipe or pinch zooms around the pointer. On a touch screen, pinch anywhere on the canvas, including on nodes, to zoom around your fingers. The `+` and `−` keys, the buttons at the bottom right of the canvas and `View → Zoom in` / `Zoom out` zoom around the centre, from 20% to 250%. `0` or **Fit to screen** centres the whole map, zoomed out as far as it needs — never past 100%. A map you open or import is fitted on arrival. **Full screen** (beside the zoom buttons, or `View → Full screen`) hides the header and status line to give the map every pixel; `Escape` or the same button leaves it.",
    ],
  },
  {
    id: "navigate-pan",
    parent: "navigate",
    label: "Pan",
    tags: ["shortcut"],
    text: [
      "Drag the background, or scroll with `Shift` held — a sideways swipe or tilt wheel pans too. With the canvas focused the arrow keys pan by `48` px, four times that with `Shift`. The map can never be lost: a little of it always stays in view.",
    ],
  },
  {
    id: "navigate-find",
    parent: "navigate",
    label: "Find",
    tags: ["shortcut"],
    links: [{ to: "build-tags", label: "searches" }],
    text: [
      "`Ctrl+F`, the magnifier in the header or `View → Find nodes…` opens the find bar above the canvas. Nodes that do not match are greyed out; matches keep their color and get a small magnifier mark. Closing the bar clears the filter.",
    ],
  },
  {
    id: "navigate-find-text",
    parent: "navigate-find",
    label: "Text and tags",
    text: [
      "Type free text to match a node's label, description, tags or the labels of the links leading from it. A word starting with `#` is a tag requirement, and the **Tags** button opens a checklist of every tag in the map with its count — a match carries *every* selected tag.",
    ],
  },
  {
    id: "navigate-find-step",
    parent: "navigate-find",
    label: "Step through matches",
    tags: ["shortcut"],
    links: [{ to: "arrange-fold", label: "unfolds folded branches" }],
    text: [
      "`Enter` selects the next match and `Shift+Enter` the previous one; the arrows beside the count do the same. A match inside a collapsed branch is unfolded on the way, and **Expand N hidden** unfolds them all at once.",
    ],
  },

  {
    id: "save",
    parent: "help",
    label: "Save and share",
    color: "violet",
    icon: "shield",
    text: [
      "A map lives in this browser until it is saved to OneDrive as a Mermaid text file. From then on the header names the file and says *Saved*, *Unsaved changes* or *Saving…*.",
    ],
  },
  {
    id: "save-file",
    parent: "save",
    label: "Save",
    importance: "high",
    tags: ["onedrive"],
    text: [
      "`File → Save…` picks a folder and a name — `.mmd` is added when you give no extension — and from then on **Save** in the header or `File → Save` writes the file. `File → Save as…` makes a copy under another name. A save never writes over a version someone else changed meanwhile: that version is merged first.",
    ],
  },
  {
    id: "save-auto",
    parent: "save",
    label: "Auto-save",
    tags: ["onedrive"],
    text: [
      "`File → Auto-save` saves the open file on its own a few seconds after you stop editing. It pauses when the file changed on OneDrive or a save failed, and the header says *Auto-save paused* until you decide what to do. You can also turn it on or off in `File → Settings…`; the setting is remembered on this device.",
    ],
  },
  {
    id: "save-refresh",
    parent: "save",
    label: "Refresh and merge",
    tags: ["onedrive"],
    text: [
      "`File → Refresh from OneDrive` fetches the latest version of the open file; the app also looks for one when you come back to the window. A newer version simply loads when you have no changes of your own, merges on its own when nothing collides, and otherwise opens a review that lists what came in, keeps your changes, and asks only where both sides changed the same item.",
    ],
  },
  {
    id: "save-link",
    parent: "save",
    label: "Copy link",
    tags: ["onedrive"],
    text: [
      "`File → Copy link` copies a link that opens the saved file in this app for anyone who can use the app and has access to the file. **App address** in the dialog is where the link points; change it if your collaborators reach the app at another address. It is remembered in this browser.",
    ],
  },
  {
    id: "save-library",
    parent: "save",
    label: "Library page",
    tags: ["onedrive"],
    text: [
      "**Library** in the header is a file browser for your maps. **Recent** lists the maps you opened or saved lately (`File → Recent files…` goes straight there); **OneDrive** browses folders, with **Up** and a path bar, and remembers the last folder. Filter by name, sort by any column, select a map to preview it, and double-click it (or use **Open**) to open it in the editor, or **Copy link**. Leaving the editor with unsaved changes asks first.",
    ],
  },
  {
    id: "save-settings",
    parent: "save",
    label: "Settings",
    text: [
      "`File → Settings…` holds preferences remembered in this browser: **Theme** (System, Light or Dark), **Auto-save**, **Pan to the selected node** (turn it off to keep the map still when you click or tap a node; keyboard moves and Find still bring a node into view), **Pin the details panel**, **Show links** and **Reduce motion**. `File → About Mind Map Monkey` shows the app version, the app and environment IDs, and the signed-in user and tenant; **Copy all** copies them for a support request.",
    ],
  },

  {
    id: "links",
    parent: "help",
    label: "Links",
    color: "lime",
    icon: "users",
    text: [
      "A link is a dotted line between two nodes in different parts of the map — related, but neither part of the other. It reads from the node that carries it to the other one, so a label such as *searches* has a direction. This map has three.",
    ],
  },
  {
    id: "links-draw",
    parent: "links",
    label: "Draw a link",
    text: [
      "Drag the round handle on the corner of the selected node onto another node; hold it near the canvas edge to pan farther. Or press **Link to another node…** on its toolbar — **Link to…** in the inspector does the same — and pick the node by name. A node cannot be linked to itself, to its parent or children, or twice to the same node.",
    ],
  },
  {
    id: "links-label",
    parent: "links",
    label: "Label and direction",
    text: [
      "Click a link on the canvas, or its entry in the inspector's **Links** list, to pick it: a floating toolbar appears above it, as it does for a node, with **Reverse direction** to swap its two ends and **Remove link**. Double-click a link to edit its **Label**; the inspector's **Select** buttons jump to either node. A link that touches no selected or hovered node is drawn faint, so it never gets in the way.",
    ],
  },
  {
    id: "links-show",
    parent: "links",
    label: "Show or remove",
    tags: ["tip"],
    text: [
      "`View → Show links` hides and shows every link; hidden links still exist and stay in the inspector's list. **Remove link** on a picked link, the unlink button beside it in the list, or `Delete` with the link picked on the canvas removes it. Deleting a node removes the links into its branch.",
    ],
  },

  {
    id: "history",
    parent: "help",
    label: "Undo and export",
    color: "rose",
    icon: "code",
    text: ["Every change is a step you can take back, and the whole map can leave as an image or as Mermaid code."],
  },
  {
    id: "history-undo",
    parent: "history",
    label: "Undo and redo",
    tags: ["shortcut"],
    text: [
      "`Ctrl+Z` undoes and `Ctrl+Y` or `Ctrl+Shift+Z` redoes — anywhere on the page outside a dialog or the find bar, even while typing a label or description, where a burst of typing is one step. The arrows in the header and `View → Undo` / `Redo` do the same. Up to 100 steps are kept; opening or importing a map starts a fresh history.",
    ],
  },
  {
    id: "history-png",
    parent: "history",
    label: "PNG export",
    text: [
      "`File → Copy as PNG` puts the whole map — every node and connector, whatever is in view — on the clipboard as an image, and `File → Download PNG` saves it as a file named after the root. Links are included as drawn, and left out while hidden.",
    ],
  },
  {
    id: "history-mermaid",
    parent: "history",
    label: "Mermaid export",
    text: [
      "`File → Export Mermaid code…` shows the open map as Mermaid `mindmap` code — the same text that is saved to OneDrive — with **Copy code** and **Download .mmd**. Colors, icons and sizes are written as class and icon lines; tags, links, pins, locks and descriptions as `%%` comment lines, so another Mermaid renderer draws the tree and ignores the rest. `File → Import Mermaid file or code…` reads such code back in, pasted or from a file on this device.",
    ],
  },

  {
    id: "keys",
    parent: "help",
    label: "Keyboard",
    color: "slate",
    icon: "rocket",
    text: ["The whole editor works without a mouse. Nodes are buttons: `Tab` moves between them in tree order, and `Enter` or `Space` selects the focused node."],
  },
  {
    id: "keys-toolbar",
    parent: "keys",
    label: "Node to toolbar",
    tags: ["shortcut"],
    text: [
      "With the selected node focused, `Tab` moves into its floating toolbar — showing it again if it was hidden. `←` and `→` move along the buttons, `Home` and `End` jump to the ends, `Enter` or `Space` presses one. `Escape` hides the toolbar and returns to the node; `Shift+Tab` returns to the node and leaves the toolbar up.",
    ],
  },
  {
    id: "keys-next",
    parent: "keys",
    label: "Node to node",
    tags: ["shortcut"],
    text: [
      "From the toolbar, `Tab` moves on to the node after the selected one, as if the toolbar sat between them. A focused node is brought into view. The **Position** buttons in the inspector move a node when dragging is not an option.",
    ],
  },
  {
    id: "keys-list",
    parent: "keys",
    label: "Shortcuts",
    tags: ["shortcut"],
    text: [
      "`Ctrl+Z` undo · `Ctrl+Y` or `Ctrl+Shift+Z` redo · `Ctrl+S` save · `Ctrl+F` find · `Ctrl+Shift+F` full screen · `Enter` / `Shift+Enter` next and previous match · `Escape` hide the toolbar, let go of a picked link or close the find bar · arrow keys pan · `+` and `−` zoom · `0` fit · `Ctrl+B`, `Ctrl+I`, `Ctrl+E`, `Ctrl+K` format a description · `Delete` remove the picked link. On a Mac, `⌘` stands in for `Ctrl`.",
    ],
  },
];

/** The help entries as a map: children in authored order, colours inherited down each branch, links checked. */
function buildHelpMap(entries: readonly HelpEntry[]): MindMap {
  const nodes: Record<string, MindNode> = {};
  for (const entry of entries) {
    const parent = entry.parent ? nodes[entry.parent] : undefined;
    const node = makeNode(
      entry.id,
      parent ? parent.id : null,
      [],
      entry.label,
      entry.text.join("\n"),
      entry.color ?? parent?.color ?? "brand",
      entry.icon ?? null,
      entry.size ?? (parent ? "medium" : "large"),
      entry.importance ?? "medium",
      entry.tags,
      entry.links,
    );
    if (entry.dir && parent) node.dir = entry.dir;
    if (parent) parent.children.push(entry.id);
    nodes[entry.id] = node;
  }
  return withValidLinks({ rootId: entries[0].id, nodes });
}

export const helpMindMap: MindMap = buildHelpMap(HELP_ENTRIES);

export function createBlankMap(): MindMap {
  const id = createNodeId();
  return { rootId: id, nodes: { [id]: makeNode(id, null, [], "Central idea", "", "brand", null, "large", "medium") } };
}

// ---------- Tree operations (immutable) ----------

const ID_ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";

/**
 * A short, random, Mermaid-safe id. It is written into the file as the node's
 * Mermaid id, so a node keeps its identity across saves and two edited copies
 * of the same map can be matched node by node.
 */
export function createNodeId(): string {
  const bytes = new Uint8Array(7);
  if (typeof crypto !== "undefined" && "getRandomValues" in crypto) crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  let id = "n";
  for (const byte of bytes) id += ID_ALPHABET[byte % ID_ALPHABET.length];
  return id;
}

/** An id no node of `map` uses yet. */
function freshId(map: MindMap): string {
  let id = createNodeId();
  while (map.nodes[id]) id = createNodeId();
  return id;
}

/** True when `id` can be written as a Mermaid node id and read back unchanged. */
export function isMermaidId(id: string): boolean {
  return /^[A-Za-z0-9_-]{1,64}$/.test(id) && !/^-|-$/.test(id);
}

const UUID_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The same map with ids that would read badly in Mermaid (earlier drafts used UUIDs) replaced by short ones. */
export function withMermaidIds(map: MindMap): MindMap {
  const rename = new Map<string, string>();
  const taken = new Set(Object.keys(map.nodes));
  for (const id of Object.keys(map.nodes)) {
    if (isMermaidId(id) && !UUID_ID.test(id)) continue;
    let next = createNodeId();
    while (taken.has(next)) next = createNodeId();
    taken.add(next);
    rename.set(id, next);
  }
  if (rename.size === 0) return map;
  const to = (id: string) => rename.get(id) ?? id;
  const nodes: Record<string, MindNode> = {};
  for (const node of Object.values(map.nodes)) {
    const links = Array.isArray(node.links) ? node.links.map((link) => ({ ...link, to: to(link.to) })) : [];
    nodes[to(node.id)] = { ...node, id: to(node.id), parentId: node.parentId === null ? null : to(node.parentId), children: node.children.map(to), links };
  }
  return { rootId: to(map.rootId), nodes };
}

/** Small, stable hash of a string, for ids derived from a node's place in the tree. */
function hashId(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `p${hash.toString(36)}`;
}

export type NodePatch = Partial<Omit<MindNode, "id" | "parentId" | "children">>;

export function updateNode(map: MindMap, id: string, patch: NodePatch): MindMap {
  const node = map.nodes[id];
  if (!node) return map;
  return { ...map, nodes: { ...map.nodes, [id]: { ...node, ...patch } } };
}

/** Furthest a node can be placed from its parent, so a stray value can't blow the canvas up. */
const OFFSET_LIMIT = 20000;

function clampOffset(offset: NodeOffset): NodeOffset {
  const bound = (value: number) => (Number.isFinite(value) ? Math.round(Math.min(OFFSET_LIMIT, Math.max(-OFFSET_LIMIT, value))) : 0);
  return { x: bound(offset.x), y: bound(offset.y) };
}

/** The node back on the automatic layout. */
function withoutOffset(node: MindNode): MindNode {
  if (!node.offset) return node;
  const next = { ...node };
  delete next.offset;
  return next;
}

/** Pin the node (and so its branch) at `offset` from its parent; `null` returns it to the automatic layout. */
export function setNodeOffset(map: MindMap, id: string, offset: NodeOffset | null): MindMap {
  const node = map.nodes[id];
  if (!node?.parentId) return map;
  const next = offset ? { ...node, offset: clampOffset(offset) } : withoutOffset(node);
  return { ...map, nodes: { ...map.nodes, [id]: next } };
}

/**
 * Lock the side the node's branch grows towards; `null` lets it grow away from its parent again. The root
 * deals its branches all around itself and takes no lock.
 */
export function setNodeDirection(map: MindMap, id: string, dir: Direction | null): MindMap {
  const node = map.nodes[id];
  if (!node?.parentId || (node.dir ?? null) === dir) return map;
  const next = { ...node };
  if (dir) next.dir = dir;
  else delete next.dir;
  return { ...map, nodes: { ...map.nodes, [id]: next } };
}

/** The same map without any direction lock that is not one of the four sides, or that sits on the root — a stored draft is not trusted. */
export function withValidDirections(map: MindMap): MindMap {
  const nodes: Record<string, MindNode> = {};
  let changed = false;
  for (const node of Object.values(map.nodes)) {
    const raw: unknown = (node as Partial<MindNode>).dir;
    if (raw === undefined || (isDirection(raw) && node.parentId)) {
      nodes[node.id] = node;
    } else {
      const next = { ...node };
      delete next.dir;
      nodes[node.id] = next;
      changed = true;
    }
  }
  return changed ? { ...map, nodes } : map;
}

export function hasManualPositions(map: MindMap): boolean {
  return Object.values(map.nodes).some((node) => node.offset !== undefined);
}

/** Every node back on the automatic layout. */
export function clearPositions(map: MindMap): MindMap {
  if (!hasManualPositions(map)) return map;
  const nodes: Record<string, MindNode> = {};
  for (const node of Object.values(map.nodes)) nodes[node.id] = withoutOffset(node);
  return { ...map, nodes };
}

/** `id` and every node beneath it, parents before children. */
export function branchIds(map: MindMap, id: string): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  const stack = [id];
  while (stack.length) {
    const current = stack.pop();
    if (current === undefined || seen.has(current)) continue;
    const node = map.nodes[current];
    if (!node) continue;
    seen.add(current);
    ids.push(current);
    for (let i = node.children.length - 1; i >= 0; i--) stack.push(node.children[i]);
  }
  return ids;
}

/** True when something beneath the node — not the node itself — was placed by hand, so there is a branch to tidy. */
export function hasDescendantPositions(map: MindMap, id: string): boolean {
  return branchIds(map, id).some((nodeId) => nodeId !== id && map.nodes[nodeId]?.offset !== undefined);
}

/**
 * Everything beneath `id` back on the automatic layout, fanning out from wherever `id` sits. The node itself
 * keeps its own pin ("Reset position" is for that), and every other node stays where it was placed.
 */
export function clearDescendantPositions(map: MindMap, id: string): MindMap {
  if (!hasDescendantPositions(map, id)) return map;
  const nodes = { ...map.nodes };
  for (const nodeId of branchIds(map, id)) if (nodeId !== id) nodes[nodeId] = withoutOffset(nodes[nodeId]);
  return { ...map, nodes };
}

/** `color` on the node and every node beneath it, as one change. */
export function colorBranch(map: MindMap, id: string, color: string): MindMap {
  const nodes = { ...map.nodes };
  let changed = false;
  for (const nodeId of branchIds(map, id)) {
    const node = nodes[nodeId];
    if (node.color === color) continue;
    nodes[nodeId] = { ...node, color };
    changed = true;
  }
  return changed ? { ...map, nodes } : map;
}

function newChildOf(parent: MindNode, id: string): MindNode {
  return makeNode(id, parent.id, [], "New idea", "", parent.color, null, parent.size === "large" ? "medium" : parent.size, "medium");
}

/** Levels from the root down to the node, the root being level 1 — as the parser counts them. */
function depthOf(map: MindMap, id: string): number {
  let depth = 0;
  for (let current: MindNode | undefined = map.nodes[id]; current && depth <= MAX_MAP_DEPTH; current = current.parentId ? map.nodes[current.parentId] : undefined) depth++;
  return depth;
}

/** Levels in the node's branch, the node itself being 1. */
function branchHeight(map: MindMap, id: string): number {
  let height = 0;
  let level = [id];
  while (level.length && height <= MAX_MAP_DEPTH) {
    height++;
    level = level.flatMap((nodeId) => map.nodes[nodeId]?.children ?? []);
  }
  return height;
}

/** Why a new node can't go under `parentId` without making a map too big to reopen, or null when it can. */
export function addBlockedReason(map: MindMap, parentId: string): string | null {
  if (Object.keys(map.nodes).length >= MAX_MAP_NODES) return `This map has reached the limit of ${MAX_MAP_NODES.toLocaleString()} nodes.`;
  if (depthOf(map, parentId) >= MAX_MAP_DEPTH) return `Nodes can't be nested more than ${MAX_MAP_DEPTH} levels deep.`;
  return null;
}

/** Why indenting the node would nest its branch too deeply, or null when it can move. */
export function indentBlockedReason(map: MindMap, id: string): string | null {
  return depthOf(map, id) + branchHeight(map, id) > MAX_MAP_DEPTH ? `Nodes can't be nested more than ${MAX_MAP_DEPTH} levels deep.` : null;
}

export function addChild(map: MindMap, parentId: string): { map: MindMap; id: string } {
  const parent = map.nodes[parentId];
  if (!parent) return { map, id: parentId };
  const id = freshId(map);
  return {
    id,
    map: {
      ...map,
      nodes: {
        ...map.nodes,
        [id]: newChildOf(parent, id),
        [parentId]: { ...parent, children: [...parent.children, id], collapsed: false },
      },
    },
  };
}

export function addSibling(map: MindMap, id: string): { map: MindMap; id: string } {
  const node = map.nodes[id];
  if (!node) return { map, id };
  if (!node.parentId) return addChild(map, id);
  const parent = map.nodes[node.parentId];
  if (!parent) return { map, id };
  const newId = freshId(map);
  const children = [...parent.children];
  children.splice(children.indexOf(id) + 1, 0, newId);
  const sibling = { ...newChildOf(parent, newId), color: node.color, size: node.size };
  return { id: newId, map: { ...map, nodes: { ...map.nodes, [newId]: sibling, [parent.id]: { ...parent, children } } } };
}

export function removeNode(map: MindMap, id: string): MindMap {
  const node = map.nodes[id];
  if (!node?.parentId) return map;
  const parent = map.nodes[node.parentId];
  if (!parent) return map;
  const nodes = { ...map.nodes };
  const gone = new Set<string>();
  const stack = [id];
  while (stack.length) {
    const current = stack.pop();
    if (!current) continue;
    const victim = nodes[current];
    if (!victim) continue;
    stack.push(...victim.children);
    delete nodes[current];
    gone.add(current);
  }
  nodes[parent.id] = { ...parent, children: parent.children.filter((c) => c !== id) };
  // A link into the deleted branch has nowhere to go; the nodes that carried one lose it.
  return { ...map, nodes: withoutLinksTo(nodes, gone) };
}

export function moveWithinParent(map: MindMap, id: string, delta: -1 | 1): MindMap {
  const node = map.nodes[id];
  if (!node?.parentId) return map;
  const parent = map.nodes[node.parentId];
  if (!parent) return map;
  const index = parent.children.indexOf(id);
  const target = index + delta;
  if (index < 0 || target < 0 || target >= parent.children.length) return map;
  const children = [...parent.children];
  children[index] = parent.children[target];
  children[target] = id;
  return { ...map, nodes: { ...map.nodes, [parent.id]: { ...parent, children } } };
}

/** Make the node the last child of its previous sibling. */
export function indentNode(map: MindMap, id: string): MindMap {
  const node = map.nodes[id];
  if (!node?.parentId) return map;
  const parent = map.nodes[node.parentId];
  if (!parent) return map;
  const index = parent.children.indexOf(id);
  if (index <= 0) return map;
  const previousId = parent.children[index - 1];
  const previous = map.nodes[previousId];
  if (!previous) return map;
  return {
    ...map,
    nodes: {
      ...map.nodes,
      [parent.id]: { ...parent, children: parent.children.filter((c) => c !== id) },
      [previousId]: { ...previous, children: [...previous.children, id], collapsed: false },
      [id]: withoutOffset({ ...node, parentId: previousId }),
    },
  };
}

/** Move the node up one level, right after its current parent. */
export function outdentNode(map: MindMap, id: string): MindMap {
  const node = map.nodes[id];
  if (!node?.parentId) return map;
  const parent = map.nodes[node.parentId];
  if (!parent?.parentId) return map;
  const grand = map.nodes[parent.parentId];
  if (!grand) return map;
  const grandChildren = [...grand.children];
  grandChildren.splice(grandChildren.indexOf(parent.id) + 1, 0, id);
  return {
    ...map,
    nodes: {
      ...map.nodes,
      [parent.id]: { ...parent, children: parent.children.filter((c) => c !== id) },
      [grand.id]: { ...grand, children: grandChildren },
      [id]: withoutOffset({ ...node, parentId: grand.id }),
    },
  };
}

/** Whether `id` may be dropped onto `targetId`: never the root, itself, a node inside its own branch, or so deep the map couldn't reopen. */
export function canMoveUnder(map: MindMap, id: string, targetId: string): boolean {
  const node = map.nodes[id];
  return (
    !!node?.parentId &&
    id !== targetId &&
    !!map.nodes[targetId] &&
    !isDescendant(map, id, targetId) &&
    depthOf(map, targetId) + branchHeight(map, id) <= MAX_MAP_DEPTH
  );
}

/** Make the node the last child of `targetId` on the automatic layout; dropping it onto its own parent moves it to the end. */
export function moveNodeUnder(map: MindMap, id: string, targetId: string): MindMap {
  const node = map.nodes[id];
  const parent = node?.parentId ? map.nodes[node.parentId] : undefined;
  const target = map.nodes[targetId];
  if (!node || !parent || !target || !canMoveUnder(map, id, targetId)) return map;
  const siblings = parent.children.filter((c) => c !== id);
  if (parent.id === targetId) {
    return { ...map, nodes: { ...map.nodes, [parent.id]: { ...parent, children: [...siblings, id] }, [id]: withoutOffset(node) } };
  }
  return {
    ...map,
    nodes: {
      ...map.nodes,
      [parent.id]: { ...parent, children: siblings },
      [targetId]: { ...target, children: [...target.children, id], collapsed: false },
      [id]: withoutOffset({ ...node, parentId: targetId }),
    },
  };
}

export function setCollapsed(map: MindMap, id: string, collapsed: boolean): MindMap {
  if (id === map.rootId) return map;
  return updateNode(map, id, { collapsed });
}

export function setAllCollapsed(map: MindMap, collapsed: boolean): MindMap {
  const nodes: Record<string, MindNode> = {};
  let changed = false;
  for (const node of Object.values(map.nodes)) {
    const canCollapse = node.id !== map.rootId && node.children.length > 0;
    const next = collapsed && canCollapse;
    if (next !== node.collapsed) changed = true;
    nodes[node.id] = next === node.collapsed ? node : { ...node, collapsed: next };
  }
  return changed ? { ...map, nodes } : map;
}

export function countDescendants(map: MindMap, id: string): number {
  const node = map.nodes[id];
  if (!node) return 0;
  return node.children.reduce((sum, child) => sum + 1 + countDescendants(map, child), 0);
}

export function isDescendant(map: MindMap, ancestorId: string, id: string): boolean {
  let current = map.nodes[id];
  while (current?.parentId) {
    if (current.parentId === ancestorId) return true;
    current = map.nodes[current.parentId];
  }
  return false;
}

// ---------- Layout (four-way tidy tree around the root) ----------
// The root's branches are dealt around it by equal angular sectors — the first to the right, then
// clockwise — and snapped to the nearest side, so a map grows right, down, left and up. Beside the root
// a side is a tidy vertical stack; above and below it is a tidy row. Deeper branches keep their side's
// direction, and a node dragged by hand carries its own offset from its parent, with its children
// fanning out away from that parent — unless the node's direction is locked (`MindNode.dir`), when they
// line up on the locked side wherever the node sits. Pinning a node moves only that node and its branch:
// its sector and its slot in the stack stay reserved, and rows are pushed clear of the stacks as if nothing
// were pinned, so siblings hold still and "Reset position" returns it to the gap. Placed nodes (and so
// connectors) are listed in tree order, which never changes with placement.

export interface SizeSpec {
  font: number;
  line: number;
  padX: number;
  padY: number;
  maxW: number;
}

export const SIZE_SPECS: Record<NodeSize, SizeSpec> = {
  small: { font: 12, line: 16, padX: 10, padY: 6, maxW: 150 },
  medium: { font: 14, line: 20, padX: 14, padY: 8, maxW: 210 },
  large: { font: 17, line: 24, padX: 18, padY: 10, maxW: 270 },
};
/** Border drawn around a node button (`border` = 1px), part of its measured box. */
const NODE_BORDER = 1;

/** Unit vectors along a direction (`fx`, `fy`: where the branch grows) and across it (`tx`, `ty`: where siblings line up). */
export interface DirectionVector {
  fx: number;
  fy: number;
  tx: number;
  ty: number;
}

const DIRECTION_VECTORS: Record<Direction, DirectionVector> = {
  right: { fx: 1, fy: 0, tx: 0, ty: 1 },
  down: { fx: 0, fy: 1, tx: 1, ty: 0 },
  left: { fx: -1, fy: 0, tx: 0, ty: 1 },
  up: { fx: 0, fy: -1, tx: 1, ty: 0 },
};

export function directionVector(dir: Direction): DirectionVector {
  return DIRECTION_VECTORS[dir];
}

export const isHorizontal = (dir: Direction): boolean => dir === "right" || dir === "left";

/** Which side of its parent a node sits on, from the vector between their centres. */
export function directionOf(dx: number, dy: number): Direction {
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? "right" : "left";
  return dy >= 0 ? "down" : "up";
}

export const CANVAS_PAD = 40;
/** Connector length between a parent and its children, beside it… */
const FLOW_GAP_H = 64;
/** …and above or below it. */
const FLOW_GAP_V = 48;
/** Between siblings stacked vertically. */
const STACK_GAP = 18;
/** Between siblings lined up side by side. */
const ROW_GAP = 24;
/** Between a row above or below the root and the stacks beside it. */
const GROUP_CLEAR = 28;

export interface PlacedNode {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Side of its parent the node sits on: where its connector leaves the parent and enters the node. */
  side: Direction;
  /** Side the node's branch grows towards — its lock, else `side`; children line up across it and the toggle sits on it. */
  dir: Direction;
  /** Dragged into place by hand; the node carries its own offset from its parent. */
  manual: boolean;
  /** Parent centre: where a node grows from and shrinks back to. */
  px: number;
  py: number;
}

export interface PlacedEdge {
  id: string;
  d: string;
  collapsedD: string;
  color: string;
  /** Stroke width, grown with the number of items in the branch it leads to. */
  width: number;
}

export interface MindMapLayout {
  nodes: PlacedNode[];
  edges: PlacedEdge[];
  /** Padded bounding box of every placed node, in map pixels (the root's centre is 0,0). */
  minX: number;
  minY: number;
  width: number;
  height: number;
}

/** Space between a node's icon, label, importance mark and tag marker (`gap-2` on the button). */
const NODE_GAP = 8;
/** Beyond the browser's own measure of a label, kept on each side so a label that fits on one line never wraps. */
const LABEL_SLACK = 2;
/** Narrowest a label is given, so a one-letter or empty label still reads as a node. */
const LABEL_MIN_WIDTH = 24;

/** The font a node's label is drawn in: its size's font size; semibold for the root and for high importance. */
export function nodeLabelFont(node: MindNode, isRoot: boolean): TextFont {
  return { size: SIZE_SPECS[node.size].font, weight: isRoot || node.importance === "high" ? 600 : 400 };
}

/** Characters the browser will break a line after even inside a word: hyphens and dashes, a question mark, an ellipsis. */
const BREAK_AFTER = /[-\u2010\u2013\u2014?\u2026]/u;

/** A run of a label that stays on one line unless it is wider than the whole line, and whether a space comes before it. */
interface LabelSegment {
  text: string;
  spaceBefore: boolean;
}

/**
 * A label cut where the browser may break it: at spaces (which collapse on screen, so they are measured
 * collapsed too), after a hyphen, dash, question mark or ellipsis, and between East Asian characters.
 */
function labelSegments(label: string): LabelSegment[] {
  const segments: LabelSegment[] = [];
  for (const word of label.trim().split(/\s+/)) {
    if (!word) continue;
    const chars = Array.from(word);
    let run = "";
    let first = true;
    chars.forEach((char, index) => {
      run += char;
      const last = index === chars.length - 1;
      const breaks = !last && (BREAK_AFTER.test(char) || WIDE_SCRIPT.test(char) || WIDE_SCRIPT.test(chars[index + 1]));
      if (last || breaks) {
        segments.push({ text: run, spaceBefore: first });
        run = "";
        first = false;
      }
    });
  }
  return segments;
}

/**
 * The label wrapped the way the browser wraps it in a box `maxWidth` wide: greedily, at the same break
 * opportunities, a run wider than the whole line broken between characters (`overflow-wrap: break-word`).
 * Gives the number of lines and the widest line's measured width — a box exactly that wide breaks the text in
 * the very same places, so a node is as wide as its longest line and no wider.
 */
export function wrapLabel(label: string, font: TextFont, maxWidth: number): { lines: number; width: number } {
  const segments = labelSegments(label);
  if (segments.length === 0) return { lines: 1, width: 0 };
  let lines = 1;
  let widest = 0;
  let line = "";
  let lineWidth = 0;
  for (const segment of segments) {
    if (line) {
      const candidate = `${line}${segment.spaceBefore ? " " : ""}${segment.text}`;
      const candidateWidth = measureTextWidth(candidate, font);
      if (candidateWidth <= maxWidth) {
        line = candidate;
        lineWidth = candidateWidth;
        continue;
      }
      widest = Math.max(widest, lineWidth);
      lines += 1;
    }
    line = segment.text;
    lineWidth = measureTextWidth(line, font);
    if (lineWidth > maxWidth) {
      // Wider than a whole line on its own: the browser fills line after line with as many of its characters as
      // fit, and what is left of it starts the next line, where the following text may join it.
      let chunk = "";
      for (const char of Array.from(segment.text)) {
        const candidate = chunk + char;
        if (chunk && measureTextWidth(candidate, font) > maxWidth) {
          widest = Math.max(widest, measureTextWidth(chunk, font));
          lines += 1;
          chunk = char;
        } else {
          chunk = candidate;
        }
      }
      line = chunk;
      lineWidth = measureTextWidth(chunk, font);
    }
  }
  return { lines, width: Math.max(widest, lineWidth) };
}

/**
 * The box a node's button takes on the canvas, from the browser's measurement of its label in its actual
 * font: padding, border, the icon, importance mark and tag marker with their gaps, and a fixed slack, so
 * the padding around the text is the same for every node of a size whatever its text says.
 */
export function measureNode(node: MindNode, isRoot: boolean): { w: number; h: number } {
  const spec = SIZE_SPECS[node.size];
  const iconW = node.icon ? spec.font + 4 + NODE_GAP : 0;
  const markW = node.importance === "high" ? spec.font - 2 + NODE_GAP : 0;
  /** The small tag marker drawn after the label of a tagged node. */
  const tagW = node.tags.length ? spec.font - 2 + NODE_GAP : 0;
  const rootExtra = isRoot ? 16 : 0;
  const maxW = spec.maxW + (isRoot ? 60 : 0);
  // Everything in the box that is not the label's own text.
  const chrome = spec.padX * 2 + NODE_BORDER * 2 + iconW + markW + tagW + rootExtra + LABEL_SLACK * 2;
  const textMax = Math.max(40, maxW - chrome);
  const { lines, width } = wrapLabel(node.label, nodeLabelFont(node, isRoot), textMax);
  const w = Math.min(maxW, Math.ceil(Math.max(LABEL_MIN_WIDTH, width)) + chrome);
  // The node button draws a 1px border on each side; count it, or every connector into a node's top or
  // bottom edge stops a hair short of the box.
  const h = lines * spec.line + spec.padY * 2 + NODE_BORDER * 2 + (isRoot ? 8 : 0);
  return { w, h: Math.round(h) };
}

/**
 * Everything the layout depends on, as one string: the tree in order with each node's label, size, icon,
 * importance, whether it is tagged, folded, pinned, locked, and its colour (connectors carry it). Two maps
 * with the same signature lay out identically — a description edit, say, leaves it unchanged.
 */
export function layoutSignature(map: MindMap): string {
  const parts: string[] = [map.rootId];
  const seen = new Set<string>();
  const visit = (id: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    const node = map.nodes[id];
    if (!node) return;
    parts.push(
      [
        node.id,
        node.label,
        node.size,
        node.icon ?? "",
        node.importance,
        node.tags.length ? "t" : "",
        node.collapsed ? "c" : "",
        node.offset ? `${node.offset.x},${node.offset.y}` : "",
        node.dir ?? "",
        node.color,
        node.children.length,
      ].join("\u001F"),
    );
    for (const child of node.children) visit(child);
  };
  visit(map.rootId);
  return parts.join("\u001E");
}

const samePlaced = (a: PlacedNode, b: PlacedNode) =>
  a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h && a.side === b.side && a.dir === b.dir && a.manual === b.manual && a.px === b.px && a.py === b.py;
const sameEdge = (a: PlacedEdge, b: PlacedEdge) => a.d === b.d && a.collapsedD === b.collapsedD && a.color === b.color && a.width === b.width;

/**
 * `next` with every node and connector that is placed exactly as in `previous` kept as the very same object —
 * and `previous` itself when nothing moved at all — so the canvas re-renders only what changed.
 */
export function shareLayout(previous: MindMapLayout, next: MindMapLayout): MindMapLayout {
  const previousNodes = new Map(previous.nodes.map((p) => [p.id, p] as const));
  const previousEdges = new Map(previous.edges.map((e) => [e.id, e] as const));
  let unchanged =
    previous.nodes.length === next.nodes.length &&
    previous.edges.length === next.edges.length &&
    previous.minX === next.minX &&
    previous.minY === next.minY &&
    previous.width === next.width &&
    previous.height === next.height;
  const nodes = next.nodes.map((p, index) => {
    const old = previousNodes.get(p.id);
    if (old && samePlaced(old, p)) {
      if (previous.nodes[index] !== old) unchanged = false;
      return old;
    }
    unchanged = false;
    return p;
  });
  const edges = next.edges.map((e, index) => {
    const old = previousEdges.get(e.id);
    if (old && sameEdge(old, e)) {
      if (previous.edges[index] !== old) unchanged = false;
      return old;
    }
    unchanged = false;
    return e;
  });
  return unchanged ? previous : { ...next, nodes, edges };
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** An S-curve between two side midpoints; the same command shape either way, so collapse animations can morph it. */
function curve(sx: number, sy: number, ex: number, ey: number, horizontal: boolean): string {
  if (horizontal) {
    const mx = (sx + ex) / 2;
    return `M ${round1(sx)} ${round1(sy)} C ${round1(mx)} ${round1(sy)}, ${round1(mx)} ${round1(ey)}, ${round1(ex)} ${round1(ey)}`;
  }
  const my = (sy + ey) / 2;
  return `M ${round1(sx)} ${round1(sy)} C ${round1(sx)} ${round1(my)}, ${round1(ex)} ${round1(my)}, ${round1(ex)} ${round1(ey)}`;
}

/** Connector width into a node: 1.75px for a leaf, growing with the square root of the items beneath it, capped at 12px. */
export function edgeWidth(descendants: number): number {
  return Math.min(12, Math.round((1.75 + 1.5 * Math.sqrt(Math.max(0, descendants))) * 10) / 10);
}

/** Descendant counts for every node, collapsed branches included, in one pass. */
export function countAllDescendants(map: MindMap): Map<string, number> {
  const counts = new Map<string, number>();
  const visiting = new Set<string>();
  const count = (id: string): number => {
    const cached = counts.get(id);
    if (cached !== undefined) return cached;
    const node = map.nodes[id];
    if (!node || visiting.has(id)) return 0;
    visiting.add(id);
    const total = node.children.reduce((sum, child) => (child in map.nodes ? sum + 1 + count(child) : sum), 0);
    visiting.delete(id);
    counts.set(id, total);
    return total;
  };
  for (const id of Object.keys(map.nodes)) count(id);
  return counts;
}

/** Connectors for a set of placed nodes, each leaving its parent on the side the child sits on. */
export function buildEdges(map: MindMap, nodes: PlacedNode[], descendants: Map<string, number> = countAllDescendants(map)): PlacedEdge[] {
  const byId = new Map(nodes.map((p) => [p.id, p] as const));
  const edges: PlacedEdge[] = [];
  for (const p of nodes) {
    const node = map.nodes[p.id];
    if (!node?.parentId) continue;
    const parent = byId.get(node.parentId);
    if (!parent) continue;
    const { fx, fy } = DIRECTION_VECTORS[p.side];
    const horizontal = isHorizontal(p.side);
    const sx = parent.x + fx * (parent.w / 2);
    const sy = parent.y + fy * (parent.h / 2);
    const ex = p.x - fx * (p.w / 2);
    const ey = p.y - fy * (p.h / 2);
    edges.push({
      id: p.id,
      d: curve(sx, sy, ex, ey, horizontal),
      collapsedD: curve(sx, sy, sx, sy, horizontal),
      color: node.color,
      width: edgeWidth(descendants.get(p.id) ?? 0),
    });
  }
  return edges;
}

interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function layoutMindMap(map: MindMap): MindMapLayout {
  const rootId = map.rootId;
  const sizes = new Map<string, { w: number; h: number }>();
  const size = (id: string) => {
    const cached = sizes.get(id);
    if (cached) return cached;
    const node = map.nodes[id];
    const measured = node ? measureNode(node, id === rootId) : { w: 0, h: 0 };
    sizes.set(id, measured);
    return measured;
  };
  const kids = (id: string): string[] => {
    const node = map.nodes[id];
    if (!node || node.collapsed) return [];
    return node.children.filter((child) => child in map.nodes);
  };
  const isManual = (id: string) => map.nodes[id]?.offset !== undefined;
  const manualKids = (id: string) => kids(id).filter(isManual);
  /** The side a node's branch grows towards: its lock, else `inherited` — the side it sits on. */
  const grows = (id: string, inherited: Direction): Direction => {
    const lock = map.nodes[id]?.dir;
    return isDirection(lock) ? lock : inherited;
  };
  const extend = (into: Box, box: Box, x: number, y: number) => {
    into.minX = Math.min(into.minX, x + box.minX);
    into.minY = Math.min(into.minY, y + box.minY);
    into.maxX = Math.max(into.maxX, x + box.maxX);
    into.maxY = Math.max(into.maxY, y + box.maxY);
  };

  // Room a branch takes: the box around the node and everything beneath it as the automatic layout places
  // them, the branch growing towards `dir`, relative to the node's centre. A hand-placed descendant still
  // counts, at its automatic slot: the slot stays reserved so the rest of the stack holds still, whether a
  // node is pinned or returned to the layout.
  const boxes = new Map<string, Box>();
  function branchBox(id: string, dir: Direction): Box {
    const key = `${id}:${dir}`;
    const cached = boxes.get(key);
    if (cached) return cached;
    const own = size(id);
    const box: Box = { minX: -own.w / 2, minY: -own.h / 2, maxX: own.w / 2, maxY: own.h / 2 };
    const grow = grows(id, dir);
    for (const slot of slots(kids(id), own, grow)) extend(box, branchBox(slot.id, grow), slot.x, slot.y);
    boxes.set(key, box);
    return box;
  }

  /**
   * Where a tidy stack (beside the parent) or row (above or below it) growing towards `dir` puts each of
   * `ids`, relative to the parent's centre: one slot per branch, as wide as the branch, side by side and
   * centred on the parent.
   */
  function slots(ids: string[], parentSize: { w: number; h: number }, dir: Direction): Array<{ id: string; x: number; y: number }> {
    const horizontal = isHorizontal(dir);
    const { fx, fy, tx, ty } = DIRECTION_VECTORS[dir];
    const gap = horizontal ? STACK_GAP : ROW_GAP;
    const entries = ids.map((id) => {
      const box = branchBox(id, dir);
      return horizontal ? { id, start: box.minY, span: box.maxY - box.minY } : { id, start: box.minX, span: box.maxX - box.minX };
    });
    const total = entries.reduce((sum, entry) => sum + entry.span, 0) + gap * (entries.length - 1);
    let cursor = -total / 2;
    return entries.map(({ id, start, span }) => {
      const { w, h } = size(id);
      const flow = horizontal ? parentSize.w / 2 + FLOW_GAP_H + w / 2 : parentSize.h / 2 + FLOW_GAP_V + h / 2;
      // The slot starts at `cursor`; the node's centre sits wherever its box begins behind it.
      const across = cursor - start;
      cursor += span + gap;
      return { id, x: fx * flow + tx * across, y: fy * flow + ty * across };
    });
  }

  const nodes: PlacedNode[] = [];

  /** Lay `ids` out in their slots. A hand-placed id keeps its slot but is not placed here: it sits at its own offset. */
  function placeStack(ids: string[], px: number, py: number, parentSize: { w: number; h: number }, dir: Direction) {
    for (const slot of slots(ids, parentSize, dir)) {
      if (isManual(slot.id)) continue;
      const { w, h } = size(slot.id);
      const x = px + slot.x;
      const y = py + slot.y;
      const grow = grows(slot.id, dir);
      nodes.push({ id: slot.id, x, y, w, h, side: dir, dir: grow, manual: false, px, py });
      placeChildren(slot.id, x, y, grow);
    }
  }

  /** Hand-placed nodes sit at their own offset; their children fan out away from the parent, or towards the locked side. */
  function placeManual(ids: string[], px: number, py: number) {
    for (const id of ids) {
      const offset = map.nodes[id]?.offset;
      if (!offset) continue;
      const { w, h } = size(id);
      const x = px + offset.x;
      const y = py + offset.y;
      const side = directionOf(offset.x, offset.y);
      const grow = grows(id, side);
      nodes.push({ id, x, y, w, h, side, dir: grow, manual: true, px, py });
      placeChildren(id, x, y, grow);
    }
  }

  /** The children of the node at (x, y), its branch growing towards `dir`. */
  function placeChildren(id: string, x: number, y: number, dir: Direction) {
    placeStack(kids(id), x, y, size(id), dir);
    placeManual(manualKids(id), x, y);
  }

  const root = size(rootId);
  nodes.push({ id: rootId, x: 0, y: 0, w: root.w, h: root.h, side: "right", dir: "right", manual: false, px: 0, py: 0 });

  // Deal the root's branches around it: equal sectors, the first to the right, then clockwise, each snapped to its
  // nearest side. Hand-placed branches keep their sector, so pinning one never moves the others.
  const branches = kids(rootId);
  const sides: Record<Direction, Array<{ id: string; angle: number }>> = { right: [], down: [], left: [], up: [] };
  branches.forEach((id, index) => {
    const angle = (360 * index) / branches.length;
    sides[DIRECTIONS[Math.floor(((angle + 45) % 360) / 90)]].push({ id, angle });
  });
  // Reading order on each side: top to bottom beside the root, left to right above and below it.
  const signed = (angle: number) => (angle > 180 ? angle - 360 : angle);
  const ordered: Record<Direction, string[]> = {
    right: sides.right.sort((a, b) => signed(a.angle) - signed(b.angle)).map((entry) => entry.id),
    down: sides.down.sort((a, b) => b.angle - a.angle).map((entry) => entry.id),
    left: sides.left.sort((a, b) => b.angle - a.angle).map((entry) => entry.id),
    up: sides.up.sort((a, b) => a.angle - b.angle).map((entry) => entry.id),
  };
  const ranges = {} as Record<Direction, [number, number]>;
  for (const dir of DIRECTIONS) {
    const start = nodes.length;
    placeStack(ordered[dir], 0, 0, root, dir);
    ranges[dir] = [start, nodes.length];
  }

  // A wide row above or below the root can reach into the stacks beside it; push it outwards until it clears them.
  // Each side is measured at its automatic slots, pinned nodes included, so pinning a node — or arranging it back
  // — never shifts a row, and a dropped node lands exactly where it was released.
  const sideBox = (dir: Direction): Box | null => {
    if (!ordered[dir].length) return null;
    const box: Box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    for (const slot of slots(ordered[dir], root, dir)) extend(box, branchBox(slot.id, dir), slot.x, slot.y);
    return box;
  };
  const touches = (a: Box, b: Box) =>
    a.minX < b.maxX + GROUP_CLEAR && b.minX < a.maxX + GROUP_CLEAR && a.minY < b.maxY + GROUP_CLEAR && b.minY < a.maxY + GROUP_CLEAR;
  const shiftRange = ([start, end]: [number, number], dy: number) => {
    for (let i = start; i < end; i++) {
      nodes[i].y += dy;
      if (map.nodes[nodes[i].id]?.parentId !== rootId) nodes[i].py += dy;
    }
  };
  const beside = [sideBox("right"), sideBox("left")].filter((box): box is Box => box !== null);
  const upBox = sideBox("up");
  if (upBox) {
    const blocking = beside.filter((box) => touches(upBox, box));
    if (blocking.length) shiftRange(ranges.up, Math.min(...blocking.map((box) => box.minY)) - GROUP_CLEAR - upBox.maxY);
  }
  const downBox = sideBox("down");
  if (downBox) {
    const blocking = beside.filter((box) => touches(downBox, box));
    if (blocking.length) shiftRange(ranges.down, Math.max(...blocking.map((box) => box.maxY)) + GROUP_CLEAR - downBox.minY);
  }

  placeManual(manualKids(rootId), 0, 0);

  // Tree order (parents before children, siblings as authored) is the same whichever nodes are pinned, so the
  // canvas never has to reorder its elements when a branch is dragged into place or back onto the layout.
  const order = new Map<string, number>();
  const visit = (id: string) => {
    if (order.has(id)) return;
    order.set(id, order.size);
    for (const child of kids(id)) visit(child);
  };
  visit(rootId);
  nodes.sort((a, b) => (order.get(a.id) ?? Infinity) - (order.get(b.id) ?? Infinity));

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of nodes) {
    minX = Math.min(minX, p.x - p.w / 2);
    maxX = Math.max(maxX, p.x + p.w / 2);
    minY = Math.min(minY, p.y - p.h / 2);
    maxY = Math.max(maxY, p.y + p.h / 2);
  }

  return {
    nodes,
    edges: buildEdges(map, nodes),
    minX: minX - CANVAS_PAD,
    minY: minY - CANVAS_PAD,
    width: maxX - minX + CANVAS_PAD * 2,
    height: maxY - minY + CANVAS_PAD * 2,
  };
}

/** The layout with one branch moved by (dx, dy) map pixels — what the canvas shows while that branch is being dragged. */
export function shiftBranch(map: MindMap, layout: MindMapLayout, id: string, dx: number, dy: number): MindMapLayout {
  const parentId = map.nodes[id]?.parentId;
  const parent = parentId ? layout.nodes.find((p) => p.id === parentId) : undefined;
  const lock = map.nodes[id]?.dir;
  const nodes = layout.nodes.map((p) => {
    if (p.id === id) {
      const x = p.x + dx;
      const y = p.y + dy;
      const side = parent ? directionOf(x - parent.x, y - parent.y) : p.side;
      return { ...p, x, y, manual: true, side, dir: isDirection(lock) ? lock : side };
    }
    return isDescendant(map, id, p.id) ? { ...p, x: p.x + dx, y: p.y + dy, px: p.px + dx, py: p.py + dy } : p;
  });
  return { ...layout, nodes, edges: buildEdges(map, nodes) };
}

// ---------- Mermaid mindmap codec ----------
// Shapes carry importance: ))bang(( = high, (rounded) = medium, [square] = low, ((circle)) = root.
// Icon, colour/size classes and description comments sit on the lines after a node, Mermaid-style.
// A hand-placed node also carries `%% @at x,y` (its offset from its parent) — a comment to Mermaid —
// a node whose direction is locked `%% @dir right` (or down, left, up: the side its branch grows
// towards), a tagged node `%% @tags a, b, c`: its tags, comma-separated, in the spelling
// `normalizeTag` gives them, and a node with association links one `%% @link <target> | <label>` line
// per link — the target's Mermaid id, then an optional ` | ` and the label — before its description
// lines. All four are comments to every other renderer, and a node without them simply has none. Each
// node's Mermaid id is its identity: it is written out as is and read back, so the same node can be
// recognised in two edited copies of a file, and a link can name its target. Nodes without one get an
// id derived from their place in the tree, so reading the same text twice yields the same ids.

const POSITION_DIRECTIVE = /^%%\s*@at\s+(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/;
/** `%% @dir right` — the side the node's branch grows towards, locked. */
const DIRECTION_DIRECTIVE = /^%%\s*@dir\s+(right|down|left|up)\s*$/i;
/** `%% @tags a, b` — the word alone (a node with its tags cleared) is also a directive, not a description line. */
const TAGS_DIRECTIVE = /^%%\s*@tags(?::|\b)\s*(.*)$/i;
/** `%% @link n1abc234 | depends on` — a link to the node with that id, labelled with what follows the bar (if anything). */
const LINK_DIRECTIVE = /^%%\s*@link\s+([A-Za-z0-9_-]+)\s*(?:\|\s*(.*))?$/i;

export function toMermaid(map: MindMap): string {
  const lines = ["mindmap"];
  let counter = 0;
  const used = new Set<string>();
  // Ids first, so a link can name its target by the id the target is actually written under.
  const written = new Map<string, string>();
  const name = (id: string) => {
    const node = map.nodes[id];
    if (!node || written.has(id)) return;
    let mermaidId = isMermaidId(id) && !used.has(id) ? id : `n${++counter}`;
    while (used.has(mermaidId)) mermaidId = `n${++counter}`;
    used.add(mermaidId);
    written.set(id, mermaidId);
    for (const child of node.children) name(child);
  };
  name(map.rootId);
  const walk = (id: string, depth: number) => {
    const node = map.nodes[id];
    const mermaidId = written.get(id);
    if (!node || !mermaidId) return;
    const indent = "  ".repeat(depth + 1);
    const label = node.label.replace(/[()[\]{}]/g, " ").replace(/\s+/g, " ").trim() || "Untitled";
    const shaped =
      id === map.rootId
        ? `${mermaidId}((${label}))`
        : node.importance === "high"
          ? `${mermaidId}))${label}((`
          : node.importance === "low"
            ? `${mermaidId}[${label}]`
            : `${mermaidId}(${label})`;
    lines.push(indent + shaped);
    if (node.icon) lines.push(`${indent}::icon(lucide lucide-${node.icon})`);
    lines.push(`${indent}:::color-${node.color} size-${node.size}`);
    if (node.offset && id !== map.rootId) lines.push(`${indent}%% @at ${Math.round(node.offset.x)},${Math.round(node.offset.y)}`);
    if (isDirection(node.dir) && id !== map.rootId) lines.push(`${indent}%% @dir ${node.dir}`);
    if (node.tags.length) lines.push(`${indent}%% @tags ${node.tags.join(", ")}`);
    for (const link of node.links) {
      const target = written.get(link.to);
      if (!target || link.to === id) continue;
      const label = normalizeLinkLabel(link.label);
      lines.push(label ? `${indent}%% @link ${target} | ${label}` : `${indent}%% @link ${target}`);
    }
    for (const descriptionLine of node.description.split("\n")) {
      const text = descriptionLine.trim();
      // A line that could read back as a directive (`@at`, `@tags`, …) is escaped; the parser takes the backslash off.
      if (text) lines.push(`${indent}%% ${/^[@\\]/.test(text) ? `\\${text}` : text}`);
    }
    for (const child of node.children) walk(child, depth + 1);
  };
  walk(map.rootId, 0);
  return lines.join("\n");
}

const SHAPE_PATTERNS: Array<{ re: RegExp; importance: Importance }> = [
  { re: /^([\w-]*)\)\)(.+)\(\($/, importance: "high" }, // ))bang((
  { re: /^([\w-]*)\(\((.+)\)\)$/, importance: "medium" }, // ((circle))
  { re: /^([\w-]*)\{\{(.+)\}\}$/, importance: "medium" }, // {{hexagon}}
  { re: /^([\w-]*)\[(.+)\]$/, importance: "low" }, // [square]
  { re: /^([\w-]*)\)(.+)\($/, importance: "medium" }, // )cloud(
  { re: /^([\w-]*)\((.+)\)$/, importance: "medium" }, // (rounded)
];

function cleanLabel(raw: string): string {
  return (
    raw
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/^["`]+|["`]+$/g, "")
      .replace(/\s+/g, " ")
      .trim() || "Untitled"
  );
}

/** The node's explicit Mermaid id (when it has a shape), its label, and the importance its shape encodes. */
function parseNodeText(body: string): { id: string | null; label: string; importance: Importance } {
  for (const { re, importance } of SHAPE_PATTERNS) {
    const match = re.exec(body);
    if (match) return { id: match[1] && isMermaidId(match[1]) ? match[1] : null, label: cleanLabel(match[2]), importance };
  }
  return { id: null, label: cleanLabel(body), importance: "medium" };
}

function applyClasses(node: MindNode, classes: string) {
  for (const token of classes.trim().split(/\s+/)) {
    const color = /^color-([a-z]+)$/.exec(token);
    if (color && NODE_COLORS[color[1]]) node.color = color[1];
    const size = /^size-(small|medium|large)$/.exec(token);
    if (size) node.size = size[1] as NodeSize;
  }
}

function matchIcon(text: string): string | null {
  const inner = text.slice(text.indexOf("(") + 1, text.lastIndexOf(")")).toLowerCase();
  for (const key of ICON_KEYS) {
    const icon = NODE_ICONS[key];
    if (inner.includes(key) || icon.aliases.some((alias) => inner.includes(alias))) return key;
  }
  return null;
}

/** Parse Mermaid `mindmap` source. Throws an Error with a readable message when nothing usable is found. */
export function parseMermaid(source: string): MindMap {
  assertTextSize(source);
  const nodes: Record<string, MindNode> = {};
  let rootId: string | null = null;
  let last: MindNode | null = null;
  let nodeCount = 0;
  const stack: Array<{ id: string; indent: number; depth: number }> = [];
  /** Links as the file names them; their targets may be written further down, so they are resolved at the end. */
  const pendingLinks: Array<{ node: MindNode; to: string; label: string }> = [];
  /** The id the file gives a node, else one derived from its parent and label — the same on every read. */
  const identify = (explicit: string | null, parentId: string | null, label: string): string => {
    if (explicit && !nodes[explicit]) return explicit;
    let id = hashId(`${parentId ?? ""}/${label}`);
    for (let n = 2; nodes[id]; n++) id = hashId(`${parentId ?? ""}/${label}#${n}`);
    return id;
  };

  for (const rawLine of source.replace(/\r/g, "").split("\n")) {
    if (!rawLine.trim()) continue;
    const indent = (/^[ \t]*/.exec(rawLine)?.[0] ?? "").replace(/\t/g, "    ").length;
    const text = rawLine.trim();

    if (!rootId && /^mindmap\b/i.test(text)) continue;
    if (text.startsWith("%%")) {
      if (last && !text.startsWith("%%{")) {
        const position = POSITION_DIRECTIVE.exec(text);
        const direction = position ? null : DIRECTION_DIRECTIVE.exec(text);
        const tagged = position || direction ? null : TAGS_DIRECTIVE.exec(text);
        const linked = position || direction || tagged ? null : LINK_DIRECTIVE.exec(text);
        if (position) {
          if (last.parentId) last.offset = clampOffset({ x: Number(position[1]), y: Number(position[2]) });
        } else if (direction) {
          const dir = direction[1].toLowerCase();
          if (last.parentId && isDirection(dir)) last.dir = dir;
        } else if (tagged) {
          // Several `@tags` lines on one node add up.
          last.tags = normalizeTags([...last.tags, ...tagged[1].split(",")]);
        } else if (linked) {
          pendingLinks.push({ node: last, to: linked[1], label: linked[2] ?? "" });
        } else {
          const comment = text.slice(2).trim();
          const extra = comment.startsWith("\\") ? comment.slice(1) : comment;
          last.description = last.description ? `${last.description}\n${extra}` : extra;
        }
      }
      continue;
    }
    if (text.startsWith("::icon(")) {
      if (last) last.icon = matchIcon(text);
      continue;
    }
    if (text.startsWith(":::")) {
      if (last) applyClasses(last, text.slice(3));
      continue;
    }

    let body = text;
    let inlineClasses = "";
    const classIndex = body.indexOf(":::");
    if (classIndex >= 0) {
      inlineClasses = body.slice(classIndex + 3);
      body = body.slice(0, classIndex).trim();
    }
    const { id: explicitId, label, importance } = parseNodeText(body);

    while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
    const parentId = stack.length ? stack[stack.length - 1].id : rootId;
    const depth = stack.length ? stack[stack.length - 1].depth + 1 : parentId ? 2 : 1;
    if (depth > MAX_MAP_DEPTH) {
      throw new UserFacingError(`This map is too deeply nested. The limit is ${MAX_MAP_DEPTH} levels, including the root.`);
    }
    if (++nodeCount > MAX_MAP_NODES) {
      throw new UserFacingError(`This map has too many nodes. The limit is ${MAX_MAP_NODES.toLocaleString()}, including the root.`);
    }
    const id = identify(explicitId, parentId, label);
    const parent = parentId ? nodes[parentId] : undefined;
    const node = makeNode(id, parent ? parent.id : null, [], label, "", parent ? parent.color : "brand", null, parent ? "medium" : "large", importance);
    if (parent) parent.children.push(id);
    else rootId = id;
    nodes[id] = node;
    if (inlineClasses) applyClasses(node, inlineClasses);
    stack.push({ id, indent, depth });
    last = node;
  }

  if (!rootId) throw new Error("No nodes found. Start with a `mindmap` line followed by one indented root node.");
  // A link to an id the file never defines (or a node's own) is dropped; `normalizeLinks` also keeps one per target.
  for (const { node, to, label } of pendingLinks) node.links.push({ to, label });
  for (const node of Object.values(nodes)) node.links = normalizeLinks(node.id, node.links, nodes);
  return { rootId, nodes };
}
