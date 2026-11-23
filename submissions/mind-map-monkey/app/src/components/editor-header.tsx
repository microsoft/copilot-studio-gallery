import type { ReactNode, RefObject } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, Link2, LoaderCircle, Menu, Redo2, Save, Search, Undo2, type LucideIcon } from "lucide-react";
import appMark from "@/assets/app-mark-64.png";
import { PageNav } from "@/components/page-nav";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { usePageLinks, type BeforeNavigate } from "@/hooks/use-page-links";
import type { DriveFileRef } from "@/lib/onedrive-files";
import { cn } from "@/lib/utils";

export interface MenuAction {
  id: string;
  label: string;
  Icon: LucideIcon;
  onSelect: () => void;
  disabled?: boolean;
  /** The keyboard shortcut shown beside the label, e.g. "Ctrl+Z". */
  shortcut?: string;
}

/** A setting switched on and off from the menu, shown with a check mark while on. */
export interface MenuToggle {
  id: string;
  label: string;
  Icon: LucideIcon;
  checked: boolean;
  onToggle: (checked: boolean) => void;
  disabled?: boolean;
  shortcut?: string;
}

export type MenuEntry = MenuAction | MenuToggle | "separator";

const isToggle = (entry: MenuAction | MenuToggle): entry is MenuToggle => "checked" in entry;

/** The map's edit history, for the header's Undo and Redo buttons. */
export interface HistoryControls {
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  /** Shortcut hints, e.g. "Ctrl+Z" / "Ctrl+Y". */
  undoShortcut: string;
  redoShortcut: string;
}

/** The find bar's toggle, for the header's Find button. */
export interface FindControls {
  open: boolean;
  onToggle: () => void;
  /** Shortcut hint, e.g. "Ctrl+F". */
  shortcut: string;
  /** The button itself, so closing the bar can hand focus back to it. */
  buttonRef: RefObject<HTMLButtonElement | null>;
}

interface EditorHeaderProps {
  file: DriveFileRef | null;
  history: HistoryControls;
  find: FindControls;
  /** The map has changes not yet saved: the Save button carries a dot. */
  dirty: boolean;
  /** A file is on its way in: the status line says so instead. */
  openingLabel: string | null;
  fileMenu: MenuEntry[];
  viewMenu: MenuEntry[];
  /** The View menu's heading, e.g. "Zoom 120%". */
  viewLabel: string;
  onSave: () => void;
  saveDisabled: boolean;
  saving: boolean;
  /** Copy a link that opens the current OneDrive file; the button shows only while a file is open. */
  onCopyLink?: () => void;
  copyLinkDisabled?: boolean;
  beforeNavigate: BeforeNavigate;
}

/** Menu items from entries. A selection runs once the menu has closed, so a dialog it opens lands cleanly. */
function MenuItems({ entries }: { entries: MenuEntry[] }) {
  return (
    <>
      {entries.map((entry, index) =>
        entry === "separator" ? (
          <DropdownMenuSeparator key={`separator-${index}`} />
        ) : isToggle(entry) ? (
          <DropdownMenuCheckboxItem
            key={entry.id}
            checked={entry.checked}
            disabled={entry.disabled}
            onCheckedChange={(checked) => window.setTimeout(() => entry.onToggle(checked === true), 0)}
          >
            <entry.Icon aria-hidden="true" />
            {entry.label}
            {entry.shortcut && <DropdownMenuShortcut className="tracking-normal">{entry.shortcut}</DropdownMenuShortcut>}
          </DropdownMenuCheckboxItem>
        ) : (
          <DropdownMenuItem key={entry.id} disabled={entry.disabled} onSelect={() => window.setTimeout(entry.onSelect, 0)}>
            <entry.Icon aria-hidden="true" />
            {entry.label}
            {entry.shortcut && <DropdownMenuShortcut className="tracking-normal">{entry.shortcut}</DropdownMenuShortcut>}
          </DropdownMenuItem>
        ),
      )}
    </>
  );
}

function HeaderMenu({ label, heading, entries }: { label: string; heading?: ReactNode; entries: MenuEntry[] }) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 px-2">
          {label}
          <ChevronDown aria-hidden="true" className="size-3.5 opacity-70" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        {heading && (
          <>
            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground [overflow-wrap:anywhere]">{heading}</DropdownMenuLabel>
            <DropdownMenuSeparator />
          </>
        )}
        <MenuItems entries={entries} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * One compact row: app name, File and View fly-outs, page switcher, the Find  toggle, then the Save
  * icon (the file name and saved state sit in the footer). Below the small breakpoint the fly-outs and pages
 * fold into a single Menu so the row stays a row on a phone; Find stays out as one icon.
 */
