import { useMemo } from "react";
import { Spline } from "lucide-react";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { linkRefusal, type MindMap } from "@/lib/mindmap-data";

interface LinkPickerProps {
  map: MindMap;
  /** The node the new link leads from; null keeps the picker closed. */
  sourceId: string | null;
  onPick: (targetId: string) => void;
  onClose: () => void;
}

interface Candidate {
  id: string;
  label: string;
  /** The parent's label, to tell two nodes with the same label apart. */
  under: string | null;
  /** Why this node cannot be the target, when it cannot. */
  refusal: string | null;
}

/** Plain substring matching on the labels (the item's value is its id, which should not match anything typed). */
const filterByLabel = (_value: string, search: string, keywords?: string[]): number =>
  (keywords ?? []).join(" ").toLowerCase().includes(search.trim().toLowerCase()) ? 1 : 0;

/** Why a node is offered greyed out, in two or three words. */
function shortRefusal(refusal: string): string {
  if (refusal.includes("already linked")) return "Already linked";
  if (refusal.includes("joined by the tree")) return "Joined by the tree";
  return "Not available";
}

/**
 * The keyboard route to a link: every other node in the map, in tree order, searchable by label; Enter (or a
 * click) links the source node to the chosen one. Nodes that cannot be linked — the parent, the children,
 * nodes already linked — are listed greyed out so the reason is visible rather than the node missing.
 */
export function LinkPicker({ map, sourceId, onPick, onClose }: LinkPickerProps) {
  const source = sourceId ? map.nodes[sourceId] : undefined;
  const candidates = useMemo((): Candidate[] => {
    if (!sourceId || !map.nodes[sourceId]) return [];
    const list: Candidate[] = [];
    const seen = new Set<string>();
    const stack = [map.rootId];
    while (stack.length) {
      const id = stack.pop() as string;
      if (seen.has(id)) continue;
      seen.add(id);
      const node = map.nodes[id];
      if (!node) continue;
      if (id !== sourceId) {
        list.push({ id, label: node.label, under: node.parentId ? (map.nodes[node.parentId]?.label ?? null) : null, refusal: linkRefusal(map, sourceId, id) });
      }
      for (let i = node.children.length - 1; i >= 0; i--) stack.push(node.children[i]);
    }
    return list;
  }, [map, sourceId]);

  return (
    <Dialog
      open={source !== undefined}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="gap-3 p-0 sm:max-w-md">
        <DialogHeader className="px-4 pt-4">
          <DialogTitle className="flex items-center gap-2">
            <Spline aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
            <span className="min-w-0 [overflow-wrap:anywhere]">Link {source?.label ?? "node"} to…</span>
          </DialogTitle>
          <DialogDescription>A dotted line from {source?.label ?? "this node"} to the node you choose; you can label it afterwards.</DialogDescription>
        </DialogHeader>
        <Command filter={filterByLabel} className="rounded-none border-t border-border bg-transparent">
          <CommandInput aria-label="Node name" placeholder="Type a node's name" autoFocus />
          <CommandList className="max-h-72">
            <CommandEmpty>No node by that name.</CommandEmpty>
            {candidates.map((candidate) => (
              <CommandItem
                key={candidate.id}
                value={candidate.id}
                keywords={[candidate.label, candidate.under ?? ""]}
                disabled={candidate.refusal !== null}
                onSelect={() => {
                  if (candidate.refusal === null) onPick(candidate.id);
                }}
                className="items-start"
              >
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="[overflow-wrap:anywhere]">{candidate.label}</span>
                  {candidate.under && <span className="text-xs text-muted-foreground [overflow-wrap:anywhere]">Under {candidate.under}</span>}
                </span>
                {candidate.refusal && <span className="shrink-0 text-xs text-muted-foreground">{shortRefusal(candidate.refusal)}</span>}
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
