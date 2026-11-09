# Submit a sample

Each entry is one `submissions/<slug>/` folder with gallery metadata and one
source format:

| Sample | Source directory | Documentation |
| --- | --- | --- |
| Managed app | `app/` with `submissionType: "managed-app"` | Required `README.md`; screenshots strongly recommended |
| Agents and/or workflows in a Power Platform solution | Complete exploded `solution/` | Optional `README.md`, recommended for prerequisites and configuration |

Start with the [contribution guide](../CONTRIBUTING.md) for repository setup,
preparation, metadata, local checks, fresh-environment testing, and pull requests.
Do not submit ZIPs or combine both source formats in one entry.

## Submit a managed app

```text
metadata.json      # submissionType: "managed-app", including connector setup
README.md          # required visitor overview and data requirements
app/               # portable source, package.json, npm lockfile, and license
screenshots/       # optional PNGs
```

Start with local code-first source or use the native CLI to clone an existing
platform-managed app, then run `npm run prepare:app` from the gallery checkout.
Complete the generated metadata and README, and declare every connector and its
exact data requirements. App version comes from `app/package.json`.

Follow [Contributing a managed app](../CONTRIBUTING.md#contributing-a-managed-app)
and the [app contract and lifecycle](../docs/managed-apps.md). See
[Team Ideas Board](team-ideas-board/) for a working example.

## Submit an exploded solution

Every solution entry is one `submissions/<slug>/` folder containing:

```text
metadata.json
README.md          # optional
solution/          # complete exploded Power Platform solution
```

The `solution/` directory must contain `solution.xml` and `customizations.xml`.
It may include agents, workflows, connectors, connection references, code, and
other normal solution assets.

Submit complete workflow exports, not just saved canvas graphs. Each workflow
needs its executable definition, typed triggers/actions, and an unambiguous
`customizations.xml` mapping to its file and workflow identity. CI rejects
missing local files/owners and malformed graph references. Passing these
structural checks is not proof of successful import or runtime behavior.

The importer derives the published agent and workflow previews and rebuilds a
deterministic `<slug>.zip` whose archive root is the contents of `solution/`.
Gallery sidecars are excluded.

Follow [Contributing a solution](../CONTRIBUTING.md#contributing-a-solution)
for export/unpack steps and the fresh-environment import requirement.

### Choose a hero workflow

`previewWorkflow` in `metadata.json` is **mandatory whenever the solution
contains workflows**, including a solution with only one workflow. It selects
the workflow shown in the solution's top preview:

```json
"previewWorkflow": "Invoice Processing - Revised"
```

Use a `WorkflowId` or an exact, unique workflow display name from
`solution/customizations.xml`. IDs stay stable when display names change.
Replace the template placeholder with your selection.

**CI fails if the required selection is missing, empty, unknown, or ambiguous.**
Both `npm run check:submissions` and `npm run import:submissions` enforce this
rule; there is no automatic first-workflow fallback. For agent-only solutions,
remove `previewWorkflow` entirely.

## Supporting files

Both apps and solutions can offer optional data files separately from their
install/source ZIP. Put them in `submissions/<slug>/supporting/` and declare only
the files you want published in `metadata.json`:

```json
"supportingFiles": [
  {"path": "supporting/sample-data.csv", "label": "Synthetic sample data"}
]
```

Only UTF-8 **CSV, JSON, and plain text (.txt)** are accepted. Use lowercase
letters, digits, and hyphens in filenames. At most five files, 512 KiB each,
2 MiB total. Files must be nonempty; JSON must parse, and CSV must have unique,
nonempty headers and a consistent column count. Use commas, not `sep=` delimiter
directives. Header-only CSVs are allowed as empty data templates. Spreadsheet formulas are not
allowed: cells must not begin with `=`, `+`, `-`, or `@`, including after
whitespace. Scripts, HTML, SVG, archives, binaries, and symbolic links are not
accepted as supporting files. These restrictions are not a security audit;
review the data before importing it into another system.

Use synthetic or properly redacted data, never private records or credentials.
Files are never executed, installed, or imported automatically. Only declared
files are published, as separate content-addressed downloads.

Link a declared file in your README using an inline relative Markdown link:
`[Download sample data (CSV)](supporting/sample-data.csv)`. The gallery rewrites
that link to the published asset; GitHub keeps the original relative link.
Explain any list/table schema separately: CSV imports do not guarantee the
internal column names, data types, defaults, or required fields an app needs.

## Choose a category

`category` in `metadata.json` is optional but recommended. It places your
app or solution under one of the gallery's category filters. Pick **one** value from
this fixed list (spelling and capitalization must match exactly). New values
can't be added in a submission yet. If none fits, use `Other` and suggest a
new category in your pull request.

Maintainer changes to the category vocabulary, metadata contract, or recognition
fields require the `allow-metadata-changes` PR label. Layout, behavior, tooling,
and CI changes require the separate `allow-site-changes` label; PRs affecting
both need both. Neither label bypasses content validation or builds. See
[Pull-request scope](../CONTRIBUTING.md#pull-request-scope) for exact boundaries.

Choose by **who uses the sample and which business activity it supports**,
not by the technology it uses or the industry it serves. Industries and
technologies such as `retail`, `sharepoint`, or `mcp` belong in `tags`.

| Category | Use it when the sample mainly serves… | Examples |
| --- | --- | --- |
| `Customer service` | Support and frontline teams helping customers | Case triage, store associate assistant |
| `Sales & marketing` | Sellers and marketers | Lead qualification, account briefs, RFP responses, campaign content |
| `IT & security` | IT, engineering, and security teams | Incident response, access reviews, telemetry analytics |
| `Operations` | Teams running day-to-day business processes and logistics | Request routing, field dispatch, fulfilment |
| `Project & communications management` | Project leads and people coordinating work | Meeting coordination, status reports, stakeholder updates |
| `HR` | HR teams, managers, and employees on people processes | Onboarding, welcome packets |
| `Finance` | Finance and accounts payable teams | Invoice processing, exception handling |
| `Legal & compliance` | Legal and compliance reviewers | Contract review, policy checks |
| `Productivity & knowledge` | Individuals working with email, calendar, documents, and knowledge | Email summaries, calendar management, research answers |
| `Agent Building` | Makers and developers learning to build and extend agents | Agent-building tutorials, hooks labs, reusable agent patterns |
| `Governance` | CoE teams and platform owners managing agent adoption and oversight | Agent idea intake, reuse reviews, agent inventories, CoE approvals |
| `Other` | None of the above fits | Mention the category you'd like in your pull request |

The gallery uses shorter filter labels: Sales, Service, Productivity, Build,
Govern, HR, Finance, Legal, IT, and Operations. Only the first five are fixed
shortcuts in the top row; the remaining categories are available in Filters and
appear as removable chips when selected. Both `Project & communications
management` and `Productivity & knowledge` appear under Productivity. Keep using
the exact metadata values above; `Other` and uncategorized submissions remain
visible under All without a dedicated category filter.

```json
"category": "Operations",
```

## More details

See the repository [contribution guide](../CONTRIBUTING.md) for metadata fields,
validation rules, and local commands.
