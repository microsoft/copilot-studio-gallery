import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

type DemoSubmission = {
  slug: string;
  name: string;
  description: string;
  tags: string[];
  author: string;
  authorGithub?: string;
  createdAt: string;
  featured?: boolean;
  kind: "agent" | "workflow" | "both";
  workflow?: string;
  trigger?: string;
  agent?: string;
  model?: string;
  steps: string[];
};

const demos: DemoSubmission[] = [
  {
    slug: "customer-support-triage",
    name: "Customer Support Triage",
    description: "Classifies incoming cases, drafts grounded answers, and routes high-risk issues to a human queue.",
    tags: ["support", "customer-service", "ai", "human-in-the-loop", "demo"],
    author: "Maya Chen",
    authorGithub: "mayachen",
    createdAt: "2026-08-13",
    featured: true,
    kind: "both",
    workflow: "Triage and route support cases",
    trigger: "When a support case is created",
    agent: "Support Triage Agent",
    model: "GPT-5",
    steps: ["Classify case", "Search knowledge", "Draft response", "Human review", "Update case"],
  },
  {
    slug: "sales-account-brief",
    name: "Sales Account Brief Generator",
    description: "Turns CRM history, open opportunities, and recent news into a concise pre-meeting account brief.",
    tags: ["sales", "crm", "research", "productivity", "demo"],
    author: "Jon Bell",
    authorGithub: "jonbell",
    createdAt: "2026-08-12",
    featured: true,
    kind: "both",
    workflow: "Prepare account brief",
    trigger: "Before a customer meeting",
    agent: "Account Research Agent",
    model: "Sonnet 4.6",
    steps: ["Load CRM account", "Find recent signals", "Summarize risks", "Create brief"],
  },
  {
    slug: "employee-onboarding-guide",
    name: "Employee Onboarding Guide",
    description: "Coordinates a new hire checklist and answers policy, benefits, and first-week questions.",
    tags: ["hr", "onboarding", "knowledge", "beginner", "demo"],
    author: "Priya Raman",
    authorGithub: "priyaraman",
    createdAt: "2026-08-10",
    kind: "both",
    workflow: "New hire onboarding",
    trigger: "When an employee joins",
    agent: "Onboarding Guide",
    model: "GPT-4.1",
    steps: ["Create checklist", "Provision access", "Send welcome plan", "Check progress"],
  },
  {
    slug: "incident-response-coordinator",
    name: "Incident Response Coordinator",
    description: "Collects service signals, assembles a response channel, and keeps stakeholders updated through resolution.",
    tags: ["it-ops", "incident-response", "teams", "automation", "demo"],
    author: "Elliot Stone",
    authorGithub: "elliotstone",
    createdAt: "2026-08-09",
    featured: true,
    kind: "both",
    workflow: "Coordinate service incident",
    trigger: "When an alert is escalated",
    agent: "Incident Coordinator",
    model: "GPT-5",
    steps: ["Collect telemetry", "Assess severity", "Open bridge", "Post updates", "Close incident"],
  },
  {
    slug: "contract-review-assistant",
    name: "Contract Review Assistant",
    description: "Extracts key clauses, flags policy deviations, and prepares a review packet for legal approval.",
    tags: ["document-ops", "legal", "compliance", "human-in-the-loop", "demo"],
    author: "Sofia Alvarez",
    authorGithub: "sofiaalvarez",
    createdAt: "2026-08-08",
    featured: true,
    kind: "both",
    workflow: "Review contract package",
    trigger: "When a contract is uploaded",
    agent: "Contract Review Agent",
    model: "Sonnet 4.6",
    steps: ["Extract clauses", "Compare playbook", "Score risk", "Request approval"],
  },
  {
    slug: "campaign-content-engine",
    name: "Campaign Content Engine",
    description: "Builds a channel-ready campaign kit from one brief with brand, audience, and approval controls.",
    tags: ["marketing", "content", "brand", "approval", "demo"],
    author: "Maya Chen",
    authorGithub: "mayachen",
    createdAt: "2026-08-07",
    kind: "both",
    workflow: "Create campaign content kit",
    trigger: "When a campaign brief is approved",
    agent: "Campaign Content Agent",
    model: "GPT-5",
    steps: ["Read brief", "Load brand voice", "Draft channels", "Review content", "Publish kit"],
  },
  {
    slug: "invoice-exception-handler",
    name: "Invoice Exception Handler",
    description: "Validates invoice data, resolves routine mismatches, and routes material exceptions for finance review.",
    tags: ["finance", "document-ops", "automation", "approval", "demo"],
    author: "Noah Williams",
    authorGithub: "noahwilliams",
    createdAt: "2026-08-06",
    kind: "workflow",
    workflow: "Resolve invoice exception",
    trigger: "When invoice validation fails",
    steps: ["Read invoice", "Match purchase order", "Classify exception", "Request approval", "Post result"],
  },
  {
    slug: "field-service-dispatch",
    name: "Field Service Dispatch",
    description: "Prioritizes service requests, finds the right technician, and keeps customers informed of arrival changes.",
    tags: ["operations", "field-service", "scheduling", "customer-service", "demo"],
    author: "Amina Yusuf",
    authorGithub: "aminayusuf",
    createdAt: "2026-08-05",
    kind: "workflow",
    workflow: "Dispatch field service visit",
    trigger: "When a service request is approved",
    steps: ["Assess request", "Find technician", "Reserve slot", "Notify customer"],
  },
  {
    slug: "knowledge-gap-finder",
    name: "Knowledge Gap Finder",
    description: "Analyzes unresolved conversations to identify missing articles and drafts evidence-backed outlines.",
    tags: ["knowledge", "support", "analytics", "ai", "demo"],
    author: "Priya Raman",
    authorGithub: "priyaraman",
    createdAt: "2026-08-04",
    kind: "agent",
    agent: "Knowledge Gap Analyst",
    model: "GPT-5",
    steps: ["Cluster questions", "Find missing topics", "Prioritize gaps", "Draft article outlines"],
  },
  {
    slug: "security-access-review",
    name: "Security Access Review",
    description: "Explains access anomalies, gathers manager evidence, and produces an auditable review decision.",
    tags: ["security", "it-ops", "compliance", "approval", "demo"],
    author: "Elliot Stone",
    authorGithub: "elliotstone",
    createdAt: "2026-08-03",
    kind: "both",
    workflow: "Quarterly access review",
    trigger: "On a quarterly schedule",
    agent: "Access Review Analyst",
    model: "Sonnet 4.6",
    steps: ["Load access list", "Detect anomalies", "Collect evidence", "Record decision"],
  },
  {
    slug: "store-feedback-analyzer",
    name: "Store Feedback Analyzer",
    description: "Summarizes store feedback, detects recurring product issues, and prepares action themes for operations.",
    tags: ["retail", "analytics", "customer-service", "beginner", "demo"],
    author: "Amina Yusuf",
    authorGithub: "aminayusuf",
    createdAt: "2026-08-02",
    kind: "agent",
    agent: "Feedback Insights Agent",
    model: "GPT-4.1",
    steps: ["Collect feedback", "Detect sentiment", "Group themes", "Recommend actions"],
  },
  {
    slug: "project-status-narrator",
    name: "Project Status Narrator",
    description: "Combines delivery signals into a plain-language status update with risks, decisions, and next actions.",
    tags: ["productivity", "project-management", "reporting", "beginner", "demo"],
    author: "Noah Williams",
    authorGithub: "noahwilliams",
    createdAt: "2026-08-01",
    kind: "workflow",
    workflow: "Generate weekly project update",
    trigger: "Every Friday",
    steps: ["Collect delivery signals", "Summarize progress", "Highlight risks", "Send update"],
  },
];

