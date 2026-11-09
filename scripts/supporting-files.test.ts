import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { submissionMetadataSchema } from "../src/lib/schema";
import { buildSupportingFiles, rewriteSupportingLinks } from "./supporting-files";

const metadata = { name: "Sample", description: "A sample", tags: ["sample"], author: "Example" };
const declaration = (name = "ideas.csv") => ({ path: `supporting/${name}`, label: "Synthetic ideas" });
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "gallery-supporting-"));
  await mkdir(join(root, "supporting"));
  return root;
}

test("supporting metadata permits only explicit, bounded, unique CSV/JSON/TXT paths", () => {
  for (const name of ["ideas.csv", "reference.json", "notes.txt"]) {
    assert.equal(submissionMetadataSchema.parse({ ...metadata, supportingFiles: [declaration(name)] }).supportingFiles.length, 1);
  }
  for (const path of ["../private.csv", "supporting/../private.csv", "supporting/nested/file.csv", "supporting/CON.txt", "supporting/con.csv", "supporting/file.ps1", "supporting/file.sh", "supporting/file.html", "supporting/file.svg", "supporting/file.zip", "supporting/file.exe.csv", "supporting/file.CSV", "https://example.com/data.csv"]) {
    assert.throws(() => submissionMetadataSchema.parse({ ...metadata, supportingFiles: [{ ...declaration(), path }] }), path);
  }
  assert.throws(() => submissionMetadataSchema.parse({ ...metadata, supportingFiles: [declaration(), declaration()] }), /unique/);
  assert.throws(() => submissionMetadataSchema.parse({ ...metadata, supportingFiles: Array.from({ length: 6 }, (_, index) => declaration(`data-${index}.txt`)) }));
});

test("publishes exact deterministic text bytes and rewrites only declared inline download links", async () => {
  const root = await fixture();
  try {
    const csv = '\uFEFFTitle,Details,Status\r\nIdea,"A comma, a ""quote"" and\nmore detail",New\r\n';
    await writeFile(join(root, declaration().path), csv);
    await writeFile(join(root, "supporting/reference.json"), '{"count":1}\n');
    await writeFile(join(root, "supporting/notes.txt"), "Plain text.\n");
    const declarations = [declaration(), declaration("reference.json"), declaration("notes.txt")];
    const built = await buildSupportingFiles(root, "sample", declarations);
    assert.deepEqual(await buildSupportingFiles(root, "sample", declarations), built);
    assert.equal(built.assets[0].content.toString(), csv);
    assert.equal(built.files[0].filename, "ideas.csv");
    assert.equal(built.files[0].size, Buffer.byteLength(csv));
    const original = '[Data](supporting/ideas.csv)\n[More](./supporting/ideas.csv "Ideas")\n[Undeclared](supporting/private.csv)\n![Not an image](supporting/ideas.csv)';
    const rewritten = rewriteSupportingLinks(original, built.links);
    assert.ok(rewritten.includes(`[Data](${built.links.get(declaration().path)})`));
    assert.ok(rewritten.includes(`[More](${built.links.get(declaration().path)} "Ideas")`));
    assert.ok(rewritten.includes("[Undeclared](supporting/private.csv)"));
    assert.ok(rewritten.includes("![Not an image](supporting/ideas.csv)"));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("accepts a header-only CSV as an empty data template", async () => {
  const root = await fixture();
  try {
    const csv = "Title,Details,Status,Priority\n";
    await writeFile(join(root, declaration().path), csv);
    const built = await buildSupportingFiles(root, "sample", [declaration()]);
    assert.equal(built.assets[0].content.toString(), csv);
    assert.equal(built.files[0].size, Buffer.byteLength(csv));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("rejects malformed, binary, invalid UTF-8, and spreadsheet-formula data", async () => {
  const root = await fixture();
  try {
    for (const [filename, content, message] of [
      ["ideas.csv", "Title,Details\nOnly one cell\n", /column count/],
      ["ideas.csv", 'Title\n"Unclosed\n', /unterminated/],
      ["ideas.csv", 'Title\n"Closed"suffix\n', /malformed/],
      ["ideas.csv", "Title,title\nOne,Two\n", /unique column headers/],
      ["ideas.csv", "Title,\nOne,Two\n", /nonempty/],
      ["ideas.csv", "sep=;\nData;=1\n", /delimiter directives/],
      ["reference.json", "{bad json}", /JSON|property name/],
      ["notes.txt", "  \n", /nonempty/],
      ["notes.txt", Buffer.from([0xff, 0xfe, 0x61]), /UTF-8/],
      ["notes.txt", Buffer.from([0x61, 0, 0x62]), /binary\/control/],
    ] as const) {
      await writeFile(join(root, "supporting", filename), content);
      await assert.rejects(buildSupportingFiles(root, "sample", [declaration(filename)]), message);
    }
    for (const value of ['=HYPERLINK("https://example.com")', "+1", "-1", "@SUM(1)", "  =1", "\t=1", "\n=1", "\uFF1D1"]) {
      const csv = `Title\n"${value.replaceAll('"', '""')}"\n`;
      await writeFile(join(root, declaration().path), csv);
      await assert.rejects(buildSupportingFiles(root, "sample", [declaration()]), /formula characters/);
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("enforces exact byte limits and rejects symbolic links and empty files", async () => {
  const root = await fixture();
  try {
    const file = join(root, "supporting/data-0.txt");
    const contents = "a".repeat(512 * 1024);
    const items = Array.from({ length: 5 }, (_, index) => declaration(`data-${index}.txt`));
    for (const item of items) await writeFile(join(root, item.path), contents);
    assert.equal((await buildSupportingFiles(root, "sample", items.slice(0, 4))).files.length, 4);
    await assert.rejects(buildSupportingFiles(root, "sample", items), /total at most 2 MiB/);
    await writeFile(file, `${contents}a`);
    await assert.rejects(buildSupportingFiles(root, "sample", items.slice(0, 1)), /512 KiB/);
    await writeFile(file, "");
    await assert.rejects(buildSupportingFiles(root, "sample", items.slice(0, 1)), /nonempty/);
    await symlink(file, join(root, "supporting/linked.txt"));
    await assert.rejects(buildSupportingFiles(root, "sample", [declaration("linked.txt")]), /regular file/);
    await assert.rejects(buildSupportingFiles(root, "sample", [declaration("missing.csv")]), /ENOENT/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
