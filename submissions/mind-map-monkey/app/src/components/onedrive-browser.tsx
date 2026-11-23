import { useState } from "react";
import { ChevronRight, FileText, Folder, FolderOpen, FolderUp, LoaderCircle } from "lucide-react";
import { ErrorNotice } from "@/components/error-notice";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useFolderPage } from "@/hooks/use-folder-page";
import { describeError, type FailureInfo } from "@/lib/app-errors";
import { crumbFor, formatBytes, formatDate, isSupportedTextFile, loadCrumbs, rememberCrumbs, type Crumb, type DriveItem } from "@/lib/onedrive-files";
import { cn } from "@/lib/utils";

/** The folder trail: earlier folders are buttons, the current one is marked as the location. */
export function FolderBreadcrumbs({ crumbs, onGoTo }: { crumbs: Crumb[]; onGoTo: (index: number) => void }) {
  return (
    <nav aria-label="Folder path">
      <ol className="flex flex-wrap items-center gap-x-1 gap-y-1 text-sm">
        {crumbs.map((crumb, index) => {
          const isCurrent = index === crumbs.length - 1;
          return (
            <li key={crumb.id ?? "root"} className="flex min-w-0 items-center gap-1">
              {index > 0 && <ChevronRight aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />}
              {isCurrent ? (
                <span aria-current="location" className="break-all px-1 font-medium">
                  {crumb.name}
                </span>
              ) : (
                <Button variant="link" size="sm" className="h-auto px-1 py-0 text-muted-foreground" onClick={() => onGoTo(index)}>
                  {crumb.name}
                </Button>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

interface OneDriveBrowserDialogProps {
  mode: "open" | "save";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** A file is being opened or saved — item actions pause meanwhile. */
  busy?: boolean;
  /** The last failed open or save, described for the user, with the file involved and a way to retry. */
  failure?: FailureInfo | null;
  onDismissFailure?: () => void;
  defaultName?: string;
  onOpenFile?: (item: DriveItem) => void;
  onOpenPath?: (path: string) => void;
  onSave?: (folderPath: string, name: string) => void;
}

export function OneDriveBrowserDialog({
  mode,
  open,
  onOpenChange,
  busy = false,
  failure,
  onDismissFailure,
  defaultName = "",
  onOpenFile,
  onOpenPath,
  onSave,
}: OneDriveBrowserDialogProps) {
  const [crumbs, setCrumbs] = useState<Crumb[]>(loadCrumbs);
  const [pathInput, setPathInput] = useState("");
  const [name, setName] = useState(defaultName);
  const current = crumbs[crumbs.length - 1];
  const parentCrumb = crumbs.length > 1 ? crumbs[crumbs.length - 2] : null;

  const enterFolder = (item: DriveItem) => {
    const crumb = crumbFor(item, current);
    if (crumb) setCrumbs((list) => [...list, crumb]);
  };

  const goTo = (index: number) => setCrumbs((list) => list.slice(0, index + 1));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{mode === "open" ? "Open from OneDrive" : "Save map"}</DialogTitle>
          <DialogDescription>
            {mode === "open"
              ? "Opening a file replaces the current map. Mermaid and text files (.mmd, .mermaid, .md, .txt) are listed."
              : "The current map is written as Mermaid code to the folder shown below."}
          </DialogDescription>
        </DialogHeader>

        {mode === "open" && (
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (pathInput.trim()) onOpenPath?.(pathInput);
            }}
          >
            <div className="min-w-0 flex-1 space-y-1.5">
              <Label htmlFor="drive-path">File path</Label>
              <Input
                id="drive-path"
                value={pathInput}
                onChange={(event) => setPathInput(event.target.value)}
                placeholder="/Diagrams/roadmap.mmd"
                autoComplete="off"
                spellCheck={false}
                className="font-mono text-xs"
              />
            </div>
            <Button type="submit" variant="secondary" disabled={busy || !pathInput.trim()}>
              Open path
            </Button>
          </form>
        )}

        <FolderBreadcrumbs crumbs={crumbs} onGoTo={goTo} />

        <FolderListing
          key={current.id ?? "root"}
          folder={current}
          mode={mode}
          busy={busy}
          onEnterFolder={enterFolder}
          onPickFile={(item) => {
            rememberCrumbs(crumbs);
            onOpenFile?.(item);
          }}
          onGoUp={parentCrumb ? () => goTo(crumbs.length - 2) : undefined}
          parentName={parentCrumb?.name}
        />

        {failure && (
          <ErrorNotice title={failure.title} description={failure.description} file={failure.file} onRetry={failure.retry} busy={busy} onDismiss={onDismissFailure} />
        )}

        {mode === "save" && (
          <form
            className="flex flex-wrap items-end gap-2 border-t border-border pt-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (!name.trim()) return;
              rememberCrumbs(crumbs);
              onSave?.(current.path, name);
            }}
          >
            <div className="min-w-0 flex-1 space-y-1.5">
              <Label htmlFor="drive-file-name">File name</Label>
              <Input id="drive-file-name" value={name} onChange={(event) => setName(event.target.value)} autoComplete="off" spellCheck={false} />
            </div>
            <Button type="submit" disabled={busy || !name.trim()}>
              {busy ? <LoaderCircle aria-hidden="true" className="animate-spin motion-reduce:animate-none" /> : <FolderOpen aria-hidden="true" />}
              Save here
            </Button>
          </form>
        )}

        {mode === "open" && (
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

function FolderListing({
  folder,
  mode,
  busy,
  onEnterFolder,
  onPickFile,
  onGoUp,
  parentName,
}: {
  folder: Crumb;
  mode: "open" | "save";
  busy: boolean;
  onEnterFolder: (item: DriveItem) => void;
  onPickFile: (item: DriveItem) => void;
  onGoUp?: () => void;
  parentName?: string;
}) {
  // Explicit page-token pagination, remounted per folder (see the `key`).
  const { query, items, nextToken, hasPrevious, pageNumber, showNextPage, showPreviousPage } = useFolderPage(folder.id);

  const rows = items
    .filter((item) => item.IsFolder || isSupportedTextFile(item))
    .sort((a, b) => Number(Boolean(b.IsFolder)) - Number(Boolean(a.IsFolder)) || (a.Name ?? "").localeCompare(b.Name ?? ""));

  const upAction = onGoUp ? (
    <Button variant="outline" size="sm" onClick={onGoUp}>
      <FolderUp aria-hidden="true" />
      Up to {parentName}
    </Button>
  ) : undefined;

  let body;
  if (query.isPending) {
    body = <LoadingState rows={4} className="p-2" />;
  } else if (query.isError) {
    body = (
      <ErrorState
        title={`Couldn't load ${folder.name}`}
        description={describeError(query.error)}
        className="py-10"
        action={
          <div className="flex flex-wrap justify-center gap-2">
            {upAction}
            {hasPrevious && (
              <Button variant="outline" size="sm" onClick={showPreviousPage}>
                Previous page
              </Button>
            )}
            <Button size="sm" onClick={() => void query.refetch()}>
              Retry
            </Button>
          </div>
        }
      />
    );
  } else if (!hasPrevious && rows.length === 0 && !nextToken) {
    body = (
      <EmptyState
        icon={FolderOpen}
        title={mode === "open" ? "No Mermaid or text files here" : "No subfolders here"}
        description={mode === "open" ? "Open a folder that holds a .mmd, .mermaid, .md or .txt file." : "Save into this folder, or go up to choose another."}
        className="py-10"
        action={upAction}
      />
    );
  } else {
    body = (
      <ul className="divide-y divide-border">
        {rows.map((item) => {
          const key = item.Id ?? item.Path ?? item.Name ?? "";
          const rowClass =
            "flex w-full min-w-0 items-center gap-3 px-3 py-2 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring";
          if (item.IsFolder) {
            return (
              <li key={key}>
                <button type="button" className={cn(rowClass, "hover:bg-muted/50")} onClick={() => onEnterFolder(item)}>
                  <Folder aria-hidden="true" className="size-4 shrink-0 text-primary" />
                  <span className="min-w-0 flex-1 break-words font-medium">{item.Name}</span>
                  <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
                </button>
              </li>
            );
          }
          const meta = (
            <>
              <FileText aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 break-words">{item.Name}</span>
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{formatBytes(item.Size)}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{formatDate(item.LastModified)}</span>
            </>
          );
          return (
            <li key={key}>
              {mode === "open" ? (
                <button type="button" className={cn(rowClass, "hover:bg-muted/50 disabled:opacity-60")} disabled={busy} onClick={() => onPickFile(item)}>
                  {meta}
                </button>
              ) : (
                <div className={cn(rowClass, "text-muted-foreground")}>{meta}</div>
              )}
            </li>
          );
        })}
        {rows.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted-foreground">Nothing to show on this page.</li>}
      </ul>
    );
  }

  return (
    <div className="flex min-h-0 flex-col gap-2">
      <div
        role="region"
        aria-label={`Contents of ${folder.name}`}
        tabIndex={0}
        aria-busy={query.isFetching || undefined}
        className="max-h-[45dvh] min-h-32 touch-pan-x touch-pan-y overflow-auto overscroll-contain rounded-md border border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {body}
      </div>
      {(hasPrevious || nextToken) && !query.isError && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button variant="outline" size="sm" disabled={!hasPrevious || query.isFetching} onClick={showPreviousPage}>
            Previous page
          </Button>
          <span role="status" className="text-xs text-muted-foreground">
            {query.isFetching ? "Loading…" : `Page ${pageNumber}`}
          </span>
          <Button variant="outline" size="sm" disabled={!nextToken || query.isFetching} onClick={showNextPage}>
            Next page
          </Button>
        </div>
      )}
    </div>
  );
}
