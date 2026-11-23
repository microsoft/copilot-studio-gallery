import { useState, useSyncExternalStore, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowDown, ArrowUp, Cloud, FileText, Folder, FolderOpen, FolderUp, History, Link2, Network, PenLine, Search, X } from "lucide-react";
import { MapThumbnail } from "@/components/map-thumbnail";
import { FolderBreadcrumbs } from "@/components/onedrive-browser";
import { PageNav } from "@/components/page-nav";
import { SheetGrabber } from "@/components/sheet-grabber";
import { ShareLinkDialog } from "@/components/share-link-dialog";
import { EmptyState, ErrorState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useConfirm } from "@/hooks/use-confirm";
import { useFolderPage } from "@/hooks/use-folder-page";
import { useMindMapLayout } from "@/hooks/use-mindmap-layout";
import { useShareLink } from "@/hooks/use-share-link";
import { describeError, retryUnlessTimedOut } from "@/lib/app-errors";
import { parseMermaid, setAllCollapsed, type MindMap } from "@/lib/mindmap-data";
import {
  crumbFor,
  displayName,
  fileRef,
  formatBytes,
  formatDate,
  isSupportedTextFile,
  loadCrumbs,
  openFile,
  rememberCrumbs,
  type Crumb,
  type DriveFileRef,
  type DriveItem,
} from "@/lib/onedrive-files";
import type { RecentFile } from "@/lib/recent-files";
import { editorPath } from "@/lib/share-link";
import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";

type Place = "recent" | "onedrive";
type SortKey = "name" | "modified" | "size";
interface Sort {
  key: SortKey;
  descending: boolean;
}
type ShareFn = (file: DriveFileRef) => Promise<void>;

const PLACE_KEY = "mermaid-mindmap-studio.library-place";
const SORT_KEY = "mermaid-mindmap-studio.library-sort";
const DEFAULT_SORT: Sort = { key: "modified", descending: true };
/** Top-level branches listed beside the preview before the rest is summarised. */
const BRANCHES_SHOWN = 8;

function readPlace(): Place {
  try {
    return localStorage.getItem(PLACE_KEY) === "recent" ? "recent" : "onedrive";
  } catch {
    return "onedrive";
  }
}

function readSort(): Sort {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(SORT_KEY) ?? "null");
    if (parsed && typeof parsed === "object") {
      const { key, descending } = parsed as Record<string, unknown>;
      if ((key === "name" || key === "modified" || key === "size") && typeof descending === "boolean") return { key, descending };
    }
  } catch {
    // Unreadable storage: use the default order.
  }
  return DEFAULT_SORT;
}

function remember(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage unavailable: the choice lasts for this visit.
  }
}

const byName = (a: DriveItem, b: DriveItem) => (a.Name ?? "").localeCompare(b.Name ?? "", undefined, { numeric: true, sensitivity: "base" });
function compareBy(sort: Sort) {
  const base = (a: DriveItem, b: DriveItem) => {
    if (sort.key === "modified") return (a.LastModified ?? "").localeCompare(b.LastModified ?? "") || byName(a, b);
    if (sort.key === "size") return (a.Size ?? 0) - (b.Size ?? 0) || byName(a, b);
    return byName(a, b);
  };
  return (a: DriveItem, b: DriveItem) => (sort.descending ? -base(a, b) : base(a, b));
}

const LARGE_SCREEN = "(min-width: 1024px)";
function subscribeLarge(onChange: () => void) {
  const query = window.matchMedia(LARGE_SCREEN);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}
/** Wide screens show the details pane beside the list; narrower ones show it in a bottom sheet. */
function useLargeScreen() {
  return useSyncExternalStore(subscribeLarge, () => window.matchMedia(LARGE_SCREEN).matches);
}

const folderOf = (path: string) => path.slice(0, path.lastIndexOf("/")) || "/";
const usedAtFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });
function formatUsedAt(iso: string) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : usedAtFormat.format(date);
}
/** A recent entry in the shape the preview and file helpers read. */
const recentItem = (file: RecentFile): DriveItem => ({ Id: file.id, Name: file.name, Path: file.path });

