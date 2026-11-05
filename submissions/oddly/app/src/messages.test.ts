import assert from "node:assert/strict";
import { test } from "node:test";
import { safeUrl, transcript } from "./messages";
import { demoAnswer, recipes } from "./demo";

test("only allows HTTP(S) links", () => {
  assert.equal(safeUrl("https://example.com/path"), "https://example.com/path");
  for (const url of ["javascript:alert(1)", "data:text/html,test", "file:///tmp/test", "//example.com", "/local"]) {
    assert.equal(safeUrl(url), undefined);
  }
});

test("exports user-visible text under the current identity", () => {
  assert.equal(transcript([
    { id: "u", role: "user", text: "Hello" },
    { id: "a", role: "assistant", text: "Hi" },
  ]), "## You\n\nHello\n\n---\n\n## Oddly\n\nHi");
});

test("sample starters remain explicitly scripted", () => {
  for (const recipe of recipes) {
    assert.match(demoAnswer(recipe.prompt), /scripted/i);
    assert.doesNotMatch(demoAnswer(recipe.prompt), /Cookie Club|Pip|crumb|cookie/i);
  }
  assert.match(demoAnswer("An arbitrary request"), /can't actually reason/);
});
