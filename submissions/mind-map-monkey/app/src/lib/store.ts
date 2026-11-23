import { create } from "zustand";
import type { DriveFileRef } from "@/lib/onedrive-files";
import { loadRecentFiles, storeRecentFiles, withRecent, type RecentFile } from "@/lib/recent-files";
import { normalizeAddress } from "@/lib/share-link";

// Global client state shared across components/routes. ONE module-scoped store,
// no Provider needed — import `useAppStore` anywhere. Use `useState` for
// component-local state; let TanStack Query own server/connector data (don't
// mirror it here). NEVER use raw React Context for mutable shared state.
//
// Rules:
//   • Put actions INSIDE the store (set-based, immutable updates); components call them.
//   • Read with a NARROW selector — `useAppStore((s) => s.items)`, never
//     `useAppStore()` with no selector. Don't return a fresh object/array from a
//     selector (it re-renders on every change); group with `useShallow`:
//     `import { useShallow } from "zustand/react/shallow"`
//     `const { a, b } = useAppStore(useShallow((s) => ({ a: s.a, b: s.b })));`
//
// Example (replace `AppState` with the app's real state + actions):
//   interface AppState {
//     items: Item[];
//     addItem: (text: string) => void;
//     toggleItem: (id: string) => void;
//   }
//   export const useAppStore = create<AppState>((set) => ({
//     items: [],
//     addItem: (text) =>
//       set((s) => ({ items: [...s.items, { id: crypto.randomUUID(), text, done: false }] })),
//     toggleItem: (id) =>
//       set((s) => ({ items: s.items.map((i) => (i.id === id ? { ...i, done: !i.done } : i)) })),
//   }));
//
// In components:
//   const items = useAppStore((s) => s.items);      // read (targeted re-render)
//   const addItem = useAppStore((s) => s.addItem);  // action (stable reference)

const ADDRESS_KEY = "mermaid-mindmap-studio.app-address";
// Settings remembered on this device, each stored as "on" or "off".
const AUTO_SAVE_KEY = "mermaid-mindmap-studio.auto-save";
const SHOW_LINKS_KEY = "mermaid-mindmap-studio.show-links";
const AUTO_PAN_KEY = "mermaid-mindmap-studio.auto-pan";
const INSPECTOR_PINNED_KEY = "mermaid-mindmap-studio.inspector-pinned";
const REDUCE_MOTION_KEY = "mermaid-mindmap-studio.reduce-motion";
const THEME_KEY = "mermaid-mindmap-studio.theme";

export type ThemePreference = "system" | "light" | "dark";

function readTheme(): ThemePreference {
  try {
    const raw = localStorage.getItem(THEME_KEY);
    return raw === "light" || raw === "dark" ? raw : "system";
  } catch {
    return "system";
  }
}

function storeTheme(theme: ThemePreference) {
  try {
    if (theme === "system") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Storage unavailable: the theme lasts for this session.
  }
}

function readSetting(key: string, fallback: boolean): boolean {
  try {
    const raw = localStorage.getItem(key);
    return raw === "on" ? true : raw === "off" ? false : fallback;
  } catch {
    return fallback;
  }
}

function storeSetting(key: string, on: boolean) {
  try {
    localStorage.setItem(key, on ? "on" : "off");
  } catch {
    // Storage unavailable: the setting lasts for this session.
  }
}

function readStoredAddress(): string | null {
  try {
    const raw = localStorage.getItem(ADDRESS_KEY);
    return raw ? normalizeAddress(raw) : null;
  } catch {
    return null;
  }
}

function storeAddress(address: string | null) {
  try {
    if (address) localStorage.setItem(ADDRESS_KEY, address);
    else localStorage.removeItem(ADDRESS_KEY);
  } catch {
    // Storage unavailable: the address lasts for this session only.
  }
}