export function LibraryPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get("view");
  const [storedPlace, setStoredPlace] = useState<Place>(readPlace);
  const place: Place = requested === "recent" ? "recent" : requested === "onedrive" ? "onedrive" : storedPlace;
  const [crumbs, setCrumbs] = useState<Crumb[]>(loadCrumbs);
  const [filter, setFilter] = useState("");
  const [sort, setSort] = useState<Sort>(readSort);
  const [selected, setSelected] = useState<DriveItem | null>(null);
  const { share, target, clear } = useShareLink();
  const large = useLargeScreen();
  const navigate = useNavigate();
  const current = crumbs[crumbs.length - 1];
  const parent = crumbs.length > 1 ? crumbs[crumbs.length - 2] : null;

  const choosePlace = (next: Place) => {
    setStoredPlace(next);
    remember(PLACE_KEY, next);
    setSelected(null);
    setFilter("");
    setSearchParams((params) => {
      const updated = new URLSearchParams(params);
      updated.delete("view");
      return updated;
    }, { replace: true });
  };
  const changeFolder = (next: Crumb[]) => {
    setCrumbs(next);
    rememberCrumbs(next);
    setSelected(null);
    setFilter("");
  };
  const enterFolder = (item: DriveItem) => {
    const crumb = crumbFor(item, current);
    if (crumb) changeFolder([...crumbs, crumb]);
  };
  const goTo = (index: number) => changeFolder(crumbs.slice(0, index + 1));
  const goUp = parent ? () => goTo(crumbs.length - 2) : undefined;
  const changeSort = (key: SortKey) => {
    const next: Sort = sort.key === key ? { key, descending: !sort.descending } : { key, descending: key !== "name" };
    setSort(next);
    remember(SORT_KEY, JSON.stringify(next));
  };
  const openInEditor = (item: DriveItem) => {
    const ref = fileRef(item);
    if (ref) navigate(editorPath(ref));
  };

  const preview = <MapPreview item={selected} onShare={share} />;

  return (
    <div className="flex min-h-full flex-col">
      <header className="flex min-h-12 flex-wrap items-center gap-x-3 gap-y-1 border-b border-border bg-card px-3 py-1">
        <h1 className="text-sm font-semibold tracking-tight">Map library</h1>
        <PageNav />
      </header>

      <div className="flex flex-1 flex-col gap-4 p-3 sm:p-4 lg:flex-row lg:gap-6 lg:p-6">
        <nav aria-label="Places" className="shrink-0 lg:w-44">
          <ul className="flex gap-1 lg:flex-col">
            <PlaceButton icon={History} label="Recent" active={place === "recent"} onClick={() => choosePlace("recent")} />
            <PlaceButton icon={Cloud} label="OneDrive" active={place === "onedrive"} onClick={() => choosePlace("onedrive")} />
          </ul>
        </nav>

        <section aria-labelledby="files-heading" className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {place === "onedrive" ? (
              <>
                <Button variant="outline" size="icon" className="size-8 shrink-0" onClick={goUp} disabled={!goUp} aria-label={parent ? `Up to ${parent.name}` : "Up one folder"}>
                  <FolderUp aria-hidden="true" />
                </Button>
                <h2 id="files-heading" className="sr-only">
                  {current.name}
                </h2>
                <div className="min-w-0 flex-1 rounded-md border border-border bg-card px-1.5 py-1">
                  <FolderBreadcrumbs crumbs={crumbs} onGoTo={goTo} />
                </div>
              </>
            ) : (
              <h2 id="files-heading" className="min-w-0 flex-1 text-base font-semibold tracking-tight">
                Recent files
              </h2>
            )}
            <div className="relative w-full sm:w-56">
              <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                aria-label="Filter by name"
                placeholder="Filter by name"
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                autoComplete="off"
                className="h-8 pl-8"
              />
            </div>
          </div>

          {place === "onedrive" ? (
            <FolderListing
              key={current.id ?? "root"}
              folder={current}
              filter={filter}
              sort={sort}
              onSort={changeSort}
              selectedId={selected?.Id ?? null}
              onSelect={setSelected}
              onOpen={openInEditor}
              onClearFilter={() => setFilter("")}
              onEnterFolder={enterFolder}
              onGoUp={goUp}
              parentName={parent?.name}
              onShare={share}
            />
          ) : (
            <RecentListing
              filter={filter}
              selectedId={selected?.Id ?? null}
              onSelect={setSelected}
              onOpen={openInEditor}
              onClearFilter={() => setFilter("")}
              onBrowse={() => choosePlace("onedrive")}
              onShare={share}
              onForgotten={(id) => selected?.Id === id && setSelected(null)}
            />
          )}
        </section>

        {large ? (
          <aside aria-labelledby="preview-heading" className="shrink-0 lg:sticky lg:top-6 lg:w-[22rem] lg:self-start xl:w-[26rem]">
            <h2 id="preview-heading" className="sr-only">
              Details
            </h2>
            {preview}
          </aside>
        ) : (
          <Sheet open={selected !== null} onOpenChange={(open) => !open && setSelected(null)}>
            <SheetContent
              side="bottom"
              className="max-h-[85dvh] gap-0 overflow-y-auto rounded-t-xl bg-card p-0 pb-[env(safe-area-inset-bottom)]"
              onOpenAutoFocus={(event) => event.preventDefault()}
            >
              <SheetGrabber onClose={() => setSelected(null)} />
              <SheetTitle className="sr-only">Details</SheetTitle>
              <SheetDescription className="sr-only">Preview of the selected map.</SheetDescription>
              <div className="px-3 pb-3 [&>div]:border-0 [&>div]:p-1">{preview}</div>
            </SheetContent>
          </Sheet>
        )}
      </div>

      <ShareLinkDialog target={target} onClose={clear} />
    </div>
  );
}

