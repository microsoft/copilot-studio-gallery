import { loadHostContext } from "@/lib/host-info";
import type { DriveFileRef } from "@/lib/onedrive-files";
import { reportPrivateRuntimeError } from "@/lib/console-capture";
import { STANDALONE } from "@/lib/standalone";

// A share link is the app's address with the file identity in the query string:
// `<app address>?file=<OneDrive id>&path=<path>`. The app itself runs inside a
// hosting frame (the design-time preview or the published app's player), so its
// own `window.location` is not the address a collaborator opens. The default
// address is therefore the published app's player address, completed with the
// app id the hosting runtime reports; the user can replace it with any address.

/** Where a published app opens for its users; the app id completes the address. */
export const PLAYER_BASE = "https://play.preview.managedapps.cloud.microsoft/apps/";
const APP_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** An absolute http(s) address without query or fragment, or null when the input isn't one. */
export function normalizeAddress(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function fileQuery(file: Pick<DriveFileRef, "id" | "path">): string {
  return new URLSearchParams({ file: file.id, path: file.path }).toString();
}

export function buildShareLink(address: string, file: DriveFileRef): string {
  const url = new URL(address);
  url.search = fileQuery(file);
  url.hash = "";
  return url.toString();
}

/** The in-app editor route for a file — the same query a share link carries, so both open the same way. */
export function editorPath(file: Pick<DriveFileRef, "id" | "path"> | null): string {
  return file ? `/?${fileQuery(file)}` : "/";
}

/**
 * `current` with its file reference replaced by `ref` (or removed). Only the two file
 * parameters change: whatever else the hosting frame put in the app's address stays.
 */
export function withFileParams(current: URLSearchParams, ref: { id?: string | null; path?: string | null } | null): URLSearchParams {
  const next = new URLSearchParams(current);
  next.delete("file");
  next.delete("path");
  if (ref?.id) next.set("file", ref.id);
  if (ref?.path) next.set("path", ref.path);
  return next;
}

export function hostOf(address: string): string {
  try {
    return new URL(address).host;
  } catch {
    return address;
  }
}

export interface ReferredFile {
  id: string | null;
  path: string | null;
}

/** A file reference carried by the page that embedded this app, when its referrer policy passes the full address along. */
function fileRefFromReferrer(): ReferredFile | null {
  try {
    if (!document.referrer) return null;
    const url = new URL(document.referrer);
    const id = url.searchParams.get("file")?.trim() || null;
    const path = url.searchParams.get("path")?.trim() || null;
    return id || path ? { id, path } : null;
  } catch {
    return null;
  }
}

// The hosting page may drop the link's query on a sign-in round trip, and a
// reloaded frame may come back at its bare address. The app therefore keeps the
// file reference in two places it controls as well: a link-open that has started
// but not finished (this browser, time-limited) and the file this tab is editing.
const PENDING_LINK_KEY = "mermaid-mindmap-studio.pending-link";
const SESSION_FILE_KEY = "mermaid-mindmap-studio.session-file";
/** Long enough for a sign-in round trip, short enough that a later visit isn't surprised by an old link. */
const PENDING_LINK_TTL_MS = 15 * 60 * 1000;

interface StoredRef extends ReferredFile {
  at: number;
}

function readStoredRef(storage: () => Storage, key: string, maxAgeMs?: number): ReferredFile | null {
  try {
    const raw = storage().getItem(key);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const { id, path, at } = parsed as Partial<StoredRef>;
    const validId = typeof id === "string" && id.trim() ? id.trim() : null;
    const validPath = typeof path === "string" && path.trim() ? path.trim() : null;
    if (!validId && !validPath) return null;
    if (maxAgeMs !== undefined && (typeof at !== "number" || Date.now() - at > maxAgeMs)) {
      storage().removeItem(key);
      return null;
    }
    return { id: validId, path: validPath };
  } catch {
    return null;
  }
}

function writeStoredRef(storage: () => Storage, key: string, ref: ReferredFile | null) {
  try {
    if (ref && (ref.id || ref.path)) {
      const stored: StoredRef = { id: ref.id, path: ref.path, at: Date.now() };
      storage().setItem(key, JSON.stringify(stored));
    } else {
      storage().removeItem(key);
    }
  } catch {
    // Storage unavailable: the reference lives in the address only.
  }
}

/** A link-open that has started: remembered until it succeeds or is dismissed, so a sign-in round trip or reload resumes it. */
export function rememberPendingLink(ref: ReferredFile) {
  writeStoredRef(() => localStorage, PENDING_LINK_KEY, ref);
}

export function clearPendingLink() {
  writeStoredRef(() => localStorage, PENDING_LINK_KEY, null);
}

/** The file the editor shows — identity and path only — kept for this tab so a reload reopens it. */
export function rememberEditorFile(ref: Pick<DriveFileRef, "id" | "path"> | null) {
  writeStoredRef(() => sessionStorage, SESSION_FILE_KEY, ref ? { id: ref.id, path: ref.path } : null);
}

let rememberedTaken = false;

/**
 * The file to open when the app's own address carries none, handed out once per
 * page load: the embedding page's address first, then a link-open still in
 * progress, then the file this tab was editing. The first editor mount decides
 * what to do with it; a later mount or a cleared file never re-opens it.
 */
export function takeRememberedFile(): ReferredFile | null {
  if (rememberedTaken) return null;
  rememberedTaken = true;
  return fileRefFromReferrer() ?? readStoredRef(() => localStorage, PENDING_LINK_KEY, PENDING_LINK_TTL_MS) ?? readStoredRef(() => sessionStorage, SESSION_FILE_KEY);
}

let publishedAddress: Promise<string | null> | null = null;

/**
 * The published app's address, from the app context the hosting runtime reports.
 * Resolved once per session; null when the host doesn't answer in time or reports
 * no usable app id, so callers fall back to the page's own address.
 */
export function resolvePublishedAddress(): Promise<string | null> {
  publishedAddress ??= (async () => {
    // No host to ask in local mode; the page's own address stands in.
    if (STANDALONE) return null;
    try {
      const context = await loadHostContext();
      const appId = context.app.appId?.trim();
      return appId && APP_ID.test(appId) ? `${PLAYER_BASE}${appId.toLowerCase()}` : null;
    } catch (error) {
      reportPrivateRuntimeError("Share link: the published app address could not be resolved", error);
      console.warn("Share link: the published app address could not be resolved");
      return null;
    }
  })();
  return publishedAddress;
}

export async function copyText(text: string): Promise<boolean> {
  try {
    if (!navigator.clipboard) return false;
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
