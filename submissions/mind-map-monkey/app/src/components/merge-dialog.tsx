import { useId } from "react";
import { ArrowRightLeft, CirclePlus, LoaderCircle, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { DIRECTION_LABEL, IMPORTANCE_LABEL, SIZE_LABEL, getColor, getIcon, type MindMap, type MindNode } from "@/lib/mindmap-data";
import { summarizeChanges, type ChangeKind, type MergeResult, type MergeSide, type NodeChange, type NodeConflict, type NodeField } from "@/lib/mindmap-merge";
import type { FileStamp } from "@/lib/onedrive-files";
import { cn } from "@/lib/utils";

export interface MergeReview {
  /** Save writes the merged map to OneDrive straight away; refresh only brings it into the editor. */
  intent: "save" | "refresh";
  fileName: string;
  /** Who changed the OneDrive copy, and when, as its metadata says. */
  stamp: FileStamp;
  mine: MindMap;
  theirs: MindMap;
  resolutions: Record<string, MergeSide>;
  result: MergeResult;
}

interface MergeDialogProps {
  review: MergeReview | null;
  busy: boolean;
  onResolve: (id: string, side: MergeSide) => void;
  onResolveAll: (side: MergeSide) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

const FIELD_LABEL: Record<NodeField, string> = {
  label: "Label",
  description: "Description",
  tags: "Tags",
  links: "Links",
  color: "Color",
  icon: "Icon",
  size: "Size",
  importance: "Importance",
  offset: "Position",
  dir: "Direction",
  parent: "Place",
};

const CHANGE_ICON: Record<ChangeKind, typeof Pencil> = { added: CirclePlus, edited: Pencil, moved: ArrowRightLeft, removed: Trash2 };

function describeField(node: MindNode, field: NodeField, map: MindMap): string {
  switch (field) {
    case "label":
      return node.label;
    case "description":
      return node.description.trim() || "No description";
    case "tags":
      return node.tags.length ? node.tags.map((tag) => `#${tag}`).join(", ") : "No tags";
    case "links":
      return node.links.length
        ? node.links.map((link) => `→ ${map.nodes[link.to]?.label ?? "another item"}${link.label ? ` (${link.label})` : ""}`).join(", ")
        : "No links";
    case "color":
      return getColor(node.color).name;
    case "icon":
      return node.icon ? (getIcon(node.icon)?.name ?? node.icon) : "None";
    case "size":
      return SIZE_LABEL[node.size];
    case "importance":
      return IMPORTANCE_LABEL[node.importance];
    case "offset":
      return node.offset ? `Pinned at ${node.offset.x}, ${node.offset.y}` : "Automatic";
    case "dir":
      return node.dir ? `Locked ${DIRECTION_LABEL[node.dir].toLowerCase()}` : "Automatic";
    case "parent":
      return node.parentId ? `Under "${map.nodes[node.parentId]?.label ?? "another item"}"` : "Root";
  }
}

function formatWhen(iso: string | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function conflictHeading(conflict: NodeConflict): string {
  switch (conflict.kind) {
    case "edited":
      return "changed by both of you";
    case "moved":
      return "moved by both of you";
    case "deleted-by-them":
      return conflict.fields.length ? "deleted on OneDrive, changed by you" : "deleted on OneDrive, with your changes inside";
    case "deleted-by-me":
      return conflict.fields.length ? "deleted by you, changed on OneDrive" : "deleted by you, with new changes inside on OneDrive";
  }
}

/** What choosing a side means for a conflicted node, in a few words, with the differing values underneath. */
function describeOption(conflict: NodeConflict, side: MergeSide, map: MindMap): { title: string; note?: string; fields: Array<{ field: NodeField; value: string }> } {
  const node = side === "mine" ? conflict.mine : conflict.theirs;
  const own = side === "mine";
  if (conflict.kind === "deleted-by-them") {
    return own
      ? { title: "Keep it", note: conflict.fields.length ? undefined : "With your changes inside.", fields: node ? conflict.fields.map((field) => ({ field, value: describeField(node, field, map) })) : [] }
      : { title: "Delete it", note: conflict.fields.length ? "Your changes to it are dropped." : "Your changes inside it are dropped.", fields: [] };
  }
  if (conflict.kind === "deleted-by-me") {
    return own
      ? { title: "Keep it deleted", note: conflict.fields.length ? "Their changes to it are dropped." : "Their changes inside it are dropped.", fields: [] }
      : { title: "Restore it", note: conflict.fields.length ? undefined : "With their changes inside.", fields: node ? conflict.fields.map((field) => ({ field, value: describeField(node, field, map) })) : [] };
  }
  return { title: own ? "Your version" : "OneDrive version", fields: node ? conflict.fields.map((field) => ({ field, value: describeField(node, field, map) })) : [] };
}

function ChangeList({ changes, labelledBy }: { changes: NodeChange[]; labelledBy: string }) {
  return (
    <ul
      tabIndex={0}
      aria-labelledby={labelledBy}
      className="max-h-40 space-y-1 overflow-y-auto rounded-md border border-border bg-muted/40 p-2 text-sm focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      {changes.map((change) => {
        const Icon = CHANGE_ICON[change.kind];
        return (
          <li key={`${change.kind}-${change.id}`} className="flex items-start gap-2">
            <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 [overflow-wrap:anywhere]">
              <span className="font-medium">{change.label}</span>
              <span className="text-muted-foreground">
                {" "}
                — {change.kind}
                {change.fields.length > 0 && change.kind !== "moved" ? `: ${change.fields.map((field) => FIELD_LABEL[field].toLowerCase()).join(", ")}` : ""}
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function ConflictChoice({ conflict, review, onResolve }: { conflict: NodeConflict; review: MergeReview; onResolve: (id: string, side: MergeSide) => void }) {
  const id = useId();
  const value = review.resolutions[conflict.id] ?? "mine";
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm">
        <span className="font-medium">{conflict.label}</span>
        <span className="text-muted-foreground"> — {conflictHeading(conflict)}</span>
      </legend>
      <RadioGroup value={value} onValueChange={(side) => onResolve(conflict.id, side as MergeSide)} className="grid gap-2 sm:grid-cols-2">
        {(["mine", "theirs"] as const).map((side) => {
          const option = describeOption(conflict, side, side === "mine" ? review.mine : review.theirs);
          const optionId = `${id}-${side}`;
          return (
            <div
              key={side}
              className={cn(
                "flex items-start gap-2 rounded-md border border-border p-2.5 transition-colors has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5 forced-colors:has-[[data-state=checked]]:border-[Highlight]",
              )}
            >
              <RadioGroupItem id={optionId} value={side} className="mt-0.5" />
              <Label htmlFor={optionId} className="flex min-w-0 flex-1 flex-col items-start gap-1 text-sm leading-snug font-normal">
                <span className="font-medium">{option.title}</span>
                {option.note && <span className="text-muted-foreground">{option.note}</span>}
                {option.fields.map(({ field, value: text }) => (
                  <span key={field} className="block min-w-0 [overflow-wrap:anywhere] whitespace-pre-wrap">
                    <span className="text-muted-foreground">{FIELD_LABEL[field]}: </span>
                    {text}
                  </span>
                ))}
              </Label>
            </div>
          );
        })}
      </RadioGroup>
    </fieldset>
  );
}

/**
 * The OneDrive copy moved on while the user was editing. Shows what came in, keeps
 * the user's own changes, and asks only where both sides changed the same item.
 */
export function MergeDialog({ review, busy, onResolve, onResolveAll, onConfirm, onCancel }: MergeDialogProps) {
  const conflicts = review?.result.conflicts ?? [];
  const by = review?.stamp.lastModifiedBy ? ` by ${review.stamp.lastModifiedBy}` : "";
  const when = formatWhen(review?.stamp.lastModified);
  const incoming = review ? summarizeChanges(review.result.theirs) : "";
  const own = review ? summarizeChanges(review.result.mine) : "";

  return (
    <Dialog
      open={review !== null}
      onOpenChange={(open) => {
        if (!open && !busy) onCancel();
      }}
    >
      <DialogContent className="sm:max-w-2xl" showCloseButton={!busy}>
        {review && (
          <>
            <DialogHeader>
              <DialogTitle>{review.fileName} changed on OneDrive</DialogTitle>
              <DialogDescription>
                Changed{by}
                {when ? ` on ${when}` : ""}.{" "}
                {conflicts.length === 0
                  ? "Those changes merge cleanly with yours; nothing of yours is lost."
                  : `${conflicts.length === 1 ? "One item was" : `${conflicts.length} items were`} changed on both sides in different ways. Choose which version to keep; everything else merges on its own.`}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <section aria-labelledby="merge-incoming" className="space-y-1.5">
                <h3 id="merge-incoming" className="text-sm font-medium">
                  From OneDrive{incoming ? ` · ${incoming}` : ""}
                </h3>
                {review.result.theirs.length > 0 ? (
                  <ChangeList changes={review.result.theirs} labelledBy="merge-incoming" />
                ) : (
                  <p className="text-sm text-muted-foreground">Only formatting changed.</p>
                )}
                <p className="text-sm text-muted-foreground">{own ? `Yours, kept: ${own}.` : "You have no changes of your own."}</p>
              </section>

              {conflicts.length > 0 && (
                <section aria-labelledby="merge-conflicts" className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 id="merge-conflicts" className="text-sm font-medium">
                      Choose a version
                    </h3>
                    {conflicts.length > 1 && (
                      <div role="group" aria-label="Choose for all" className="flex items-center gap-1 text-xs">
                        <Button variant="ghost" size="xs" onClick={() => onResolveAll("mine")}>
                          Keep all of mine
                        </Button>
                        <Button variant="ghost" size="xs" onClick={() => onResolveAll("theirs")}>
                          Take all from OneDrive
                        </Button>
                      </div>
                    )}
                  </div>
                  {conflicts.map((conflict) => (
                    <ConflictChoice key={conflict.id} conflict={conflict} review={review} onResolve={onResolve} />
                  ))}
                </section>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={onCancel} disabled={busy}>
                Cancel
              </Button>
              <Button onClick={onConfirm} disabled={busy}>
                {busy && <LoaderCircle aria-hidden="true" className="animate-spin motion-reduce:animate-none" />}
                {review.intent === "save" ? "Save merged map" : "Apply merged map"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
