import assert from "node:assert/strict";
import { test } from "node:test";
import { validateConfig } from "./settings";

const config = {
  environmentId: "Default-11111111-2222-3333-4444-555555555555",
  schemaName: "contoso_friendlyAgent",
};

test("accepts portable environment IDs and agent schema names", () => {
  assert.doesNotThrow(() => validateConfig(config));
  assert.doesNotThrow(() => validateConfig({ ...config, environmentId: "11111111-2222-3333-4444-555555555555" }));
});

test("rejects environment IDs and agent GUIDs in the schema field", () => {
  assert.throws(() => validateConfig({ ...config, schemaName: config.environmentId }), /not the environment ID/);
  assert.throws(() => validateConfig({ ...config, schemaName: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" }), /not the environment ID/);
});

test("rejects URLs and invalid environment IDs", () => {
  assert.throws(() => validateConfig({ ...config, environmentId: "My environment" }), /environment ID/);
  assert.throws(() => validateConfig({ ...config, environmentId: "https://example.com" }), /not a full URL/);
  assert.throws(() => validateConfig({ ...config, schemaName: "https://example.com" }), /not a URL/);
});
