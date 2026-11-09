import assert from "node:assert/strict";
import { test } from "node:test";
import { forgetAgentSelection, readAgentSelection, rememberAgentSelection, sameAgent, validateConfig } from "./settings";

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
  assert.throws(() => validateConfig({ ...config, environmentId: "https://example.com" }), /not a display name or full URL/);
  assert.throws(() => validateConfig({ ...config, schemaName: "https://example.com" }), /not a URL/);
});

function storage() {
  const values = new Map<string, string>();
  const access = () => ({
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  });
  return { values, access };
}

test("remembers only the versioned agent selection, never extra data", () => {
  const store = storage();
  const input = { ...config, token: "not-an-auth-token", chats: ["not persisted"] };
  assert.equal(rememberAgentSelection(store.access, input), "");
  assert.deepEqual(JSON.parse(store.values.get("oddly.agent.v1")!), { version: 1, ...config });
  assert.deepEqual(readAgentSelection(store.access), { config, notice: "" });
  assert.equal(store.values.size, 1);
});

test("reports corrupt, unsupported, or invalid remembered selections", () => {
  const store = storage();
  assert.deepEqual(readAgentSelection(store.access), { config: null, notice: "" });
  for (const raw of [
    "not-json", "null", "[]", "123", "{}",
    JSON.stringify({ version: 2, ...config }),
    JSON.stringify({ version: 1, ...config, environmentId: "not-an-id" }),
    JSON.stringify({ version: 1, ...config, schemaName: 42 }),
  ]) {
    store.values.set("oddly.agent.v1", raw);
    const restored = readAgentSelection(store.access);
    assert.equal(restored.config, null);
    assert.match(restored.notice, /could not be read/);
  }
});

test("storage failures produce visible notices instead of breaking agent selection", () => {
  const unavailable = () => { throw new Error("Storage blocked"); };
  assert.match(readAgentSelection(unavailable).notice, /could not be read/);
  assert.match(rememberAgentSelection(unavailable, config), /for this visit only/);
  assert.match(forgetAgentSelection(unavailable), /may be selected again/);
});

test("replaces a selection and forgets it without touching other storage", () => {
  const store = storage();
  store.values.set("unrelated", "keep");
  rememberAgentSelection(store.access, config);
  const replacement = { ...config, schemaName: "contoso_anotherAgent" };
  rememberAgentSelection(store.access, replacement);
  assert.deepEqual(readAgentSelection(store.access).config, replacement);
  assert.equal(forgetAgentSelection(store.access), "");
  assert.deepEqual(readAgentSelection(store.access), { config: null, notice: "" });
  assert.equal(store.values.get("unrelated"), "keep");
  assert.equal(store.values.size, 1);
});

test("invalid selections cannot overwrite a valid remembered agent", () => {
  const store = storage();
  rememberAgentSelection(store.access, config);
  assert.throws(() => rememberAgentSelection(store.access, { ...config, schemaName: "invalid agent name" }));
  assert.deepEqual(readAgentSelection(store.access).config, config);
});

test("agent identity preserves schema-name case and distinguishes environments", () => {
  assert.equal(sameAgent(config, { ...config, environmentId: config.environmentId.toUpperCase() }), true);
  assert.equal(sameAgent(config, { ...config, schemaName: config.schemaName.toUpperCase() }), false);
  assert.equal(sameAgent(config, { ...config, environmentId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" }), false);
});
