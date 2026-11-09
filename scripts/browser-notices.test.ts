import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { build as buildAstro, dev as devAstro } from "astro";
import { build } from "vite";
import browserNotices, { browserNoticesPlugin, collectBrowserNotices, formatBrowserNotices, NOTICES_FILE } from "./browser-notices";

async function fixture() {
  const nodeEnv = process.env.NODE_ENV;
  const root = await realpath(await mkdtemp(join(tmpdir(), "browser-notices-")));
  const put = async (path: string, text: string) => {
    const target = join(root, path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, text);
    return target;
  };
  const pkg = async (name: string, version = "1.0.0", parent = "") => {
    const directory = join(parent, "node_modules", name);
    await put(join(directory, "package.json"), JSON.stringify({ name, version, main: "index.js", license: "MIT" }));
    await put(join(directory, "LICENSE"), `MIT License\nCopyright Example ${name}\nPermission notice for ${name}`);
    return { directory, entry: await put(join(directory, "index.js"), `export const value = ${JSON.stringify(name)};`) };
  };
  return { root, put, pkg, cleanup: async () => {
    if (nodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = nodeEnv;
    await rm(root, { recursive: true, force: true });
  } };
}

test("React and React DOM notices retain their complete installed license texts", async () => {
  const react = fileURLToPath(import.meta.resolve("react"));
  const dom = fileURLToPath(import.meta.resolve("react-dom/client"));
  const packages = await collectBrowserNotices([react, dom]);
  const text = formatBrowserNotices(packages);
  const license = await readFile(join(dirname(react), "LICENSE"), "utf8");
  assert.ok(text.includes(license.trim()));
  assert.match(text, /react@[\d.]+/);
  assert.match(text, /react-dom@[\d.]+/);
  assert.match(text, /Copyright \(c\) Meta Platforms, Inc. and affiliates\./);
});

test("scoped and nested package instances preserve all license and notice files", async () => {
  const f = await fixture();
  try {
    const outer = await f.pkg("@example/widget");
    const nested = await f.pkg("utility", "2.0.0", outer.directory);
    await f.put(join(outer.directory, "NOTICE.txt"), "Third-party attribution to preserve");
    await f.put(join(outer.directory, "LICENSE-BSD"), "Second license text");
    await f.put(join(nested.directory, "dist/package.json"), '{"type":"module"}');
    const nestedEntry = await f.put(join(nested.directory, "dist/index.js"), "export const nested = true;");
    const text = formatBrowserNotices(await collectBrowserNotices([outer.entry, `${nestedEntry}?commonjs-proxy`, outer.entry]));
    assert.match(text, /@example\/widget@1\.0\.0/);
    assert.match(text, /utility@2\.0\.0/);
    assert.match(text, /Third-party attribution to preserve/);
    assert.match(text, /Second license text/);
    assert.equal(text.match(/@example\/widget@1\.0\.0/g)?.length, 1);
    assert.ok(!text.includes(f.root));
  } finally {
    await f.cleanup();
  }
});

test("LICENSES directories preserve license texts with SPDX filenames", async () => {
  const f = await fixture();
  try {
    const p = await f.pkg("licensed");
    await rm(join(f.root, p.directory, "LICENSE"));
    await f.put(join(p.directory, "LICENSES/MIT.txt"), "The full MIT text");
    await f.put(join(p.directory, "LICENSES/nested/BSD-3-Clause.txt"), "The full BSD text");
    const text = formatBrowserNotices(await collectBrowserNotices([p.entry]));
    assert.match(text, /The full MIT text/);
    assert.match(text, /The full BSD text/);
  } finally {
    await f.cleanup();
  }
});

test("an SPDX identifier or NOTICE alone cannot replace missing license text", async () => {
  const f = await fixture();
  try {
    const p = await f.pkg("missing-license");
    await f.put(join(p.directory, "LICENSE"), " \n");
    await f.put(join(p.directory, "NOTICE"), "Attribution without the license");
    await assert.rejects(collectBrowserNotices([p.entry]), /Missing license text.*missing-license@1\.0\.0/);
  } finally {
    await f.cleanup();
  }
});

test("notice output is deterministic and ignores project and virtual modules", async () => {
  const f = await fixture();
  try {
    const a = await f.pkg("a");
    const z = await f.pkg("z");
    const one = formatBrowserNotices(await collectBrowserNotices([z.entry, a.entry, "\0virtual", join(f.root, "app.ts")]));
    const two = formatBrowserNotices(await collectBrowserNotices([a.entry, z.entry]));
    assert.equal(one, two);
    assert.ok(one.indexOf("a@1.0.0") < one.indexOf("z@1.0.0"));
    assert.throws(() => formatBrowserNotices(new Map()), /No browser dependency notices/);
  } finally {
    await f.cleanup();
  }
});

test("browser builds include bundled JS and CSS packages but exclude build-only packages", async () => {
  const f = await fixture();
  try {
    await f.pkg("runtime");
    const css = await f.pkg("styles");
    await f.pkg("build-only");
    await f.put(join(css.directory, "theme.css"), "body { color: red; }");
    const entry = await f.put("entry.js", 'import { value } from "runtime"; import "styles/theme.css"; console.log(value);');
    let text = "";
    await build({
      configFile: false,
      root: f.root,
      logLevel: "silent",
      build: { rolldownOptions: { input: entry } },
      plugins: [browserNoticesPlugin((result) => { text = result; })],
    });
    assert.match(text, /runtime@1\.0\.0/);
    assert.match(text, /styles@1\.0\.0/);
    assert.ok(!text.includes("build-only"));
  } finally {
    await f.cleanup();
  }
});

test("missing bundled licenses fail the actual browser build", async () => {
  const f = await fixture();
  try {
    const p = await f.pkg("missing-license");
    await rm(join(f.root, p.directory, "LICENSE"));
    const entry = await f.put("entry.js", 'import { value } from "missing-license"; console.log(value);');
    await assert.rejects(build({
      configFile: false,
      root: f.root,
      logLevel: "silent",
      build: { rolldownOptions: { input: entry } },
      plugins: [browserNoticesPlugin(() => {})],
    }), /Missing license text.*missing-license@1\.0\.0/);
  } finally {
    await f.cleanup();
  }
});

test("Astro writes notices to the final deployed output rather than an intermediate directory", async () => {
  const f = await fixture();
  try {
    await f.pkg("runtime");
    await symlink(dirname(fileURLToPath(import.meta.resolve("astro/package.json"))), join(f.root, "node_modules/astro"), "dir");
    await f.put("src/pages/index.astro", "<html><body>Notice fixture</body></html>");
    await buildAstro({
      root: f.root,
      configFile: false,
      logLevel: "silent",
      integrations: [browserNotices(), {
        name: "fixture-client",
        hooks: { "astro:config:setup": ({ injectScript }) => {
          injectScript("page", 'import { value } from "runtime"; console.log(value);');
        } },
      }],
    });
    const text = await readFile(join(f.root, "dist", NOTICES_FILE), "utf8");
    assert.match(text, /runtime@1\.0\.0/);
    assert.match(text, /Permission notice for runtime/);
  } finally {
    await f.cleanup();
  }
});

test("development serves fresh notices at the configured base without a production build", async () => {
  const f = await fixture();
  let server: Awaited<ReturnType<typeof devAstro>> | undefined;
  try {
    await mkdir(join(f.root, "node_modules"), { recursive: true });
    await symlink(dirname(fileURLToPath(import.meta.resolve("astro/package.json"))), join(f.root, "node_modules/astro"), "dir");
    await f.put("src/pages/index.astro", "<html><body>Notice fixture</body></html>");
    server = await devAstro({
      root: f.root,
      configFile: false,
      base: "/gallery/",
      logLevel: "silent",
      server: { host: "127.0.0.1", port: 0 },
      integrations: [browserNotices()],
    });
    const response = await fetch(`http://127.0.0.1:${server.address.port}/gallery/${NOTICES_FILE}`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") ?? "", /text\/plain/);
    const text = await response.text();
    assert.match(text, /react@[\d.]+/);
    assert.match(text, /react-dom@[\d.]+/);
    assert.match(text, /Copyright \(c\) Meta Platforms/);
    await assert.rejects(readFile(join(f.root, "dist", NOTICES_FILE)), { code: "ENOENT" });
  } finally {
    await server?.stop();
    await f.cleanup();
  }
});
