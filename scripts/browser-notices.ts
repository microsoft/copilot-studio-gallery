import { readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, parse } from "node:path";
import { fileURLToPath } from "node:url";
import type { AstroIntegration } from "astro";
import { build, type Plugin } from "vite";
import type { OutputBundle } from "rolldown";

export const NOTICES_FILE = "third-party-notices.txt";
const LICENSE_METADATA = ".vite/browser-licenses.json";
const licenseName = /^(?:licen[cs]e|copying)(?:[._-]|$)/i;
const noticeName = /^(?:notice|third[-_]?party[-_]?notices?|copyright|authors)(?:[._-]|$)/i;
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;

function packageModule(id: string): string | undefined {
  if (id.startsWith("\0")) return;
  const path = id.split("?")[0]!;
  if (!isAbsolute(path) || !path.replaceAll("\\", "/").includes("/node_modules/")) return;
  return path;
}

function developmentModule(id: string): string | undefined {
  const path = packageModule(id);
  if (path && !path.includes("/.vite/") && !path.includes("/vite/dist/client/")
    && !path.includes("/astro/dist/runtime/client/dev-toolbar")
    && !path.endsWith("/astro/dist/runtime/client/hmr.js")) return path;
}

async function packageRoot(path: string): Promise<string> {
  let directory = dirname(path);
  while (directory !== parse(directory).root) {
    try {
      const pkg = JSON.parse(await readFile(join(directory, "package.json"), "utf8"));
      if (typeof pkg.name === "string" && typeof pkg.version === "string") return directory;
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
    }
    directory = dirname(directory);
  }
  throw new Error(`Cannot find package metadata for browser module: ${path}`);
}

async function legalFiles(root: string, licenseDirectory = false): Promise<{ name: string; text: string; license: boolean }[]> {
  const files: { name: string; text: string; license: boolean }[] = [];
  for (const entry of (await readdir(root, { withFileTypes: true })).sort((a, b) => compare(a.name, b.name))) {
    const license = licenseDirectory || licenseName.test(entry.name);
    if (entry.isFile() && (license || noticeName.test(entry.name))) {
      const text = (await readFile(join(root, entry.name), "utf8")).trim();
      if (text) files.push({ name: entry.name, text, license });
    } else if (entry.isDirectory() && (licenseDirectory || /^licenses$/i.test(entry.name))) {
      for (const file of await legalFiles(join(root, entry.name), true)) {
        files.push({ ...file, name: `${entry.name}/${file.name}` });
      }
    }
  }
  return files;
}

export async function collectBrowserNotices(moduleIds: Iterable<string>): Promise<Map<string, string>> {
  const paths = [...new Set([...moduleIds].map(packageModule).filter((path) => path !== undefined))];
  const roots = new Set(await Promise.all(paths.map(packageRoot)));
  const packages = new Map<string, Set<string>>();
  for (const root of roots) {
    const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
    const key = `${pkg.name}@${pkg.version}`;
    const files = await legalFiles(root);
    if (!files.some((file) => file.license)) {
      throw new Error(`Missing license text for bundled browser dependency ${key}. Include its upstream LICENSE/COPYING file before building.`);
    }
    const sections = packages.get(key) ?? new Set<string>();
    for (const file of files) sections.add(`--- ${file.name} ---\n${file.text}`);
    packages.set(key, sections);
  }
  return new Map([...packages].sort(([a], [b]) => compare(a, b))
    .map(([key, sections]) => [key, [...sections].sort(compare).join("\n\n")]));
}

export function formatBrowserNotices(packages: Map<string, string>): string {
  if (packages.size === 0) throw new Error("No browser dependency notices were collected; check the client build integration.");
  return [
    "Third-party notices",
    "",
    "This website includes the following third-party software.",
    "The license and attribution texts below apply to their respective components.",
    ...[...packages].sort(([a], [b]) => compare(a, b)).map(([key, text]) => `\n${"=".repeat(72)}\n${key}\n\n${text}`),
    "",
  ].join("\n");
}

