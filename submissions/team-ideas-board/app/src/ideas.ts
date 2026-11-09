import fields from "./ideaFields.json";
import { readIdea, writeIdea, type Idea, type NewIdea, type Status } from "./ideaSchema";
export { STATUSES, PRIORITIES, type Status, type Priority, type Idea, type NewIdea } from "./ideaSchema";

interface Result<T> { success: boolean; data?: T; error?: unknown }
interface IdeasService {
  getAll(options: { top: number; select: string[] }): Promise<Result<unknown>>;
  create(idea: Record<string, string | null>): Promise<Result<unknown>>;
  update(id: string, fields: Record<string, string>): Promise<Result<unknown>>;
}

// Native CLI generates this service after the recipient binds their own list.
// An unbound source checkout must still build, but must never pretend to load data.
const modules = import.meta.glob<Record<string, unknown>>(
  ["../generated/services/TeamIdeasService.ts", "../generated/services/TeamideasService.ts",
    "../generated/services/Team_ideasService.ts", "../generated/services/Team_IdeasService.ts"],
  { eager: true },
);
function isService(value: unknown): value is IdeasService {
  return (typeof value === "function" || (typeof value === "object" && value !== null))
    && "getAll" in value && typeof value.getAll === "function"
    && "create" in value && typeof value.create === "function"
    && "update" in value && typeof value.update === "function";
}
function service(): IdeasService {
  const generated = Object.values(modules).flatMap((module) => Object.values(module).filter(isService));
  if (generated.length !== 1) throw new Error("SharePoint is not configured unambiguously. Bind one list named Team Ideas or team-ideas using ms app add data-source, then restart or rebuild this app. See the submission setup guide.");
  return generated[0];
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "message" in error && typeof error.message === "string") return error.message;
  return "The SharePoint request failed. Check your connection, list permissions, required columns, and tenant policy, then retry.";
}
function result<T>(response: Result<T>): T {
  if (!response.success) throw new Error(errorMessage(response.error));
  if (response.data === undefined || response.data === null) throw new Error("SharePoint returned no result. Refresh the board to check whether the operation completed before retrying.");
  return response.data;
}
export async function loadIdeas(): Promise<Idea[]> {
  const rows = result(await service().getAll({ top: 200, select: Object.values(fields) }));
  if (!Array.isArray(rows)) throw new Error("SharePoint returned an unexpected table result.");
  return rows.map((row) => readIdea(row, fields)).sort((a, b) => b.ID - a.ID);
}
export async function createIdea(idea: NewIdea): Promise<void> {
  result(await service().create(writeIdea(idea, fields)));
}
export async function changeStatus(id: number, status: Status): Promise<void> {
  result(await service().update(String(id), { [fields.Status]: status }));
}