interface AppState {
  /** Saves the open OneDrive file on its own after each pause in editing. Off until switched on. */
  autoSave: boolean;
  setAutoSave: (on: boolean) => void;
  /** Draws association links on the canvas. On until switched off. */
  showLinks: boolean;
  setShowLinks: (on: boolean) => void;
  /** Pans the map to a node picked by click or tap. On until switched off. */
  autoPan: boolean;
  setAutoPan: (on: boolean) => void;
  /** On a wide screen, keeps the details panel beside the map rather than opening it over the map on demand. On until switched off. */
  inspectorPinned: boolean;
  setInspectorPinned: (on: boolean) => void;
  /** Turns off the app's animations — eased pans, node moves, marching links — whatever the system setting. Off until switched on. */
  reduceMotion: boolean;
  setReduceMotion: (on: boolean) => void;
  /** Colour scheme: follow the system, or force light or dark. Follows the system until changed. */
  theme: ThemePreference;
  setTheme: (theme: ThemePreference) => void;
  /** The OneDrive file open in the editor — identity and path only — so other pages can link back to it. */
  currentFile: DriveFileRef | null;
  setCurrentFile: (file: DriveFileRef | null) => void;
  /** Files the editor opened or saved on this device, newest first (metadata only). */
  recentFiles: RecentFile[];
  forgetRecentFile: (id: string) => void;
  clearRecentFiles: () => void;
  /** Share-link address chosen by the user (remembered in this browser); null follows the default. */
  customAddress: string | null;
  setCustomAddress: (address: string | null) => void;
  /** Published app address reported by the host: undefined until looked up, null when it isn't available. */
  publishedAddress: string | null | undefined;
  setPublishedAddress: (address: string | null) => void;
}

export const useAppStore = create<AppState>((set) => ({
  autoSave: readSetting(AUTO_SAVE_KEY, false),
  setAutoSave: (autoSave) => {
    storeSetting(AUTO_SAVE_KEY, autoSave);
    set({ autoSave });
  },
  showLinks: readSetting(SHOW_LINKS_KEY, true),
  setShowLinks: (showLinks) => {
    storeSetting(SHOW_LINKS_KEY, showLinks);
    set({ showLinks });
  },
  autoPan: readSetting(AUTO_PAN_KEY, true),
  setAutoPan: (autoPan) => {
    storeSetting(AUTO_PAN_KEY, autoPan);
    set({ autoPan });
  },
  inspectorPinned: readSetting(INSPECTOR_PINNED_KEY, true),
  setInspectorPinned: (inspectorPinned) => {
    storeSetting(INSPECTOR_PINNED_KEY, inspectorPinned);
    set({ inspectorPinned });
  },
  reduceMotion: readSetting(REDUCE_MOTION_KEY, false),
  setReduceMotion: (reduceMotion) => {
    storeSetting(REDUCE_MOTION_KEY, reduceMotion);
    set({ reduceMotion });
  },
  theme: readTheme(),
  setTheme: (theme) => {
    storeTheme(theme);
    set({ theme });
  },
  currentFile: null,
  setCurrentFile: (currentFile) =>
    set((state) => {
      if (!currentFile) return { currentFile };
      const recentFiles = withRecent(state.recentFiles, currentFile);
      storeRecentFiles(recentFiles);
      return { currentFile, recentFiles };
    }),
  recentFiles: loadRecentFiles(),
  forgetRecentFile: (id) =>
    set((state) => {
      const recentFiles = state.recentFiles.filter((file) => file.id !== id);
      storeRecentFiles(recentFiles);
      return { recentFiles };
    }),
  clearRecentFiles: () => {
    storeRecentFiles([]);
    set({ recentFiles: [] });
  },
  customAddress: readStoredAddress(),
  setCustomAddress: (customAddress) => {
    storeAddress(customAddress);
    set({ customAddress });
  },
  publishedAddress: undefined,
  setPublishedAddress: (publishedAddress) => set({ publishedAddress }),
}));