async function noticesFromBundle(bundle: OutputBundle, styles: Set<string>): Promise<string> {
  const metadata = bundle[LICENSE_METADATA];
  if (!metadata || metadata.type !== "asset" || typeof metadata.source !== "string") {
    throw new Error("Vite browser license metadata is missing; enable build.license for the client build.");
  }
  const packages = await collectBrowserNotices([
    ...Object.values(bundle).flatMap((chunk) => chunk.type === "chunk" ? Object.keys(chunk.modules) : []),
    ...styles,
  ]);
  // Check Vite's inventory as well so an unresolved package cannot disappear silently.
  const entries: unknown = JSON.parse(metadata.source);
  if (!Array.isArray(entries)) throw new Error("Invalid Vite browser license metadata");
  for (const entry of entries) {
    if (!entry || typeof entry.name !== "string" || typeof entry.version !== "string"
      || !packages.has(`${entry.name}@${entry.version}`)) {
      throw new Error("Unresolved dependency in Vite browser license metadata");
    }
  }
  return formatBrowserNotices(packages);
}

export function browserNoticesPlugin(onNotices: (text: string) => void, styles = new Set<string>()): Plugin {
  return {
    name: "gallery-browser-notices",
    applyToEnvironment: (environment) => environment.name === "client",
    configEnvironment(name) {
      if (name === "client") return { build: { license: { fileName: LICENSE_METADATA } } };
    },
    buildStart() {
      styles.clear();
    },
    transform(_code, id) {
      if (/\.css(?:\?|$)/i.test(id)) styles.add(id);
    },
    writeBundle: {
      order: "post",
      async handler(_options, bundle) {
        onNotices(await noticesFromBundle(bundle, styles));
      },
    },
  };
}

export default function browserNotices(): AstroIntegration {
  let notices: string | undefined;
  return {
    name: "gallery-browser-notices",
    hooks: {
      "astro:config:setup": ({ updateConfig, addWatchFile }) => {
        addWatchFile(new URL(import.meta.url));
        updateConfig({
          vite: {
            plugins: [browserNoticesPlugin((text) => { notices = text; })],
          },
        });
      },
      "astro:build:done": async ({ dir }) => {
        if (!notices) throw new Error("The client build did not generate third-party notices");
        await writeFile(new URL(NOTICES_FILE, dir), notices);
      },
      "astro:server:setup": ({ server }) => {
        let pending: Promise<string> | undefined;
        const endpoint = `${server.config.base.replace(/\/$/, "")}/${NOTICES_FILE}`;
        server.middlewares.use((request, response, next) => {
          const path = request.url?.split("?")[0];
          if ((path !== endpoint && path !== `/${NOTICES_FILE}`) || !["GET", "HEAD"].includes(request.method ?? "")) return next();
          const generate = async () => {
            const client = server.environments.client;
            const inputs = new Set<string>([
              fileURLToPath(import.meta.resolve("react")),
              fileURLToPath(import.meta.resolve("react-dom/client")),
              fileURLToPath(import.meta.resolve("@xyflow/react")),
            ]);
            for (const module of client?.moduleGraph.idToModuleMap.values() ?? []) {
              const path = developmentModule(module.id ?? "");
              if (path) inputs.add(path);
            }
            for (const dep of client?.depsOptimizer?.metadata.depInfoList ?? []) {
              const path = developmentModule(dep.src ?? "");
              if (path) inputs.add(path);
            }
            const styles = new Set<string>();
            // Bundle installed client entries in memory, without executing them or
            // reusing a potentially stale production build.
            const result = await build({
              configFile: false,
              root: server.config.root,
              publicDir: false,
              logLevel: "warn",
              build: {
                write: false,
                license: { fileName: LICENSE_METADATA },
                rolldownOptions: { input: [...inputs].sort(compare) },
              },
              plugins: [browserNoticesPlugin(() => {}, styles)],
            });
            if (!Array.isArray(result) && !("output" in result)) throw new Error("Unexpected browser build watcher");
            const output = (Array.isArray(result) ? result : [result]).flatMap((item) => item.output);
            return noticesFromBundle(Object.fromEntries(output.map((item) => [item.fileName, item])), styles);
          };
          pending ??= generate().finally(() => { pending = undefined; });
          void pending.then((text) => {
            response.setHeader("Content-Type", "text/plain; charset=utf-8");
            response.setHeader("Cache-Control", "no-store");
            response.end(request.method === "HEAD" ? undefined : text);
          }).catch(next);
        });
      },
    },
  };
}
