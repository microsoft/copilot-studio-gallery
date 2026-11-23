import { withValidLinks, type MindMap, type MindNode, type NodeLink } from "@/lib/mindmap-data";

// Three-way merge of a mind map: the version the user started from (base), the
// user's current map (mine), and the version now on OneDrive (theirs). Nodes are
// matched by id — the Mermaid codec keeps ids stable across saves — so a change
// made on only one side is taken as is, and a node both sides changed in
// different ways becomes a conflict the user settles. The merge is a pure
// function: re-run it with the user's resolutions to get the final map.

export type MergeSide = "mine" | "theirs";

/**
 * What a merge compares on a node. `parent` is its place in the tree; `links` are the association links it
 * carries (merged link by link, see `mergeLinks`); `collapsed` is view state and never merged.
 */
export type NodeField = "label" | "description" | "tags" | "links" | "color" | "icon" | "size" | "importance" | "offset" | "dir" | "parent";

const FIELDS: NodeField[] = ["label", "description", "tags", "links", "color", "icon", "size", "importance", "offset", "dir", "parent"];

export type ConflictKind = "edited" | "moved" | "deleted-by-me" | "deleted-by-them";

export interface NodeConflict {
  id: string;
  kind: ConflictKind;
  label: string;
  /** The node as each side has it; null on the side that deleted it. */
  mine: MindNode | null;
  theirs: MindNode | null;
  /** Fields the two versions disagree on; for a deletion, the fields the surviving side changed (none = items under it). */
  fields: NodeField[];
}

export type ChangeKind = "added" | "edited" | "moved" | "removed";

/** One change taken into the merged map, for the summary. */
export interface NodeChange {
  id: string;
  kind: ChangeKind;
  label: string;
  fields: NodeField[];
}

export interface MergeResult {
  map: MindMap;
  conflicts: NodeConflict[];
  /** Changes taken from the OneDrive version. */
  theirs: NodeChange[];
  /** The user's own changes, relative to the version they started from. */
  mine: NodeChange[];
}

function fieldOf(node: MindNode, field: NodeField): string | null {
  switch (field) {
    case "offset":
      return node.offset ? `${node.offset.x},${node.offset.y}` : null;
    case "dir":
      return node.dir ?? null;
    case "parent":
      return node.parentId;
    case "icon":
      return node.icon;
    case "tags":
      // Tags are kept sorted, so the same set always joins to the same string.
      return node.tags.join(",");
    case "links":
      // Links are kept sorted by target, so the same set always joins to the same string.
      return node.links.map((link) => `${link.to}\u001F${link.label}`).join("\u001E");
    default:
      return node[field];
  }
}

const same = (a: MindNode, b: MindNode, field: NodeField) => fieldOf(a, field) === fieldOf(b, field);

/** The fields that differ between two versions of a node. */
export function changedFields(from: MindNode, to: MindNode): NodeField[] {
  return FIELDS.filter((field) => !same(from, to, field));
}

/**
 * A node's links merged link by link: a link one side added, removed or relabelled comes through, and only a
 * link both sides changed in different ways (one relabelled it, the other removed it; both relabelled it
 * differently) is a clash — then `side`'s version of that link is taken and the clash reported.
 */
function mergeLinks(base: readonly NodeLink[], mine: readonly NodeLink[], theirs: readonly NodeLink[], side: MergeSide): { links: NodeLink[]; clash: boolean } {
  const labelIn = (links: readonly NodeLink[]) => new Map(links.map((link) => [link.to, link.label] as const));
  const b = labelIn(base);
  const m = labelIn(mine);
  const t = labelIn(theirs);
  const targets = new Set([...b.keys(), ...m.keys(), ...t.keys()]);
  const links: NodeLink[] = [];
  let clash = false;
  for (const to of targets) {
    const bl = b.get(to);
    const ml = m.get(to);
    const tl = t.get(to);
    let label: string | undefined;
    if (ml === tl) label = ml;
    else if (bl === ml) label = tl;
    else if (bl === tl) label = ml;
    else {
      clash = true;
      label = side === "mine" ? ml : tl;
    }
    if (label !== undefined) links.push({ to, label });
  }
  return { links: links.sort((a, z) => (a.to < z.to ? -1 : a.to > z.to ? 1 : 0)), clash };
}

