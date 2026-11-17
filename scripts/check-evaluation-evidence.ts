import { execFileSync } from "node:child_process";
import { lstat, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

async function entries(path: string) {
  try {
    return await readdir(path, { withFileTypes: true });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return [];
    throw error;
  }
}

export async function checkEvaluationEvidence(root: string, changedPaths: string[]): Promise<string[]> {
  const slugs = new Set(changedPaths.flatMap((path) => {
    const match = /^submissions\/([a-z0-9]+(?:-[a-z0-9]+)*)\//.exec(path);
    return match ? [match[1]] : [];
  }));
  const errors: string[] = [];
  for (const slug of [...slugs].sort()) {
    const submission = resolve(root, "submissions", slug);
    const solution = resolve(submission, "solution");
    const botRoots = (await entries(solution)).filter((entry) => entry.isDirectory() && entry.name.toLowerCase() === "bots");
    let hasAgent = false;
    for (const botRoot of botRoots) {
      const bots = await entries(resolve(solution, botRoot.name));
      for (const bot of bots.filter((entry) => entry.isDirectory())) {
        const files = await entries(resolve(solution, botRoot.name, bot.name));
        if (files.some((file) => file.isFile() && file.name.toLowerCase() === "bot.xml")) hasAgent = true;
      }
    }
    if (!hasAgent) continue;

    const evaluations = await entries(resolve(submission, "evaluations"));
    let hasCsv = false;
    for (const file of evaluations.filter((entry) => entry.isFile() && /\.csv$/i.test(entry.name))) {
      const info = await lstat(resolve(submission, "evaluations", file.name));
      if (info.size > 0) hasCsv = true;
    }
    if (!hasCsv) {
      errors.push(`${slug}: a standalone agent requires a nonempty results CSV in submissions/${slug}/evaluations/. Redact all sensitive data before uploading. See CONTRIBUTING.md#evaluation-evidence-for-published-agents.`);
    }
  }
  return errors;
}

async function main() {
  const baseRef = process.argv[2];
  if (!baseRef || process.argv.length !== 3) {
    throw new Error("Usage: node --import tsx scripts/check-evaluation-evidence.ts <base-ref>");
  }
  const base = execFileSync("git", ["rev-parse", "--verify", "--end-of-options", `${baseRef}^{commit}`], { encoding: "utf8" }).trim();
  const paths = execFileSync("git", ["diff", "--name-only", "--no-renames", "-z", `${base}...HEAD`, "--", "submissions/"], { encoding: "utf8" })
    .split("\0").filter(Boolean);
  const errors = await checkEvaluationEvidence(process.cwd(), paths);
  if (errors.length) throw new Error(errors.join("\n"));
  console.log("Evaluation CSV presence check passed for changed submissions. Content coverage is reviewed by Copilot and maintainers.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
