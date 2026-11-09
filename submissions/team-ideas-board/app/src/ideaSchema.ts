export const STATUSES = ["New", "Exploring", "Planned"] as const;
export const PRIORITIES = ["Low", "Medium", "High"] as const;
export type Status = typeof STATUSES[number];
export type Priority = typeof PRIORITIES[number];
export interface Idea {
  ID: number;
  Title: string;
  Details?: string | null;
  Status: Status;
  Priority: Priority;
}
export type NewIdea = Omit<Idea, "ID">;
export type IdeaFields = Record<keyof Idea, string>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function fieldsFromSchema(value: unknown): IdeaFields {
  if (!isRecord(value) || !isRecord(value.schema) || !isRecord(value.schema.items)
    || !isRecord(value.schema.items.properties)) {
    throw new Error("The native Team Ideas schema has no table columns. Rebind the SharePoint list using ms app add data-source.");
  }
  const properties = value.schema.items.properties;
  function field(title: keyof Idea, type: string): string {
    const matches = Object.entries(properties).filter(([, property]) => isRecord(property) && property.title === title);
    if (matches.length !== 1) throw new Error(`The Team Ideas list must have exactly one column named ${title}. Check the submission setup guide and rebind the list.`);
    const [name, property] = matches[0];
    if (!isRecord(property) || property.type !== type) {
      throw new Error(`The Team Ideas ${title} column has the wrong type. Check the submission setup guide and rebind the list.`);
    }
    return name;
  }
  return {
    ID: field("ID", "integer"), Title: field("Title", "string"),
    Details: field("Details", "string"), Status: field("Status", "string"),
    Priority: field("Priority", "string"),
  };
}

export function readIdea(value: unknown, fields: IdeaFields): Idea {
  if (isRecord(value)) {
    const ID = value[fields.ID], Title = value[fields.Title], Details = value[fields.Details];
    const Status = STATUSES.find((status) => status === value[fields.Status]);
    const Priority = PRIORITIES.find((priority) => priority === value[fields.Priority]);
    if (typeof ID === "number" && typeof Title === "string" && Status && Priority
      && (Details === undefined || Details === null || typeof Details === "string")) {
      return { ID, Title, Details, Status, Priority };
    }
  }
  throw new Error("The list does not match the Team Ideas schema. Check the Status/Priority values and column types in the setup guide, then rebind and rebuild if the columns changed.");
}

export function writeIdea(idea: NewIdea, fields: IdeaFields): Record<string, string | null> {
  return {
    [fields.Title]: idea.Title, [fields.Details]: idea.Details ?? null,
    [fields.Status]: idea.Status, [fields.Priority]: idea.Priority,
  };
}
