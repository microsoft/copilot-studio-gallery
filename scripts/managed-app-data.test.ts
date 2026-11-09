import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as ideaSchema from "../submissions/team-ideas-board/app/src/ideaSchema";

const { fieldsFromSchema, readIdea, writeIdea } = ideaSchema;

function schema(imported = false) {
  return { schema: { items: { properties: {
    ID: { title: "ID", type: "integer" }, Title: { title: "Title", type: "string" },
    [imported ? "field_1" : "Details"]: { title: "Details", type: "string" },
    [imported ? "field_2" : "Status"]: { title: "Status", type: "string" },
    [imported ? "field_3" : "Priority"]: { title: "Priority", type: "string" },
  } } } };
}

test("native schema maps display names, including CSV-created internal names, without guessing order", () => {
  assert.deepEqual(fieldsFromSchema(schema()), { ID: "ID", Title: "Title", Details: "Details", Status: "Status", Priority: "Priority" });
  assert.deepEqual(fieldsFromSchema(schema(true)), { ID: "ID", Title: "Title", Details: "field_1", Status: "field_2", Priority: "field_3" });
  const reordered = { schema: { items: { properties: Object.fromEntries(Object.entries(schema(true).schema.items.properties).reverse()) } } };
  assert.deepEqual(fieldsFromSchema(reordered), fieldsFromSchema(schema(true)));
});

test("native schema rejects missing, ambiguous, and incorrectly typed columns explicitly", () => {
  assert.throws(() => fieldsFromSchema({}), /no table columns/);
  const missing = schema(true);
  delete missing.schema.items.properties.field_2;
  assert.throws(() => fieldsFromSchema(missing), /exactly one column named Status/);
  const ambiguous = schema(true);
  ambiguous.schema.items.properties.secondStatus = { title: "Status", type: "string" };
  assert.throws(() => fieldsFromSchema(ambiguous), /exactly one column named Status/);
  const wrongType = schema(true);
  wrongType.schema.items.properties.field_1.type = "array";
  assert.throws(() => fieldsFromSchema(wrongType), /Details column has the wrong type/);
});

test("CSV field aliases are used for reading, creation, and status updates even before any rows exist", () => {
  const fields = fieldsFromSchema(schema(true));
  const idea = { Title: "Synthetic idea", Details: "Test only", Status: "New", Priority: "High" } as const;
  assert.deepEqual(writeIdea(idea, fields), { Title: idea.Title, field_1: idea.Details, field_2: "New", field_3: "High" });
  assert.deepEqual(readIdea({ ID: 1, ...writeIdea(idea, fields) }, fields), { ID: 1, ...idea });
  assert.deepEqual({ [fields.Status]: "Planned" }, { field_2: "Planned" });
  assert.deepEqual(writeIdea({ ...idea, Details: undefined }, fields), { Title: idea.Title, field_1: null, field_2: "New", field_3: "High" });
  assert.throws(() => readIdea({ ID: 1, Title: "Wrong values", field_2: "Unexpected", field_3: "High" }, fields), /does not match/);
  assert.throws(() => readIdea(null, fields), /does not match/);
});

interface Adapter {
  loadIdeas(): Promise<ideaSchema.Idea[]>;
  createIdea(idea: ideaSchema.NewIdea): Promise<void>;
  changeStatus(id: number, status: ideaSchema.Status): Promise<void>;
}
function isAdapter(value: unknown): value is Adapter {
  return typeof value === "object" && value !== null
    && "loadIdeas" in value && typeof value.loadIdeas === "function"
    && "createIdea" in value && typeof value.createIdea === "function"
    && "changeStatus" in value && typeof value.changeStatus === "function";
}

