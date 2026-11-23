import { OneDriveforBusinessService } from "../../generated";
import type { BlobMetadata } from "../../generated/models/OneDriveforBusinessModel";
import { OneDriveError, UserFacingError, isTimeout, oneDriveFailure, oneDriveTimeout } from "@/lib/app-errors";
import { whenHostReady } from "@/lib/host-ready";
import { reportPrivateRuntimeError } from "@/lib/console-capture";
import { FileSizeError, MAX_FILE_BYTES, assertTextSize } from "@/lib/map-limits";
import { STANDALONE, standaloneMessage } from "@/lib/standalone";

// OneDrive for Business file access for the mind-map editor. Every call goes
// through the generated connector client; results are unwrapped by each
// method's declared return shape and failures surface as plain-language,
// user-safe messages (the raw connector error is logged for developers only).
// A connector request has no timeout of its own and waits until the host
// answers, so every operation here is bounded: it ends in a result or in a
// described failure, never in a spinner that stays forever.

export type DriveItem = BlobMetadata;

/** Identity and location of a OneDrive file — metadata only, safe to keep in app state. */
export interface DriveFileRef {
  id: string;
  name: string;
  path: string;
}

/** Which version of a file OneDrive holds, as its metadata reports it — enough to notice a change without reading the content. */
export interface FileStamp {
  eTag?: string;
  lastModified?: string;
  /** Who last changed it, as OneDrive names them (connector text — shown, never stored). */
  lastModifiedBy?: string;
  /** Its size in bytes, when the metadata reports one — shown as a file property, never compared. */
  size?: number;
}

export interface SavedFile extends DriveFileRef {
  stamp: FileStamp;
}

export interface OpenedFile extends SavedFile {
  text: string;
}

/** The outcome of asking OneDrive whether a file still matches the version the app knows. */
export type RemoteCheck = { status: "same"; stamp: FileStamp } | { status: "changed"; ref: DriveFileRef; stamp: FileStamp; text: string };

export interface FolderPage {
  items: DriveItem[];
  /** Continuation token for the next page; absent when this is the last page. */
  nextToken?: string;
}

export const PAGE_SIZE = 50;
export { MAX_FILE_BYTES } from "@/lib/map-limits";
/** Longest an operation (one or two connector calls) may wait for OneDrive before it is reported as unanswered. */
export const REQUEST_TIMEOUT_MS = 40_000;
export const DEFAULT_EXTENSION = "mmd";
const TEXT_EXTENSIONS = new Set(["mmd", "mermaid", "md", "markdown", "txt"]);

/** One step of a folder trail. `id: null` is the drive root. */
export interface Crumb {
  id: string | null;
  name: string;
  path: string;
}

export const ROOT_CRUMB: Crumb = { id: null, name: "OneDrive", path: "/" };
const FOLDER_KEY = "mermaid-mindmap-studio.last-folder";

function isCrumb(value: unknown): value is Crumb {
  if (!value || typeof value !== "object") return false;
  const crumb = value as Record<string, unknown>;
  return (crumb.id === null || typeof crumb.id === "string") && typeof crumb.name === "string" && typeof crumb.path === "string";
}

/** The folder trail of the last open, save, or library visit — folder ids and names only — so the next one starts there. */
export function loadCrumbs(): Crumb[] {
  try {
    const raw = localStorage.getItem(FOLDER_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0 && parsed.every(isCrumb) && parsed[0].id === null) return parsed;
    }
  } catch {
    // Unreadable storage: start at the drive root.
  }
  return [ROOT_CRUMB];
}

export function rememberCrumbs(crumbs: Crumb[]) {
  try {
    localStorage.setItem(FOLDER_KEY, JSON.stringify(crumbs));
  } catch {
    // Storage unavailable: the folder is simply not remembered.
  }
}

/** A folder item appended to the current trail. */
export function crumbFor(item: DriveItem, parent: Crumb): Crumb | null {
  if (!item.Id) return null;
  const name = item.Name || "Folder";
  return { id: item.Id, name, path: item.Path || joinPath(parent.path, name) };
}

export function fileExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

/** A file name without its extension, for display. */
export function displayName(item: DriveItem): string {
  if (item.NameNoExt) return item.NameNoExt;
  const name = item.Name ?? "";
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name || "Untitled";
}

