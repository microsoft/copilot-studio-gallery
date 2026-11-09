import { copyFile, lstat, mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { collectAppSource, inspectAppPackage } from "./managed-app-source";
import { submissionMetadataSchema } from "../src/lib/schema";

export async function prepareManagedApp(options: { source: string; slug: string; root?: string; dryRun?: boolean }) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(options.slug)) throw new Error("slug must be lowercase kebab-case");
  const source = resolve(options.source);
  const destination = resolve(options.root ?? process.cwd(), "submissions", options.slug);
  if (destination === source || destination.startsWith(`${source}${sep}`) || source.startsWith(`${destination}${sep}`)) {
    throw new Error("source and submission destination must not overlap");
  }
  try {
    await lstat(destination);
    throw new Error(`destination already exists: ${destination}`);
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
  }
  const { files, excluded } = await collectAppSource(source, true);
  await inspectAppPackage(files);
  let bindings = false;
  try {
    const config = JSON.parse(await readFile(join(source, "ms.config.json"), "utf8"));
    bindings = Object.keys(config.connectionReferences ?? {}).length > 0;
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
  }
  const report = { destination, files: files.map((file) => file.path), excluded, bindingsRequireDocumentation: bindings };
  if (options.dryRun) return report;
  await mkdir(destination, { recursive: false });
  for (const file of files) {
    const target = join(destination, "app", file.path);
    await mkdir(dirname(target), { recursive: true });
    await copyFile(file.absolutePath, target);
  }
  const metadata = {
    submissionType: "managed-app",
    name: basename(source),
    description: "Replace this description with the purpose of your managed app.",
    tags: ["managed-app"],
    author: "Replace with contributor name",
    app: { prerequisites: [], connectors: [] },
  };
  submissionMetadataSchema.parse(metadata);
  await writeFile(join(destination, "metadata.json"), `${JSON.stringify(metadata, null, 2)}\n`, { flag: "wx" });
  await writeFile(join(destination, "README.md"), `# ${metadata.name}\n\nDescribe what the app does and who it helps.\n\n${bindings ? "**SETUP INCOMPLETE:** The original app has connection references. Declare every required connector, logical data-source name, table/schema, and setup instruction in metadata.json before submitting. Original connection bindings were excluded.\n\n" : ""}## Screenshots\n\nScreenshots are strongly recommended. Show the main screen using synthetic or redacted data, add descriptive alt text, and declare the primary PNG in metadata.json. See the managed app guide for the Markdown example and supported image references.\n\n## Data requirements\n\nDocument required lists or tables, their exact schema, how to create them, and the permissions needed to use them.\n\n## Using the app\n\nDescribe the main workflows and any limitations.\n\n## Make it your own\n\nDescribe a small UI change or adaptation for another use case.\n`, { flag: "wx" });
  return report;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const positional = args.filter((arg) => arg !== "--dry-run");
  if (positional.length !== 2) {
    console.error("Usage: npm run prepare:app -- /path/to/clone submission-slug [--dry-run]");
    process.exitCode = 1;
  } else {
    prepareManagedApp({ source: positional[0]!, slug: positional[1]!, dryRun })
      .then((report) => {
        console.log(JSON.stringify({ ...report, destination: relative(process.cwd(), report.destination) }, null, 2));
        if (report.bindingsRequireDocumentation) console.warn("Connection setup is incomplete: document every binding in metadata.json before submission.");
        console.log("Review metadata, setup documentation, and source privacy before submitting. No cloud operations were performed.");
      })
      .catch((error: unknown) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
  }
}
