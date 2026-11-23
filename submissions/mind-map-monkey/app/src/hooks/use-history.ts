import { useCallback, useState } from "react";

/** Undo steps kept; the oldest fall off the end. */
const HISTORY_LIMIT = 100;
/** Commits that share a coalescing key and arrive this close together form one step — a burst of typing, a run of nudges. */
const COALESCE_WINDOW_MS = 1200;

interface Timeline<T> {
  past: T[];
  present: T;
  future: T[];
  /** The open coalescing group: the key of the last commit and when it landed. */
  group: { key: string; at: number } | null;
}

export interface CommitOptions {
  /** Successive commits with the same key merge into a single undo step while they keep coming. */
  coalesce?: string;
}

/**
 * A value with an undo history. `commit` records a change (an update that returns the current value is
 * not a step), `reset` starts a new history from a value that arrived from outside — an opened file, a
 * new map — and `endGroup` closes the current coalescing run early (when a text field loses focus).
 * Every update is a pure function of the previous timeline, so it is safe under Strict Mode's double invocation.
 */
export function useHistory<T>(initial: () => T) {
  const [timeline, setTimeline] = useState<Timeline<T>>(() => ({ past: [], present: initial(), future: [], group: null }));

  const commit = useCallback((update: T | ((current: T) => T), options?: CommitOptions) => {
    const now = Date.now();
    const key = options?.coalesce ?? null;
    setTimeline((current) => {
      const next = typeof update === "function" ? (update as (value: T) => T)(current.present) : update;
      if (Object.is(next, current.present)) return current;
      const merge = key !== null && current.group?.key === key && now - current.group.at < COALESCE_WINDOW_MS;
      return {
        past: merge ? current.past : [...current.past, current.present].slice(-HISTORY_LIMIT),
        present: next,
        future: [],
        group: key === null ? null : { key, at: now },
      };
    });
  }, []);

  const reset = useCallback((next: T) => {
    setTimeline({ past: [], present: next, future: [], group: null });
  }, []);

  /** Remove a provisional change from the timeline without discarding unrelated edits. */
  const discard = useCallback((update: (value: T) => T, equal: (a: T, b: T) => boolean) => {
    setTimeline((current) => {
      const entries = [...current.past, current.present, ...current.future];
      const presentIndex = current.past.length;
      const past: T[] = [];
      const future: T[] = [];
      let present = update(current.present);
      let previousChanged = false;
      for (let i = 0; i < presentIndex; i++) {
        const next = update(entries[i]);
        const changed = next !== entries[i];
        if (!past.length || !(previousChanged || changed) || !equal(past[past.length - 1], next)) {
          past.push(next);
          previousChanged = changed;
        }
      }
      let presentChanged = present !== current.present;
      if (past.length && (previousChanged || presentChanged) && equal(past[past.length - 1], present)) {
        present = past.pop()!;
        presentChanged = true;
      }
      let lastChanged = presentChanged;
      for (let i = presentIndex + 1; i < entries.length; i++) {
        const next = update(entries[i]);
        const changed = next !== entries[i];
        if (!(lastChanged || changed) || !equal(future.length ? future[future.length - 1] : present, next)) {
          future.push(next);
          lastChanged = changed;
        }
      }
      return { past, present, future, group: null };
    });
  }, []);

  const undo = useCallback(() => {
    setTimeline((current) => {
      const previous = current.past[current.past.length - 1];
      if (previous === undefined) return current;
      return { past: current.past.slice(0, -1), present: previous, future: [current.present, ...current.future], group: null };
    });
  }, []);

  const redo = useCallback(() => {
    setTimeline((current) => {
      const [next, ...rest] = current.future;
      if (next === undefined) return current;
      return { past: [...current.past, current.present], present: next, future: rest, group: null };
    });
  }, []);

  const endGroup = useCallback(() => {
    setTimeline((current) => (current.group ? { ...current, group: null } : current));
  }, []);

  return {
    present: timeline.present,
    canUndo: timeline.past.length > 0,
    canRedo: timeline.future.length > 0,
    commit,
    reset,
    discard,
    undo,
    redo,
    endGroup,
  };
}
