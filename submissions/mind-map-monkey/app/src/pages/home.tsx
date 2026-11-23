import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import {
  ArrowDown,
  ArrowLeft,
  ArrowLeftRight,
  ArrowRight,
  ArrowUp,
  BookOpen,
  Check,
  ChevronsDownUp,
  ChevronsUpDown,
  CloudCheck,
  CloudUpload,
  Copy,
  Expand,
  FileCode2,
  FileDown,
  FilePlus2,
  FileText,
  FolderOpen,
  History,
  Image,
  ImageDown,
  Link2,
  LoaderCircle,
  Maximize2,
  MousePointerClick,
  Network,
  PaintBucket,
  Pin,
  PinOff,
  Redo2,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Settings,
  Info,
  Shrink,
  Spline,
  Trash2,
  Undo2,
  Unlink,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { EditorHeader, type MenuEntry } from "@/components/editor-header";
import { ErrorNotice } from "@/components/error-notice";
import { useFileDetails, type StatusItem } from "@/components/file-properties";
import { MapStatusBar } from "@/components/map-status-bar";
import { FindBar } from "@/components/find-bar";
import { LinkPicker } from "@/components/link-picker";
import { MergeDialog, type MergeReview } from "@/components/merge-dialog";
import { MindMapCanvas } from "@/components/mindmap-canvas";
import type { LinkActions, NodeActions } from "@/components/node-action-bar";
import { OneDriveBrowserDialog } from "@/components/onedrive-browser";
import { RichTextEditor } from "@/components/rich-text-editor";
import { SettingsDialog } from "@/components/settings-dialog";
import { AboutDialog } from "@/components/about-dialog";
import { WelcomeDialog } from "@/components/welcome-dialog";
import { ShareLinkDialog } from "@/components/share-link-dialog";
import { TagEditor } from "@/components/tag-editor";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { SheetGrabber } from "@/components/sheet-grabber";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useConfirm } from "@/hooks/use-confirm";
import { useFileDrop } from "@/hooks/use-file-drop";
import { useHistory } from "@/hooks/use-history";
import { useMediaQuery } from "@/hooks/use-media-query";
import { ZOOM_STEP, useMapView } from "@/hooks/use-map-view";
import { useMindMapLayout } from "@/hooks/use-mindmap-layout";
import { useShareLink } from "@/hooks/use-share-link";
import { NODE_ACTION_BAR_GAP, NODE_ACTION_BAR_HEIGHT, actionBarCompact, actionBarWidth, chooseActionBarSide, type ActionBarSide } from "@/lib/action-bar-placement";
import { CancelledError, UserFacingError, describeError, type FailureInfo } from "@/lib/app-errors";
import { copyPngToClipboard, downloadBlob, exportMapPng } from "@/lib/map-image";
import {
  COLOR_KEYS,
  DIRECTIONS,
  DIRECTION_LABEL,
  ICON_KEYS,
  IMPORTANCE_LABEL,
  LINK_LABEL_MAX_LENGTH,
  NODE_COLORS,
  NODE_ICONS,
  SIZE_LABEL,
  addChild,
  addBlockedReason,
  addLink,
  addSibling,
  branchIds,
  canLink,
  clearDescendantPositions,
  clearPositions,
  colorBranch,
  countDescendants,
  createBlankMap,
  findLink,
  hasDescendantPositions,
  hasManualPositions,
  helpMindMap,
  indentNode,
  indentBlockedReason,
  isDescendant,
  isDirection,
  linkId,
  linkRefusal,
  linksAt,
  moveNodeUnder,
  moveWithinParent,
  outdentNode,
  parseMermaid,
  removeLink,
  removeNode,
  reverseLink,
  setAllCollapsed,
  setCollapsed,
  setLinkLabel,
  setNodeDirection,
  setNodeOffset,
  toMermaid,
  updateNode,
  withMermaidIds,
  withNormalizedTags,
  withValidDirections,
  withValidLinks,
  type Direction,
  type Importance,
  type MindMap,
  type NodeOffset,
  type NodePatch,
  type NodeSize,
} from "@/lib/mindmap-data";
import { linkRoutes } from "@/lib/mindmap-links";
import { MAX_FILE_BYTES as MAX_SAVE_BYTES, assertTextSize } from "@/lib/map-limits";
import { mergeMindMaps, summarizeChanges, type MergeSide } from "@/lib/mindmap-merge";
import { EMPTY_QUERY, expandTo, findMatches, isHiddenByFold, isSearchActive, tagCounts, type SearchQuery } from "@/lib/mindmap-search";
import {
  DEFAULT_EXTENSION,
  MAX_FILE_BYTES,
  checkRemote,
  createFile,
  fileExtension,
  findFile,
  formatBytes,
  joinPath,
  openFile,
  openFileByPath,
  openLinkedFile,
  sameVersion,
  suggestFileName,
  updateFile,
  withDefaultExtension,
  withSaveLock,
  type DriveFileRef,
  type DriveItem,
  type FileStamp,
  type OpenedFile,
  type SavedFile,
} from "@/lib/onedrive-files";
import { clearPendingLink, rememberEditorFile, rememberPendingLink, takeRememberedFile, withFileParams } from "@/lib/share-link";
import { STANDALONE, STANDALONE_NOTICE } from "@/lib/standalone";
import { useSaveChoice } from "@/components/save-choice-dialog";
import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "mermaid-mindmap-studio.map";
/** The help map's code: a draft that still reads this has nothing of the user's to lose. */
const helpMermaid = toMermaid(helpMindMap);
/** The name of the device file the local draft was imported from — kept and cleared together with the draft. */
const DRAFT_NAME_KEY = "mermaid-mindmap-studio.draft-name";
/** How long after the last edit an automatic save starts. */
const AUTO_SAVE_DELAY_MS = 3000;
/**
 * Typing in the description is committed to the map when the typing pauses this long (or the field is left),
 * not on every keystroke: each commit re-renders the map, and the description changes nothing on the canvas.
 */
const DESCRIPTION_COMMIT_DELAY_MS = 400;
const ZOOM_MIN = 0.2;
const ZOOM_MAX = 2.5;
/** How far the inspector's Position buttons move a node, in map pixels. */
const NUDGE = 24;
/** Viewport room kept around a newly selected node so its action bar is in view too. */
const ACTION_BAR_CLEARANCE = NODE_ACTION_BAR_HEIGHT + NODE_ACTION_BAR_GAP + 8;
/** How long a clicked node waits before the map pans to it, so a second click still lands on it. */
const DOUBLE_CLICK_MS = 400;
const SIZE_KEYS = Object.keys(SIZE_LABEL) as NodeSize[];
const IMPORTANCE_KEYS = Object.keys(IMPORTANCE_LABEL) as Importance[];
// The inspector's fixed choices, built once: handed the same elements every render, React leaves them (and
// their icons) alone, so a keystroke in the label is not also a rebuild of every option on the page.
const ICON_OPTIONS = [
  <SelectItem key="none" value="none">
    None
  </SelectItem>,
  ...ICON_KEYS.map((key) => {
    const entry = NODE_ICONS[key];
    return (
      <SelectItem key={key} value={key}>
        <entry.Icon aria-hidden="true" className="size-4" />
        {entry.name}
      </SelectItem>
    );
  }),
];
const SIZE_OPTIONS = SIZE_KEYS.map((key) => (
  <ToggleGroupItem key={key} value={key} className="flex-1">
    {SIZE_LABEL[key]}
  </ToggleGroupItem>
));
const IMPORTANCE_OPTIONS = IMPORTANCE_KEYS.map((key) => (
  <ToggleGroupItem key={key} value={key} className="flex-1">
    {IMPORTANCE_LABEL[key]}
  </ToggleGroupItem>
));
const DIRECTION_OPTIONS = [
  <ToggleGroupItem key="auto" value="auto" className="flex-1">
    Auto
  </ToggleGroupItem>,
  ...DIRECTIONS.map((dir) => (
    <ToggleGroupItem key={dir} value={dir} className="flex-1">
      {DIRECTION_LABEL[dir]}
    </ToggleGroupItem>
  )),
];
/** How often, at most, the app glances at OneDrive for a newer version when the window comes back into view. */
const REMOTE_PROBE_INTERVAL_MS = 20_000;
const IS_MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/i.test(navigator.platform);
const UNDO_SHORTCUT = IS_MAC ? "⌘Z" : "Ctrl+Z";
const REDO_SHORTCUT = IS_MAC ? "⇧⌘Z" : "Ctrl+Y";
const FIND_SHORTCUT = IS_MAC ? "⌘F" : "Ctrl+F";
const SAVE_SHORTCUT = IS_MAC ? "⌘S" : "Ctrl+S";
const FULL_SCREEN_SHORTCUT = IS_MAC ? "⇧⌘F" : "Ctrl+Shift+F";

/** Where a keyboard shortcut is not ours: dialogs and menus have their own text fields and keys. */
const SHORTCUT_EXEMPT = "[role='dialog'], [role='alertdialog'], [role='menu'], [role='listbox']";

function loadMap(): MindMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as MindMap;
      if (parsed && typeof parsed.rootId === "string" && parsed.nodes && parsed.nodes[parsed.rootId]) {
        return withValidLinks(withValidDirections(withNormalizedTags(withMermaidIds(parsed))));
      }
    }
  } catch {
    // Unreadable storage: fall through to the help map.
  }
  return helpMindMap;
}

/** Where a file comes from: a typed path, a picked drive item, or a shared app link (file id, path kept for display). */
type OpenSource = { kind: "path"; path: string } | { kind: "item"; item: DriveItem } | { kind: "link"; id: string; path: string | null };
/** The version of the OneDrive file the app knows: its stamp and the exact text last read or written. */
interface KnownVersion {
  stamp: FileStamp;
  text: string;
}
/** The version the editor started from — every change is measured against it, and a save first checks OneDrive still holds it. */
interface FileBase extends KnownVersion {
  map: MindMap;
  mermaid: string;
}
/** A newer version found on OneDrive, not yet brought into the editor. */
interface RemoteVersion extends KnownVersion {
  ref: DriveFileRef;
}
type SaveTarget =
  /** `auto`: started by auto-save, not the user — it neither merges a changed file nor announces itself. */
  | { ref: DriveFileRef; body: string; snapshot: MindMap; known: KnownVersion | null; note?: string; auto?: boolean }
  | { folderPath: string; name: string; body: string; snapshot: MindMap };
type SaveOutcome = { kind: "saved"; saved: SavedFile; body: string; snapshot: MindMap; note?: string } | { kind: "changed"; version: RemoteVersion } | null;
/** The last open, save, or refresh that failed, kept with what was attempted so it can be described and retried. */
type Failure =
  | { key: number; kind: "open"; source: OpenSource; error: unknown }
  | { key: number; kind: "save"; target: SaveTarget; error: unknown }
  | { key: number; kind: "refresh"; error: unknown };

const baseName = (path: string) => path.split("/").pop() || path;

/** The file an open concerns, as the status line and messages name it. */
function sourceName(source: OpenSource): string {
  if (source.kind === "link") return source.path ? baseName(source.path) : "the linked map";
  if (source.kind === "item") return source.item.Name || "the file";
  return baseName(source.path);
}

/** What the status line says while a file is on its way in. */
function openingLabel(source: OpenSource): string {
  return source.kind === "link" ? `Opening ${sourceName(source)} from your link…` : `Opening ${sourceName(source)}…`;
}

/** Settle with `work`, or stop waiting the moment `signal` aborts. The work itself runs on; its late result is ignored. */
function untilCancelled<T>(signal: AbortSignal, work: Promise<T>): Promise<T> {
  if (signal.aborted) return Promise.reject(new CancelledError());
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new CancelledError());
    signal.addEventListener("abort", onAbort, { once: true });
    work.then(resolve, reject).finally(() => signal.removeEventListener("abort", onAbort));
  });
}

function loadSource(source: OpenSource): Promise<OpenedFile> {
  if (source.kind === "item") return openFile(source.item);
  if (source.kind === "path") return openFileByPath(source.path);
  return openLinkedFile(source.id, source.path);
}

/** `next` with the branches folded in `current` still folded, where those nodes still exist — folding is view state, not file content. */
function keepFolds(next: MindMap, current: MindMap): MindMap {
  const nodes = { ...next.nodes };
  let changed = false;
  for (const node of Object.values(current.nodes)) {
    if (node.collapsed && nodes[node.id] && !nodes[node.id].collapsed) {
      nodes[node.id] = { ...nodes[node.id], collapsed: true };
      changed = true;
    }
  }
  return changed ? { ...next, nodes } : next;
}

/** Dot-grid spacing that follows the zoom but never crowds below 12px. */
function gridStep(zoom: number): number {
  let step = 22 * zoom;
  while (step < 12) step *= 2;
  return step;
}

/** The text files the import takes from this device — the same kinds Open from OneDrive lists. */
const IMPORT_EXTENSIONS = new Set(["mmd", "mermaid", "md", "markdown", "txt"]);
const IMPORT_ACCEPT = ".mmd,.mermaid,.md,.markdown,.txt,text/plain,text/markdown";

/**
 * The `mindmap` code in `text`: the first fenced code block that holds one (a Markdown note
 * with the map inside it), else the text itself, less a byte-order mark.
 */
function extractMindmapCode(text: string): string {
  const clean = text.replace(/^\uFEFF/, "");
  for (const match of clean.matchAll(/```[^\n]*\n([\s\S]*?)```/g)) {
    if (/^\s*mindmap\b/i.test(match[1])) return match[1].trimEnd();
  }
  return clean;
}

/** What the live region says when a file is dragged over the map. */
const DROP_CUE = "Drop to import the Mermaid file.";

/** The device file the local draft was imported from, remembered beside the draft itself; absent for a draft that was not imported. */
function loadDraftName(): string | null {
  try {
    const name = localStorage.getItem(DRAFT_NAME_KEY)?.trim();
    return name && name.length <= 255 ? name : null;
  } catch {
    return null;
  }
}

