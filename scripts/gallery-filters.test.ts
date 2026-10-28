import assert from "node:assert/strict";
import test from "node:test";
import { collectCategories } from "../src/lib/catalog";
import { parseSortMode } from "../src/lib/discovery";
import {
  cloneState, emptyState, filterParams, isFiltered, matches, sameState, stateFromUrl,
  GALLERY_CATEGORIES, galleryCategory,
  type FacetLabels, type SolutionRecord,
} from "../src/lib/galleryFilters";

const labels: FacetLabels = {
  categories: new Map([["Operations", "Operations"], ["Sales", "Sales"]]),
  tags: new Map([["email", "email"], ["automation", "automation"], ["community-only", "community-only"]]),
  authors: new Map([["microsoft", "Microsoft"], ["community", "Community contributor"]]),
  contains: new Map([["mcp", "MCP servers"], ["tool", "Tools"], ["skill", "Skills"]]),
};

const microsoft: SolutionRecord = {
  name: "Email assistant",
  text: "email assistant for operations",
  types: ["agents", "workflows"],
  categories: ["Operations"],
  tags: ["email", "automation"],
  authors: ["microsoft"],
  contains: ["mcp", "skill"],
};
const community: SolutionRecord = {
  ...microsoft,
  authors: ["community"],
  tags: ["email", "automation", "community-only"],
};

test("offers ten short gallery categories and combines productivity functions", () => {
  assert.deepEqual(GALLERY_CATEGORIES, [
    "Sales", "Service", "Productivity", "Build", "Govern",
    "HR", "Finance", "Legal", "IT", "Operations",
  ]);
  assert.equal(galleryCategory("Project & communications management"), "Productivity");
  assert.equal(galleryCategory("Productivity & knowledge"), "Productivity");
  assert.equal(galleryCategory("Customer service"), "Service");
  assert.equal(galleryCategory("Governance"), "Govern");
  assert.equal(galleryCategory("Other"), undefined);
  assert.equal(galleryCategory(undefined), undefined);
  assert.equal(matches({ ...microsoft, categories: [] }, emptyState()), true);
});

test("normalizes original category links into the short gallery filters", () => {
  const shortLabels: FacetLabels = {
    ...labels,
    categories: new Map(GALLERY_CATEGORIES.map((category) => [category, category])),
  };
  const state = stateFromUrl(new URLSearchParams({
    category: "Project & communications management,Productivity & knowledge,Agent Building,Governance,Other",
  }), shortLabels);
  assert.deepEqual([...state.categories], ["Productivity", "Build", "Govern"]);
  assert.equal(matches({ ...microsoft, categories: ["Productivity"] }, state), true);
  assert.ok(sameState(stateFromUrl(filterParams(state, "featured"), shortLabels), state));
});

test("round-trips search, type, every facet, and sorting through gallery URLs", () => {
  const params = new URLSearchParams({
    q: "  Email & approvals + follow-ups  ",
    type: "workflows",
    category: "Operations,Sales",
    tag: "email,automation",
    author: "MICROSOFT,community",
    contains: "mcp,skill",
    sort: "name",
  });
  const state = stateFromUrl(params, labels);
  assert.equal(state.query, "Email & approvals + follow-ups");
  assert.equal(state.type, "workflows");
  assert.deepEqual([...state.categories], ["Operations", "Sales"]);
  assert.deepEqual([...state.tags], ["email", "automation"]);
  assert.deepEqual([...state.authors], ["microsoft", "community"]);
  assert.deepEqual([...state.contains], ["mcp", "skill"]);

  const carried = filterParams(state, parseSortMode(params.get("sort")));
  assert.equal(carried.get("sort"), "name");
  assert.equal(carried.get("q"), state.query);
  assert.ok(sameState(stateFromUrl(new URLSearchParams(carried.toString()), labels), state));
});

test("retains valid selections with no matches in the Microsoft gallery", () => {
  const state = stateFromUrl(new URLSearchParams("author=community&tag=community-only"), labels);
  const carried = stateFromUrl(filterParams(state, "newest"), labels);
  assert.equal(matches(microsoft, carried), false);
  assert.equal(matches(community, carried), true);
  assert.deepEqual([...carried.authors], ["community"]);
  assert.deepEqual([...carried.tags], ["community-only"]);
  assert.ok(sameState(stateFromUrl(filterParams(carried, "newest"), labels), state));
});

