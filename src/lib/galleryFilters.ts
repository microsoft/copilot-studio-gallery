import { containsEveryComponent, type SortMode, type SortableSolution } from "./discovery";

export type Facet = "categories" | "tags" | "authors" | "contains";
export type SolutionType = "" | "agents" | "workflows";

export interface FilterState {
  query: string;
  type: SolutionType;
  categories: Set<string>;
  tags: Set<string>;
  authors: Set<string>;
  contains: Set<string>;
}

export interface SolutionRecord extends SortableSolution {
  text: string;
  types: string[];
  categories: string[];
  tags: string[];
  authors: string[];
  contains: string[];
}

export type FacetLabels = Record<Facet, ReadonlyMap<string, string>>;

export const FACETS: Facet[] = ["contains", "categories", "tags", "authors"];
export const TYPES: SolutionType[] = ["agents", "workflows"];
// Categories and contributors are alternatives; tags and component types narrow.
export const MATCH_ANY = new Set<Facet>(["categories", "authors"]);
const URL_PARAMS: Record<Facet, string> = { categories: "category", tags: "tag", authors: "author", contains: "contains" };
// Links shared before the type filter replaced the makeup dropdown.
const LEGACY_MAKEUP: Record<string, SolutionType> = { Agents: "agents", Workflows: "workflows", "Agents + workflows": "" };

export function emptyState(): FilterState {
  return { query: "", type: "", categories: new Set(), tags: new Set(), authors: new Set(), contains: new Set() };
}

export function cloneState(state: FilterState): FilterState {
  return {
    query: state.query,
    type: state.type,
    categories: new Set(state.categories),
    tags: new Set(state.tags),
    authors: new Set(state.authors),
    contains: new Set(state.contains),
  };
}

export function sameState(a: FilterState, b: FilterState): boolean {
  return a.query === b.query
    && a.type === b.type
    && FACETS.every((facet) => a[facet].size === b[facet].size && [...a[facet]].every((value) => b[facet].has(value)));
}

export function isFiltered(state: FilterState): boolean {
  return Boolean(state.query || state.type) || FACETS.some((facet) => state[facet].size > 0);
}

export function stateFromUrl(params: URLSearchParams, labels: FacetLabels): FilterState {
  const values = (name: string) => (params.get(name) ?? "").split(",").map((value) => value.trim()).filter(Boolean);
  const state = emptyState();
  state.query = (params.get("q") ?? "").trim();
  state.type = TYPES.find((type) => type === params.get("type")) ?? LEGACY_MAKEUP[params.get("makeup") ?? ""] ?? "";
  FACETS.forEach((facet) => {
    values(URL_PARAMS[facet])
      .map((value) => (facet === "authors" ? value.toLowerCase() : value))
      .filter((value) => labels[facet].has(value))
      .forEach((value) => state[facet].add(value));
  });
  return state;
}

export function filterParams(state: FilterState, sort: SortMode): URLSearchParams {
  const params = new URLSearchParams();
  if (state.query.trim()) params.set("q", state.query.trim());
  if (state.type) params.set("type", state.type);
  FACETS.forEach((facet) => {
    if (state[facet].size) params.set(URL_PARAMS[facet], [...state[facet]].join(","));
  });
  if (sort !== "featured") params.set("sort", sort);
  return params;
}

export function matches(record: SolutionRecord, state: FilterState, ignore?: Facet): boolean {
  if (state.query && !record.text.includes(state.query.toLowerCase())) return false;
  if (state.type && !record.types.includes(state.type)) return false;
  return FACETS.every((facet) => {
    const selected = state[facet];
    if (facet === ignore || selected.size === 0) return true;
    if (facet === "contains") return containsEveryComponent(record.contains, selected);
    return MATCH_ANY.has(facet)
      ? record[facet].some((value) => selected.has(value))
      : [...selected].every((value) => record[facet].includes(value));
  });
}