export function HomePage() {
  const confirm = useConfirm();
  const { ask: askSave, dialog: saveChoiceDialog } = useSaveChoice();
  const queryClient = useQueryClient();
  const setCurrentFile = useAppStore((s) => s.setCurrentFile);
  const { share, target: shareTarget, clear: clearShare } = useShareLink();
  const [searchParams, setSearchParams] = useSearchParams();
  const [welcomeOpen, setWelcomeOpen] = useState(() => {
    if (searchParams.get("file") || searchParams.get("path")) return false;
    try {
      return localStorage.getItem("mind-map-monkey.welcome-seen") !== "yes";
    } catch {
      return true;
    }
  });
  const [welcomeManual, setWelcomeManual] = useState(false);
  const changeWelcomeOpen = (open: boolean) => {
    setWelcomeOpen(open);
    if (!open) {
      setWelcomeManual(false);
      try {
        localStorage.setItem("mind-map-monkey.welcome-seen", "yes");
      } catch {
        // The welcome can be dismissed for this session when storage is unavailable.
      }
    }
  };
  const history = useHistory<MindMap>(loadMap);
  const map = history.present;
  const { commit, reset: resetHistory, discard: discardHistoryChange, endGroup } = history;
  const [selectedId, setSelectedId] = useState<string | null>(map.rootId);
  /** The association link picked on the canvas or in the inspector; the inspector edits it while one is. */
  const [selectedLinkId, setSelectedLinkId] = useState<string | null>(null);
  const showLinks = useAppStore((s) => s.showLinks);
  const setShowLinks = useAppStore((s) => s.setShowLinks);
  const autoPan = useAppStore((s) => s.autoPan);
  const autoPanRef = useRef(autoPan);
  useLayoutEffect(() => {
    autoPanRef.current = autoPan;
  }, [autoPan]);
  /** The node a link is being chosen for in the picker dialog, while it is open. */
  const [linkPickerFor, setLinkPickerFor] = useState<string | null>(null);
  const linkLabelRef = useRef<HTMLInputElement>(null);
  /** A link was just drawn: its label field takes focus so the relation can be named at once. */
  const pendingLinkLabelFocus = useRef(false);
  /** Where focus goes after a link's editor is removed with the link. */
  const linkToButtonRef = useRef<HTMLButtonElement>(null);
  /** The selected node's floating toolbar is shown until the user hides it; selecting a node shows it again. */
  const [toolbarOpen, setToolbarOpen] = useState(true);
  /** What the last undo or redo did, for assistive technology. */
  const [announcement, setAnnouncement] = useState("");
  const [exporting, setExporting] = useState(false);
  /** The off-screen bitmap the PNG export paints into. */
  const exportCanvasRef = useRef<HTMLCanvasElement>(null);
  /** Below the `lg` breakpoint the inspector is a bottom sheet over the map rather than a sidebar beside it. */
  const wide = useMediaQuery("(min-width: 1024px)");
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [creatingNodeId, setCreatingNodeId] = useState<string | null>(null);
  const inspectorPinned = useAppStore((s) => s.inspectorPinned);
  const setInspectorPinned = useAppStore((s) => s.setInspectorPinned);
  /** The map takes the whole window: no header, status line or pinned details panel. */
  const [fullScreen, setFullScreen] = useState(false);
  /** Pinned for this spell of full screen only: full screen always starts unpinned, whatever the Pin setting says. */
  const [fullScreenPinned, setFullScreenPinned] = useState(false);
  /** The inspector sits beside the map (wide and pinned); otherwise it opens over the map on demand. */
  const docked = wide && (fullScreen ? fullScreenPinned : inspectorPinned);
  const setPinned = (on: boolean) => {
    if (fullScreen) setFullScreenPinned(on);
    else setInspectorPinned(on);
    setInspectorOpen(!on && creatingNodeId !== null);
  };
  const wasDocked = useRef(docked);
  useLayoutEffect(() => {
    if (wasDocked.current && !docked && creatingNodeId) {
      pendingLabelFocus.current = true;
      setInspectorOpen(true);
    }
    wasDocked.current = docked;
  }, [docked, creatingNodeId]);
  const changeInspectorOpen = (open: boolean) => {
    setInspectorOpen(open);
    if (!open) {
      setCreatingNodeId(null);
      pendingLabelFocus.current = false;
    }
  };
  // Leaving the browser's full screen (Escape, or its own control) leaves the app's too.
  useEffect(() => {
    const sync = () => {
      if (!document.fullscreenElement) setFullScreen(false);
    };
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);
  const [exportOpen, setExportOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importError, setImportError] = useState<string | null>(null);
  /** The device file whose code is in the import field, while one is. */
  const [importSource, setImportSource] = useState<{ name: string; size: number } | null>(null);
  /** The device file the open draft was imported from; it names the draft until the draft is saved or replaced, and survives a reload with it. */
  const [draftName, setDraftName] = useState<string | null>(loadDraftName);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const [file, setFile] = useState<DriveFileRef | null>(null);
  const [base, setBase] = useState<FileBase | null>(null);
  const [remote, setRemote] = useState<RemoteVersion | null>(null);
  const [review, setReview] = useState<MergeReview | null>(null);
  const [driveDialog, setDriveDialog] = useState<"open" | "save" | null>(null);
  /**
   * The file on its way into the editor, while one is. Kept by the editor itself, set and
   * cleared by the open's own lifecycle callbacks, rather than read from the mutation hook:
   * a link-open starts the moment the page mounts, and if the page's subscription to that
   * mutation is dropped and re-established while it runs (a mount replay does exactly this)
   * the hook's `isPending` stays frozen at true after the file has long arrived.
   */
  const [opening, setOpening] = useState<OpenSource | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const autoSave = useAppStore((s) => s.autoSave);
  const setAutoSave = useAppStore((s) => s.setAutoSave);
  /**
   * Auto-save stands back once it has run into a file changed on OneDrive, or a save that failed, until the
   * version the editor measures against moves on (a save, a merge, the latest loaded). The user decides.
   */
  const [autoSaveHold, setAutoSaveHold] = useState<"changed" | "failed" | null>(null);
  /** A branch is being dragged on the canvas: nothing is saved mid-drag. */
  const [dragging, setDragging] = useState(false);
  /** The find bar above the canvas, and what it looks for. The query is cleared with the bar, so no filter outlives it. */
  const [findOpen, setFindOpen] = useState(false);
  const [query, setQuery] = useState<SearchQuery>(EMPTY_QUERY);
  const findInputRef = useRef<HTMLInputElement>(null);
  const findButtonRef = useRef<HTMLButtonElement>(null);
  /** Focus the find field as soon as the bar is on the page (opened by shortcut, menu, or header button). */
  const pendingFindFocus = useRef(false);
  /** A newer version the user chose to leave for later: the background glance stays quiet about that one. */
  const ignoredStampRef = useRef<FileStamp | null>(null);
  /** The OneDrive version the open review concerns — what a merged save is measured against. */
  const reviewVersionRef = useRef<RemoteVersion | null>(null);
  const labelRef = useRef<HTMLInputElement>(null);
  const pendingLabelFocus = useRef(false);
  /** A node to focus on the map once the selection has moved to it (after a delete, so focus is not stranded). */
  const pendingNodeFocus = useRef<string | null>(null);
  const loadedKeyRef = useRef<string | null>(null);
  /** Lets the user stop waiting for the open in progress; the current map stays as it is. */
  const openAbortRef = useRef<AbortController | null>(null);

  // Recomputed only when something that places a node changes; the same object otherwise, so the canvas,
  // the view and the action bar see no change when a description or a tag is edited.
  const layout = useMindMapLayout(map);
  const layoutRef = useRef(layout);
  const view = useMapView(layout, ZOOM_MIN, ZOOM_MAX);
  const { reveal, requestFit, constrain } = view;
  const wasDragging = useRef(false);
  useLayoutEffect(() => {
    if (wasDragging.current && !dragging) constrain();
    wasDragging.current = dragging;
  }, [dragging, layout, constrain]);
  const mermaid = useMemo(() => toMermaid(map), [map]);
  const requestedId = searchParams.get("file")?.trim() || null;
  const requestedPath = searchParams.get("path")?.trim() || null;
  const requestedKey = requestedId ?? requestedPath;
  // The map object the file was last saved or loaded as is clean without comparing; any other is compared by content.
  const dirty = file !== null && base !== null && map !== base.map && base.mermaid !== mermaid;

  /**
   * The description edit still waiting on the typing pause, if any: the node it belongs to, its text so far,
   * and the timer that commits it. Kept out of React state so a keystroke changes nothing but this.
   */
  const pendingDescription = useRef<{ id: string; description: string; timer: number } | null>(null);

  /** Commit the waiting description edit now — before anything that reads or replaces the map. */
  const flushDescription = useCallback(() => {
    const pending = pendingDescription.current;
    if (!pending) return;
    window.clearTimeout(pending.timer);
    pendingDescription.current = null;
    commit((current) => (current.nodes[pending.id] ? updateNode(current, pending.id, { description: pending.description }) : current), {
      coalesce: `description:${pending.id}`,
    });
  }, [commit]);

  /** Drop the waiting description edit: the map it was typed into is being replaced wholesale. */
  const discardDescription = () => {
    const pending = pendingDescription.current;
    if (!pending) return;
    window.clearTimeout(pending.timer);
    pendingDescription.current = null;
  };

  const queueDescription = (id: string, description: string) => {
    const pending = pendingDescription.current;
    if (pending) window.clearTimeout(pending.timer);
    pendingDescription.current = { id, description, timer: window.setTimeout(flushDescription, DESCRIPTION_COMMIT_DELAY_MS) };
  };

  // A timer must not fire into an editor that is gone.
  useEffect(
    () => () => {
      const pending = pendingDescription.current;
      if (pending) window.clearTimeout(pending.timer);
    },
    [],
  );

  /** The map as it stands including the waiting description edit — what a save writes and a merge measures. */
  const settledMap = (): MindMap => {
    const pending = pendingDescription.current;
    return pending && map.nodes[pending.id] ? updateNode(map, pending.id, { description: pending.description }) : map;
  };

  /** What a save writes: the settled map and its code (the memoised code when nothing is waiting). */
  const saveSnapshot = (): { snapshot: MindMap; body: string } => {
    const snapshot = settledMap();
    return { snapshot, body: snapshot === map ? mermaid : toMermaid(snapshot) };
  };

  useEffect(() => {
    // Only unlinked local drafts persist here; OneDrive file content stays in session memory.
    if (file) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
    } catch {
      // Storage unavailable: the map still lives in memory for this session.
    }
  }, [map, file]);

  // The draft's imported-from name goes with it, under the same rule: written while the draft is the open map,
  // removed when the draft is replaced by a new or the help map; a stale name never outlives its draft.
  useEffect(() => {
    if (file) return;
    try {
      if (draftName) localStorage.setItem(DRAFT_NAME_KEY, draftName);
      else localStorage.removeItem(DRAFT_NAME_KEY);
    } catch {
      // Storage unavailable: the name lasts for this session.
    }
  }, [draftName, file]);

  const linkFile = (linked: DriveFileRef | null) => {
    const ref = linked ? { id: linked.id, name: linked.name, path: linked.path } : null;
    setFile(ref);
    setCurrentFile(ref);
    // Whatever the map is now linked to (or no longer is), it is not the imported draft any more.
    setDraftName(null);
    // The address now names the file by the id the open settled on, and that same key is the one
    // already loaded — so rewriting it is not a new request, whatever form the link arrived in.
    loadedKeyRef.current = ref?.id ?? null;
    setSearchParams((current) => withFileParams(current, ref), { replace: true });
    // The link-open (if any) is settled, and this tab now remembers what it shows for a reload.
    clearPendingLink();
    rememberEditorFile(ref);
    // The draft was saved as this file or the user agreed to replace it, so it is not offered again.
    if (ref) {
      try {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(DRAFT_NAME_KEY);
      } catch {
        // Storage unavailable: nothing was kept there.
      }
    }
  };

  /** Show `next` in the editor as an undoable step, keeping the selection when the selected node is still there. */
  const adoptMap = (next: MindMap) => {
    commit(next);
    setSelectedId((current) => (current && next.nodes[current] ? current : next.rootId));
  };

  /** The editor now measures its changes against this version of the file; auto-save, if it was standing back, may go on. */
  const rebase = (next: FileBase) => {
    setBase(next);
    setRemote(null);
    setAutoSaveHold(null);
    ignoredStampRef.current = null;
  };

  /**
   * A newer version is on OneDrive. With nothing of the user's to keep it simply replaces the map;
   * otherwise the two are merged — on their own when nothing collides on a refresh, and through the
   * review dialog before any save, or whenever both sides changed the same item.
   */
  const reconcile = (version: RemoteVersion, intent: "save" | "refresh") => {
    if (!file || !base) return;
    let theirs: MindMap;
    try {
      theirs = parseMermaid(version.text);
    } catch (error) {
      setFailure({
        key: Date.now(),
        kind: "refresh",
        error: new UserFacingError(`The version of ${version.ref.name} now on OneDrive isn't a Mermaid mindmap. ${describeError(error, "Its code could not be read.")}`),
      });
      return;
    }
    const by = version.stamp.lastModifiedBy ? ` by ${version.stamp.lastModifiedBy}` : "";
    const theirsBase: FileBase = { map: theirs, mermaid: toMermaid(theirs), text: version.text, stamp: version.stamp };
    // A description still being typed counts as the user's: it goes into the merge (and the history) rather than being lost.
    const mine = settledMap();
    flushDescription();
    if (!dirty && mine === map) {
      adoptMap(keepFolds(theirs, map));
      rebase(theirsBase);
      if (version.ref.name !== file.name || version.ref.path !== file.path) linkFile(version.ref);
      toast.success(`Loaded the latest ${version.ref.name} from OneDrive${by}`);
      return;
    }
    const result = mergeMindMaps(base.map, mine, theirs);
    if (intent === "refresh" && result.conflicts.length === 0) {
      adoptMap(result.map);
      rebase(theirsBase);
      toast.success(`Merged changes from OneDrive${by}: ${summarizeChanges(result.theirs) || "formatting only"}. Your changes are kept.`);
      return;
    }
    setReview({ intent, fileName: version.ref.name, stamp: version.stamp, mine, theirs, resolutions: {}, result });
    reviewVersionRef.current = version;
  };

  const openMutation = useMutation({
    mutationFn: async (source: OpenSource) => {
      // One open at a time: a new request supersedes an unfinished one, and Cancel ends the wait.
      openAbortRef.current?.abort();
      const controller = new AbortController();
      openAbortRef.current = controller;
      try {
        const opened = await untilCancelled(controller.signal, loadSource(source));
        let parsed: MindMap;
        try {
          parsed = parseMermaid(opened.text);
        } catch (error) {
          throw new UserFacingError(`${opened.name} isn't a Mermaid mindmap. ${describeError(error, "Its code could not be read.")}`);
        }
        return { ref: { id: opened.id, name: opened.name, path: opened.path }, map: parsed, text: opened.text, stamp: opened.stamp };
      } finally {
        if (openAbortRef.current === controller) openAbortRef.current = null;
      }
    },
    onMutate: (source) => {
      setFailure(null);
      setOpening(source);
    },
    onSuccess: (opened, source) => {
      // A freshly opened file starts its own history; an edit still waiting belonged to the map it replaces.
      discardDescription();
      resetHistory(opened.map);
      setSelectedId(opened.map.rootId);
      requestFit();
      rebase({ map: opened.map, mermaid: toMermaid(opened.map), text: opened.text, stamp: opened.stamp });
      setReview(null);
      setDriveDialog(null);
      linkFile(opened.ref);
      if (source.kind === "link") toast.success(`Opened ${opened.ref.name} from OneDrive`);
    },
    onError: (error, source) => {
      if (error instanceof CancelledError) {
        // Stopped on purpose: nothing to report, and a reload must not pick the open up again.
        clearPendingLink();
        toast.info(`Stopped opening ${sourceName(source)}. The current map is unchanged.`);
        return;
      }
      setFailure({ key: Date.now(), kind: "open", source, error });
    },
    onSettled: (_opened, _error, source) => {
      // Over, one way or the other — unless a later open has taken its place meanwhile.
      setOpening((current) => (current === source ? null : current));
    },
  });

  /** The overlay goes at once and the current map stays; the request itself is told to stop and its late result is ignored. */
  const cancelOpen = () => {
    setOpening(null);
    openAbortRef.current?.abort();
    view.viewportRef.current?.focus({ preventScroll: true });
  };

  const saveMutation = useMutation({
    mutationFn: async (target: SaveTarget): Promise<SaveOutcome> => {
      // A file over the open limit could be written but never opened again.
      if (target.body.length > MAX_SAVE_BYTES || new TextEncoder().encode(target.body).byteLength > MAX_SAVE_BYTES) {
        throw new UserFacingError("This map is larger than 1 MB, so it can't be saved. Remove some nodes or shorten descriptions, then save again.");
      }
      if ("ref" in target) {
        return withSaveLock(target.ref, async (): Promise<SaveOutcome> => {
          // Someone else may have saved meanwhile: a changed file is never written over, it is merged first.
          if (target.known) {
            const check = await checkRemote(target.ref, target.known);
            if (check.status === "changed") return { kind: "changed", version: { ref: check.ref, stamp: check.stamp, text: check.text } };
          }
          return { kind: "saved", saved: await updateFile(target.ref, target.body), body: target.body, snapshot: target.snapshot, note: target.note };
        });
      }
      const path = joinPath(target.folderPath, target.name);
      const existing = await findFile(path);
      if (existing) {
        const ok = await confirm({
          title: `Replace "${existing.name}"?`,
          description: "A file with this name is already in that folder. Its content is overwritten.",
          confirmLabel: "Replace",
          destructive: true,
        });
        if (!ok) return null;
        return withSaveLock(existing, async (): Promise<SaveOutcome> => ({
          kind: "saved",
          saved: await updateFile(existing, target.body),
          body: target.body,
          snapshot: target.snapshot,
        }));
      }
      return withSaveLock({ name: target.name, path }, async (): Promise<SaveOutcome> => {
        // Another session may have created the same name while this one was looking; it is never written over unasked.
        if (await findFile(path)) {
          throw new UserFacingError(`A file named ${target.name} was just saved to that folder from somewhere else. Save again to choose whether to replace it.`);
        }
        return { kind: "saved", saved: await createFile(target.folderPath, target.name, target.body), body: target.body, snapshot: target.snapshot };
      });
    },
    onMutate: () => {
      setFailure(null);
    },
    onSuccess: (outcome, target) => {
      if (!outcome) return;
      const automatic = "ref" in target && target.auto === true;
      if (outcome.kind === "changed") {
        if (automatic) {
          // Auto-save never writes over a changed file and never opens the review on its own: the notice says the
          // file changed and the user chooses to merge, load the latest, or leave it for later; automatic saves
          // wait until that is settled. A version the user already set aside is not pointed out again.
          setAutoSaveHold("changed");
          const ignored = ignoredStampRef.current;
          if (!(ignored && sameVersion(ignored, outcome.version.stamp) === true)) setRemote(outcome.version);
          return;
        }
        reconcile(outcome.version, "save");
        return;
      }
      rebase({ map: outcome.snapshot, mermaid: outcome.body, text: outcome.body, stamp: outcome.saved.stamp });
      linkFile(outcome.saved);
      void queryClient.invalidateQueries({ queryKey: ["onedrive-folder"] });
      // An automatic save shows in the header's status alone, like a manual one does, without a toast every few seconds.
      if (!automatic) toast.success(outcome.note ? `${outcome.note} Saved ${outcome.saved.name} to OneDrive.` : `Saved ${outcome.saved.name} to OneDrive`);
    },
    onError: (error, target) => {
      setFailure({ key: Date.now(), kind: "save", target, error });
      // One notice, no automatic retries: the next save is the user's, from the notice or the Save button.
      if ("ref" in target && target.auto) setAutoSaveHold("failed");
    },
  });

  const refreshMutation = useMutation({
    mutationFn: ({ ref, known }: { ref: DriveFileRef; known: KnownVersion }) => checkRemote(ref, known),
    onMutate: () => {
      setFailure(null);
    },
    onSuccess: (check, { ref }) => {
      if (check.status === "same") {
        setBase((current) => (current && sameVersion(current.stamp, check.stamp) !== true ? { ...current, stamp: check.stamp } : current));
        setRemote(null);
        toast.info(`${ref.name} is up to date with OneDrive`);
        return;
      }
      reconcile({ ref: check.ref, stamp: check.stamp, text: check.text }, "refresh");
    },
    onError: (error) => {
      setFailure({ key: Date.now(), kind: "refresh", error });
    },
  });

  const resolveConflict = (id: string, side: MergeSide) =>
    setReview((current) => {
      if (!current || !base) return current;
      const resolutions = { ...current.resolutions, [id]: side };
      return { ...current, resolutions, result: mergeMindMaps(base.map, current.mine, current.theirs, resolutions) };
    });

  const resolveAll = (side: MergeSide) =>
    setReview((current) => {
      if (!current || !base) return current;
      const resolutions = Object.fromEntries(current.result.conflicts.map((conflict) => [conflict.id, side]));
      return { ...current, resolutions, result: mergeMindMaps(base.map, current.mine, current.theirs, resolutions) };
    });

  const cancelReview = () => {
    const version = reviewVersionRef.current;
    setReview(null);
    reviewVersionRef.current = null;
    // The newer version is still there; the notice keeps it in view until it is dealt with.
    if (version) setRemote(version);
  };

  const confirmReview = () => {
    const version = reviewVersionRef.current;
    if (!review || !version) return;
    const merged = review.result.map;
    const summary = summarizeChanges(review.result.theirs);
    const note = `Merged changes from OneDrive${summary ? ` (${summary})` : ""}.`;
    adoptMap(merged);
    rebase({ map: review.theirs, mermaid: toMermaid(review.theirs), text: version.text, stamp: version.stamp });
    setReview(null);
    reviewVersionRef.current = null;
    if (review.intent === "refresh") {
      toast.success(`${note} Your changes are kept.`);
      return;
    }
    saveMutation.mutate({ ref: version.ref, body: toMermaid(merged), snapshot: merged, known: { stamp: version.stamp, text: version.text }, note });
  };

  useEffect(() => {
    // Opened from a share link whose query the hosting page kept for itself, or reloaded while a
    // link-open was under way: adopt the remembered file reference once per page load, so the link
    // effect below opens it like any other.
    const remembered = takeRememberedFile();
    if (!remembered || requestedKey) return;
    setSearchParams((current) => withFileParams(current, remembered), { replace: true });
  }, [requestedKey, setSearchParams]);

  const { mutate: openFromDrive } = openMutation;
  useEffect(() => {
    // `?file=<id>&path=/Folder/diagram.mmd` (a shared app link) or `?path=…` opens that OneDrive file once per distinct link.
    if (!requestedKey || loadedKeyRef.current === requestedKey) return;
    const previousKey = loadedKeyRef.current;
    loadedKeyRef.current = requestedKey;
    // Remembered from the first moment it is seen, so a sign-in round trip or frame reload resumes the open.
    rememberPendingLink({ id: requestedId, path: requestedPath });
    void (async () => {
      // A link replaces the map like any other open, so unsaved changes or a draft are not dropped without asking.
      const { confirmReplace: ask, file: current } = latestRef.current;
      if (!(await ask())) {
        loadedKeyRef.current = previousKey;
        clearPendingLink();
        setSearchParams((params) => withFileParams(params, current), { replace: true });
        return;
      }
      if (requestedId) openFromDrive({ kind: "link", id: requestedId, path: requestedPath });
      else if (requestedPath) openFromDrive({ kind: "path", path: requestedPath });
    })();
  }, [requestedKey, requestedId, requestedPath, openFromDrive, setSearchParams]);

  useEffect(() => {
    if (pendingLabelFocus.current && labelRef.current) {
      pendingLabelFocus.current = false;
      labelRef.current.focus();
      labelRef.current.select();
    }
  }, [selectedId, inspectorOpen, docked]);

  const { viewportRef } = view;
  useEffect(() => {
    const id = pendingNodeFocus.current;
    if (!id) return;
    pendingNodeFocus.current = null;
    viewportRef.current?.querySelector<HTMLElement>(`button[data-node-id="${CSS.escape(id)}"]`)?.focus({ preventScroll: true });
  }, [selectedId, viewportRef]);

  const selected = selectedId ? map.nodes[selectedId] : undefined;
  useEffect(() => {
    if (creatingNodeId && (selectedId !== creatingNodeId || selectedLinkId || !map.nodes[creatingNodeId])) {
      setCreatingNodeId(null);
      pendingLabelFocus.current = false;
    }
  }, [creatingNodeId, selectedId, selectedLinkId, map]);
  const parent = selected?.parentId ? map.nodes[selected.parentId] : undefined;
  const siblingIndex = parent && selected ? parent.children.indexOf(selected.id) : -1;
  const canMoveUp = siblingIndex > 0;
  const canMoveDown = !!parent && siblingIndex >= 0 && siblingIndex < parent.children.length - 1;
  const canOutdent = !!parent?.parentId;
  const root = map.nodes[map.rootId];
  const nodeCount = Object.keys(map.nodes).length;
  const hiddenCount = nodeCount - layout.nodes.length;
  const linkCount = useMemo(() => Object.values(map.nodes).reduce((sum, node) => sum + node.links.length, 0), [map]);
  /** The links touching the selected node — those it leads from first — as the inspector lists them. */
  const nodeLinks = useMemo(() => (selectedId ? linksAt(map, selectedId) : []), [map, selectedId]);
  const canLinkSelected = useMemo(() => !!selectedId && Object.keys(map.nodes).some((id) => canLink(map, selectedId, id)), [map, selectedId]);
  const selectedLink = selectedLinkId ? findLink(map, selectedLinkId) : null;

  // What the find bar matches, in tree order. The set is null while no search is on, so the canvas greys nothing.
  const searchActive = isSearchActive(query);
  const matches = useMemo(() => findMatches(map, query), [map, query]);
  const matchSet = useMemo(() => (searchActive ? new Set(matches) : null), [matches, searchActive]);
  const hiddenMatches = useMemo(() => matches.filter((id) => isHiddenByFold(map, id)).length, [map, matches]);
  const tagList = useMemo(() => tagCounts(map), [map]);
  /** 1-based place of the selected node among the matches; 0 when it is not one of them. */
  const matchPosition = selectedId ? matches.indexOf(selectedId) + 1 : 0;

  /** The node a click or tap just picked: its reveal waits out a possible double-click so the map doesn't move under it. */
  const pointerPick = useRef<string | null>(null);
  const selectNode = (id: string, byPointer = false) => {
    pointerPick.current = byPointer ? id : null;
    // What was typed into the previous node's description lands before the inspector moves on.
    flushDescription();
    setSelectedId(id);
    setSelectedLinkId(null);
    setToolbarOpen(true);
  };

  /**
   * Pick a link: the canvas draws it at full strength and the inspector edits it in place of the node, whose
   * toolbar steps aside meanwhile. Null lets go of the link and brings the node's toolbar back.
   */
  const selectLink = (id: string | null) => {
    flushDescription();
    setSelectedLinkId(id);
    setToolbarOpen(id === null);
  };

  // The selected node may have gone with an undo or redo (or an arriving merge); the root stands in for it.
  useEffect(() => {
    if (selectedId && !map.nodes[selectedId]) setSelectedId(map.rootId);
  }, [map, selectedId]);

  // So may the picked link (removed, undone, its target deleted): nothing stands in for it.
  useEffect(() => {
    if (selectedLinkId && !findLink(map, selectedLinkId)) setSelectedLinkId(null);
  }, [map, selectedLinkId]);

  useEffect(() => {
    if (!pendingLinkLabelFocus.current || !selectedLinkId) return;
    pendingLinkLabelFocus.current = false;
    linkLabelRef.current?.focus();
  }, [selectedLinkId]);

  /**
   * Typing in the label or description is one undo step per burst, not one per keystroke. A label keystroke
   * commits at once (the node grows with it); description keystrokes wait for a pause, since they change
   * nothing on the canvas and a commit re-renders the map.
   */
  const update = (patch: NodePatch) => {
    if (!selected) return;
    if ("description" in patch && patch.description !== undefined) {
      queueDescription(selected.id, patch.description);
      return;
    }
    commit((current) => updateNode(current, selected.id, patch), "label" in patch ? { coalesce: `label:${selected.id}` } : undefined);
  };

  const toggleBranch = (id: string) => {
    const node = map.nodes[id];
    if (!node) return;
    commit((current) => setCollapsed(current, id, !node.collapsed));
    if (!node.collapsed && selectedId && isDescendant(map, id, selectedId)) setSelectedId(id);
  };

  const moveNode = (id: string, targetId: string) => {
    commit((current) => moveNodeUnder(current, id, targetId));
    selectNode(id);
  };

  /** A node dropped on the background stays where it landed, relative to its parent. */
  const placeNode = (id: string, offset: NodeOffset) => {
    commit((current) => setNodeOffset(current, id, offset));
    selectNode(id);
  };

  /** Keyboard route for free placement: step the selected node from wherever it currently sits. A run of nudges is one undo step. */
  const nudgeSelected = (dx: number, dy: number) => {
    if (!selected?.parentId) return;
    const placed = layout.nodes.find((p) => p.id === selected.id);
    const placedParent = layout.nodes.find((p) => p.id === selected.parentId);
    if (!placed || !placedParent) return;
    commit((current) => setNodeOffset(current, selected.id, { x: placed.x - placedParent.x + dx, y: placed.y - placedParent.y + dy }), {
      coalesce: `nudge:${selected.id}`,
    });
  };

  const resetPosition = () => {
    if (selected) commit((current) => setNodeOffset(current, selected.id, null));
  };

  const autoArrange = () => commit((current) => clearPositions(current));

  /** Only what is beneath the selected node goes back on the automatic layout; the node itself and everything else stay put. */
  const arrangeBranch = () => {
    if (selected) commit((current) => clearDescendantPositions(current, selected.id));
  };

  /** Lock the side the selected node's branch grows towards (or let it follow its parent again), as one undo step. */
  const setDirection = (dir: Direction | null) => {
    if (selected) commit((current) => setNodeDirection(current, selected.id, dir));
  };

  /** Say it even when it is the same as last time: an identical string would not be read out again. */
  const announce = (text: string) => setAnnouncement((current) => (current === text ? `${text}\u200B` : text));

  const labelOf = (id: string) => map.nodes[id]?.label ?? "a node";

  const toggleShowLinks = (on: boolean) => {
    setShowLinks(on);
    if (!on) setSelectedLinkId(null);
  };

  /**
   * Draw a link from `from` to `to` (dropped from the handle, or chosen in the picker), as one undo step, and
   * pick it so its label can be typed straight away. Links are shown again if they were hidden.
   */
  const createLink = (from: string, to: string) => {
    const refusal = linkRefusal(map, from, to);
    if (refusal) {
      announce(refusal);
      return;
    }
    setLinkPickerFor(null);
    commit((current) => addLink(current, from, to));
    if (!showLinks) toggleShowLinks(true);
    flushDescription();
    setSelectedId(from);
    setSelectedLinkId(linkId(from, to));
    setToolbarOpen(false);
    pendingLinkLabelFocus.current = true;
    announce(`Linked ${labelOf(from)} to ${labelOf(to)}. Type a label for the link, or leave it blank.`);
  };

  const deleteLink = (id: string) => {
    const link = findLink(map, id);
    if (!link) return;
    commit((current) => removeLink(current, link.from, link.to));
    if (selectedLinkId === id) {
      setSelectedLinkId(null);
      // The link's editor goes with it; focus lands on the node's own Link to… button rather than nowhere.
      window.setTimeout(() => linkToButtonRef.current?.focus(), 0);
    }
    announce(`Removed the link from ${labelOf(link.from)} to ${labelOf(link.to)}.`);
  };

  /** Typing in the picked link's label is one undo step per burst, like a node label. */
  const relabelLink = (id: string, label: string) => {
    const link = findLink(map, id);
    if (!link) return;
    commit((current) => setLinkLabel(current, link.from, link.to, label), { coalesce: `link-label:${id}` });
  };

  /** The picked link now reads the other way: the arrow (and the label) point from its old target to its old source. */
  const flipLink = (id: string) => {
    const link = findLink(map, id);
    if (!link) return;
    commit((current) => reverseLink(current, link.from, link.to));
    setSelectedLinkId(linkId(link.to, link.from));
    announce(`The link now reads from ${labelOf(link.to)} to ${labelOf(link.from)}.`);
  };

  const branchSize = selected ? branchIds(map, selected.id).length - 1 : 0;
  const branchNeedsColor = selected ? branchIds(map, selected.id).some((id) => map.nodes[id]?.color !== selected.color) : false;

  /** The selected node's colour on every node beneath it, as one undo step. */
  const applyColorToBranch = () => {
    if (!selected || !branchNeedsColor) return;
    commit((current) => colorBranch(current, selected.id, selected.color));
    const colorName = NODE_COLORS[selected.color]?.name ?? "the color";
    toast.success(`Applied ${colorName} to the ${branchSize} ${branchSize === 1 ? "node" : "nodes"} under "${selected.label}"`);
  };

  const handleUndo = () => {
    setCreatingNodeId(null);
    pendingLabelFocus.current = false;
    // A description still being typed is a step of its own first, so undo takes it back rather than losing it.
    const pending = pendingDescription.current !== null;
    flushDescription();
    if (!history.canUndo && !pending) {
      announce("Nothing to undo.");
      return;
    }
    history.undo();
    announce("Undid the last change.");
  };

  const handleRedo = () => {
    setCreatingNodeId(null);
    pendingLabelFocus.current = false;
    flushDescription();
    if (!history.canRedo) {
      announce("Nothing to redo.");
      return;
    }
    history.redo();
    announce("Redid the last change.");
  };

  const openFind = () => {
    if (findOpen) {
      findInputRef.current?.focus();
      findInputRef.current?.select();
      return;
    }
    pendingFindFocus.current = true;
    setFindOpen(true);
  };

  useEffect(() => {
    if (!findOpen || !pendingFindFocus.current) return;
    pendingFindFocus.current = false;
    const input = findInputRef.current;
    input?.focus();
    // Opened from the View menu, the closing menu hands focus back to its trigger a moment later; take it again.
    const timer = window.setTimeout(() => {
      if (input && document.activeElement !== input && !document.querySelector("[role='menu']")) input.focus();
    }, 300);
    return () => window.clearTimeout(timer);
  }, [findOpen]);

  /** Closing the bar ends the filter with it, and hands focus back to the header's Find button. */
  const closeFind = () => {
    setFindOpen(false);
    setQuery(EMPTY_QUERY);
    findButtonRef.current?.focus();
  };

  const toggleFind = () => (findOpen ? closeFind() : openFind());

  /** A tag chip in the inspector: show every node with that tag, keeping whatever the bar already asks for. */
  const findByTag = (tag: string) => {
    setQuery((current) => (current.tags.includes(tag) ? current : { ...current, tags: [...current.tags, tag].sort() }));
    setFindOpen(true);
  };

  // Ctrl/⌘+Z undoes and Ctrl+Y or Ctrl/⌘+Shift+Z redoes anywhere on the page — including in the label and
  // description fields, where the map's history stands in for the browser's own — except inside dialogs and
  // menus, and except in the find bar, whose text keeps the browser's own undo. Ctrl/⌘+F opens the find bar,
  // Ctrl/⌘+S saves (never the browser's "save page") and Ctrl/⌘+Shift+F switches full screen on and off.
  const shortcuts = useRef({ undo: handleUndo, redo: handleRedo, find: openFind, save: () => {}, fullScreen: () => {} });
  useLayoutEffect(() => {
    shortcuts.current = {
      undo: handleUndo,
      redo: handleRedo,
      find: openFind,
      save: () => {
        if (!busy) handleSave();
      },
      fullScreen: () => toggleFullScreen(!fullScreen),
    };
  });
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.defaultPrevented) return;
      const key = event.key.toLowerCase();
      const undo = key === "z" && !event.shiftKey;
      const redo = (key === "z" && event.shiftKey) || (key === "y" && !event.shiftKey);
      const find = key === "f" && !event.shiftKey;
      const save = key === "s" && !event.shiftKey;
      const fullScreen = key === "f" && event.shiftKey;
      if (!undo && !redo && !find && !save && !fullScreen) return;
      // The browser's own Save page is never what is meant here, even where the app's save doesn't apply.
      if (save) event.preventDefault();
      if (event.target instanceof Element) {
        // The details panel is a dialog only in form; like the pinned panel it edits the map, so its shortcuts apply.
        const exempt = event.target.closest(SHORTCUT_EXEMPT);
        if (exempt && !exempt.hasAttribute("data-map-inspector")) return;
        if ((undo || redo) && event.target.closest("[role='search']")) return;
      }
      event.preventDefault();
      if (find) shortcuts.current.find();
      else if (save) shortcuts.current.save();
      else if (fullScreen) shortcuts.current.fullScreen();
      else if (undo) shortcuts.current.undo();
      else shortcuts.current.redo();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const revealNode = (id: string) => {
    const placed = layoutRef.current.nodes.find((p) => p.id === id);
    if (placed) reveal(placed);
  };

  /** A match inside a branch just unfolded: bring it into view once the layout that places it is known. */
  const pendingReveal = useRef<string | null>(null);
  useLayoutEffect(() => {
    layoutRef.current = layout;
    const id = pendingReveal.current;
    if (!id) return;
    pendingReveal.current = null;
    revealNode(id);
  });

  /**
   * Select the next (or previous) match after the selected node — the first (or last) when the selection
   * is not a match — unfolding the branch it sits in. Selecting it brings it into view; its toolbar stays
   * down so it does not cover the neighbours being compared.
   */
  const stepMatch = (delta: 1 | -1) => {
    if (matches.length === 0) return;
    const index = selectedId ? matches.indexOf(selectedId) : -1;
    const next = index < 0 ? (delta > 0 ? 0 : matches.length - 1) : (index + delta + matches.length) % matches.length;
    const id = matches[next];
    if (isHiddenByFold(map, id)) {
      commit((current) => expandTo(current, [id]), { coalesce: "find-expand" });
      pendingReveal.current = id;
    } else if (id === selectedId) {
      revealNode(id);
    }
    setSelectedId(id);
    setSelectedLinkId(null);
    setToolbarOpen(false);
  };

  /** Unfold every branch that hides a match, as one undo step. */
  const expandHiddenMatches = () => commit((current) => expandTo(current, matches));

  const zoom = view.view.zoom;
  const viewportWidth = view.size.width;
  const isRootSelected = !!selected && selected.id === map.rootId;
  // The toolbar goes on the side of the selected node where it hides the least of the map.
  const barSide: ActionBarSide = useMemo(
    () =>
      selected
        ? chooseActionBarSide(layout, selected.id, isRootSelected, !!selected.parentId && selected.children.length > 0, zoom, viewportWidth, !docked)
        : "above",
    [layout, selected, isRootSelected, zoom, viewportWidth, docked],
  );
  const barCompact = actionBarCompact(viewportWidth, !docked);
  const barRef = useRef({ side: barSide, isRoot: isRootSelected, withEdit: !docked, compact: barCompact });
  useLayoutEffect(() => {
    barRef.current = { side: barSide, isRoot: isRootSelected, withEdit: !docked, compact: barCompact };
  }, [barSide, isRootSelected, docked, barCompact]);

  // A newly selected node (added, moved, or picked from the inspector) is brought into view, with room for its action bar.
  useEffect(() => {
    if (!selectedId) return;
    const bringIntoView = () => {
      const placed = layoutRef.current.nodes.find((p) => p.id === selectedId);
      if (!placed) return;
      const { side, isRoot, withEdit, compact } = barRef.current;
      const barWidth = actionBarWidth(isRoot, withEdit, compact);
      const beside = barWidth + NODE_ACTION_BAR_GAP + 8;
      reveal(
        placed,
        side === "above"
          ? { x: barWidth / 2, top: ACTION_BAR_CLEARANCE }
          : side === "below"
            ? { x: barWidth / 2, bottom: ACTION_BAR_CLEARANCE }
            : side === "left"
              ? { left: beside }
              : { right: beside },
      );
    };
    if (pointerPick.current !== selectedId) {
      bringIntoView();
      return;
    }
    pointerPick.current = null;
    // With auto-pan off, a clicked node stays where it is on screen.
    if (!autoPanRef.current) return;
    const timer = window.setTimeout(bringIntoView, DOUBLE_CLICK_MS);
    return () => window.clearTimeout(timer);
  }, [selectedId, reveal]);

  const handleAddChild = () => {
    if (!selected) return;
    const blocked = addBlockedReason(map, selected.id);
    if (blocked) {
      toast.error(blocked);
      return;
    }
    const result = addChild(map, selected.id);
    commit(result.map);
    pendingLabelFocus.current = true;
    selectNode(result.id);
    setCreatingNodeId(result.id);
    if (!docked) setInspectorOpen(true);
  };

  const handleAddSibling = () => {
    if (!selected) return;
    const blocked = addBlockedReason(map, selected.parentId ?? selected.id);
    if (blocked) {
      toast.error(blocked);
      return;
    }
    const result = addSibling(map, selected.id);
    commit(result.map);
    pendingLabelFocus.current = true;
    selectNode(result.id);
    setCreatingNodeId(result.id);
    if (!docked) setInspectorOpen(true);
  };

  const cancelNewNode = () => {
    if (!selected?.parentId || selected.id !== creatingNodeId) return;
    if (pendingDescription.current?.id === selected.id) discardDescription();
    const id = selected.id;
    discardHistoryChange((current) => removeNode(current, id), (a, b) => JSON.stringify(a) === JSON.stringify(b));
    setCreatingNodeId(null);
    pendingLabelFocus.current = false;
    pendingNodeFocus.current = selected.parentId;
    setSelectedId(selected.parentId);
    if (!docked) setInspectorOpen(false);
    announce("Cancelled new node.");
  };

  const finishNewNode = () => {
    flushDescription();
    setCreatingNodeId(null);
    if (!docked) setInspectorOpen(false);
  };

  const handleDelete = async () => {
    if (!selected?.parentId) return;
    const nested = countDescendants(map, selected.id);
    // A single node is one Ctrl+Z away, so only a branch asks first.
    if (nested) {
      const ok = await confirm({
        title: `Delete "${selected.label}"?`,
        description: `${nested} nested ${nested === 1 ? "item" : "items"} will be deleted with it.`,
        confirmLabel: "Delete",
        destructive: true,
      });
      if (!ok) return;
    }
    commit((current) => removeNode(current, selected.id));
    announce(`Deleted ${selected.label}. Ctrl+Z brings it back.`);
    pendingNodeFocus.current = selected.parentId;
    setSelectedId(selected.parentId);
  };

  const handleMoveUp = () => {
    if (selected) commit((current) => moveWithinParent(current, selected.id, -1));
  };

  const handleMoveDown = () => {
    if (selected) commit((current) => moveWithinParent(current, selected.id, 1));
  };

  const handleIndent = () => {
    if (!selected) return;
    const blocked = indentBlockedReason(map, selected.id);
    if (blocked) {
      toast.error(blocked);
      return;
    }
    commit((current) => indentNode(current, selected.id));
  };

  const handleOutdent = () => {
    if (selected) commit((current) => outdentNode(current, selected.id));
  };

  const canArrangeBranch = !!selected && hasDescendantPositions(map, selected.id);

  /**
   * Opens a node's details: its Label field in the pinned panel beside the map, otherwise the inspector over the map
   * (with the Label field focused on a wide screen, where focusing it raises no on-screen keyboard).
   */
  const editNode = (id: string | null = selectedId) => {
    if (!id) return;
    if (id !== selectedId) {
      if (wide) pendingLabelFocus.current = true;
      selectNode(id);
    } else if (wide) {
      // After the click that started this has finished, or the map takes focus back when the pointer lifts.
      window.setTimeout(() => {
        labelRef.current?.focus();
        labelRef.current?.select();
      }, 0);
    }
    if (!docked) setInspectorOpen(true);
  };

  /** The selected node's fly-out: structure edits that used to sit on the command bar. */
  const nodeActions: NodeActions = {
    canAddSibling: !!parent,
    canMoveUp,
    canMoveDown,
    canIndent: canMoveUp,
    canOutdent,
    canDelete: !!parent,
    canArrangeBranch,
    direction: selected?.dir ?? null,
    canLink: canLinkSelected,
    onAddChild: handleAddChild,
    onAddSibling: handleAddSibling,
    onMoveUp: handleMoveUp,
    onMoveDown: handleMoveDown,
    onIndent: handleIndent,
    onOutdent: handleOutdent,
    onDelete: () => void handleDelete(),
    onArrangeBranch: arrangeBranch,
    onSetDirection: setDirection,
    onLink: () => {
      if (selected) setLinkPickerFor(selected.id);
    },
    onEdit: () => editNode(),
    showEdit: !docked,
  };

  /**
   * Opens a link's details, as Edit node does for a node: its Label field in the pinned panel, otherwise the
   * inspector over the map (focused on a wide screen, where that raises no on-screen keyboard).
   */
  const editLink = (id: string | null = selectedLinkId) => {
    if (!id) return;
    if (id !== selectedLinkId) {
      if (wide || docked) pendingLinkLabelFocus.current = true;
      selectLink(id);
    } else if (wide || docked) {
      window.setTimeout(() => {
        linkLabelRef.current?.focus();
        linkLabelRef.current?.select();
      }, 0);
    }
    if (!docked) setInspectorOpen(true);
  };

  const linkActions: LinkActions = {
    onEdit: () => editLink(),
    onReverse: () => {
      if (selectedLinkId) flipLink(selectedLinkId);
    },
    onDelete: () => {
      if (selectedLinkId) deleteLink(selectedLinkId);
    },
    showEdit: !docked,
  };

  const toggleFullScreen = (on: boolean) => {
    setFullScreen(on);
    if (on) setFullScreenPinned(false);
    // The browser's own full screen where it is allowed (an embedding frame may refuse it); the in-app layout either way.
    if (on) {
      if (document.fullscreenEnabled && !document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => undefined);
    } else if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => undefined);
    }
  };

  const handleNewMap = async () => {
    if (!(await confirmReplace())) return;
    const blank = createBlankMap();
    discardDescription();
    resetHistory(blank);
    requestFit();
    setBase(null);
    setRemote(null);
    setReview(null);
    setFailure(null);
    setAutoSaveHold(null);
    linkFile(null);
    pendingLabelFocus.current = true;
    selectNode(blank.rootId);
  };

  /** The built-in help map takes the editor over like a new map does: it replaces the open map and starts its own history, and nothing is written to OneDrive. */
  const handleOpenHelp = async () => {
    if (!(await confirmReplace())) return;
    discardDescription();
    resetHistory(helpMindMap);
    requestFit();
    setBase(null);
    setRemote(null);
    setReview(null);
    setFailure(null);
    setAutoSaveHold(null);
    linkFile(null);
    selectNode(helpMindMap.rootId);
  };

  const handleSave = () => {
    if (!file) {
      openDriveDialog("save");
      return;
    }
    const { snapshot, body } = saveSnapshot();
    flushDescription();
    saveMutation.mutate({ ref: file, body, snapshot, known: base ? { stamp: base.stamp, text: base.text } : null });
  };

  const handleSaveAs = async (folderPath: string, name: string) => {
    setDriveDialog(null);
    const { snapshot, body } = saveSnapshot();
    flushDescription();
    let saved = false;
    try {
      saved = (await saveMutation.mutateAsync({ folderPath, name: withDefaultExtension(name), body, snapshot }))?.kind === "saved";
    } catch {
      // The save's own error notice is already showing.
    }
    // A save started from "Save the current map?" lets the open, import or new map go ahead only once it is written.
    settleSaveAs(saved && (!saveAsWaiter.current || unchangedSince(body)));
  };

  /** An automatic save of the open file, started by the timer below once editing has paused. */
  const performAutoSave = () => {
    if (!file || !base || saveMutation.isPending) return;
    const { snapshot, body } = saveSnapshot();
    if (body === base.mermaid) return;
    flushDescription();
    saveMutation.mutate({ ref: file, body, snapshot, known: { stamp: base.stamp, text: base.text }, auto: true });
  };

  const toggleAutoSave = (on: boolean) => {
    setAutoSave(on);
    setAutoSaveHold(null);
  };

  /** Ask OneDrive for the latest version of the open file and bring it in. */
  const handleRefresh = () => {
    if (!file || !base) return;
    // A version already noticed in the background is still confirmed against OneDrive: it may have moved on again.
    refreshMutation.mutate({ ref: file, known: { stamp: base.stamp, text: base.text } });
  };

  const openDriveDialog = (mode: "open" | "save") => {
    setFailure(null);
    setDriveDialog(mode);
  };

  const pendingLabel = opening ? openingLabel(opening) : null;
  const busy = opening !== null || saveMutation.isPending || refreshMutation.isPending;

  /** The glance stays out of the way while a file operation, a review, or the OneDrive browser is up. */
  const quietRef = useRef(false);
  const quiet = busy || review !== null || driveDialog !== null;
  useLayoutEffect(() => {
    quietRef.current = quiet;
  }, [quiet]);

  // Auto-save: a few seconds after the last edit, the open OneDrive file is saved on its own — but not while
  // anything is in progress or awaiting an answer: a file operation, a dialog, a drag, a newer version noticed
  // on OneDrive, a notice of something that failed, or a hold from an earlier automatic save. Every edit
  // restarts the wait (the code changes with the edit). An unlinked draft keeps itself locally and is left alone.
  const autoSaveBlocked = busy || quiet || importOpen || shareTarget !== null || dragging || remote !== null || failure !== null || autoSaveHold !== null || creatingNodeId !== null;
  const autoSaveRef = useRef(performAutoSave);
  useLayoutEffect(() => {
    autoSaveRef.current = performAutoSave;
  });
  useEffect(() => {
    if (!autoSave || !file || !base || autoSaveBlocked || base.mermaid === mermaid) return;
    let timer = window.setTimeout(function attempt() {
      // A dialog or menu that opened meanwhile (a confirmation, say) is left alone; try again after another pause.
      if (document.querySelector(SHORTCUT_EXEMPT)) {
        timer = window.setTimeout(attempt, AUTO_SAVE_DELAY_MS);
        return;
      }
      autoSaveRef.current();
    }, AUTO_SAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [autoSave, file, base, autoSaveBlocked, mermaid]);

  // When the window comes back into view, glance at OneDrive for a newer version. The glance only
  // reports; it never changes the map. A failed glance says nothing — the next save or refresh does.
  useEffect(() => {
    if (!file || !base) return;
    let active = true;
    let last = 0;
    const probe = () => {
      if (document.visibilityState !== "visible" || quietRef.current) return;
      const now = Date.now();
      if (now - last < REMOTE_PROBE_INTERVAL_MS) return;
      last = now;
      checkRemote(file, { stamp: base.stamp, text: base.text })
        .then((check) => {
          if (!active || quietRef.current) return;
          if (check.status === "same") {
            setBase((current) => (current && current.text === base.text && sameVersion(current.stamp, check.stamp) !== true ? { ...current, stamp: check.stamp } : current));
            return;
          }
          if (ignoredStampRef.current && sameVersion(ignoredStampRef.current, check.stamp) === true) return;
          setRemote({ ref: check.ref, stamp: check.stamp, text: check.text });
        })
        .catch(() => undefined);
    };
    document.addEventListener("visibilitychange", probe);
    window.addEventListener("focus", probe);
    return () => {
      active = false;
      document.removeEventListener("visibilitychange", probe);
      window.removeEventListener("focus", probe);
    };
  }, [file, base]);

  /** The failure as the notice shows it: what didn't happen, why, which file, and how to try again. */
  const describeFailure = (current: Failure): FailureInfo => {
    if (current.kind === "open") {
      const { source } = current;
      const description = describeError(current.error, "The file could not be opened.");
      const retry = () => openMutation.mutate(source);
      if (source.kind === "link") return { title: "The linked map didn't open", description, file: source.path ?? source.id, retry };
      if (source.kind === "path") return { title: `${baseName(source.path)} didn't open`, description, file: source.path, retry };
      return { title: `${source.item.Name || "The file"} didn't open`, description, file: source.item.Path || source.item.Name || null, retry };
    }
    if (current.kind === "refresh") {
      return {
        title: file ? `${file.name} couldn't be refreshed from OneDrive` : "The file couldn't be refreshed from OneDrive",
        description: describeError(current.error, "The latest version could not be loaded."),
        file: file?.path ?? null,
        retry: handleRefresh,
      };
    }
    const { target } = current;
    const name = "ref" in target ? target.ref.name : target.name;
    return {
      title: `${name} wasn't saved`,
      description: describeError(current.error, "The file could not be saved."),
      file: "ref" in target ? target.ref.path : joinPath(target.folderPath, target.name),
      // Retried by the user, so a failed automatic save is retried as a manual one.
      retry: () => saveMutation.mutate("ref" in target ? { ...target, auto: false } : target),
    };
  };
  const failureInfo = failure ? describeFailure(failure) : null;

  const dismissFailure = () => {
    // A dismissed link-open is over: a later reload must not try it again.
    if (failure?.kind === "open") clearPendingLink();
    setFailure(null);
  };

  /** Save the open OneDrive file; true once it is written. A changed file opens the review instead, and that counts as not saved. */
  const saveOpenFile = async () => {
    if (!file) return false;
    const { snapshot, body } = saveSnapshot();
    flushDescription();
    try {
      const outcome = await saveMutation.mutateAsync({ ref: file, body, snapshot, known: base ? { stamp: base.stamp, text: base.text } : null });
      return outcome?.kind === "saved" && unchangedSince(body);
    } catch {
      // The save's own error notice is already showing.
      return false;
    }
  };

  /** The map is still what was just written; edits made while a save ran would otherwise be lost by leaving or replacing it. */
  const liveMap = useRef(map);
  useLayoutEffect(() => {
    liveMap.current = map;
  });
  const unchangedSince = (body: string) => {
    if (!pendingDescription.current && toMermaid(liveMap.current) === body) return true;
    toast.info("The map changed while it was saving. Save again before you continue.");
    return false;
  };

  /** Save a draft through the OneDrive Save as dialog; true once it is written, false if the dialog is closed or the save fails. */
  const saveAsWaiter = useRef<((saved: boolean) => void) | null>(null);
  const settleSaveAs = (saved: boolean) => {
    saveAsWaiter.current?.(saved);
    saveAsWaiter.current = null;
  };
  const saveDraftFirst = () =>
    new Promise<boolean>((resolve) => {
      settleSaveAs(false);
      saveAsWaiter.current = resolve;
      openDriveDialog("save");
    });

  /** Leaving the editor unmounts it; unsaved changes to a OneDrive file would be lost. (A draft stays in this browser.) */
  const confirmLeave = async () => {
    if (!dirty && !(file && pendingDescription.current)) return true;
    const choice = await askSave({
      title: `Save changes to ${file?.name ?? "this map"}?`,
      description: "Your changes aren't saved yet. If you don't save, they're lost.",
      saveLabel: "Save",
    });
    if (choice === "cancel") return false;
    return choice === "discard" || (await saveOpenFile());
  };

  const navigate = useNavigate();
  const leaveTo = async (path: string) => {
    if (await confirmLeave()) navigate(path);
  };

  /** Opening, importing or starting afresh replaces the map: offer to save unsaved OneDrive changes or a draft that isn't just the help map. */
  const confirmReplace = async () => {
    const unsavedFile = dirty || !!(file && pendingDescription.current);
    const draft = !file && mermaid !== helpMermaid;
    if (!unsavedFile && !draft) return true;
    const choice = await askSave(
      unsavedFile
        ? {
            title: `Save changes to ${file?.name ?? "this map"}?`,
            description: "Your changes aren't saved yet. If you don't save, they're lost.",
            saveLabel: "Save",
          }
        : {
            title: "Save the current map?",
            description: STANDALONE
              ? "This map isn't saved anywhere. If you continue without saving, it's replaced and can't be recovered."
              : "This map isn't saved yet. If you don't save it, it's replaced and can't be recovered.",
            saveLabel: STANDALONE ? undefined : "Save…",
          },
    );
    if (choice === "cancel") return false;
    if (choice === "discard") return true;
    return unsavedFile ? saveOpenFile() : saveDraftFirst();
  };

  // The link effect asks with whatever is open when the link arrives.
  const latestRef = useRef({ confirmReplace, file });
  useLayoutEffect(() => {
    latestRef.current = { confirmReplace, file };
  });

  const openConfirmed = async (source: OpenSource) => {
    if (await confirmReplace()) openMutation.mutate(source);
  };

  // Closing or reloading the tab would drop unsaved changes to a OneDrive file; the browser asks first.
  const unsavedRef = useRef(false);
  useEffect(() => {
    unsavedRef.current = dirty;
  }, [dirty]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!unsavedRef.current && !(file && pendingDescription.current)) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [file]);

  /** Read a Mermaid file from this device into the import field — here in the browser; the file goes nowhere. */
  const readImportFile = async (picked: File) => {
    setImportError(null);
    const extension = fileExtension(picked.name);
    if (extension && !IMPORT_EXTENSIONS.has(extension) && !picked.type.startsWith("text/")) {
      setImportError(`${picked.name} isn't a text file. Choose a .mmd, .mermaid, .md or .txt file.`);
      return;
    }
    if (picked.size > MAX_FILE_BYTES) {
      setImportError(`${picked.name} is larger than 1 MB and can't be imported here.`);
      return;
    }
    try {
      const text = await picked.text();
      assertTextSize(text);
      setImportText(extractMindmapCode(text));
      setImportSource({ name: picked.name, size: picked.size });
    } catch (error) {
      setImportError(describeError(error, `${picked.name} could not be read.`));
    }
  };

  /** A file dropped on the canvas opens the import dialog with its code loaded, ready to review and import. */
  const importDroppedFile = (picked: File) => {
    setImportOpen(true);
    void readImportFile(picked);
  };

  /** The import dialog and the map are both places to drop a Mermaid file; each shows where while a file is over it. */
  const importDrop = useFileDrop({ onFile: (picked) => void readImportFile(picked) });
  const canvasDrop = useFileDrop({
    onFile: importDroppedFile,
    // The cue is said once as the file comes over the map, and withdrawn when the drag ends, so the next one is said again.
    onEnter: () => announce(DROP_CUE),
    onLeave: () => setAnnouncement((current) => (current.startsWith(DROP_CUE) ? "" : current)),
  });

  /** Close the import dialog; the code typed or loaded into it is kept for next time, the rest is not. */
  const closeImport = () => {
    setImportOpen(false);
    setImportError(null);
    importDrop.reset();
  };

  /**
   * Imported code replaces the map wholesale and becomes an unlinked draft, like a new map: it starts its own
   * history, and nothing is written to OneDrive until the user saves it there. A draft read from a device file
   * keeps that file's name.
   */
  const handleImport = async () => {
    let imported: MindMap;
    try {
      assertTextSize(importText);
      imported = parseMermaid(extractMindmapCode(importText));
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "The code could not be read as a Mermaid mindmap.");
      return;
    }
    if (!(await confirmReplace())) return;
    const from = importSource?.name ?? null;
    discardDescription();
    resetHistory(imported);
    requestFit();
    setBase(null);
    setRemote(null);
    setReview(null);
    setFailure(null);
    setAutoSaveHold(null);
    linkFile(null);
    setDraftName(from);
    setSelectedId(imported.rootId);
    setImportText("");
    setImportSource(null);
    closeImport();
  };

  /** The Save as… name an imported draft suggests: the device file's name with the app's extension; else by the root's label. */
  const draftStem = draftName?.replace(/\.[^.]+$/, "").trim();
  const suggestedName = file?.name ?? (draftStem ? `${draftStem}.${DEFAULT_EXTENSION}` : suggestFileName(root?.label ?? ""));

  const handleCopy = () => {
    if (!navigator.clipboard) {
      setCopyState("failed");
      return;
    }
    navigator.clipboard
      .writeText(mermaid)
      .then(() => setCopyState("copied"))
      .catch(() => setCopyState("failed"))
      .finally(() => window.setTimeout(() => setCopyState("idle"), 2500));
  };

  const handleDownloadMermaid = () => {
    const name = `${suggestedName.replace(/\.[^.]+$/, "")}.mmd`;
    downloadBlob(new Blob([mermaid], { type: "text/plain;charset=utf-8" }), name);
    toast.success(`Handed ${name} to your browser as a download`);
  };

  const manualPositions = hasManualPositions(map);

  /** The whole map — every node and connector, whatever is in view — as a PNG on the page's background colour. */
  const renderPng = async (): Promise<Blob> => {
    const svg = viewportRef.current?.querySelector<SVGSVGElement>("svg[data-mindmap-canvas]");
    const canvas = exportCanvasRef.current;
    const context = canvas?.getContext("2d");
    if (!svg || !canvas || !context) throw new UserFacingError("The map could not be drawn as an image.");
    // Links go into the picture as they are on the canvas: routed on the current layout, and left out while hidden.
    return exportMapPng(canvas, context, { svg, layout: layoutRef.current, zoom, links: showLinks ? linkRoutes(map, layoutRef.current) : [] });
  };
  const imageFileName = () => suggestFileName(root?.label ?? "").replace(/\.[^.]+$/, "") + ".png";

  const handleCopyImage = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const blob = await renderPng();
      if (await copyPngToClipboard(blob)) {
        toast.success("Copied the map to the clipboard as a PNG image");
        return;
      }
      const name = imageFileName();
      downloadBlob(blob, name);
      toast.info(`Copying images to the clipboard isn't allowed here, so the PNG was handed to your browser as a download instead (${name}).`);
    } catch (error) {
      toast.error(describeError(error, "The map could not be copied as an image."));
    } finally {
      setExporting(false);
    }
  };

  const handleDownloadImage = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const name = imageFileName();
      downloadBlob(await renderPng(), name);
      toast.success(`Handed ${name} to your browser as a download`);
    } catch (error) {
      toast.error(describeError(error, "The map could not be saved as an image."));
    } finally {
      setExporting(false);
    }
  };

  /** Switchable whether or not a file is open: it applies to the OneDrive file whenever one is. */
  const autoSaveEntry: MenuEntry = { id: "auto-save", label: "Auto-save", Icon: CloudCheck, checked: autoSave, onToggle: toggleAutoSave };
  const fileMenu: MenuEntry[] = [
    { id: "open", label: "Open from OneDrive…", Icon: FolderOpen, onSelect: () => openDriveDialog("open"), disabled: opening !== null },
    { id: "recent", label: "Recent files…", Icon: History, onSelect: () => void leaveTo("/library?view=recent") },
    ...(file
      ? [
          { id: "save", label: "Save", Icon: Save, shortcut: SAVE_SHORTCUT, onSelect: handleSave, disabled: busy },
          { id: "save-as", label: "Save as…", Icon: CloudUpload, onSelect: () => openDriveDialog("save"), disabled: busy },
          autoSaveEntry,
          { id: "refresh", label: "Refresh from OneDrive", Icon: RefreshCw, onSelect: handleRefresh, disabled: busy || !base },
          { id: "link", label: "Copy link", Icon: Link2, onSelect: () => void share(file), disabled: opening !== null },
        ]
      : [{ id: "save-as", label: "Save…", Icon: CloudUpload, shortcut: SAVE_SHORTCUT, onSelect: () => openDriveDialog("save"), disabled: busy }, autoSaveEntry]),
    "separator",
    { id: "copy-image", label: "Copy as PNG", Icon: Image, onSelect: () => void handleCopyImage(), disabled: exporting },
    { id: "download-image", label: "Download PNG", Icon: ImageDown, onSelect: () => void handleDownloadImage(), disabled: exporting },
    "separator",
    { id: "import", label: "Import Mermaid file or code…", Icon: FileCode2, onSelect: () => setImportOpen(true) },
    { id: "export", label: "Export Mermaid code…", Icon: FileDown, onSelect: () => setExportOpen(true) },
    { id: "new", label: "New map", Icon: FilePlus2, onSelect: () => void handleNewMap() },
    { id: "help", label: "Open help map", Icon: BookOpen, onSelect: () => void handleOpenHelp() },
    "separator",
    { id: "settings", label: "Settings…", Icon: Settings, onSelect: () => setSettingsOpen(true) },
    { id: "welcome", label: "Welcome and Cowork skill…", Icon: BookOpen, onSelect: () => { setWelcomeManual(true); changeWelcomeOpen(true); } },
    { id: "about", label: "About Mind Map Monkey", Icon: Info, onSelect: () => setAboutOpen(true) },
  ];

  const viewMenu: MenuEntry[] = [
    { id: "find", label: "Find nodes…", Icon: Search, shortcut: FIND_SHORTCUT, onSelect: openFind },
    "separator",
    { id: "undo", label: "Undo", Icon: Undo2, shortcut: UNDO_SHORTCUT, onSelect: handleUndo, disabled: !history.canUndo },
    { id: "redo", label: "Redo", Icon: Redo2, shortcut: REDO_SHORTCUT, onSelect: handleRedo, disabled: !history.canRedo },
    "separator",
    { id: "zoom-in", label: "Zoom in", Icon: ZoomIn, onSelect: () => view.zoomBy(ZOOM_STEP), disabled: zoom >= ZOOM_MAX },
    { id: "zoom-out", label: "Zoom out", Icon: ZoomOut, onSelect: () => view.zoomBy(1 / ZOOM_STEP), disabled: zoom <= ZOOM_MIN },
    { id: "fit", label: "Fit to screen", Icon: Maximize2, onSelect: () => view.fit() },
    "separator",
    { id: "expand", label: "Expand all branches", Icon: ChevronsUpDown, onSelect: () => commit((c) => setAllCollapsed(c, false)) },
    { id: "collapse", label: "Collapse all branches", Icon: ChevronsDownUp, onSelect: () => commit((c) => setAllCollapsed(c, true)) },
    { id: "arrange", label: "Auto-arrange", Icon: Network, onSelect: autoArrange, disabled: !manualPositions },
    "separator",
    { id: "links", label: "Show links", Icon: Spline, checked: showLinks, onToggle: toggleShowLinks },
    { id: "full-screen", label: "Full screen", Icon: Expand, shortcut: FULL_SCREEN_SHORTCUT, checked: fullScreen, onToggle: toggleFullScreen },
  ];

  // With auto-save on, the header reads Saving… then Saved as a manual save does; when auto-save has had to stand back, it says so.
  const status = saveMutation.isPending
    ? "Saving…"
    : refreshMutation.isPending
      ? "Checking OneDrive…"
      : dirty
        ? autoSave && autoSaveHold
          ? "Auto-save paused"
          : "Unsaved changes"
        : "Saved";

  const countText = `${nodeCount} ${nodeCount === 1 ? "node" : "nodes"}${hiddenCount > 0 ? `, ${hiddenCount} hidden in collapsed branches` : ""}${
    linkCount > 0 ? `, ${linkCount} ${linkCount === 1 ? "link" : "links"}${showLinks ? "" : " (hidden)"}` : ""
  }`;
  const fileDetails = useFileDetails({ file, stamp: base?.stamp ?? null, importedFrom: draftName });
  const statusItems: StatusItem[] = [
    ...fileDetails.filter((item) => item.id === "draft"),
    { id: "count", priority: 1, node: <span aria-hidden="true">{countText}</span> },
    ...fileDetails.filter((item) => item.id !== "draft"),
    ...(STANDALONE
      ? [{ id: "standalone", priority: 3, node: <span className="rounded border border-border px-1.5 font-medium text-foreground">{STANDALONE_NOTICE}</span> }]
      : []),
  ];

  /**
   * The inspector: pinned beside the map on a wide screen, a panel over the map's right edge when unpinned there (or in
   * full screen), and a bottom sheet on a narrow screen — the last two opened on demand.
   */
  const inspectorFrame = (body: ReactNode) =>
    docked ? (
      <aside aria-labelledby="inspector-heading" className="flex min-h-0 w-[22rem] shrink-0 flex-col border-l border-border bg-card">
        <div className="flex items-center justify-between gap-2 border-b border-border py-1 pr-2 pl-4">
          <h2 id="inspector-heading" className="text-sm font-medium">
            Details
          </h2>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Unpin details panel"
            title="Unpin: open details over the map only when you edit"
            onClick={() => setPinned(false)}
          >
            <PinOff aria-hidden="true" />
          </Button>
        </div>
        {body}
      </aside>
    ) : wide ? (
      // Not modal, so the map stays live: picking another node shows its details here; a click elsewhere on the map closes it.
      <Sheet open={inspectorOpen} onOpenChange={changeInspectorOpen} modal={false}>
        <SheetContent
          data-map-inspector
          side="right"
          showCloseButton={false}
          className="w-[22rem] gap-0 bg-card p-0 sm:max-w-[22rem]"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            const label = labelRef.current;
            if (label) {
              label.focus();
              label.select();
            } else {
              (event.currentTarget as HTMLElement | null)?.focus();
            }
          }}
          onInteractOutside={(event) => {
            const target = event.target;
            if (target instanceof Element && target.closest("[data-node-id], [role='toolbar'], [data-link-id], [role='menu']")) event.preventDefault();
          }}
        >
          <div className="flex items-center justify-between gap-2 border-b border-border py-1 pr-2 pl-4">
            <SheetTitle className="text-sm font-medium">Details</SheetTitle>
            <div className="flex items-center gap-0.5">
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Pin details panel"
                title={fullScreen ? "Pin: keep details beside the map until you leave full screen" : "Pin: keep details beside the map"}
                onClick={() => setPinned(true)}
              >
                <Pin aria-hidden="true" />
              </Button>
              {creatingNodeId === null && (
                <Button variant="ghost" size="icon-sm" aria-label="Close details" onClick={() => changeInspectorOpen(false)}>
                  <X aria-hidden="true" />
                </Button>
              )}
            </div>
          </div>
          <SheetDescription className="sr-only">Edit the selected node or link.</SheetDescription>
          {body}
        </SheetContent>
      </Sheet>
    ) : (
      <Sheet open={inspectorOpen} onOpenChange={changeInspectorOpen}>
        <SheetContent
          data-map-inspector
          side="bottom"
          showCloseButton={creatingNodeId === null}
          className="max-h-[85dvh] gap-0 rounded-t-xl bg-card p-0 pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] [padding-right:max(2.5rem,env(safe-area-inset-right))]"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            if (pendingLabelFocus.current && labelRef.current) {
              pendingLabelFocus.current = false;
              labelRef.current.focus();
              labelRef.current.select();
            } else {
              // Existing nodes do not raise the keyboard just because the sheet opened.
              (event.currentTarget as HTMLElement | null)?.focus();
            }
          }}
        >
          <SheetGrabber onClose={() => changeInspectorOpen(false)} />
          <SheetTitle className="sr-only">Inspector</SheetTitle>
          <SheetDescription className="sr-only">Edit the selected node or link.</SheetDescription>
          {body}
        </SheetContent>
      </Sheet>
    );

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <div className={fullScreen ? "hidden" : "contents"}>
        <EditorHeader
          file={file}
          history={{ canUndo: history.canUndo, canRedo: history.canRedo, onUndo: handleUndo, onRedo: handleRedo, undoShortcut: UNDO_SHORTCUT, redoShortcut: REDO_SHORTCUT }}
          find={{ open: findOpen, onToggle: toggleFind, shortcut: FIND_SHORTCUT, buttonRef: findButtonRef }}
          dirty={dirty}
          openingLabel={pendingLabel}
          fileMenu={fileMenu}
          viewMenu={viewMenu}
          viewLabel={`Zoom ${Math.round(zoom * 100)}%`}
          onSave={handleSave}
          saveDisabled={busy}
          saving={saveMutation.isPending}
          onCopyLink={file ? () => void share(file) : undefined}
          copyLinkDisabled={opening !== null}
          beforeNavigate={confirmLeave}
        />
      </div>

      {remote && file && !failure && review === null && driveDialog === null && (
        <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-border bg-muted/40 px-3 py-1.5 text-sm">
          <RefreshCw aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
            <span className="font-medium">{file.name}</span> was changed on OneDrive{remote.stamp.lastModifiedBy ? ` by ${remote.stamp.lastModifiedBy}` : ""}.
            {dirty ? " Your changes are kept when you merge." : ""}
          </span>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="outline" className="h-7" onClick={() => reconcile(remote, "refresh")} disabled={busy}>
              {dirty ? "Merge changes" : "Load latest"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7"
              onClick={() => {
                ignoredStampRef.current = remote.stamp;
                setRemote(null);
              }}
            >
              Later
            </Button>
          </div>
        </div>
      )}

      {failure && failureInfo && driveDialog === null && (
        <div className="border-b border-border bg-card px-4 py-3">
          <ErrorNotice
            key={failure.key}
            title={failureInfo.title}
            description={failureInfo.description}
            file={failureInfo.file}
            onRetry={failureInfo.retry}
            busy={busy}
            actions={
              failure.kind === "open" ? (
                <Button variant="outline" size="sm" onClick={() => openDriveDialog("open")}>
                  <FolderOpen aria-hidden="true" />
                  Open from OneDrive…
                </Button>
              ) : failure.kind === "save" ? (
                <Button variant="outline" size="sm" onClick={() => openDriveDialog("save")}>
                  <CloudUpload aria-hidden="true" />
                  Save as…
                </Button>
              ) : undefined
            }
            onDismiss={dismissFailure}
          />
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-row">
        <section aria-labelledby="canvas-heading" className="flex min-h-0 min-w-0 flex-1 flex-col">
          <h2 id="canvas-heading" className="sr-only">
            Mind map canvas
          </h2>

          {findOpen && (
            <FindBar
              query={query}
              onQueryChange={setQuery}
              tags={tagList}
              matchCount={matches.length}
              position={matchPosition}
              currentLabel={matchPosition > 0 && selected ? selected.label : null}
              hiddenCount={hiddenMatches}
              onNext={() => stepMatch(1)}
              onPrevious={() => stepMatch(-1)}
              onExpandHidden={expandHiddenMatches}
              onClose={closeFind}
              inputRef={findInputRef}
            />
          )}

          <figure className="relative m-0 flex min-h-0 flex-1 flex-col">
            <div className="relative flex min-h-0 flex-1 flex-col">
              <div
                ref={view.viewportRef}
                data-map-viewport
                role="region"
                aria-label="Mind map"
                aria-describedby="map-hint"
                tabIndex={0}
                {...view.handlers}
                onKeyDown={(event) => {
                  // Escape on the map or a node lets go of the picked link, else hides the selected node's toolbar; everything else is pan and zoom.
                  if (event.key === "Escape" && selectedLinkId) {
                    event.preventDefault();
                    selectLink(null);
                    return;
                  }
                  if (event.key === "Escape" && toolbarOpen) {
                    event.preventDefault();
                    setToolbarOpen(false);
                    return;
                  }
                  // Delete on the map itself (not on a node) removes the link picked on it.
                  if ((event.key === "Delete" || event.key === "Backspace") && selectedLinkId && event.target === event.currentTarget) {
                    event.preventDefault();
                    deleteLink(selectedLinkId);
                    return;
                  }
                  view.handlers.onKeyDown(event);
                }}
                onClick={(event) => {
                  // A click on the background (not a pan, not a node, link or control) hides the toolbar and lets go of a picked link.
                  if (view.wasPan()) return;
                  if (
                    event.target instanceof Element &&
                    event.target.closest("button, a, input, textarea, select, [role='toolbar'], [role='tooltip'], [role='menu'], [data-link-id]")
                  ) {
                    return;
                  }
                  setToolbarOpen(false);
                  setSelectedLinkId(null);
                }}
                // A Mermaid file from the device may be dropped on the map; nothing else dragged from outside is taken.
                {...canvasDrop.handlers}
                style={{ backgroundPosition: `${view.view.x}px ${view.view.y}px`, backgroundSize: `${gridStep(zoom)}px ${gridStep(zoom)}px` }}
                className={cn(
                  "relative min-h-0 flex-1 touch-none select-none overflow-clip bg-[radial-gradient(var(--color-border)_1px,transparent_1px)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                  view.panning ? "cursor-grabbing" : "cursor-grab",
                )}
              >
                <div className="absolute top-0 left-0" style={{ transform: view.transform, transformOrigin: "0 0" }}>
                  <MindMapCanvas
                    map={map}
                    layout={layout}
                    selectedId={selectedId}
                    zoom={zoom}
                    view={view.view}
                    viewportRef={view.viewportRef}
                    onPanForDrag={view.panForDrag}
                    pinching={view.pinching}
                    touchGesture={view.touchGesture}
                    viewKey={view.transform}
                    captionId="map-caption"
                    onSelect={selectNode}
                    onToggle={toggleBranch}
                    onMove={moveNode}
                    onPlace={placeNode}
                    onReveal={revealNode}
                    actions={nodeActions}
                    toolbarOpen={toolbarOpen}
                    toolbarSide={barSide}
                    toolbarCompact={barCompact}
                    onShowToolbar={() => setToolbarOpen(true)}
                    onHideToolbar={() => setToolbarOpen(false)}
                    matchIds={matchSet}
                    onDragChange={setDragging}
                    showLinks={showLinks}
                    selectedLinkId={selectedLinkId}
                    onSelectLink={selectLink}
                    onLink={createLink}
                    onPickLinkTarget={setLinkPickerFor}
                    onEditNode={editNode}
                    linkActions={linkActions}
                    onEditLink={editLink}
                  />
                </div>
              </div>
              {canvasDrop.active && (
                // Said by the live region above; the pointer passes through it to the map, which takes the drop.
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-2 z-10 flex items-center justify-center rounded-lg border-2 border-dashed border-primary bg-primary/10 forced-colors:border-[Highlight]"
                >
                  <span className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground shadow-sm forced-colors:border-[CanvasText]">
                    <FileCode2 aria-hidden="true" className="size-4 shrink-0 text-primary forced-colors:text-[CanvasText]" />
                    Drop a Mermaid file to import it
                  </span>
                </div>
              )}
              <p role="status" aria-live="polite" className="sr-only">
                {announcement}
              </p>
              <p id="map-hint" className="sr-only">
                Select a node for its actions; Escape hides them. Dragging, linking, zooming and panning are explained in the help map under File, Open
                help map.
              </p>
              {/* The PNG export paints the map here; it is never shown. */}
              <canvas ref={exportCanvasRef} data-aether-canvas-purpose="non-drawing" aria-hidden="true" className="hidden" width={1} height={1} />
              <div
                role="group"
                aria-label="Zoom"
                className="absolute right-[max(0.5rem,env(safe-area-inset-right))] bottom-[max(0.5rem,env(safe-area-inset-bottom))] flex items-center gap-0.5 rounded-md border border-border bg-card/95 p-0.5 shadow-sm backdrop-blur-sm forced-colors:bg-[Canvas]"
              >
                <Button variant="ghost" size="icon-sm" className="pointer-coarse:size-11" aria-label="Zoom out" onClick={() => view.zoomBy(1 / ZOOM_STEP)} disabled={zoom <= ZOOM_MIN}>
                  <ZoomOut aria-hidden="true" />
                </Button>
                <span className="min-w-[4ch] text-center text-xs tabular-nums" aria-live="polite">
                  {Math.round(zoom * 100)}%
                </span>
                <Button variant="ghost" size="icon-sm" className="pointer-coarse:size-11" aria-label="Zoom in" onClick={() => view.zoomBy(ZOOM_STEP)} disabled={zoom >= ZOOM_MAX}>
                  <ZoomIn aria-hidden="true" />
                </Button>
                <Button variant="ghost" size="icon-sm" className="pointer-coarse:size-11" aria-label="Fit to screen" onClick={() => view.fit()}>
                  <Maximize2 aria-hidden="true" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="pointer-coarse:size-11"
                  aria-label={fullScreen ? "Exit full screen" : "Full screen"}
                  aria-pressed={fullScreen}
                  aria-keyshortcuts="Control+Shift+F"
                  title={fullScreen ? `Exit full screen (${FULL_SCREEN_SHORTCUT})` : `Full screen (${FULL_SCREEN_SHORTCUT})`}
                  onClick={() => toggleFullScreen(!fullScreen)}
                >
                  {fullScreen ? <Shrink aria-hidden="true" /> : <Expand aria-hidden="true" />}
                </Button>
              </div>
            </div>
            {pendingLabel && (
              <div className="absolute inset-0 z-10 grid place-items-center bg-background/70">
                <div className="flex flex-col items-center gap-2 rounded-md border border-border bg-card px-4 py-3 text-sm shadow-sm">
                  <span className="flex items-center gap-2">
                    <LoaderCircle aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />
                    {pendingLabel}
                  </span>
                  <Button variant="outline" size="sm" onClick={cancelOpen}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}
            <figcaption className={cn("border-t border-border bg-card px-3 pt-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))] text-xs text-muted-foreground", fullScreen && "hidden")}>
              <span id="map-caption" className="sr-only">
                {countText}
              </span>
              <MapStatusBar
                lead={
                  file ? (
                    <>
                      <FileText aria-hidden="true" className="mr-1.5 size-3.5 shrink-0" />
                      <span className="min-w-0 truncate font-medium text-foreground" title={file.path}>
                        {file.name}
                      </span>
                      <span aria-live="polite" className={cn("shrink-0 whitespace-pre", status !== "Saved" && "text-foreground")}>
                        {" · "}
                        {status}
                      </span>
                    </>
                  ) : undefined
                }
                leadDetail={file ? `${file.name} · ${status}` : undefined}
                items={statusItems}
              />
            </figcaption>
          </figure>
        </section>

        {inspectorFrame(
          <div className="min-h-0 flex-1 p-4 lg:overflow-auto">
              {selectedLink ? (
                // The picked link's editor stands in for the node's fields while a link is picked.
                <div className="space-y-5">
                  <h3 className="flex items-start gap-2 text-sm font-medium">
                    <Spline aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 [overflow-wrap:anywhere]">
                      <span className="sr-only">Link from </span>
                      {labelOf(selectedLink.from)}
                      <span aria-hidden="true"> → </span>
                      <span className="sr-only"> to </span>
                      {labelOf(selectedLink.to)}
                    </span>
                  </h3>
                  <div className="space-y-1.5">
                    <Label htmlFor="link-label">Label</Label>
                    <Input
                      id="link-label"
                      ref={linkLabelRef}
                      value={selectedLink.label}
                      maxLength={LINK_LABEL_MAX_LENGTH}
                      placeholder="depends on, see also…"
                      spellCheck
                      onBlur={endGroup}
                      onChange={(e) => relabelLink(selectedLink.id, e.target.value)}
                    />
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <Button variant="outline" size="sm" className="h-auto min-w-0 whitespace-normal" onClick={() => selectNode(selectedLink.from)}>
                      <ArrowLeft aria-hidden="true" />
                      <span className="[overflow-wrap:anywhere]">Select {labelOf(selectedLink.from)}</span>
                    </Button>
                    <Button variant="outline" size="sm" className="h-auto min-w-0 whitespace-normal" onClick={() => selectNode(selectedLink.to)}>
                      <ArrowRight aria-hidden="true" />
                      <span className="[overflow-wrap:anywhere]">Select {labelOf(selectedLink.to)}</span>
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => flipLink(selectedLink.id)}>
                      <ArrowLeftRight aria-hidden="true" />
                      Reverse direction
                    </Button>
                    <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={() => deleteLink(selectedLink.id)}>
                      <Unlink aria-hidden="true" />
                      Remove link
                    </Button>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => selectLink(null)}>
                    <Check aria-hidden="true" />
                    Done
                  </Button>
                </div>
              ) : selected ? (
                <div className="space-y-5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="min-w-0 text-xs text-muted-foreground">{parent ? `Under ${parent.label}` : "Root node"}</p>
                    {parent && creatingNodeId !== selected.id && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="shrink-0 text-destructive hover:text-destructive"
                        aria-label="Delete node"
                        title="Delete node"
                        onClick={() => void handleDelete()}
                      >
                        <Trash2 aria-hidden="true" />
                      </Button>
                    )}
                  </div>
                  {creatingNodeId === selected.id && (
                    <div className="flex flex-wrap items-center gap-2">
                      <Button size="sm" onClick={finishNewNode}>Done</Button>
                      <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={cancelNewNode}>
                        Cancel new node
                      </Button>
                    </div>
                  )}
                  <div className="space-y-1.5">
                    <Label htmlFor="node-label">Label</Label>
                    <Input id="node-label" ref={labelRef} value={selected.label} spellCheck onBlur={endGroup} onChange={(e) => update({ label: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label id="node-description-label">Description</Label>
                    <RichTextEditor
                      key={selected.id}
                      id="node-description"
                      value={selected.description}
                      onChange={(description) => update({ description })}
                      onBlur={() => {
                        // Leaving the field ends the typing: what was typed lands, and the undo step closes with it.
                        flushDescription();
                        endGroup();
                      }}
                      aria-labelledby="node-description-label"
                    />
                  </div>
                  <fieldset className="space-y-1.5">
                    <legend className="text-sm font-medium">Tags</legend>
                    <TagEditor key={selected.id} tags={selected.tags} suggestions={tagList.map((entry) => entry.tag)} onChange={(tags) => update({ tags })} onFind={findByTag} />
                  </fieldset>
                  <fieldset className="space-y-1.5">
                    <legend className="text-sm font-medium">Links</legend>
                    {nodeLinks.length > 0 && (
                      <ul aria-label={`Links of ${selected.label}`} className="space-y-1">
                        {nodeLinks.map((link) => {
                          const outgoing = link.from === selected.id;
                          const otherLabel = labelOf(outgoing ? link.to : link.from);
                          return (
                            <li key={link.id} className="flex items-stretch gap-1">
                              <button
                                type="button"
                                onClick={() => selectLink(link.id)}
                                aria-label={`${outgoing ? "To" : "From"} ${otherLabel}${link.label ? ` (${link.label})` : ""}, edit link`}
                                className="flex min-w-0 flex-1 items-start gap-1.5 rounded-md border border-border px-2 py-1 text-left text-sm hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              >
                                <span aria-hidden="true" className="shrink-0 text-muted-foreground">
                                  {outgoing ? "→" : "←"}
                                </span>
                                <span className="min-w-0 [overflow-wrap:anywhere]">
                                  {otherLabel}
                                  {link.label && <span className="text-muted-foreground"> ({link.label})</span>}
                                </span>
                              </button>
                              <Button variant="ghost" size="icon-sm" aria-label={`Remove link ${outgoing ? "to" : "from"} ${otherLabel}`} onClick={() => deleteLink(link.id)}>
                                <Unlink aria-hidden="true" />
                              </Button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                    <Button ref={linkToButtonRef} variant="outline" size="sm" onClick={() => setLinkPickerFor(selected.id)} disabled={!canLinkSelected}>
                      <Spline aria-hidden="true" />
                      Link to…
                    </Button>
                  </fieldset>
                  <fieldset className="space-y-1.5">
                    <legend className="text-sm font-medium">Color</legend>
                    <div className="flex flex-wrap gap-2">
                      {COLOR_KEYS.map((key) => {
                        const color = NODE_COLORS[key];
                        const active = selected.color === key;
                        return (
                          <button
                            key={key}
                            type="button"
                            aria-label={color.name}
                            title={color.name}
                            aria-pressed={active}
                            onClick={() => update({ color: key })}
                            className={cn(
                              "grid size-8 place-items-center rounded-full border-2 border-transparent shadow-sm ring-offset-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 forced-colors:border-[color:ButtonText]",
                              color.fill,
                              active && "ring-2 ring-ring ring-offset-2",
                            )}
                          >
                            {active && <Check aria-hidden="true" className="size-4" />}
                          </button>
                        );
                      })}
                    </div>
                    {branchSize > 0 && (
                      <Button variant="outline" size="sm" className="mt-1" onClick={applyColorToBranch} disabled={!branchNeedsColor}>
                        <PaintBucket aria-hidden="true" />
                        Apply to branch
                        <span className="text-muted-foreground">
                          ({branchSize} {branchSize === 1 ? "node" : "nodes"})
                        </span>
                      </Button>
                    )}
                  </fieldset>
                  <div className="space-y-1.5">
                    <Label htmlFor="node-icon">Icon</Label>
                    <Select value={selected.icon ?? "none"} onValueChange={(value) => update({ icon: value === "none" ? null : value })}>
                      <SelectTrigger id="node-icon" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>{ICON_OPTIONS}</SelectContent>
                    </Select>
                  </div>
                  <fieldset className="space-y-1.5">
                    <legend className="text-sm font-medium">Size</legend>
                    <ToggleGroup type="single" variant="outline" className="w-full" value={selected.size} onValueChange={(value) => value && update({ size: value as NodeSize })}>
                      {SIZE_OPTIONS}
                    </ToggleGroup>
                  </fieldset>
                  <fieldset className="space-y-1.5">
                    <legend className="text-sm font-medium">Importance</legend>
                    <ToggleGroup
                      type="single"
                      variant="outline"
                      className="w-full"
                      value={selected.importance}
                      onValueChange={(value) => value && update({ importance: value as Importance })}
                    >
                      {IMPORTANCE_OPTIONS}
                    </ToggleGroup>
                  </fieldset>
                  {parent && (
                    <fieldset className="space-y-1.5">
                      <legend className="text-sm font-medium">Position</legend>
                      <div className="flex flex-wrap items-center gap-1">
                        <Button variant="outline" size="sm" aria-label="Nudge left" onClick={() => nudgeSelected(-NUDGE, 0)}>
                          <ArrowLeft aria-hidden="true" />
                        </Button>
                        <Button variant="outline" size="sm" aria-label="Nudge right" onClick={() => nudgeSelected(NUDGE, 0)}>
                          <ArrowRight aria-hidden="true" />
                        </Button>
                        <Button variant="outline" size="sm" aria-label="Nudge up" onClick={() => nudgeSelected(0, -NUDGE)}>
                          <ArrowUp aria-hidden="true" />
                        </Button>
                        <Button variant="outline" size="sm" aria-label="Nudge down" onClick={() => nudgeSelected(0, NUDGE)}>
                          <ArrowDown aria-hidden="true" />
                        </Button>
                        <Button variant="outline" size="sm" onClick={resetPosition} disabled={!selected.offset}>
                          <RotateCcw aria-hidden="true" />
                          Reset position
                        </Button>
                        <Button variant="outline" size="sm" onClick={arrangeBranch} disabled={!canArrangeBranch}>
                          <Network aria-hidden="true" />
                          Arrange branch
                        </Button>
                      </div>
                    </fieldset>
                  )}
                  {parent && (
                    <fieldset className="space-y-1.5">
                      <legend className="text-sm font-medium">Branch direction</legend>
                      <ToggleGroup
                        type="single"
                        variant="outline"
                        className="w-full"
                        value={selected.dir ?? "auto"}
                        onValueChange={(value) => value && setDirection(isDirection(value) ? value : null)}
                      >
                        {DIRECTION_OPTIONS}
                      </ToggleGroup>
                    </fieldset>
                  )}
                </div>
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-3 py-12 text-center">
                  <MousePointerClick aria-hidden="true" className="size-8 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">Select a node on the map to edit it.</p>
                  <Button variant="outline" size="sm" onClick={() => selectNode(map.rootId)}>
                    Select the root node
                  </Button>
                </div>
              )}
          </div>,
        )}
      </div>

      <Dialog
        open={exportOpen}
        onOpenChange={(open) => {
          setExportOpen(open);
          if (!open) setCopyState("idle");
        }}
      >
        <DialogContent className="flex max-h-[min(40rem,90dvh)] flex-col sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Export Mermaid mindmap</DialogTitle>
            <DialogDescription>The whole map as Mermaid mindmap code, for Markdown, docs or another Mermaid tool.</DialogDescription>
          </DialogHeader>
          <pre
            tabIndex={0}
            aria-label="Mermaid mindmap code"
            className="min-h-0 flex-1 overflow-auto rounded-lg border border-border bg-muted/50 p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap break-words text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {mermaid}
          </pre>
          <p role="status" className={cn("text-xs", copyState === "failed" ? "text-destructive" : "sr-only")}>
            {copyState === "copied" && "Mermaid code copied."}
            {copyState === "failed" && "Copy is blocked here. Select the code above and copy it manually, or download it."}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={handleDownloadMermaid}>
              <FileDown aria-hidden="true" />
              Download .mmd
            </Button>
            <Button onClick={handleCopy}>
              {copyState === "copied" ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
              {copyState === "copied" ? "Copied" : "Copy code"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <OneDriveBrowserDialog
        key={driveDialog ?? "closed"}
        mode={driveDialog ?? "open"}
        open={driveDialog !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDriveDialog(null);
            setFailure(null);
            settleSaveAs(false);
          }
        }}
        busy={busy}
        failure={failureInfo}
        onDismissFailure={dismissFailure}
        defaultName={suggestedName}
        onOpenFile={(item) => void openConfirmed({ kind: "item", item })}
        onOpenPath={(path) => void openConfirmed({ kind: "path", path })}
        onSave={(folderPath, name) => void handleSaveAs(folderPath, name)}
      />
      {saveChoiceDialog}

      <MergeDialog review={review} busy={saveMutation.isPending} onResolve={resolveConflict} onResolveAll={resolveAll} onConfirm={confirmReview} onCancel={cancelReview} />

      <ShareLinkDialog target={shareTarget} onClose={clearShare} />
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
      <AboutDialog open={aboutOpen} onOpenChange={setAboutOpen} />
      <WelcomeDialog open={welcomeOpen && (welcomeManual || !requestedKey)} onOpenChange={changeWelcomeOpen} />

      <LinkPicker
        map={map}
        sourceId={linkPickerFor && map.nodes[linkPickerFor] ? linkPickerFor : null}
        onPick={(targetId) => {
          if (linkPickerFor) createLink(linkPickerFor, targetId);
        }}
        onClose={() => setLinkPickerFor(null)}
      />

      <Dialog
        open={importOpen}
        onOpenChange={(open) => {
          if (open) setImportOpen(true);
          else closeImport();
        }}
      >
        <DialogContent className="sm:max-w-lg" {...importDrop.handlers}>
          {importDrop.active && (
            // Said by the status line below; the pointer passes through it to the dialog, which takes the drop.
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-2 z-10 flex items-center justify-center rounded-md border-2 border-dashed border-primary bg-background/90 forced-colors:border-[Highlight]"
            >
              <span className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground shadow-sm forced-colors:border-[CanvasText]">
                <FileCode2 aria-hidden="true" className="size-4 shrink-0 text-primary forced-colors:text-[CanvasText]" />
                Drop a Mermaid file to import it
              </span>
            </div>
          )}
          <p role="status" className="sr-only">
            {importDrop.active ? DROP_CUE : ""}
          </p>
          <DialogHeader>
            <DialogTitle>Import Mermaid mindmap</DialogTitle>
            <DialogDescription>
              The imported map replaces the current one as a new draft, not linked to OneDrive until you save it there.
              {dirty && file ? ` Unsaved changes to ${file.name} are discarded.` : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="import-file">Mermaid file from this device</Label>
            <Input
              id="import-file"
              type="file"
              accept={IMPORT_ACCEPT}
              aria-describedby="import-file-hint"
              onChange={(event) => {
                const picked = event.target.files?.[0];
                if (picked) void readImportFile(picked);
              }}
            />
            <p id="import-file-hint" className="text-xs text-muted-foreground">
              .mmd, .mermaid, .md or .txt — chosen here or dropped anywhere on this dialog.
            </p>
            <p role="status" className={cn("text-xs text-muted-foreground", !importSource && "sr-only")}>
              {importSource ? `Loaded ${importSource.name} (${formatBytes(importSource.size)}) into the code field.` : ""}
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="import-code">Mermaid code</Label>
            <Textarea
              id="import-code"
              rows={10}
              value={importText}
              onChange={(e) => {
                setImportText(e.target.value);
                // Emptied by hand, the field no longer holds the loaded file.
                if (!e.target.value.trim()) setImportSource(null);
              }}
              className="font-mono text-xs"
              placeholder={"mindmap\n  root((Topic))\n    Branch\n      Leaf"}
              aria-invalid={importError ? true : undefined}
              aria-describedby={importError ? "import-error" : undefined}
            />
            {importError && (
              <p id="import-error" role="alert" className="text-sm text-destructive">
                {importError}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeImport}>
              Cancel
            </Button>
            <Button onClick={() => void handleImport()} disabled={!importText.trim()}>
              Replace map
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
