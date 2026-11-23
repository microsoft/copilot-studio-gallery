import { useMemo, useSyncExternalStore } from "react";
import { layoutMindMap, layoutSignature, shareLayout, type MindMap, type MindMapLayout } from "@/lib/mindmap-data";
import { subscribeTextMeasure, textMeasureGeneration } from "@/lib/text-measure";

/**
 * The last few layouts by what they were computed from. A map whose geometry is unchanged — a description
 * typed, a tag added, an undo back to a known state — gets the very same layout object back, so nothing
 * downstream (the canvas, the view, the action bar) sees a change. A new layout shares every node and
 * connector that did not move with the one before it.
 */
const recent: Array<{ key: string; layout: MindMapLayout }> = [];
const RECENT_LIMIT = 4;

function cachedLayout(map: MindMap, generation: number): MindMapLayout {
  const key = `${generation}\u001D${layoutSignature(map)}`;
  const hit = recent.findIndex((entry) => entry.key === key);
  if (hit >= 0) {
    const [entry] = recent.splice(hit, 1);
    recent.push(entry);
    return entry.layout;
  }
  const previous = recent[recent.length - 1]?.layout;
  const fresh = layoutMindMap(map);
  const layout = previous ? shareLayout(previous, fresh) : fresh;
  recent.push({ key, layout });
  if (recent.length > RECENT_LIMIT) recent.shift();
  return layout;
}

/**
 * The map's layout, recomputed only when something that places a node changes — or when labels can be
 * measured differently than before (the measuring context arrived, the web font finished loading).
 */
export function useMindMapLayout(map: MindMap): MindMapLayout;
export function useMindMapLayout(map: MindMap | null): MindMapLayout | null;
export function useMindMapLayout(map: MindMap | null): MindMapLayout | null {
  const generation = useSyncExternalStore(subscribeTextMeasure, textMeasureGeneration, textMeasureGeneration);
  return useMemo(() => (map ? cachedLayout(map, generation) : null), [map, generation]);
}