function PlaceButton({ icon: Icon, label, active, onClick }: { icon: typeof Cloud; label: string; active: boolean; onClick: () => void }) {
  return (
    <li>
      <Button
        variant="ghost"
        size="sm"
        aria-current={active ? "page" : undefined}
        onClick={onClick}
        className={cn("w-full justify-start", active && "bg-accent font-semibold text-accent-foreground")}
      >
        <Icon aria-hidden="true" className={active ? "text-primary" : "text-muted-foreground"} />
        {label}
      </Button>
    </li>
  );
}

/** The bordered file table shared by both places; `head` holds the column headers. */
function FileTable({ head, children, label }: { head: ReactNode; children: ReactNode; label: string }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <table className="w-full table-fixed text-sm" aria-label={label}>
        <thead className="border-b border-border bg-muted/50 text-xs text-muted-foreground">
          <tr>{head}</tr>
        </thead>
        <tbody className="divide-y divide-border">{children}</tbody>
      </table>
    </div>
  );
}

function SortHeader({ label, column, sort, onSort, className }: { label: string; column: SortKey; sort: Sort; onSort: (key: SortKey) => void; className?: string }) {
  const active = sort.key === column;
  const Arrow = sort.descending ? ArrowDown : ArrowUp;
  return (
    <th scope="col" aria-sort={active ? (sort.descending ? "descending" : "ascending") : "none"} className={cn("p-0 font-medium", className)}>
      <button
        type="button"
        onClick={() => onSort(column)}
        className={cn(
          "inline-flex w-full items-center gap-1 px-3 py-2 hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
          className?.includes("text-right") && "justify-end",
          active && "text-foreground",
        )}
      >
        {label}
        {active && <Arrow aria-hidden="true" className="size-3.5" />}
      </button>
    </th>
  );
}

const ACTIONS_HEADER = (
  <th scope="col" className="w-20 px-2 py-2 sm:w-24">
    <span className="sr-only">Actions</span>
  </th>
);

