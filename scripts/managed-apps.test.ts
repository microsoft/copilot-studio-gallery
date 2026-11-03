import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import AdmZip from "adm-zip";
import { collectContributors } from "../src/lib/catalog";
import { agentProfiles, inventoryBlocks, solutionInventory } from "../src/lib/inventory";
import { emptyState, filterParams, matches, stateFromUrl } from "../src/lib/galleryFilters";
import { gallerySchema, isManagedApp, managedAppSchema, submissionMakeup, submissionMetadataSchema } from "../src/lib/schema";
import { importSubmissions } from "./import-submissions";
import { prepareManagedApp } from "./prepare-managed-app";

const metadata = {
  submissionType: "managed-app", name: "Ideas", description: "A portable sample", tags: ["sharepoint"],
  author: "Example author", app: { prerequisites: ["An existing list"], connectors: [{
    connector: "shared_sharepointonline", mode: "table", dataSource: "teamideas",
    table: "Team Ideas", instructions: "Choose your own site.", columns: [],
  }] },
};
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "gallery-managed-"));
  const submission = join(root, "submissions/ideas");
  const app = join(submission, "app");
  await mkdir(app, { recursive: true });
  await writeFile(join(submission, "metadata.json"), JSON.stringify(metadata));
  await writeFile(join(submission, "README.md"), "# Ideas\n\nNative setup and prerequisites.\n");
  await writeFile(join(app, "package.json"), JSON.stringify({
    name: "ideas", version: "1.0.0", dependencies: { "@microsoft/managed-apps": "0.6.1" },
    scripts: { build: "touch DO_NOT_EXECUTE" },
  }));
  await writeFile(join(app, "package-lock.json"), JSON.stringify({ lockfileVersion: 3 }));
  await writeFile(join(app, "LICENSE"), "MIT test fixture");
  await writeFile(join(app, "index.html"), "<h1>Source only</h1>");
  return { root, submission, app };
}
async function imported(root: string) {
  await importSubmissions({ root });
  return managedAppSchema.parse(JSON.parse(await readFile(join(root, "src/content/solutions/ideas.json"), "utf8")));
}

test("managed app metadata is explicit, bounded, and rejects deployment-local setup fields", () => {
  assert.equal(submissionMetadataSchema.parse(metadata).submissionType, "managed-app");
  assert.equal(submissionMetadataSchema.parse({ name: "Legacy", description: "Legacy", tags: ["x"], author: "A" }).submissionType, "solution");
  assert.throws(() => submissionMetadataSchema.parse({ ...metadata, app: undefined }));
  assert.throws(() => submissionMetadataSchema.parse({ ...metadata, previewWorkflow: "not-an-app" }));
  assert.throws(() => submissionMetadataSchema.parse({ ...metadata, app: { ...metadata.app, environmentId: "private" } }));
  assert.throws(() => submissionMetadataSchema.parse({ ...metadata, screenshot: { path: "../private.png", alt: "No" } }));
  assert.throws(() => submissionMetadataSchema.parse({ ...metadata, app: { connectors: [{ ...metadata.app.connectors[0], mode: "action" }] } }));
});