export function isSupportedTextFile(item: DriveItem): boolean {
  return !item.IsFolder && TEXT_EXTENSIONS.has(fileExtension(item.Name ?? ""));
}

export function normalizePath(path: string): string {
  const trimmed = path.trim().replace(/\\/g, "/");
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

export function joinPath(folderPath: string, name: string): string {
  const folder = normalizePath(folderPath).replace(/\/+$/, "");
  return `${folder}/${name.trim()}`;
}

export function withDefaultExtension(name: string): string {
  const trimmed = name.trim();
  return fileExtension(trimmed) ? trimmed : `${trimmed}.${DEFAULT_EXTENSION}`;
}

export function suggestFileName(label: string): string {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${slug || "mindmap"}.${DEFAULT_EXTENSION}`;
}

export function formatBytes(size: number | undefined): string {
  if (size === undefined) return "";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDate(iso: string | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
}

/** A failed connector result: raw details go to private diagnostics; the thrown error explains itself to people. */
function fail(action: string, error: unknown): never {
  throw oneDriveFailure(action, error);
}

/**
 * Run one operation against OneDrive, bounded: it starts only once the hosting
 * runtime is ready to carry it, gives up after `REQUEST_TIMEOUT_MS`, and turns
 * any unexpected throw (anything not already written for the user) into a
 * described failure.
 */
async function attempt<T>(action: string, run: () => Promise<T>): Promise<T> {
  if (STANDALONE) throw new UserFacingError(standaloneMessage(action));
  await whenHostReady();
  let timer: number | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = window.setTimeout(() => reject(oneDriveTimeout(action, REQUEST_TIMEOUT_MS)), REQUEST_TIMEOUT_MS);
  });
  try {
    return await Promise.race([run(), timeout]);
  } catch (error) {
    if (error instanceof OneDriveError || error instanceof UserFacingError) throw error;
    throw oneDriveFailure(action, error);
  } finally {
    window.clearTimeout(timer);
  }
}

function assertSize(size: number | undefined) {
  if (size !== undefined && size > MAX_FILE_BYTES) {
    throw new FileSizeError();
  }
}

function toRef(meta: DriveItem | undefined, fallback: Partial<DriveFileRef>): DriveFileRef {
  const id = meta?.Id ?? fallback.id;
  if (!id) throw new UserFacingError("OneDrive returned a file without an identifier.");
  const path = meta?.Path || fallback.path || "";
  const name = meta?.Name || fallback.name || path.split("/").pop() || "Untitled";
  return { id, name, path: path || joinPath("/", name) };
}

/** The identity of a listed file, or null when the listing carried no id for it. */
export function fileRef(item: DriveItem): DriveFileRef | null {
  return item.Id ? toRef(item, {}) : null;
}

function stampOf(meta: DriveItem | undefined): FileStamp {
  const stamp: FileStamp = {};
  if (meta?.ETag) stamp.eTag = meta.ETag;
  if (meta?.LastModified) stamp.lastModified = meta.LastModified;
  if (meta?.LastModifiedBy) stamp.lastModifiedBy = meta.LastModifiedBy;
  if (typeof meta?.Size === "number" && meta.Size >= 0) stamp.size = meta.Size;
  return stamp;
}

/** True when both stamps name the same version, false when they differ, null when they can't be compared. */
export function sameVersion(a: FileStamp, b: FileStamp): boolean | null {
  if (a.eTag && b.eTag) return a.eTag === b.eTag;
  if (a.lastModified && b.lastModified) return a.lastModified === b.lastModified;
  return null;
}

/** Text as it compares: line endings and trailing whitespace are not changes. */
export function normalizeText(text: string): string {
  return text.replace(/\r\n?/g, "\n").replace(/[ \t]+$/gm, "").trimEnd();
}

/**
 * File content is declared as `string` by the generated client, but the runtime
 * hands binary responses back as bytes — accept both and decode to text.
 */
function decodeText(data: unknown): string {
  if (data === undefined || data === null) return "";
  let text: string;
  if (typeof data === "string") {
    text = data;
  } else if (data instanceof Uint8Array || data instanceof ArrayBuffer) {
    assertSize(data.byteLength);
    text = new TextDecoder().decode(data);
  } else {
    throw new UserFacingError("The file content could not be read as text.");
  }
  assertTextSize(text);
  return text.replace(/^\uFEFF/, "");
}

/**
 * Action-mode listing: the continuation lives in the page's `nextLink`. An absent
 * link means the last page; a link without a readable token is surfaced as an
 * error so the list never silently truncates.
 */
function continuationFrom(nextLink: string | undefined): string | undefined {
  if (!nextLink) return undefined;
  let url: URL;
  try {
    url = new URL(nextLink, window.location.origin);
  } catch (error) {
    reportPrivateRuntimeError("OneDrive: invalid continuation link", error, nextLink);
    console.error("OneDrive: invalid continuation link");
    throw new UserFacingError("Couldn't read the next page of this folder.");
  }
  for (const [key, value] of url.searchParams) {
    if (key.toLowerCase().replace(/^\$/, "") === "skiptoken" && value.trim()) return value.trim();
  }
  reportPrivateRuntimeError(
    "OneDrive: continuation link lacks a skipToken parameter",
    new Error("Continuation link did not contain a skipToken parameter"),
    nextLink,
  );
  console.error("OneDrive: continuation link lacks a skipToken parameter");
  throw new UserFacingError("Couldn't read the next page of this folder.");
}

/** One page of a folder. `null` lists the drive root (no continuation contract there). */
export function listFolderPage(folderId: string | null, skipToken?: string): Promise<FolderPage> {
  return attempt("list this folder", async () => {
    if (folderId === null) {
      // IOperationResult<BlobMetadata[]> — direct array.
      const result = await OneDriveforBusinessService.ListRootFolder();
      if (!result.success) fail("list the root folder", result.error);
      return { items: result.data ?? [] };
    }
    // IOperationResult<BlobMetadataPage> — wrapper with `value` + `nextLink`.
    const result = await OneDriveforBusinessService.ListFolderV2(folderId, skipToken, PAGE_SIZE);
    if (!result.success) fail("list this folder", result.error);
    return { items: result.data?.value ?? [], nextToken: continuationFrom(result.data?.nextLink) };
  });
}

export function openFileByPath(rawPath: string): Promise<OpenedFile> {
  return attempt("open that file", async () => {
    const path = normalizePath(rawPath);
    // IOperationResult<BlobMetadata> — scalar.
    const meta = await OneDriveforBusinessService.GetFileMetadataByPath(path);
    if (!meta.success) fail("find that file", meta.error);
    if (meta.data?.IsFolder) throw new UserFacingError("That path points to a folder, not a file.");
    assertSize(meta.data?.Size);
    const content = await OneDriveforBusinessService.GetFileContentByPath(path, false);
    if (!content.success) fail("read that file", content.error);
    return { ...toRef(meta.data, { path }), stamp: stampOf(meta.data), text: decodeText(content.data) };
  });
}

export function openFile(item: DriveItem): Promise<OpenedFile> {
  return attempt("open that file", async () => {
    const ref = toRef(item, {});
    assertSize(item.Size);
    const content = await OneDriveforBusinessService.GetFileContent(ref.id, false);
    if (!content.success) fail("read that file", content.error);
    return { ...ref, stamp: stampOf(item), text: decodeText(content.data) };
  });
}

/** Open a file from its identifier (the form a shared app link carries). */
export function openFileById(id: string): Promise<OpenedFile> {
  return attempt("open the linked file", async () => {
    // IOperationResult<BlobMetadata> — scalar.
    const meta = await OneDriveforBusinessService.GetFileMetadata(id);
    if (!meta.success) fail("find the linked file", meta.error);
    if (meta.data?.IsFolder) throw new UserFacingError("That link points to a folder, not a file.");
    assertSize(meta.data?.Size);
    const content = await OneDriveforBusinessService.GetFileContent(id, false);
    if (!content.success) fail("read the linked file", content.error);
    return { ...toRef(meta.data, { id }), stamp: stampOf(meta.data), text: decodeText(content.data) };
  });
}

// The connector names a file `<drive>.<item>` — the drive's own id, a dot, then the
// item id. A link made elsewhere (a file created through the graph directly) can
// carry the bare item id instead; the connector has no answer for that form.
const DRIVE_SEPARATOR = ".";

/** True for the connector's own file identifier, false for a bare item id. */
export function hasDrivePrefix(id: string): boolean {
  const dot = id.indexOf(DRIVE_SEPARATOR);
  return dot > 0 && dot < id.length - 1;
}

let drivePrefix: Promise<string | null> | null = null;

/** The user's drive id, as the identifiers of the drive's root items carry it; null when the root is empty. Looked up once per session. */
function resolveDrivePrefix(): Promise<string | null> {
  drivePrefix ??= listFolderPage(null)
    .then(({ items }) => {
      for (const item of items) {
        const id = item.Id ?? "";
        if (hasDrivePrefix(id)) return id.slice(0, id.indexOf(DRIVE_SEPARATOR));
      }
      // An empty root says nothing yet; the next save asks again once something is there.
      drivePrefix = null;
      return null;
    })
    .catch((error: unknown) => {
      drivePrefix = null;
      throw error;
    });
  return drivePrefix;
}

/**
 * Open the file a share link names. The connector's own identifier opens directly,
 * with the path as the fallback for a link whose id this drive can't resolve. A bare
 * item id goes by path first — the one call sequence that works for it — and, should
 * the file have moved since the link was made, by the id completed with this drive's
 * prefix. A wait that ends without an answer is reported as it is; asking again
 * another way would only repeat the wait.
 */
export async function openLinkedFile(id: string, path: string | null): Promise<OpenedFile> {
  if (hasDrivePrefix(id)) {
    try {
      return await openFileById(id);
    } catch (error) {
      if (!path || isTimeout(error) || error instanceof FileSizeError) throw error;
      return openFileByPath(path);
    }
  }
  let pathError: unknown = null;
  if (path) {
    try {
      return await openFileByPath(path);
    } catch (error) {
      if (isTimeout(error) || error instanceof FileSizeError) throw error;
      pathError = error;
    }
  }
  const drive = await resolveDrivePrefix();
  if (!drive) {
    if (pathError) throw pathError;
    throw new UserFacingError("This link names the file in a form your OneDrive doesn't recognise, and carries no path to find it by.");
  }
  return openFileById(`${drive}${DRIVE_SEPARATOR}${id}`);
}

/**
 * Has the file changed on OneDrive since the version the app knows? Its metadata
 * answers in one call when the stamps compare; otherwise the content is read and
 * compared, so a mere touch is not reported as a change.
 */
export function checkRemote(ref: DriveFileRef, known: { stamp: FileStamp; text: string }): Promise<RemoteCheck> {
  return attempt("check the file on OneDrive", async () => {
    // IOperationResult<BlobMetadata> — scalar.
    const meta = await OneDriveforBusinessService.GetFileMetadata(ref.id);
    if (!meta.success) fail("check the file on OneDrive", meta.error);
    if (meta.data?.IsFolder) throw new UserFacingError("The file's place on OneDrive is now taken by a folder.");
    const stamp = stampOf(meta.data);
    if (sameVersion(stamp, known.stamp) === true) return { status: "same", stamp };
    assertSize(meta.data?.Size);
    const content = await OneDriveforBusinessService.GetFileContent(ref.id, false);
    if (!content.success) fail("read the file on OneDrive", content.error);
    const text = decodeText(content.data);
    if (normalizeText(text) === normalizeText(known.text)) return { status: "same", stamp };
    return { status: "changed", ref: toRef(meta.data, ref), stamp, text };
  });
}

/** Existing file at `path`, or null when nothing usable is there. */
export function findFile(path: string): Promise<DriveFileRef | null> {
  return attempt("check that folder for an existing file", async () => {
    const result = await OneDriveforBusinessService.GetFileMetadataByPath(normalizePath(path));
    if (!result.success || !result.data?.Id || result.data.IsFolder) return null;
    return toRef(result.data, { path });
  });
}

export function updateFile(ref: DriveFileRef, text: string): Promise<SavedFile> {
  return attempt("save the file", async () => {
    // IOperationResult<BlobMetadata> — scalar.
    const result = await OneDriveforBusinessService.UpdateFile(ref.id, text);
    if (!result.success) fail("save the file", result.error);
    return { ...toRef(result.data, ref), stamp: stampOf(result.data) };
  });
}

export function createFile(folderPath: string, name: string, text: string): Promise<SavedFile> {
  return attempt("create the file", async () => {
    const folder = normalizePath(folderPath);
    // IOperationResult<BlobMetadata> — scalar.
    const result = await OneDriveforBusinessService.CreateFile(folder, name, text);
    if (!result.success) fail("create the file", result.error);
    return { ...toRef(result.data, { name, path: joinPath(folder, name) }), stamp: stampOf(result.data) };
  });
}

// Save lock. The connector can't make a write conditional on the version it
// replaces, and CreateFile silently overwrites, so saves are serialized with a
// lock file beside the map instead: each save writes a uniquely named temp file
// and renames it onto the lock name with overwrite off. OneDrive lets exactly
// one rename win; the others are told the destination exists. Only Mind Map
// Monkey honours the lock. Lock paths address the signed-in user's own drive,
// so a file from someone else's drive is saved without one.
const LOCK_LEASE_MS = 120_000;
const LOCK_ATTEMPTS = 6;
const LOCK_RETRY_MS = 1_500;

function failedStatus(error: unknown): number | undefined {
  if (error && typeof error === "object" && "status" in error) {
    const { status } = error as { status?: unknown };
    if (typeof status === "number") return status;
  }
  return undefined;
}

function folderOf(path: string): string {
  const normalized = normalizePath(path);
  return normalized.slice(0, normalized.lastIndexOf("/")) || "/";
}

interface LockTarget {
  id?: string | null;
  name: string;
  path: string;
}

async function lockable(target: LockTarget): Promise<boolean> {
  if (!target.path || !target.name) return false;
  if (!target.id) return true;
  if (!hasDrivePrefix(target.id)) return false;
  const drive = await resolveDrivePrefix().catch(() => null);
  return drive !== null && target.id.startsWith(`${drive}${DRIVE_SEPARATOR}`);
}

async function releaseLock(id: string) {
  try {
    await attempt("release the save lock", () => OneDriveforBusinessService.DeleteFile(id));
  } catch {
    // An unreleased lock expires after its lease.
  }
}

async function acquireLock(ref: LockTarget): Promise<string> {
  const folder = folderOf(ref.path);
  const lockName = `.${ref.name}.mindmap-monkey.lock`;
  const lockPath = joinPath(folder, lockName);
  const token = crypto.randomUUID();
  const tempId = await attempt("prepare the save", async () => {
    const temp = await OneDriveforBusinessService.CreateFile(folder, `${lockName}.${token}.tmp`, JSON.stringify({ app: "Mind Map Monkey", token }));
    if (!temp.success || !temp.data?.Id) fail("prepare the save", temp.error);
    return temp.data.Id;
  });
  try {
    for (let tries = 0; tries < LOCK_ATTEMPTS; tries++) {
      const moved = await attempt("lock the file for saving", () => OneDriveforBusinessService.MoveFile(tempId, lockPath, false));
      if (moved.success) return moved.data?.Id ?? tempId;
      const held = await attempt("lock the file for saving", () => OneDriveforBusinessService.GetFileMetadataByPath(lockPath));
      if (!held.success) {
        // The lock was released between the rename and the look: try again at once. Any other failed rename is reported as it is.
        const movedStatus = failedStatus(moved.error);
        const conflict = movedStatus === 409 || movedStatus === 412 || /already exists/i.test(String(moved.error?.message ?? ""));
        if (failedStatus(held.error) === 404 && conflict) continue;
        fail("lock the file for saving", moved.error);
      }
      const heldId = held.data?.Id;
      const since = Date.parse(held.data?.LastModified ?? "");
      if (heldId && Number.isFinite(since) && Date.now() - since > LOCK_LEASE_MS) {
        // A lock left behind by a save that never finished. Renaming it by id lets only one client break it.
        const broken = await attempt("clear an expired save lock", () =>
          OneDriveforBusinessService.MoveFile(heldId, joinPath(folder, `${lockName}.${token}.expired`), false),
        );
        if (broken.success) await releaseLock(broken.data?.Id ?? heldId);
        continue;
      }
      await new Promise<void>((resolve) => window.setTimeout(resolve, LOCK_RETRY_MS));
    }
  } catch (error) {
    await releaseLock(tempId);
    throw error;
  }
  await releaseLock(tempId);
  throw new UserFacingError(`${ref.name} is being saved from somewhere else right now. Try saving again in a moment.`);
}

/** Run a save of `ref` while holding its save lock, so two Mind Map Monkey sessions can't check and write it at the same time. */
export async function withSaveLock<T>(ref: LockTarget, run: () => Promise<T>): Promise<T> {
  if (!(await lockable(ref))) return run();
  const lockId = await acquireLock(ref);
  try {
    return await run();
  } finally {
    await releaseLock(lockId);
  }
}
