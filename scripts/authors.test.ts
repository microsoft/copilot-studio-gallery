import assert from "node:assert/strict";
import test from "node:test";
import { collectContributors, type SolutionEntry } from "../src/lib/catalog";
import { joinAuthorNames, submissionMetadataSchema } from "../src/lib/schema";

const base = { name: "Sample", description: "A sample solution.", tags: ["sample"] };

test("a single author normalizes to a one-entry authors list", () => {
  const metadata = submissionMetadataSchema.parse({ ...base, author: "Ada Lovelace", authorGithub: "ada", authorUrl: "https://example.com/ada" });
  assert.equal(metadata.author, "Ada Lovelace");
  assert.deepEqual(metadata.authors, [{ name: "Ada Lovelace", github: "ada", url: "https://example.com/ada" }]);
  assert.equal("authorGithub" in metadata, false);
});

test("authors keeps every person and derives the display line", () => {
  const metadata = submissionMetadataSchema.parse({
    ...base,
    authors: [{ name: "Ada", github: "ada" }, { name: "Grace" }, { name: "Linus", github: "linus" }],
  });
  assert.equal(metadata.author, "Ada, Grace, and Linus");
  assert.equal(metadata.authors.length, 3);
});

test("rejects metadata that mixes author and authors, or has neither", () => {
  assert.throws(() => submissionMetadataSchema.parse({ ...base, author: "Ada", authors: [{ name: "Grace" }] }));
  assert.throws(() => submissionMetadataSchema.parse({ ...base, authorGithub: "ada", authors: [{ name: "Grace" }] }));
  assert.throws(() => submissionMetadataSchema.parse(base));
  assert.throws(() => submissionMetadataSchema.parse({ ...base, authors: [] }));
  assert.throws(() => submissionMetadataSchema.parse({ ...base, authors: [{ name: "Ada", github: "not a handle" }] }));
});

test("joins names the way people read them", () => {
  assert.equal(joinAuthorNames([{ name: "Ada" }]), "Ada");
  assert.equal(joinAuthorNames([{ name: "Ada" }, { name: "Grace" }]), "Ada and Grace");
  assert.equal(joinAuthorNames([{ name: "Ada" }, { name: "Grace" }, { name: "Linus" }]), "Ada, Grace, and Linus");
});

test("each co-author gets one contributor entry that lists all their solutions", () => {
  const solution = (id: string, authors: Array<{ name: string; github?: string }>, featured = false) =>
    ({ id, data: { name: id, authors, featured, agentCount: 1, workflowCount: 1, tags: ["x"] } }) as unknown as SolutionEntry;
  const contributors = collectContributors([
    solution("solo", [{ name: "Ada Lovelace", github: "ada" }]),
    solution("team", [{ name: "Ada Lovelace", github: "ADA" }, { name: "Grace" }, { name: "Linus", github: "linus" }], true),
  ]);
  const byKey = new Map(contributors.map((contributor) => [contributor.key, contributor]));
  assert.deepEqual([...byKey.keys()].sort(), ["ada", "grace", "linus"]);
  assert.equal(byKey.get("ada")!.count, 2);
  assert.equal(byKey.get("ada")!.featured, 1);
  assert.deepEqual(byKey.get("ada")!.solutions.map((entry) => entry.id), ["solo", "team"]);
  assert.equal(byKey.get("grace")!.count, 1);
});
