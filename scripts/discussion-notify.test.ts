import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { parse } from "yaml";
import config from "../src/lib/discussion-config.json";

const workflow = parse(readFileSync(new URL("../.github/workflows/discussion-notify.yml", import.meta.url), "utf8"));
const script = workflow.jobs.notify.steps[1].with.script;
assert.equal(typeof script, "string");
const execute = new Function("github", "context", "core", "require", `return (async () => { ${script} })();`);
const marker = "<!-- gallery-submitter-notified:hooks-lab -->";

interface Comment {
  body: string;
  author: { login: string } | null;
}

interface Options {
  slug?: string;
  category?: string;
  commenter?: string;
  bot?: boolean;
  missing?: boolean;
  authors?: Array<{ github?: string }>;
  tags?: string[];
  pages?: Comment[][];
  liveTitle?: string;
  liveCategory?: string;
  fail?: boolean;
  repeatedCursor?: boolean;
}

async function run(options: Options = {}) {
  const messages: string[] = [];
  const mutations: Array<{ discussionId: string; body: string }> = [];
  const reads: string[] = [];
  let queries = 0;
  const pages = options.pages ?? [[]];
  const metadata = {
    name: "@unwanted-user [unsafe](https://example.com)",
    tags: options.tags ?? ["hooks"],
    authors: options.authors ?? [{ github: "adilei" }],
  };
  await execute(
    {
      graphql: async (query: string, variables: Record<string, unknown>) => {
        if (options.fail) throw new Error("GitHub API unavailable");
        if (query.includes("mutation")) {
          assert.equal(typeof variables.discussionId, "string");
          assert.equal(typeof variables.body, "string");
          mutations.push({ discussionId: String(variables.discussionId), body: String(variables.body) });
          return { addDiscussionComment: { comment: { id: "notification" } } };
        }
        assert.equal(variables.owner, "microsoft");
        assert.equal(variables.name, "copilot-studio-gallery");
        assert.equal(variables.number, 42);
        assert.equal(variables.after, queries === 0 ? null : `page-${queries}`);
        const index = queries++;
        const hasNextPage = index < pages.length - 1;
        return {
          repository: {
            discussion: {
              id: "discussion-id",
              title: options.liveTitle ?? "hooks-lab",
              category: { id: options.liveCategory ?? config.categoryId },
              comments: {
                nodes: pages[index],
                pageInfo: { hasNextPage, endCursor: options.repeatedCursor ? variables.after : `page-${index + 1}` },
              },
            },
          },
        };
      },
    },
    {
      repo: { owner: "microsoft", repo: "copilot-studio-gallery" },
      payload: {
        discussion: { title: options.slug ?? "hooks-lab", number: 42, category: { node_id: options.category ?? config.categoryId } },
        comment: { user: { login: options.commenter ?? "visitor", type: options.bot ? "Bot" : "User" } },
      },
    },
    { info: (message: string) => messages.push(message) },
    (name: string) => {
      if (name === "node:path") return path;
      assert.equal(name, "node:fs");
      return {
        existsSync: () => !options.missing,
        readFileSync: (file: string) => {
          reads.push(file);
          return JSON.stringify(file.endsWith("discussion-config.json") ? config : metadata);
        },
      };
    },
  );
  return { messages, mutations, queries, reads };
}

test("notification workflow uses trusted metadata and least-privilege permissions", () => {
  assert.deepEqual(workflow.on, { discussion_comment: { types: ["created"] } });
  assert.deepEqual(workflow.permissions, { contents: "read", discussions: "write" });
  assert.equal(workflow.concurrency["cancel-in-progress"], false);
  assert.match(workflow.concurrency.group, /discussion.number/);
  assert.equal(workflow.jobs.notify.steps[0].with.ref, "main");
  assert.equal(workflow.jobs.notify.steps[0].with["persist-credentials"], false);
});

test("first community comment mentions the credited submitter and uses only trusted handles", async () => {
  const { mutations, reads } = await run();
  assert.equal(mutations.length, 1);
  assert.equal(mutations[0].discussionId, "discussion-id");
  assert.match(mutations[0].body, /@adilei/);
  assert.match(mutations[0].body, /gallery-submitter-notified:hooks-lab/);
  assert.match(mutations[0].body, /\/solutions\/hooks-lab\//);
  assert.doesNotMatch(mutations[0].body, /@unwanted-user/);
  assert.ok(reads.includes(path.join("src", "content", "solutions", "hooks-lab.json")));
});

test("notifies all credited GitHub authors, deduplicating case-insensitively", async () => {
  const { mutations } = await run({ authors: [{ github: "Ada" }, {}, { github: "Grace" }, { github: "ADA" }] });
  assert.equal(mutations.length, 1);
  assert.match(mutations[0].body, /@ADA @Grace/);
  assert.equal((mutations[0].body.match(/@/g) ?? []).length, 2);
});

for (const options of [
  { bot: true },
  { category: "other-category" },
  { slug: "../../other-file" },
  { slug: "Hooks Lab" },
  { missing: true },
  { authors: [{}] },
  { commenter: "ADILEI" },
  { tags: ["DeMo"] },
]) {
  test(`skips ineligible notification: ${JSON.stringify(options)}`, async () => {
    const { mutations, queries, messages } = await run(options);
    assert.equal(mutations.length, 0);
    assert.equal(queries, 0);
    assert.ok(messages.length > 0);
  });
}

test("existing bot marker prevents duplicate notifications, including on later pages", async () => {
  const { mutations, queries } = await run({
    pages: [
      Array.from({ length: 100 }, () => ({ author: { login: "visitor" }, body: "A comment" })),
      [{ author: { login: "github-actions[bot]" }, body: marker }],
    ],
  });
  assert.equal(queries, 2);
  assert.equal(mutations.length, 0);
});

test("a visitor cannot suppress notification by copying the marker", async () => {
  const { mutations } = await run({ pages: [[{ author: { login: "visitor" }, body: marker }]] });
  assert.equal(mutations.length, 1);
});

test("a prior author's comment does not prevent the first visitor notification", async () => {
  const { mutations } = await run({ pages: [[{ author: { login: "adilei" }, body: "Author note" }]] });
  assert.equal(mutations.length, 1);
});

test("handles deleted commenters in the discussion history", async () => {
  const { mutations } = await run({ pages: [[{ author: null, body: "Older comment" }]] });
  assert.equal(mutations.length, 1);
});

test("does not notify a discussion renamed or recategorized while the workflow waited", async () => {
  assert.equal((await run({ liveTitle: "different-sample" })).mutations.length, 0);
  assert.equal((await run({ liveCategory: "different-category" })).mutations.length, 0);
});

test("invalid handles and API failures fail visibly instead of reporting success", async () => {
  await assert.rejects(run({ authors: [{ github: "bad @handle" }] }), /Invalid GitHub handle/);
  await assert.rejects(run({ fail: true }), /GitHub API unavailable/);
  await assert.rejects(run({ pages: [[], []], repeatedCursor: true }), /pagination cursor/);
});
