import { lstat, readdir, readFile } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";

export interface SourceFile {
  absolutePath: string;
  path: string;
  size: number;
}

export function nonPortablePath(path: string): boolean {
  return path.split("/").some((part) =>
    [".git", ".ms", "node_modules", "dist", ".astro", ".DS_Store", ".aether-app-builder.json",
      ".app-meta.json", "ms.config.json", "ms.project.config.json", ".npmrc"].includes(part)
    || (/^\.env(?:\.|$)/.test(part) && part !== ".env.example")
    || /\.(?:pem|pfx|key|tsbuildinfo)$/i.test(part),
  );
}

export async function collectAppSource(root: string, prepare = false): Promise<{ files: SourceFile[]; excluded: string[] }> {
  root = resolve(root);
  const files: SourceFile[] = [];
  const excluded: string[] = [];
  let total = 0;
  const rootStat = await lstat(root);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new Error("app source must be a real directory");
  async function walk(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolutePath = join(directory, entry.name);
      const path = relative(root, absolutePath).split(sep).join("/");
      const stat = await lstat(absolutePath);
      if (stat.isSymbolicLink()) throw new Error(`symbolic links are not allowed: ${path}`);
      if (path.includes("\\") || path.split("/").some((part) => /[\x00-\x1f<>:"|?*]|[. ]$/.test(part)
        || /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(part))) throw new Error(`unsafe source path: ${path}`);
      if (nonPortablePath(path)) {
        if (!prepare) throw new Error(`non-portable app source: ${path}; use prepare:app and review the export`);
        excluded.push(path);
        continue;
      }
      if (stat.isDirectory()) await walk(absolutePath);
      else if (stat.isFile()) {
        total += stat.size;
        if (stat.size > 2 * 1024 * 1024 || total > 25 * 1024 * 1024) throw new Error(`app source exceeds size limits: ${path}`);
        files.push({ absolutePath, path, size: stat.size });
      } else throw new Error(`unsupported filesystem entry: ${path}`);
    }
  }
  await walk(root);
  return { files: files.sort((a, b) => a.path.localeCompare(b.path)), excluded: excluded.sort() };
}

export async function inspectAppPackage(files: SourceFile[]): Promise<{ version: string }> {
  const required = (path: string) => {
    const file = files.find((item) => item.path === path);
    if (!file) throw new Error(`missing required app/${path}`);
    return file.absolutePath;
  };
  const pkg = JSON.parse(await readFile(required("package.json"), "utf8"));
  const lock = JSON.parse(await readFile(required("package-lock.json"), "utf8"));
  if (typeof pkg.version !== "string" || !/^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/.test(pkg.version)) {
    throw new Error("app/package.json must declare a semantic version");
  }
  if (typeof pkg.scripts?.build !== "string" || !pkg.scripts.build.trim()) throw new Error("app/package.json must declare scripts.build");
  if (!Number.isInteger(lock.lockfileVersion) || lock.lockfileVersion < 2) throw new Error("app requires an npm lockfile version 2 or newer");
  if (!Object.keys(pkg.dependencies ?? {}).includes("@microsoft/managed-apps")) throw new Error("app must depend on @microsoft/managed-apps");
  if (!files.some((file) => file.path === "LICENSE" || file.path === "LICENSE.md")) throw new Error("app requires LICENSE or LICENSE.md");
  return { version: pkg.version };
}