const root = process.cwd();

function xml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function graphFor(demo: DemoSubmission) {
  const types = ["start", "agent", "connector", "ifElse", "connector", "end"];
  const names = [demo.trigger ?? "Start", ...demo.steps, "Complete"];
  const nodes = names.map((name, index) => ({
    id: `node-${index + 1}`,
    name,
    type: types[index] ?? (index === names.length - 1 ? "end" : index % 2 ? "agent" : "connector"),
    position: { x: index * 240, y: index === 3 ? 90 : index === 4 ? -70 : 0 },
    data: {
      config: {
        displayName: name,
        operationType: index === 0 ? "trigger" : index === names.length - 1 ? "end" : "action",
      },
    },
  }));
  const edges = nodes.slice(1).map((node, index) => ({
    id: `edge-${index + 1}`,
    source: nodes[index].id,
    target: node.id,
  }));
  return { trigger: { metadata: { associatedData: { graph: { name: demo.workflow, nodes, edges } } } } };
}

async function write(path: string, content: string): Promise<void> {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, content);
}

for (const demo of demos) {
  const base = join(root, "submissions", demo.slug);
  await rm(base, { recursive: true, force: true });
  const uniqueName = `Demo_${demo.slug.replaceAll("-", "_")}`;
  const hasAgent = demo.kind !== "workflow";
  const hasWorkflow = demo.kind !== "agent";
  const rootComponents = [hasAgent ? `<RootComponent type="29" schemaName="${uniqueName}_agent" />` : "", hasWorkflow ? `<RootComponent type="29" schemaName="${uniqueName}_workflow" />` : ""].filter(Boolean).join("");

  await write(
    join(base, "metadata.json"),
    `${JSON.stringify({
      name: demo.name,
      description: demo.description,
      tags: demo.tags,
      author: demo.author,
      ...(demo.authorGithub ? { authorGithub: demo.authorGithub } : {}),
      createdAt: demo.createdAt,
      featured: demo.featured ?? false,
    }, null, 2)}\n`,
  );
  await write(
    join(base, "README.md"),
    `# ${demo.name}\n\n${demo.description}\n\n## How it works\n\n${demo.steps.map((step) => `- ${step}`).join("\n")}\n\n> Demo submission for gallery design and discovery testing.\n`,
  );
  await write(
    join(base, "solution", "solution.xml"),
    `<ImportExportXml><SolutionManifest><UniqueName>${uniqueName}</UniqueName><Version>1.0.0.0</Version><Publisher><PublisherName>CAT Gallery Demos</PublisherName></Publisher><LocalizedNames><LocalizedName description="${xml(demo.name)}" languagecode="1033" /></LocalizedNames><RootComponents>${rootComponents}</RootComponents></SolutionManifest></ImportExportXml>\n`,
  );
  await write(
    join(base, "solution", "customizations.xml"),
    hasWorkflow
      ? `<ImportExportXml><Workflows><Workflow><Name>${xml(demo.workflow ?? demo.name)}</Name><JsonFileName>workflow.json</JsonFileName><WorkflowId>${demo.slug}-workflow</WorkflowId></Workflow></Workflows></ImportExportXml>\n`
      : "<ImportExportXml />\n",
  );
  if (hasWorkflow) {
    await write(join(base, "solution", "Workflows", "workflow.json"), `${JSON.stringify(graphFor(demo), null, 2)}\n`);
  }
  if (hasAgent) {
    const schemaName = `${demo.slug.replaceAll("-", "_")}_agent`;
    await write(join(base, "solution", "bots", schemaName, "bot.xml"), `<Bot schemaname="${schemaName}"><name>${xml(demo.agent ?? demo.name)}</name></Bot>\n`);
    await write(
      join(base, "solution", "bots", schemaName, "configuration.json"),
      `${JSON.stringify({
        agentSettings: {
          model: { series: demo.model ?? "GPT-5" },
          instructions: { segments: [{ value: demo.description }] },
          channels: [{ channelId: "MsTeams" }],
        },
      }, null, 2)}\n`,
    );
  }
}

console.log(`Seeded ${demos.length} demo submissions.`);