export function EditorHeader({ file, history, find, dirty, openingLabel, fileMenu, viewMenu, viewLabel, onSave, saveDisabled, saving, onCopyLink, copyLinkDisabled, beforeNavigate }: EditorHeaderProps) {
  const links = usePageLinks(beforeNavigate);

  return (
    <header className="flex min-h-12 shrink-0 items-center gap-1.5 border-b border-border bg-card px-2 py-1 sm:gap-2 sm:px-3">
      <h1 className="flex shrink-0 items-center gap-1.5 text-sm font-semibold tracking-tight">
        {/* The name beside it already says what the mark is, so the image stays silent for assistive tech. */}
        <img src={appMark} alt="" width={24} height={24} draggable={false} className="size-6 shrink-0 object-contain" />
        Mind Map Monkey
      </h1>
      <Separator orientation="vertical" className="hidden data-[orientation=vertical]:h-5 sm:block" />
      <div className="hidden items-center gap-0.5 sm:flex">
        <HeaderMenu label="File" heading={file?.path} entries={fileMenu} />
        <HeaderMenu label="View" heading={viewLabel} entries={viewMenu} />
        <Separator orientation="vertical" className="mx-0.5 data-[orientation=vertical]:h-5" />
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Undo"
          aria-keyshortcuts="Control+Z"
          title={`Undo (${history.undoShortcut})`}
          onClick={history.onUndo}
          disabled={!history.canUndo}
        >
          <Undo2 aria-hidden="true" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Redo"
          aria-keyshortcuts="Control+Y Control+Shift+Z"
          title={`Redo (${history.redoShortcut})`}
          onClick={history.onRedo}
          disabled={!history.canRedo}
        >
          <Redo2 aria-hidden="true" />
        </Button>
        <PageNav beforeNavigate={beforeNavigate} className="ml-1" />
      </div>

      <Button
        ref={find.buttonRef}
        variant="ghost"
        size="icon-sm"
        className="shrink-0"
        aria-label="Find nodes"
        aria-pressed={find.open}
        aria-keyshortcuts="Control+F"
        title={`Find nodes (${find.shortcut})`}
        onClick={find.onToggle}
      >
        <Search aria-hidden="true" />
      </Button>

      {openingLabel && (
        <p className="ml-auto flex min-w-0 items-center gap-1.5 overflow-hidden text-xs whitespace-nowrap" role="status">
          <LoaderCircle aria-hidden="true" className="size-4 shrink-0 animate-spin text-muted-foreground motion-reduce:animate-none" />
          <span className="min-w-0 truncate text-muted-foreground" title={openingLabel}>
            {openingLabel}
          </span>
        </p>
      )}

      {file && onCopyLink && (
        <Button
          variant="ghost"
          size="icon-sm"
          className={cn("shrink-0", !openingLabel && "ml-auto")}
          aria-label={`Copy link to ${file.name}`}
          title="Copy link"
          onClick={onCopyLink}
          disabled={copyLinkDisabled}
        >
          <Link2 aria-hidden="true" />
        </Button>
      )}

      {file && (
        <Button
          variant="ghost"
          size="icon-sm"
          className={cn("relative shrink-0", !openingLabel && !onCopyLink && "ml-auto")}
          aria-label={dirty ? "Save (unsaved changes)" : "Save"}
          aria-keyshortcuts="Control+S"
          title={dirty ? "Save — unsaved changes (Ctrl+S)" : "Save (Ctrl+S)"}
          onClick={onSave}
          disabled={saveDisabled}
        >
          {saving ? <LoaderCircle aria-hidden="true" className="animate-spin motion-reduce:animate-none" /> : <Save aria-hidden="true" />}
          {dirty && !saving && <span aria-hidden="true" className="absolute top-1 right-1 size-2 rounded-full bg-primary ring-2 ring-card" />}
        </Button>
      )}

      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" className="shrink-0 sm:hidden" aria-label="Menu">
            <Menu aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuGroup>
            <DropdownMenuLabel className="text-xs text-muted-foreground">File</DropdownMenuLabel>
            {file && <DropdownMenuLabel className="-mt-2 text-xs font-normal text-muted-foreground [overflow-wrap:anywhere]">{file.path}</DropdownMenuLabel>}
            <MenuItems entries={fileMenu} />
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuLabel className="text-xs text-muted-foreground">View · {viewLabel}</DropdownMenuLabel>
            <MenuItems entries={viewMenu} />
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuLabel className="text-xs text-muted-foreground">Pages</DropdownMenuLabel>
            {links.map(({ path, to, label, Icon, current, onClick }) => (
              <DropdownMenuItem key={path} asChild className={cn(current && "bg-muted font-semibold")}>
                <Link to={to} aria-current={current ? "page" : undefined} onClick={onClick}>
                  {Icon && <Icon aria-hidden="true" />}
                  {label}
                </Link>
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