for (const category of ["Agent Building", "Governance"] as const) {
  test(`discovers ${category} before submissions exist and round-trips its filter`, () => {
    const categories = collectCategories([]);
    assert.equal(new Map(categories).get(category), 0);
    const catalogLabels: FacetLabels = {
      ...labels,
      categories: new Map(categories.map(([category]) => [category, category])),
    };
    const state = stateFromUrl(new URLSearchParams({ category }), catalogLabels);
    assert.deepEqual([...state.categories], [category]);
    assert.equal(matches({ ...microsoft, categories: [category] }, state), true);
    assert.equal(matches(microsoft, state), false);
    assert.equal(filterParams(state, "newest").get("category"), category);
    assert.ok(sameState(stateFromUrl(new URLSearchParams(filterParams(state, "newest").toString()), catalogLabels), state));
  });
}

test("ignores invalid values without dropping valid selections", () => {
  const state = stateFromUrl(new URLSearchParams({
    type: "unknown",
    category: "Operations,missing",
    tag: "email,email,missing",
    author: "MICROSOFT,missing",
    contains: "mcp,missing",
  }), labels);
  assert.equal(state.type, "");
  assert.deepEqual([...state.categories], ["Operations"]);
  assert.deepEqual([...state.tags], ["email"]);
  assert.deepEqual([...state.authors], ["microsoft"]);
  assert.deepEqual([...state.contains], ["mcp"]);
});

test("normalizes legacy type links while preserving their remaining filters", () => {
  const legacy = stateFromUrl(new URLSearchParams("makeup=Workflows&contains=skill"), labels);
  assert.equal(legacy.type, "workflows");
  assert.equal(filterParams(legacy, "featured").toString(), "type=workflows&contains=skill");
  const current = stateFromUrl(new URLSearchParams("type=agents&makeup=Workflows"), labels);
  assert.equal(current.type, "agents");
});

test("matches query and type, OR categories and contributors, and AND tags and components", () => {
  const state = stateFromUrl(new URLSearchParams({
    q: "EMAIL",
    type: "workflows",
    category: "Operations,Sales",
    author: "microsoft,community",
    tag: "email,automation",
    contains: "mcp,skill",
  }), labels);
  assert.equal(matches(microsoft, state), true);
  assert.equal(matches(community, state), true);
  assert.equal(matches({ ...microsoft, types: ["agents"] }, state), false);
  assert.equal(matches({ ...microsoft, categories: [] }, state), false);
  assert.equal(matches({ ...microsoft, authors: [] }, state), false);
  assert.equal(matches({ ...microsoft, tags: ["email"] }, state), false);
  assert.equal(matches({ ...microsoft, contains: ["mcp"] }, state), false);
  assert.equal(matches({ ...microsoft, text: "unrelated assistant" }, state), false);
});

test("alternative facet counts ignore only the facet being counted", () => {
  const state = stateFromUrl(new URLSearchParams("category=Sales&contains=skill"), labels);
  assert.equal(matches(microsoft, state), false);
  assert.equal(matches(microsoft, state, "categories"), true);
  assert.equal(matches({ ...microsoft, contains: [] }, state, "categories"), false);
});

test("draft changes do not mutate applied selections", () => {
  const applied = stateFromUrl(new URLSearchParams("type=agents&contains=mcp"), labels);
  const draft = cloneState(applied);
  assert.ok(sameState(applied, draft));
  draft.contains.add("skill");
  draft.type = "workflows";
  assert.equal(sameState(applied, draft), false);
  assert.equal(applied.type, "agents");
  assert.deepEqual([...applied.contains], ["mcp"]);
});

test("cleared filters omit defaults and keep a chosen sort order", () => {
  const state = emptyState();
  assert.equal(isFiltered(state), false);
  assert.equal(filterParams(state, "featured").toString(), "");
  assert.equal(filterParams(state, "newest").toString(), "sort=newest");
  assert.equal(filterParams(state, "name").toString(), "sort=name");
  state.contains.add("skill");
  assert.equal(isFiltered(state), true);
});
