import { useCallback, useLayoutEffect, useRef } from "react";

/**
 * A callback whose identity never changes but which always runs the latest `fn`. For handlers handed to many
 * memoised children (every node on the canvas), so a parent re-render does not re-render them all.
 */
export function useStableCallback<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
  const latest = useRef(fn);
  useLayoutEffect(() => {
    latest.current = fn;
  });
  return useCallback((...args: A) => latest.current(...args), []);
}