/** The name cell: a button that selects a file (double-click opens it) or enters a folder. */
function NameCell({ icon, name, meta, selected, onActivate }: { icon: ReactNode; name: string; meta?: ReactNode; selected?: boolean; onActivate: () => void }) {
  return (
    <td className="p-0">
      <button
        type="button"
        aria-current={selected ? "true" : undefined}
        title={name}
        onClick={onActivate}
        className="flex w-full min-w-0 items-center gap-2.5 px-3 py-2 text-left focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
      >
        {icon}
        <span className="min-w-0">
          <span className="block truncate font-medium">{name}</span>
          {meta && <span className="block truncate text-xs text-muted-foreground tabular-nums">{meta}</span>}
        </span>
      </button>
    </td>
  );
}

function FileActions({ file, name, onShare, extra }: { file: DriveFileRef; name: string; onShare: ShareFn; extra?: ReactNode }) {
  return (
    <td className="px-1 py-1 text-right whitespace-nowrap">
      <Button asChild variant="ghost" size="icon" className="size-8">
        <Link to={editorPath(file)} aria-label={`Open ${name} in the editor`} title="Open in editor">
          <PenLine aria-hidden="true" />
        </Link>
      </Button>
      <Button variant="ghost" size="icon" className="hidden size-8 sm:inline-flex" aria-label={`Copy link to ${name}`} title="Copy link" onClick={() => void onShare(file)}>
        <Link2 aria-hidden="true" />
      </Button>
      {extra}
    </td>
  );
}

const rowClass = (selected: boolean) => cn("transition-colors", selected ? "bg-accent" : "hover:bg-muted/50");

function LoadingRows() {
  return (
    <div role="status" aria-label="Loading files" className="space-y-px overflow-hidden rounded-lg border border-border bg-card">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="flex items-center gap-3 px-3 py-2.5">
          <Skeleton className="size-4 rounded" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="hidden h-4 w-24 sm:block" />
        </div>
      ))}
    </div>
  );
}

interface ListingProps {
  filter: string;
  selectedId: string | null;
  onSelect: (item: DriveItem) => void;
  onOpen: (item: DriveItem) => void;
  onClearFilter: () => void;
  onShare: ShareFn;
}

function NoMatches({ onClearFilter }: { onClearFilter: () => void }) {
  return (
    <EmptyState
      icon={Search}
      title="Nothing matches this filter"
      className="py-12"
      action={
        <Button variant="outline" size="sm" onClick={onClearFilter}>
          Clear filter
        </Button>
      }
    />
  );
}