test("imports an app without fake solution graphs and builds deterministic content-addressed artifacts without executing source", async () => {
  const { root, app } = await fixture();
  try {
    const record = await imported(root);
    assert.ok(isManagedApp(gallerySchema.parse(record)));
    assert.equal(submissionMakeup(record), "Apps");
    assert.equal("agentGraph" in record, false);
    assert.equal("uniqueName" in record, false);
    assert.equal("agents" in record, false);
    assert.equal(record.version, "1.0.0");
    const zip = await readFile(join(root, "public", record.bundle));
    const archive = new AdmZip(zip);
    assert.equal(archive.getEntry("metadata.json"), null);
    assert.equal(archive.getEntry("ms.config.json"), null);
    assert.ok(archive.getEntry("package.json"));
    assert.ok(!(await readdir(app)).includes("DO_NOT_EXECUTE"));
    assert.ok(record.bundle.endsWith(`-${createHash("sha256").update(zip).digest("hex")}.zip`));
    assert.equal(record.template, "github:microsoft/copilot-studio-gallery/submissions/ideas/app#main");
    assert.match(record.installScript, /^bundles\/ideas-[a-f0-9]{64}\.mjs$/);
    for (const field of ["installer", "windowsInstallScript", "installManifest"]) {
      assert.equal(field in record, false);
    }
    for (const file of ["ideas.sh", "ideas.ps1", "ideas-obsolete.mjs", "ideas-obsolete-manifest.json"]) {
      await writeFile(join(root, "public/bundles", file), "Obsolete installer artifact.");
    }
    await importSubmissions({ root });
    assert.deepEqual(await readFile(join(root, "public", record.bundle)), zip);
    assert.deepEqual((await readdir(join(root, "public/bundles"))).sort(),
      [record.bundle.split("/").at(-1), record.installScript.split("/").at(-1)].sort());
    await writeFile(join(app, "new.txt"), "new source");
    const changed = await imported(root);
    assert.notEqual(changed.bundle, record.bundle);
    assert.equal(changed.template, record.template);
    assert.ok(!(await readdir(join(root, "public/bundles"))).includes(record.bundle.split("/").at(-1)!));
    const inventory = solutionInventory(changed);
    assert.equal(inventory.apps, 1);
    assert.equal(inventory.agents, 0);
    assert.equal(inventory.tools, 0);
    assert.deepEqual(agentProfiles(changed), []);
    assert.equal(inventoryBlocks(inventory).app, 1);
    const contributors = collectContributors([{ id: "ideas", collection: "solutions", data: changed }]);
    assert.equal(contributors[0]!.apps, 1);
    assert.equal(contributors[0]!.agents, 0);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("rejects local identity, caches, symlinks, missing lockfiles, mixed payloads, and missing app guides", async () => {
  for (const bad of ["ms.config.json", ".app-meta.json", ".npmrc", ".env.local", ".ms/cache.json", "node_modules/private.js"]) {
    const { root, app } = await fixture();
    try {
      await mkdir(dirname(join(app, bad)), { recursive: true });
      await writeFile(join(app, bad), "{}");
      await assert.rejects(importSubmissions({ root }), /non-portable app source/);
    } finally { await rm(root, { recursive: true, force: true }); }
  }
  for (const kind of ["symlink", "lockfile", "mixed", "guide"]) {
    const { root, app, submission } = await fixture();
    try {
      if (kind === "symlink") await symlink(join(app, "LICENSE"), join(app, "linked"));
      if (kind === "lockfile") await rm(join(app, "package-lock.json"));
      if (kind === "mixed") await mkdir(join(submission, "solution"));
      if (kind === "guide") await rm(join(submission, "README.md"));
      await assert.rejects(importSubmissions({ root }));
    } finally { await rm(root, { recursive: true, force: true }); }
  }
  for (const bad of ["CON.txt", "stream:secret", "trailing."]) {
    const { root, app } = await fixture();
    try {
      await writeFile(join(app, bad), "not Windows-portable");
      await assert.rejects(importSubmissions({ root }), /unsafe source path/);
    } finally { await rm(root, { recursive: true, force: true }); }
  }
});

test("validates and publishes PNG screenshots, then cleans stale image artifacts", async () => {
  const { root, submission } = await fixture();
  try {
    await mkdir(join(submission, "screenshots"));
    const screenshot = { path: "screenshots/board.png", alt: "Illustrative board" };
    const file = join(submission, screenshot.path);
    await writeFile(join(submission, "metadata.json"), JSON.stringify({ ...metadata, screenshot }));
    await writeFile(join(submission, "README.md"), "# Ideas\n\n![Illustrative board](screenshots/board.png)\n\n![Alternate description](./screenshots/board.png \"Board preview\")\n");
    await writeFile(file, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZlWQAAAAASUVORK5CYII=", "base64"));
    const record = await imported(root);
    assert.ok(record.screenshot);
    const guide = await readFile(join(root, "src/content/guides/ideas.md"), "utf8");
    const imageUrl = `/copilot-studio-gallery/${record.screenshot.path}`;
    assert.ok(guide.includes(`![Illustrative board](${imageUrl})`));
    assert.ok(guide.includes(`![Alternate description](${imageUrl} "Board preview")`));
    const imageName = record.screenshot.path.split("/").at(-1)!;
    await writeFile(file, "<svg onload='alert(1)'/>");
    await assert.rejects(importSubmissions({ root }), /screenshot must be a PNG/);
    await writeFile(join(submission, "metadata.json"), JSON.stringify(metadata));
    await writeFile(join(submission, "README.md"), "# Ideas\n\nNative setup and prerequisites.\n");
    await imported(root);
    assert.ok(!(await readdir(join(root, "public/bundles"))).includes(imageName));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("publishes README-only PNGs without changing the app bundle, template, or primary screenshot", async () => {
  const { root, submission } = await fixture();
  try {
    const original = await imported(root);
    await mkdir(join(submission, "screenshots"));
    const image = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZlWQAAAAASUVORK5CYII=", "base64");
    await writeFile(join(submission, "screenshots/csv-import.png"), image);
    await writeFile(join(submission, "screenshots/unreferenced.png"), "Not an image; must not be published.");
    await writeFile(join(submission, "README.md"), '# Ideas\n\n![CSV import](screenshots/csv-import.png)\n\n![Another reference](./screenshots/csv-import.png "Column types")\n');
    const record = await imported(root);
    assert.equal(record.screenshot, undefined);
    assert.equal(record.bundle, original.bundle);
    assert.equal(record.template, original.template);
    const name = `ideas-${createHash("sha256").update(image).digest("hex")}.png`;
    const imageUrl = `/copilot-studio-gallery/bundles/${name}`;
    const guide = await readFile(join(root, "src/content/guides/ideas.md"), "utf8");
    assert.ok(guide.includes(`![CSV import](${imageUrl})`));
    assert.ok(guide.includes(`![Another reference](${imageUrl} "Column types")`));
    assert.deepEqual(await readFile(join(root, "public/bundles", name)), image);
    assert.equal((await readdir(join(root, "public/bundles"))).filter((file) => file.endsWith(".png")).length, 1);
    assert.ok(new AdmZip(await readFile(join(root, "public", record.bundle))).getEntries()
      .every((entry) => !entry.entryName.startsWith("screenshots/")));
    await writeFile(join(submission, "screenshots/csv-import.png"), "<svg/>");
    await assert.rejects(importSubmissions({ root }), /screenshot must be a PNG/);
    await writeFile(join(submission, "README.md"), "# Ideas\n\nNo image references.\n");
    await imported(root);
    assert.ok(!(await readdir(join(root, "public/bundles"))).includes(name));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("rejects README screenshot symlinks and more than five images", async () => {
  for (const kind of ["file-symlink", "directory-symlink", "limit"]) {
    const { root, submission } = await fixture();
    try {
      await writeFile(join(submission, "README.md"), "# Ideas\n\n![CSV import](screenshots/csv-import.png)\n");
      if (kind === "limit") {
        await writeFile(join(submission, "README.md"), "# Ideas\n\n" + Array.from({ length: 6 }, (_, index) => `![Image ${index}](screenshots/image-${index}.png)`).join("\n\n"));
      } else {
        const privateDirectory = join(root, "private-images");
        await mkdir(privateDirectory);
        await writeFile(join(privateDirectory, "csv-import.png"), "Not for publication.");
        if (kind === "file-symlink") {
          await mkdir(join(submission, "screenshots"));
          await symlink(join(privateDirectory, "csv-import.png"), join(submission, "screenshots/csv-import.png"));
        } else {
          await symlink(privateDirectory, join(submission, "screenshots"));
        }
      }
      await assert.rejects(importSubmissions({ root }), kind === "limit" ? /at most five PNG screenshots/ : /symbolic links are not allowed/);
    } finally { await rm(root, { recursive: true, force: true }); }
  }
});

test("publishes declared supporting data separately without changing app installation artifacts", async () => {
  const { root, submission } = await fixture();
  try {
    const original = await imported(root);
    const declaration = { path: "supporting/ideas.csv", label: "Synthetic ideas" };
    const csv = "Title,Status\nA synthetic idea,New\n";
    await mkdir(join(submission, "supporting"));
    await writeFile(join(submission, declaration.path), csv);
    await writeFile(join(submission, "supporting/unlisted.txt"), "Not declared for publication.");
    await writeFile(join(submission, "metadata.json"), JSON.stringify({ ...metadata, supportingFiles: [declaration] }));
    await writeFile(join(submission, "README.md"), "# Ideas\n\n[Sample data](supporting/ideas.csv)\n");
    const record = await imported(root);
    assert.equal(record.supportingFiles.length, 1);
    assert.equal(record.bundle, original.bundle);
    assert.equal(record.template, original.template);
    const asset = record.supportingFiles[0];
    assert.equal(await readFile(join(root, "public", asset.path), "utf8"), csv);
    assert.ok((await readFile(join(root, "src/content/guides/ideas.md"), "utf8")).includes(`/copilot-studio-gallery/${asset.path}`));
    const zip = new AdmZip(await readFile(join(root, "public", record.bundle)));
    assert.ok(zip.getEntries().every((entry) => !entry.entryName.startsWith("supporting/") && !entry.entryName.endsWith(".csv")));
    assert.ok(!(await readdir(join(root, "public/bundles"))).some((name) => name.includes("unlisted")));
    await writeFile(join(submission, declaration.path), `${csv}Another synthetic idea,Planned\n`);
    const updated = await imported(root);
    assert.notEqual(updated.supportingFiles[0].path, asset.path);
    assert.ok(!(await readdir(join(root, "public/bundles"))).includes(asset.path.split("/").at(-1)!));
    await writeFile(join(submission, "metadata.json"), JSON.stringify(metadata));
    const removed = await imported(root);
    assert.deepEqual(removed.supportingFiles, []);
    assert.ok(!(await readdir(join(root, "public/bundles"))).some((name) => name.endsWith(".csv")));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("preparation is non-destructive, reports bindings, supports dry-run, and refuses overlap/overwrite", async () => {
  const { root, app } = await fixture();
  try {
    await writeFile(join(app, "ms.config.json"), JSON.stringify({ connectionReferences: { original: { id: "fixture" } } }));
    const original = await readFile(join(app, "ms.config.json"));
    const args = { root, source: app, slug: "prepared" };
    const dryRun = await prepareManagedApp({ ...args, dryRun: true });
    assert.ok(dryRun.excluded.includes("ms.config.json"));
    assert.ok(dryRun.bindingsRequireDocumentation);
    assert.ok(!(await readdir(join(root, "submissions"))).includes("prepared"));
    const prepared = await prepareManagedApp(args);
    assert.deepEqual(await readFile(join(app, "ms.config.json")), original);
    assert.ok(!(await readdir(join(prepared.destination, "app"))).includes("ms.config.json"));
    const guide = await readFile(join(prepared.destination, "README.md"), "utf8");
    assert.match(guide, /SETUP INCOMPLETE/);
    assert.match(guide, /Screenshots are strongly recommended/);
    assert.match(guide, /## Data requirements/);
    assert.match(guide, /## Using the app/);
    assert.doesNotMatch(guide, /## Setup|Use native CLI prompts|ms app |## Install/);
    await assert.rejects(importSubmissions({ root }), /unresolved connection setup/);
    await assert.rejects(prepareManagedApp(args), /already exists/);
    await assert.rejects(prepareManagedApp({ source: root, root, slug: "nested" }), /overlap/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("apps filter round-trips and does not masquerade as agents or workflows", () => {
  const labels = { categories: new Map(), tags: new Map(), authors: new Map(), contains: new Map() };
  const state = emptyState(); state.type = "apps";
  assert.equal(stateFromUrl(filterParams(state, "featured"), labels).type, "apps");
  const record = { name: "Ideas", text: "ideas sharepoint", types: ["apps"], categories: [], tags: [], authors: [], contains: [] };
  assert.ok(matches(record, state));
  state.type = "agents";
  assert.equal(matches(record, state), false);
});