function adapter(fields: ideaSchema.IdeaFields, services: Record<string, unknown>): Adapter {
  const paths: string[] = [];
  const source = readFileSync(new URL("../submissions/team-ideas-board/app/src/ideas.ts", import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    transformers: { before: [(context) => (file) => {
      const visit: ts.Visitor = (node) => {
        if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
          && ts.isMetaProperty(node.expression.expression) && node.expression.name.text === "glob") {
          const patterns = node.arguments[0];
          assert.ok(patterns && ts.isArrayLiteralExpression(patterns));
          for (const pattern of patterns.elements) {
            assert.ok(ts.isStringLiteral(pattern));
            paths.push(pattern.text);
          }
          return ts.factory.createIdentifier("nativeModules");
        }
        return ts.visitEachChild(node, visit, context);
      };
      return ts.visitEachChild(file, visit, context);
    }] },
  });
  const module: { exports: unknown } = { exports: {} };
  runInNewContext(outputText, {
    module, exports: module.exports,
    nativeModules: Object.fromEntries(Object.entries(services).filter(([path]) => paths.includes(path))),
    require: (path: string) => {
      if (path === "./ideaSchema") return ideaSchema;
      if (path === "./ideaFields.json") return fields;
      throw new Error(`Unexpected adapter dependency: ${path}`);
    },
  });
  assert.ok(isAdapter(module.exports));
  return module.exports;
}

test("the actual adapter selects native service variants and maps reads, creates, and updates without modifying generated code", async () => {
  for (const imported of [false, true]) {
    const fields = fieldsFromSchema(schema(imported));
    const calls: unknown[] = [];
    const idea = { Title: "Offline test", Details: "Synthetic only", Status: "New", Priority: "High" } as const;
    class NativeService {
      static async getAll(options: unknown) {
        calls.push(["getAll", options]);
        return { success: true, data: [{ ID: 1, ...writeIdea(idea, fields) }, { ID: 2, ...writeIdea(idea, fields) }] };
      }
      static async create(record: unknown) {
        calls.push(["create", record]);
        return { success: true, data: { ID: 3 } };
      }
      static async update(id: string, record: unknown) {
        calls.push(["update", id, record]);
        return { success: true, data: { ID: Number(id) } };
      }
    }
    const name = imported ? "Team_ideasService" : "TeamIdeasService";
    const app = adapter(fields, { [`../generated/services/${name}.ts`]: { [name]: NativeService } });
    assert.deepEqual(await app.loadIdeas(), [{ ID: 2, ...idea }, { ID: 1, ...idea }]);
    await app.createIdea(idea);
    await app.changeStatus(3, "Planned");
    assert.deepEqual(structuredClone(calls), [
      ["getAll", { top: 200, select: Object.values(fields) }],
      ["create", writeIdea(idea, fields)], ["update", "3", { [fields.Status]: "Planned" }],
    ]);
  }
});

test("the actual adapter rejects unbound/ambiguous services and propagates native failures rather than fake success", async () => {
  const fields = fieldsFromSchema(schema(true));
  const idea = { Title: "Offline test", Status: "New", Priority: "High" } as const;
  for (const response of [
    { success: false, error: { message: "Native connector denied access" } },
    { success: true },
  ]) {
    class NativeService {
      static async getAll() { return response; }
      static async create() { return response; }
      static async update() { return response; }
    }
    const modules = { "../generated/services/Team_ideasService.ts": { Team_ideasService: NativeService } };
    const app = adapter(fields, modules);
    const message = response.success ? /returned no result/ : /Native connector denied access/;
    await assert.rejects(app.loadIdeas(), message);
    await assert.rejects(app.createIdea(idea), message);
    await assert.rejects(app.changeStatus(1, "Planned"), message);
    await assert.rejects(adapter(fields, {}).loadIdeas(), /not configured unambiguously/);
    await assert.rejects(adapter(fields, {
      ...modules, "../generated/services/TeamIdeasService.ts": { TeamIdeasService: NativeService },
    }).loadIdeas(), /not configured unambiguously/);
    await assert.rejects(adapter(fields, {
      "../generated/services/UnrelatedService.ts": { UnrelatedService: NativeService },
    }).loadIdeas(), /not configured unambiguously/);
  }
});