function copyField(into: MindNode, from: MindNode, field: NodeField) {
  switch (field) {
    case "offset":
      if (from.offset) into.offset = { ...from.offset };
      else delete into.offset;
      break;
    case "links":
      into.links = from.links.map((link) => ({ ...link }));
      break;
    case "dir":
      if (from.dir) into.dir = from.dir;
      else delete into.dir;
      break;
    case "parent":
      into.parentId = from.parentId;
      break;
    case "icon":
      into.icon = from.icon;
      break;
    case "tags":
      into.tags = [...from.tags];
      break;
    case "label":
    case "description":
    case "color":
      into[field] = from[field];
      break;
    case "size":
      into.size = from.size;
      break;
    case "importance":
      into.importance = from.importance;
      break;
  }
}

const kindFor = (fields: NodeField[]): ChangeKind => (fields.length > 0 && fields.every((field) => field === "parent") ? "moved" : "edited");

function renameNode(map: MindMap, from: string, to: string): MindMap {
  const swap = (id: string | null) => (id === from ? to : id);
  const nodes: Record<string, MindNode> = {};
  for (const node of Object.values(map.nodes)) {
    nodes[swap(node.id) as string] = {
      ...node,
      id: swap(node.id) as string,
      parentId: swap(node.parentId),
      children: node.children.map((child) => swap(child) as string),
      links: node.links.map((link) => ({ ...link, to: swap(link.to) as string })),
    };
  }
  return { rootId: swap(map.rootId) as string, nodes };
}

/** The same map with its root known as `rootId`: roots always correspond, whatever id a copy gives its own. */
function withRootId(map: MindMap, rootId: string): MindMap {
  if (map.rootId === rootId) return map;
  let current = map;
  if (current.nodes[rootId]) current = renameNode(current, rootId, `${rootId}~`);
  return renameNode(current, current.rootId, rootId);
}

/** Same sequence once both are reduced to the elements they share. */
function sameOrder(a: string[], b: string[]): boolean {
  const inB = new Set(b);
  const inA = new Set(a);
  const left = a.filter((id) => inB.has(id));
  const right = b.filter((id) => inA.has(id));
  return left.length === right.length && left.every((id, i) => id === right[i]);
}

/** `primary`'s order, with anything only `secondary` has slotted in after its nearest neighbour there. */
function weave(primary: string[], secondary: string[]): string[] {
  const result = [...primary];
  const placed = new Set(result);
  secondary.forEach((id, index) => {
    if (placed.has(id)) return;
    let at = 0;
    for (let i = index - 1; i >= 0; i--) {
      const before = result.indexOf(secondary[i]);
      if (before >= 0) {
        at = before + 1;
        break;
      }
    }
    result.splice(at, 0, id);
    placed.add(id);
  });
  return result;
}

