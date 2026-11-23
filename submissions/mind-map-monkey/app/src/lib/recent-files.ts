import type { DriveFileRef } from "@/lib/onedrive-files";

/** A OneDrive file the editor opened or saved on this device — identity and location only, never content. */
export interface RecentFile extends DriveFileRef {
  /** When the editor last opened or saved it (ISO time). */
  usedAt: string;
}

const RECENT_KEY = "mermaid-mindmap-studio.recent-files";
export const RECENT_LIMIT = 15;

const isRecent = (value: unknown): value is RecentFile => {
  if (!value || typeof value !== "object") return false;
  const entry = value as Record<string, unknown>;
  return typeof entry.id === "string" && entry.id !== "" && typeof entry.name === "string" && typeof entry.path === "string" && typeof entry.usedAt === "string";
};

export function loadRecentFiles(): RecentFile[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isRecent).slice(0, RECENT_LIMIT) : [];
  } catch {
    return [];
  }
}

export function storeRecentFiles(files: RecentFile[]) {
  try {
    if (files.length) localStorage.setItem(RECENT_KEY, JSON.stringify(files));
    else localStorage.removeItem(RECENT_KEY);
  } catch {
    // Storage unavailable: the list lasts for this session.
  }
}

/** `file` moved to the top of the list, newest first, without duplicates. */
export function withRecent(files: RecentFile[], file: DriveFileRef, usedAt = new Date().toISOString()): RecentFile[] {
  const entry: RecentFile = { id: file.id, name: file.name, path: file.path, usedAt };
  return [entry, ...files.filter((recent) => recent.id !== file.id)].slice(0, RECENT_LIMIT);
}
