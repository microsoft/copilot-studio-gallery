import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { managedApps } from "@microsoft/managed-apps-vite-plugin";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { fieldsFromSchema } from "./src/ideaSchema.ts";

const schemas = new URL("./.ms/schemas/sharepointonline/", import.meta.url);
const matches = existsSync(schemas) ? readdirSync(schemas)
  .filter((name) => name.replace(/\.Schema\.json$/, "").replace(/[_-]/g, "").toLowerCase() === "teamideas") : [];
if (matches.length > 1) throw new Error("Multiple Team Ideas schemas exist. Keep one native SharePoint binding for this app.");
if (matches.length === 1) {
  const fields = fieldsFromSchema(JSON.parse(readFileSync(new URL(matches[0], schemas), "utf8")));
  const target = new URL("./src/ideaFields.json", import.meta.url);
  const content = `${JSON.stringify(fields, null, 2)}\n`;
  // Persist only field aliases: hosted Git builds do not have the ignored .ms cache.
  if (readFileSync(target, "utf8") !== content) writeFileSync(target, content);
}

export default defineConfig({ plugins: [react(), managedApps()] });