export function mergeMindMaps(baseMap: MindMap, mineMap: MindMap, theirsMap: MindMap, resolutions: Record<string, MergeSide> = {}): MergeResult {
  const rootId = baseMap.rootId;
  const base = baseMap;
  const mine = withRootId(mineMap, rootId);
  const theirs = withRootId(theirsMap, rootId);
  const choice = (id: string): MergeSide => resolutions[id] ?? "mine";
  const sideMap = (side: MergeSide | "base") => (side === "mine" ? mine : side === "theirs" ? theirs : base);

  const conflicts: NodeConflict[] = [];
  const fromTheirs: NodeChange[] = [];
  const fromMine: NodeChange[] = [];
  /** Merged nodes; children are rebuilt at the end. */
  const kept = new Map<string, MindNode>();
  /** Which side decided each node's parent — for untangling a move both sides made into each other's branch. */
  const parentFrom = new Map<string, MergeSide | "base">();

  /** True when `side` added or changed the node itself. */
  const touched = (side: MindMap, id: string): boolean => {
    const node = side.nodes[id];
    const before = base.nodes[id];
    return !!node && (!before || changedFields(before, node).length > 0);
  };
  const subtreeTouched = (side: MindMap, id: string): boolean => {
    const node = side.nodes[id];
    return !!node && node.children.some((child) => touched(side, child) || subtreeTouched(side, child));
  };

  /**
   * Nodes one side deleted that the other still has. A deleted branch goes quietly unless the
   * other side worked on it or inside it — then the branch top becomes one conflict that settles
   * the whole branch, so the user decides once rather than per node.
   */
  const deletionPlan = (keeper: MindMap, deleter: MindMap, keeperSide: MergeSide): Map<string, boolean> => {
    const gone = new Set(Object.keys(base.nodes).filter((id) => keeper.nodes[id] && !deleter.nodes[id] && id !== rootId));
    const keep = new Map<string, boolean>();
    for (const top of gone) {
      const parentId = keeper.nodes[top].parentId;
      if (parentId && gone.has(parentId)) continue;
      const node = keeper.nodes[top];
      const worked = touched(keeper, top) || subtreeTouched(keeper, top);
      let decision = false;
      if (worked) {
        conflicts.push({
          id: top,
          kind: keeperSide === "mine" ? "deleted-by-them" : "deleted-by-me",
          label: node.label,
          mine: keeperSide === "mine" ? node : null,
          theirs: keeperSide === "theirs" ? node : null,
          fields: changedFields(base.nodes[top], node),
        });
        decision = choice(top) === keeperSide;
      }
      const stack = [top];
      while (stack.length) {
        const id = stack.pop() as string;
        keep.set(id, decision);
        for (const child of keeper.nodes[id].children) if (gone.has(child)) stack.push(child);
      }
    }
    return keep;
  };
  const keepMine = deletionPlan(mine, theirs, "mine");
  const keepTheirs = deletionPlan(theirs, mine, "theirs");

  const ids = new Set([...Object.keys(base.nodes), ...Object.keys(mine.nodes), ...Object.keys(theirs.nodes)]);
  for (const id of ids) {
    const b = base.nodes[id];
    const m = mine.nodes[id];
    const t = theirs.nodes[id];

    if (m && t) {
      const merged: MindNode = { ...m, children: [] };
      if (b) {
        const mFields = changedFields(b, m);
        const tFields = changedFields(b, t);
        const side = choice(id);
        // Links both sides touched are merged one by one; the set as a whole clashes only when a single link does.
        const links = mFields.includes("links") && tFields.includes("links") && !same(m, t, "links") ? mergeLinks(b.links, m.links, t.links, side) : null;
        const clash = mFields.filter((field) => tFields.includes(field) && !same(m, t, field) && (field !== "links" || links?.clash));
        let parentSource: MergeSide | "base" = "base";
        for (const field of FIELDS) {
          if (field === "links" && links) {
            // Already settled link by link — a clashing link the chosen side's way.
            merged.links = links.links;
            continue;
          }
          const mChanged = mFields.includes(field);
          const tChanged = tFields.includes(field);
          let source: MergeSide | "base" = "base";
          if (mChanged && tChanged) source = clash.includes(field) ? side : "mine";
          else if (tChanged) source = "theirs";
          else if (mChanged) source = "mine";
          if (source !== "base") copyField(merged, source === "mine" ? m : t, field);
          if (field === "parent") parentSource = source;
        }
        kept.set(id, merged);
        parentFrom.set(id, parentSource);
        if (clash.length) conflicts.push({ id, kind: clash.every((field) => field === "parent") ? "moved" : "edited", label: m.label, mine: m, theirs: t, fields: clash });
        const takenTheirs = tFields.filter((field) => !clash.includes(field) || side === "theirs");
        if (takenTheirs.length) fromTheirs.push({ id, kind: kindFor(takenTheirs), label: t.label, fields: takenTheirs });
        const takenMine = mFields.filter((field) => !clash.includes(field) || side === "mine");
        if (takenMine.length) fromMine.push({ id, kind: kindFor(takenMine), label: m.label, fields: takenMine });
      } else {
        // Added on both sides under one id: the same node when it reads the same, else a choice.
        const diff = changedFields(m, t);
        const side = choice(id);
        if (diff.length && side === "theirs") for (const field of diff) copyField(merged, t, field);
        kept.set(id, merged);
        parentFrom.set(id, diff.includes("parent") ? side : "mine");
        if (diff.length) conflicts.push({ id, kind: "edited", label: m.label, mine: m, theirs: t, fields: diff });
        fromMine.push({ id, kind: "added", label: m.label, fields: [] });
        fromTheirs.push({ id, kind: "added", label: t.label, fields: [] });
      }
    } else if (m) {
      if (!b) {
        kept.set(id, { ...m, children: [] });
        parentFrom.set(id, "mine");
        fromMine.push({ id, kind: "added", label: m.label, fields: [] });
      } else if (keepMine.get(id)) {
        kept.set(id, { ...m, children: [] });
        parentFrom.set(id, "mine");
      } else {
        fromTheirs.push({ id, kind: "removed", label: b.label, fields: [] });
      }
    } else if (t) {
      if (!b) {
        kept.set(id, { ...t, children: [], collapsed: false });
        parentFrom.set(id, "theirs");
        fromTheirs.push({ id, kind: "added", label: t.label, fields: [] });
      } else if (keepTheirs.get(id)) {
        kept.set(id, { ...t, children: [], collapsed: false });
        parentFrom.set(id, "theirs");
      } else {
        fromMine.push({ id, kind: "removed", label: b.label, fields: [] });
      }
    }
  }

  // Every kept node needs a kept parent: a node whose parent went away moves up to the nearest surviving ancestor.
  const nearestKept = (tree: MindMap, from: string | null): string | null => {
    let current = from;
    const seen = new Set<string>();
    while (current && !seen.has(current)) {
      if (kept.has(current)) return current;
      seen.add(current);
      current = tree.nodes[current]?.parentId ?? null;
    }
    return null;
  };
  for (const [id, node] of kept) {
    if (id === rootId) {
      node.parentId = null;
      continue;
    }
    if (node.parentId && kept.has(node.parentId) && node.parentId !== id) continue;
    const source = parentFrom.get(id) ?? "base";
    node.parentId =
      nearestKept(sideMap(source), node.parentId) ?? nearestKept(base, base.nodes[id]?.parentId ?? null) ?? nearestKept(mine, mine.nodes[id]?.parentId ?? null) ?? rootId;
  }

  // Two moves into each other's branch make a loop: undo the OneDrive-side move (the user's stands) and let the user decide.
  const findCycle = (): string[] | null => {
    const state = new Map<string, 1 | 2>();
    for (const start of kept.keys()) {
      if (state.has(start)) continue;
      const path: string[] = [];
      let current: string | null = start;
      while (current && current !== rootId) {
        const seen = state.get(current);
        if (seen === 2) break;
        if (seen === 1) return path.slice(path.indexOf(current));
        state.set(current, 1);
        path.push(current);
        current = kept.get(current)?.parentId ?? null;
      }
      for (const id of path) state.set(id, 2);
    }
    return null;
  };
  for (let cycle = findCycle(), guard = 0; cycle && guard < kept.size; cycle = findCycle(), guard++) {
    const victim =
      cycle.find((id) => parentFrom.get(id) === "theirs" && choice(id) !== "theirs") ??
      cycle.find((id) => parentFrom.get(id) === "mine") ??
      cycle.find((id) => parentFrom.get(id) === "theirs") ??
      cycle[0];
    if (parentFrom.get(victim) === "theirs" && !conflicts.some((conflict) => conflict.id === victim)) {
      conflicts.push({ id: victim, kind: "moved", label: kept.get(victim)?.label ?? victim, mine: mine.nodes[victim] ?? null, theirs: theirs.nodes[victim] ?? null, fields: ["parent"] });
    }
    const node = kept.get(victim) as MindNode;
    node.parentId = nearestKept(base, base.nodes[victim]?.parentId ?? null) ?? rootId;
    if (node.parentId === victim) node.parentId = rootId;
    parentFrom.set(victim, "base");
  }

  // Sibling order: the side that reordered a family wins; anything only the other side has is slotted in beside its neighbours.
  const families = new Map<string, string[]>();
  for (const [id, node] of kept) {
    if (id === rootId || !node.parentId) continue;
    const list = families.get(node.parentId) ?? [];
    list.push(id);
    families.set(node.parentId, list);
  }
  for (const [parentId, members] of families) {
    const inFamily = new Set(members);
    const order = (map: MindMap) => (map.nodes[parentId]?.children ?? []).filter((id) => inFamily.has(id));
    const ob = order(base);
    const om = order(mine);
    const ot = order(theirs);
    const theirsReordered = !sameOrder(ot, ob);
    const mineReordered = !sameOrder(om, ob);
    const woven = theirsReordered && !mineReordered ? weave(ot, om) : weave(om, ot);
    const seen = new Set(woven);
    const parent = kept.get(parentId) as MindNode;
    parent.children = [...woven, ...members.filter((id) => !seen.has(id))];
  }

  const nodes: Record<string, MindNode> = {};
  for (const [id, node] of kept) nodes[id] = node;
  // A link whose target one side deleted (and the merge let go) has nowhere to lead; it goes with the target.
  return { map: withValidLinks({ rootId, nodes }), conflicts, theirs: fromTheirs, mine: fromMine };
}

/** Counts of each kind of change, for a one-line summary. */
export function countChanges(changes: NodeChange[]): Record<ChangeKind, number> {
  const counts: Record<ChangeKind, number> = { added: 0, edited: 0, moved: 0, removed: 0 };
  for (const change of changes) counts[change.kind] += 1;
  return counts;
}

/** "2 added, 1 edited, 1 removed" — or "" when nothing changed. */
export function summarizeChanges(changes: NodeChange[]): string {
  const counts = countChanges(changes);
  return (Object.keys(counts) as ChangeKind[])
    .filter((kind) => counts[kind] > 0)
    .map((kind) => `${counts[kind]} ${kind}`)
    .join(", ");
}
