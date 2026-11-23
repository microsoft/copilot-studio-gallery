import { useSyncExternalStore, type ReactNode } from "react";
import { formatBytes, type DriveFileRef, type FileStamp } from "@/lib/onedrive-files";

// The open map's file properties, as the line under the canvas states them: where the
// OneDrive file is, when it was last saved and by whom, how big it is — only what the
// file's metadata actually reports — or, for a draft, that it is not saved anywhere yet.

/** How often the humanised save time is re-read against the clock. */
const TICK_MS = 60_000;

interface FilePropertiesProps {
  /** The OneDrive file the map is linked to, if any. */
  file: DriveFileRef | null;
  /** The version of that file the editor measures against — the last one loaded or saved. */
  stamp: FileStamp | null;
  /** The device file the open draft was imported from, while the draft is still unsaved. */
  importedFrom: string | null;
}

const EXACT = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });
const DAY = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });
const RELATIVE = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

/**
 * `date` against `now`, humanised: just now, 5 minutes ago, 3 hours ago, yesterday, else the date.
 * A time ahead of this clock (the server's clock runs its own way) reads as just now.
 */
function humaniseTime(date: Date, now: number): string {
  const seconds = Math.round((now - date.getTime()) / 1000);
  if (seconds < 45) return "just now";
  if (seconds < 3600) return RELATIVE.format(-Math.max(1, Math.round(seconds / 60)), "minute");
  if (seconds < 86_400) return RELATIVE.format(-Math.max(1, Math.round(seconds / 3600)), "hour");
  if (seconds < 7 * 86_400) return RELATIVE.format(-Math.max(1, Math.round(seconds / 86_400)), "day");
  return DAY.format(date);
}

/** The folder part of a OneDrive path, as the line names it. */
function folderLabel(path: string): string {
  const cut = path.lastIndexOf("/");
  const folder = cut > 0 ? path.slice(0, cut) : "/";
  return folder === "/" ? "the OneDrive root" : folder;
}

// The clock the humanised time is read against ticks once a minute; a whole minute is the
// snapshot, so renders in the same minute agree.
function subscribeToClock(onTick: () => void) {
  const timer = window.setInterval(onTick, TICK_MS);
  return () => window.clearInterval(timer);
}
const readMinute = () => Math.floor(Date.now() / TICK_MS);

/** One fact on the status line; a lower `priority` keeps its place longer when the line runs short. */
export interface StatusItem {
  id: string;
  priority: number;
  node: ReactNode;
}

/** The open map's file properties as status-line items. */
export function useFileDetails({ file, stamp, importedFrom }: FilePropertiesProps): StatusItem[] {
  const minute = useSyncExternalStore(subscribeToClock, readMinute, readMinute);
  const now = minute * TICK_MS;
  const parsed = stamp?.lastModified ? new Date(stamp.lastModified) : null;
  const savedAt = parsed && !Number.isNaN(parsed.getTime()) ? parsed : null;
  const by = stamp?.lastModifiedBy ? ` by ${stamp.lastModifiedBy}` : "";

  const items: StatusItem[] = [];
  if (file) {
    items.push({ id: "folder", priority: 4, node: <>in {folderLabel(file.path)}</> });
    if (savedAt) {
      const exact = EXACT.format(savedAt);
      items.push({
        id: "saved",
        priority: 2,
        node: (
          <>
            Last saved{" "}
            <time dateTime={savedAt.toISOString()} title={exact}>
              {humaniseTime(savedAt, now)}
            </time>
            <span className="sr-only"> ({exact})</span>
            {by}
          </>
        ),
      });
    } else if (by) {
      items.push({ id: "saved", priority: 2, node: <>Last saved{by}</> });
    }
    if (stamp?.size !== undefined) items.push({ id: "size", priority: 5, node: formatBytes(stamp.size) });
  } else {
    items.push({ id: "draft", priority: 1, node: <>Unsaved draft{importedFrom ? `, imported from ${importedFrom}` : ""}</> });
  }
  return items;
}
