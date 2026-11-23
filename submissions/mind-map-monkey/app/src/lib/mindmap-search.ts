import { normalizeTag, type MindMap, type MindNode } from "@/lib/mindmap-data";
import { parseRichText } from "@/lib/rich-text";

// Finding nodes in the open map. A query is free text plus tags; a node matches when it carries every
// tag asked for and its label, description, tags or the labels of the links it leads from contain the
// text. Matching is a pure function of the map and the query, so the canvas, the find bar and the
// inspector all agree on what matches.

/** What the find bar asks for: text to look for, and tags every match must carry. */
export interface SearchQuery {
  text: string;
  tags: string[];
}

export const EMPTY_QUERY: SearchQuery = { text: "", tags: [] };

export function isSearchActive(query: SearchQuery): boolean {
  return query.text.trim().length > 0 || query.tags.length > 0;
}

/** `#tag` words in the text are tag requirements; the remaining words, lower-cased, are the text looked for. */
export function splitQueryText(text: string): { needle: string; tags: string[] } {
  const tags: string[] = [];
  const words: string[] = [];
  for (const word of text.trim().split(/\s+/)) {
    if (!word) continue;
    if (word.length > 1 && word.startsWith("#")) {
      const tag = normalizeTag(word);
      if (tag) tags.push(tag);
    } else {
      words.push(word);
    }
  }
  return { needle: words.join(" ").toLowerCase(), tags };
}

/** A description with its markup removed, for matching and reading out. */
export function plainDescription(markup: string): string {
  return parseRichText(markup)
    .map((line) => line.map((run) => run.text).join(""))
    .join(" ");
}

function nodeMatches(node: MindNode, needle: string, tags: readonly string[]): boolean {
  if (tags.some((tag) => !node.tags.includes(tag))) return false;
  if (!needle) return true;
  if (node.label.toLowerCase().includes(needle)) return true;
  if (node.tags.some((tag) => tag.includes(needle))) return true;
  if (node.links.some((link) => link.label.toLowerCase().includes(needle))) return true;
  return plainDescription(node.description).toLowerCase().includes(needle);
}

/** Ids of the nodes the query matches, in tree order — parents before children, siblings as authored. */
export function findMatches(map: MindMap, query: SearchQuery): string[] {
  if (!isSearchActive(query)) return [];
  const { needle, tags: textTags } = splitQueryText(query.text);
  const tags = [...new Set([...query.tags, ...textTags])];
  const found: string[] = [];
  const seen = new Set<string>();
  const stack = [map.rootId];
  while (stack.length) {
    const id = stack.pop() as string;
    if (seen.has(id)) continue;
    seen.add(id);
    const node = map.nodes[id];
    if (!node) continue;
    if (nodeMatches(node, needle, tags)) found.push(id);
    for (let i = node.children.length - 1; i >= 0; i--) stack.push(node.children[i]);
  }
  return found;
}

/** True when a collapsed branch above the node keeps it off the canvas. */
export function isHiddenByFold(map: MindMap, id: string): boolean {
  let current = map.nodes[id];
  const seen = new Set<string>();
  while (current?.parentId && !seen.has(current.id)) {
    seen.add(current.id);
    const parent = map.nodes[current.parentId];
    if (!parent) return false;
    if (parent.collapsed) return true;
    current = parent;
  }
  return false;
}

/** The map with every collapsed branch above the given nodes expanded, so they are on the canvas. */
export function expandTo(map: MindMap, ids: readonly string[]): MindMap {
  const nodes = { ...map.nodes };
  let changed = false;
  for (const id of ids) {
    let current = nodes[id];
    const seen = new Set<string>();
    while (current?.parentId && !seen.has(current.id)) {
      seen.add(current.id);
      const parent = nodes[current.parentId];
      if (!parent) break;
      if (parent.collapsed) {
        nodes[parent.id] = { ...parent, collapsed: false };
        changed = true;
      }
      current = nodes[parent.id];
    }
  }
  return changed ? { ...map, nodes } : map;
}

export interface TagCount {
  tag: string;
  count: number;
}

/** Every tag in the map and how many nodes carry it — most used first, then alphabetical. */
export function tagCounts(map: MindMap): TagCount[] {
  const counts = new Map<string, number>();
  for (const node of Object.values(map.nodes)) {
    for (const tag of node.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return [...counts]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || (a.tag < b.tag ? -1 : a.tag > b.tag ? 1 : 0));
}