function FolderListing({
  folder,
  filter,
  sort,
  onSort,
  selectedId,
  onSelect,
  onOpen,
  onClearFilter,
  onEnterFolder,
  onGoUp,
  parentName,
  onShare,
}: ListingProps & {
  folder: Crumb;
  sort: Sort;
  onSort: (key: SortKey) => void;
  onEnterFolder: (item: DriveItem) => void;
  onGoUp?: () => void;
  parentName?: string;
}) {
  // Explicit page-token pagination, remounted per folder (see the `key` above).
  const { query, items, nextToken, hasPrevious, pageNumber, showNextPage, showPreviousPage } = useFolderPage(folder.id);
  const needle = filter.trim().toLowerCase();
  const matches = (item: DriveItem) => !needle || (item.Name ?? "").toLowerCase().includes(needle);
  const folderSort: Sort = sort.key === "name" ? sort : { key: "name", descending: false };
  const folders = items.filter((item) => item.IsFolder).sort(compareBy(folderSort));
  const maps = items.filter(isSupportedTextFile).sort(compareBy(sort));
  const shownFolders = folders.filter(matches);
  const shownMaps = maps.filter(matches);

  const upAction = onGoUp ? (
    <Button variant="outline" size="sm" onClick={onGoUp}>
      <FolderUp aria-hidden="true" />
      Up to {parentName}
    </Button>
  ) : undefined;

  if (query.isPending) return <LoadingRows />;

  if (query.isError) {
    return (
      <ErrorState
        title={`Couldn't load ${folder.name}`}
        description={describeError(query.error)}
        className="py-12"
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
  }

  let body: ReactNode;
  if (folders.length === 0 && maps.length === 0 && !hasPrevious && !nextToken) {
    body = (
      <EmptyState
        icon={FolderOpen}
        title={`${folder.name} has no maps or folders`}
        description="Maps saved from the editor appear here, along with any other .mmd, .mermaid, .md or .txt file."
        className="py-12"
        action={
          <div className="flex flex-wrap justify-center gap-2">
            {upAction}
            <Button asChild size="sm">
              <Link to="/">
                <PenLine aria-hidden="true" />
                Open the editor
              </Link>
            </Button>
          </div>
        }
      />
    );
  } else if (shownFolders.length === 0 && shownMaps.length === 0) {
    body = needle ? <NoMatches onClearFilter={onClearFilter} /> : <p className="py-8 text-center text-sm text-muted-foreground">No maps on this page.</p>;
  } else {
    body = (
      <>
        {needle && (
          <p role="status" className="text-xs text-muted-foreground">
            {shownFolders.length + shownMaps.length} of {folders.length + maps.length} items on this page match
          </p>
        )}
        <FileTable
          label={`Contents of ${folder.name}`}
          head={
            <>
              <SortHeader label="Name" column="name" sort={sort} onSort={onSort} className="text-left" />
              <SortHeader label="Modified" column="modified" sort={sort} onSort={onSort} className="hidden w-36 text-left sm:table-cell" />
              <SortHeader label="Size" column="size" sort={sort} onSort={onSort} className="hidden w-24 text-right md:table-cell" />
              {ACTIONS_HEADER}
            </>
          }
        >
          {shownFolders.map((item) => (
            <tr key={item.Id ?? item.Name} className={rowClass(false)}>
              <NameCell
                icon={<Folder aria-hidden="true" className="size-4 shrink-0 fill-primary/15 text-primary" />}
                name={item.Name ?? "Folder"}
                meta={<span className="sm:hidden">Folder</span>}
                onActivate={() => onEnterFolder(item)}
              />
              <td className="hidden px-3 py-2 text-muted-foreground tabular-nums sm:table-cell">{formatDate(item.LastModified)}</td>
              <td className="hidden px-3 py-2 text-right text-muted-foreground md:table-cell">—</td>
              <td />
            </tr>
          ))}
          {shownMaps.map((item) => {
            const ref = fileRef(item);
            const name = displayName(item);
            const selected = item.Id === selectedId;
            return (
              <tr key={item.Id ?? item.Path ?? item.Name} className={rowClass(selected)} onDoubleClick={() => onOpen(item)}>
                <NameCell
                  icon={<FileText aria-hidden="true" className={cn("size-4 shrink-0", selected ? "text-primary" : "text-muted-foreground")} />}
                  name={name}
                  meta={
                    <span className="sm:hidden">
                      {[formatDate(item.LastModified), item.Size !== undefined ? formatBytes(item.Size) : ""].filter(Boolean).join(" · ")}
                    </span>
                  }
                  selected={selected}
                  onActivate={() => onSelect(item)}
                />
                <td className="hidden px-3 py-2 text-muted-foreground tabular-nums sm:table-cell">{formatDate(item.LastModified)}</td>
                <td className="hidden px-3 py-2 text-right text-muted-foreground tabular-nums md:table-cell">{item.Size !== undefined ? formatBytes(item.Size) : ""}</td>
                {ref ? <FileActions file={ref} name={name} onShare={onShare} /> : <td />}
              </tr>
            );
          })}
        </FileTable>
      </>
    );
  }

  return (
    <div className="space-y-3">
      {body}
      {(hasPrevious || nextToken) && (
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

function RecentListing({
  filter,
  selectedId,
  onSelect,
  onOpen,
  onClearFilter,
  onBrowse,
  onShare,
  onForgotten,
}: ListingProps & { onBrowse: () => void; onForgotten: (id: string) => void }) {
  const recentFiles = useAppStore((s) => s.recentFiles);
  const forgetRecentFile = useAppStore((s) => s.forgetRecentFile);
  const clearRecentFiles = useAppStore((s) => s.clearRecentFiles);
  const confirm = useConfirm();
  const needle = filter.trim().toLowerCase();
  const shown = needle ? recentFiles.filter((file) => file.name.toLowerCase().includes(needle)) : recentFiles;

  const forget = (id: string) => {
    forgetRecentFile(id);
    onForgotten(id);
  };
  const clearAll = async () => {
    const ok = await confirm({
      title: "Clear recent files?",
      description: "The list is emptied on this device. The files stay in OneDrive.",
      confirmLabel: "Clear",
    });
    if (!ok) return;
    clearRecentFiles();
    if (selectedId) onForgotten(selectedId);
  };

  if (recentFiles.length === 0) {
    return (
      <EmptyState
        icon={History}
        title="No recent files yet"
        description="Maps you open or save in the editor are listed here on this device."
        className="py-12"
        action={
          <Button variant="outline" size="sm" onClick={onBrowse}>
            <Cloud aria-hidden="true" />
            Browse OneDrive
          </Button>
        }
      />
    );
  }
  if (shown.length === 0) return <NoMatches onClearFilter={onClearFilter} />;

  return (
    <div className="space-y-3">
      <FileTable
        label="Recent files"
        head={
          <>
            <th scope="col" className="px-3 py-2 text-left font-medium">
              Name
            </th>
            <th scope="col" className="hidden w-44 px-3 py-2 text-left font-medium sm:table-cell">
              Last opened
            </th>
            <th scope="col" className="w-24 px-2 py-2 sm:w-32">
              <span className="sr-only">Actions</span>
            </th>
          </>
        }
      >
        {shown.map((file) => {
          const item = recentItem(file);
          const name = displayName(item);
          const selected = file.id === selectedId;
          return (
            <tr key={file.id} className={rowClass(selected)} onDoubleClick={() => onOpen(item)}>
              <NameCell
                icon={<FileText aria-hidden="true" className={cn("size-4 shrink-0", selected ? "text-primary" : "text-muted-foreground")} />}
                name={name}
                meta={
                  <>
                    {folderOf(file.path)}
                    <span className="sm:hidden"> · {formatUsedAt(file.usedAt)}</span>
                  </>
                }
                selected={selected}
                onActivate={() => onSelect(item)}
              />
              <td className="hidden px-3 py-2 text-muted-foreground tabular-nums sm:table-cell">{formatUsedAt(file.usedAt)}</td>
              <FileActions
                file={file}
                name={name}
                onShare={onShare}
                extra={
                  <Button variant="ghost" size="icon" className="size-8" aria-label={`Remove ${name} from recent files`} title="Remove from recent" onClick={() => forget(file.id)}>
                    <X aria-hidden="true" />
                  </Button>
                }
              />
            </tr>
          );
        })}
      </FileTable>
      <div className="flex justify-end">
        <Button variant="ghost" size="sm" onClick={() => void clearAll()}>
          Clear recent files
        </Button>
      </div>
    </div>
  );
}

interface PreviewData {
  map: MindMap | null;
  /** Set when the file opened but isn't Mermaid mindmap code. */
  parseError: string | null;
}

async function loadPreview(item: DriveItem): Promise<PreviewData> {
  const opened = await openFile(item);
  try {
    return { map: setAllCollapsed(parseMermaid(opened.text), false), parseError: null };
  } catch (error) {
    return { map: null, parseError: describeError(error, "The file could not be read as a Mermaid mindmap.") };
  }
}

function MapPreview({ item, onShare }: { item: DriveItem | null; onShare: ShareFn }) {
  const ref = item ? fileRef(item) : null;
  const query = useQuery({
    queryKey: ["onedrive-file", ref?.id],
    queryFn: () => {
      if (!item) throw new Error("No map selected.");
      return loadPreview(item);
    },
    enabled: item !== null && ref !== null,
    retry: retryUnlessTimedOut,
  });
  const map = query.data?.map ?? null;
  const layout = useMindMapLayout(map);

  const panel = "rounded-xl border border-border bg-card p-4";

  if (!item || !ref) {
    return (
      <div className={panel}>
        <EmptyState icon={Network} title="Select a map to preview it" description="Double-click a map to open it in the editor." className="py-12" />
      </div>
    );
  }

  const name = displayName(item);
  const actions = (
    <div className="flex flex-wrap gap-2">
      <Button asChild size="sm">
        <Link to={editorPath(ref)}>
          <PenLine aria-hidden="true" />
          Open in editor
        </Link>
      </Button>
      <Button variant="outline" size="sm" onClick={() => void onShare(ref)}>
        <Link2 aria-hidden="true" />
        Copy link
      </Button>
    </div>
  );

  if (query.isPending) {
    return (
      <div className={cn(panel, "space-y-3")}>
        {actions}
        <div role="status" aria-label={`Loading preview of ${name}`} className="space-y-3">
          <Skeleton className="aspect-[4/3] w-full rounded-lg" />
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className={cn(panel, "space-y-3")}>
        <ErrorState
          title={`Couldn't open ${name}`}
          description={describeError(query.error)}
          className="py-10"
          action={
            <Button size="sm" onClick={() => void query.refetch()}>
              Retry
            </Button>
          }
        />
      </div>
    );
  }

  if (!map || !layout) {
    return (
      <div className={panel}>
        <ErrorState title={`${name} isn't a Mermaid mindmap`} description={query.data?.parseError ?? undefined} className="py-10" />
      </div>
    );
  }

  const root = map.nodes[map.rootId];
  const nodeCount = Object.keys(map.nodes).length;
  const branches = root.children.map((id) => map.nodes[id]).filter((node) => node !== undefined);
  const hiddenBranches = Math.max(0, branches.length - BRANCHES_SHOWN);

  return (
    <div className={cn(panel, "space-y-4")}>
      {actions}
      <figure className="m-0 space-y-2">
        <div className="rounded-lg border border-border bg-background bg-[radial-gradient(var(--color-border)_1px,transparent_1px)] bg-[size:16px_16px] p-2">
          <MapThumbnail map={map} layout={layout} id="library-preview" className="max-h-72" />
        </div>
        <figcaption className="text-sm">
          <span className="font-medium">{root.label}</span>
          <span className="text-muted-foreground">
            {" "}
            · {nodeCount} {nodeCount === 1 ? "node" : "nodes"} · {branches.length} {branches.length === 1 ? "branch" : "branches"}
          </span>
        </figcaption>
      </figure>

      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="text-muted-foreground">File</dt>
        <dd className="min-w-0 break-all">{ref.path}</dd>
        {item.LastModified && (
          <>
            <dt className="text-muted-foreground">Modified</dt>
            <dd>{formatDate(item.LastModified)}</dd>
          </>
        )}
        {item.Size !== undefined && (
          <>
            <dt className="text-muted-foreground">Size</dt>
            <dd className="tabular-nums">{formatBytes(item.Size)}</dd>
          </>
        )}
      </dl>

      {branches.length > 0 && (
        <div className="space-y-1.5">
          <h3 className="text-sm font-medium">Branches</h3>
          <ul className="flex flex-wrap gap-1.5">
            {branches.slice(0, BRANCHES_SHOWN).map((node) => (
              <li key={node.id} className="rounded-md border border-border bg-muted px-2 py-0.5 text-xs break-words text-foreground">
                {node.label}
              </li>
            ))}
            {hiddenBranches > 0 && <li className="px-1 py-0.5 text-xs text-muted-foreground">+{hiddenBranches} more</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
