import { createHash } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { supportingFileMetadataSchema, type SubmissionMetadata, type SupportingFile } from "../src/lib/schema";
import { publicAssetPath } from "../src/lib/site";

const MAX_FILE_BYTES = 512 * 1024;
const MAX_TOTAL_BYTES = 2 * 1024 * 1024;

function validateCsv(text: string): void {
  if (/^\s*sep\s*=/i.test(text)) throw new Error("CSV delimiter directives are not supported; use comma-separated data");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let closedQuote = false;
  const finishField = () => {
    if (/^[\s\uFEFF]*[=+\-@\uFF1D\uFF0B\uFF0D\uFF20]/u.test(field) || /^[\t\r\n]/.test(field)) {
      throw new Error("CSV cells must not start with spreadsheet formula characters (=, +, -, @) or control characters");
    }
    row.push(field);
    field = "";
    closedQuote = false;
  };
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character !== '"') field += character;
      else if (text[index + 1] === '"') { field += '"'; index += 1; }
      else { quoted = false; closedQuote = true; }
    } else if (character === ",") {
      finishField();
    } else if (character === "\r" || character === "\n") {
      finishField();
      rows.push(row);
      row = [];
      if (character === "\r" && text[index + 1] === "\n") index += 1;
    } else if (character === '"' && !field && !closedQuote) {
      quoted = true;
    } else {
      if (closedQuote || character === '"') throw new Error("CSV contains malformed quoted fields");
      field += character;
    }
  }
  if (quoted) throw new Error("CSV contains an unterminated quoted field");
  if (field || row.length || closedQuote) { finishField(); rows.push(row); }
  const headers = rows[0]?.map((header) => header.trim().toLowerCase()) ?? [];
  if (!headers.length || headers.some((header) => !header) || new Set(headers).size !== headers.length) {
    throw new Error("CSV requires nonempty, unique column headers");
  }
  if (rows.some((item) => item.length !== headers.length)) throw new Error("CSV rows must match the header column count");
}

export async function buildSupportingFiles(submissionPath: string, slug: string, declarations: SubmissionMetadata["supportingFiles"]) {
  const files: SupportingFile[] = [];
  const assets: Array<{ name: string; content: Buffer }> = [];
  const links = new Map<string, string>();
  let total = 0;
  for (const declaration of declarations) {
    const item = supportingFileMetadataSchema.parse(declaration);
    const directory = await lstat(join(submissionPath, "supporting"));
    if (!directory.isDirectory() || directory.isSymbolicLink()) throw new Error("supporting/ must be a directory, not a symbolic link");
    const path = join(submissionPath, item.path);
    const stat = await lstat(path);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`${item.path}: supporting file must be a regular file`);
    if (!stat.size || stat.size > MAX_FILE_BYTES) throw new Error(`${item.path}: supporting file must be nonempty and at most 512 KiB`);
    const content = await readFile(path);
    if (!content.length || content.length > MAX_FILE_BYTES) throw new Error(`${item.path}: supporting file must be nonempty and at most 512 KiB`);
    total += content.length;
    if (total > MAX_TOTAL_BYTES) throw new Error("supporting files must total at most 2 MiB");
    let text: string;
    try { text = new TextDecoder("utf-8", { fatal: true }).decode(content); }
    catch { throw new Error(`${item.path}: supporting files must contain valid UTF-8 text`); }
    if (!text.trim() || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(text)) {
      throw new Error(`${item.path}: supporting files must contain nonempty text without binary/control characters`);
    }
    try {
      if (extname(item.path) === ".json") JSON.parse(text);
      if (extname(item.path) === ".csv") validateCsv(text);
    } catch (error) {
      throw new Error(`${item.path}: ${error instanceof Error ? error.message : String(error)}`);
    }
    const filename = basename(item.path);
    const name = `${slug}-${createHash("sha256").update(content).digest("hex")}-${filename}`;
    files.push({ label: item.label, filename, path: `bundles/${name}`, size: content.length });
    assets.push({ name, content });
    links.set(item.path, publicAssetPath(`bundles/${name}`));
  }
  return { files, assets, links };
}

export function rewriteSupportingLinks(markdown: string, links: ReadonlyMap<string, string>): string {
  for (const [source, target] of links) {
    const escaped = source.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    markdown = markdown.replace(new RegExp(`(?<!!)(\\[[^\\]]*\\]\\()(?:\\./)?${escaped}(\\s*(?:"[^"]*")?\\))`, "g"),
      (_match, prefix: string, suffix: string) => `${prefix}${target}${suffix}`);
  }
  return markdown;
}
