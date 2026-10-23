import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parse } from "yaml";

const workflow = parse(readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8"));
const scopeGuard = workflow.jobs["guard-scope"].steps[0].run;
assert.equal(typeof scopeGuard, "string");

const cases = [
  { name: "allows category documentation with site changes", files: ["submissions/README.md", "CONTRIBUTING.md", "src/lib/schema.ts"], status: 0 },
  { name: "rejects submission metadata with site changes", files: ["submissions/sample/metadata.json", "src/lib/schema.ts"], status: 1 },
  { name: "rejects sample README changes with site changes", files: ["submissions/sample/README.md", "src/lib/schema.ts"], status: 1 },
  { name: "rejects submission payload with site changes", files: ["submissions/sample/solution/solution.xml", "src/lib/schema.ts"], status: 1 },
  { name: "rejects template changes with site changes", files: ["submissions/_template/metadata.json", "src/lib/schema.ts"], status: 1 },
  { name: "does not exempt other submission-root files", files: ["submissions/other.json", "src/lib/schema.ts"], status: 1 },
  { name: "allows submission and generated content changes", files: ["submissions/sample/metadata.json", "src/content/solutions/sample.json", "src/content/guides/sample.md", "public/bundles/sample.zip"], status: 0 },
  { name: "preserves the maintainer scope override", files: ["submissions/sample/metadata.json", "src/lib/schema.ts"], labels: ["allow-mixed-changes"], status: 0 },
];

for (const { name, files, labels = [], status } of cases) {
  test(`PR scope guard ${name}`, () => {
    const result = spawnSync("bash", ["-c", `gh() { printf '%s\\n' "$CHANGED_FILES"; }\n${scopeGuard}`], {
      env: { ...process.env, CHANGED_FILES: files.join("\n"), LABELS: JSON.stringify(labels), PR: "1", REPO: "test/gallery" },
      encoding: "utf8",
      timeout: 10_000,
    });
    assert.ifError(result.error);
    assert.equal(result.status, status, result.stdout + result.stderr);
    if (status === 1) assert.match(result.stdout, /mixes submission content with site or repository changes/);
  });
}
