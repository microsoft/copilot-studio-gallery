# Contributing a solution

Contribute one complete Copilot Studio / Power Platform solution by adding an
exploded solution folder to `submissions/` and opening a pull request.

## Export and unpack

1. Export the solution from Power Platform as an **unmanaged** solution.
2. Unpack the exported ZIP with `pac solution unpack`, Power Platform CLI, or a
   standard ZIP tool.
3. Copy the unpacked files into `submissions/<slug>/solution/`.
4. Add the gallery sidecar files described below.

Do not submit a ZIP. Keeping the payload exploded makes agents, workflows,
connectors, and code reviewable in the pull request.

## Submission layout

```text
submissions/<slug>/
├── metadata.json          # required gallery metadata
├── README.md              # optional human-facing overview
└── solution/              # required exploded payload
    ├── solution.xml
    ├── customizations.xml
    ├── Workflows/*.json
    ├── bots/*/
    ├── botcomponents/*/
    └── ...other solution files
```

The slug must use lowercase letters, numbers, and single hyphens.

### `metadata.json`

```json
{
  "name": "Customer Service Operations",
  "previewWorkflow": "Triage incoming requests",
  "description": "Agents and workflows for triage, policy review, and assisted resolution.",
  "tags": ["customer-service", "triage", "human-in-the-loop"],
  "category": "Customer service",
  "author": "Your Name",
  "authorUrl": "https://github.com/your-login",
  "createdAt": "2026-08-12",
  "updatedAt": "2026-08-12",
  "featured": false
}
```

Required fields: `name`, `description`, `tags`, and `author` (or `authors`).
`previewWorkflow` is **mandatory for solutions containing one or more workflows**;
omit it for agent-only solutions.
Recommended: `category`. Optional fields: `authorUrl`, `authorGithub`,
`createdAt`, `updatedAt`, and `featured`. `hackathon` is set by maintainers.

To credit more than one person, replace `author`, `authorUrl`, and
`authorGithub` with an `authors` list. Each entry needs a `name` and can add a
`github` handle (used for the avatar and to group contributions on one
contributor page) and a `url`:

```json
"authors": [
  { "name": "Your Name", "github": "your-login" },
  { "name": "Teammate Name", "github": "teammate-login" },
  { "name": "Colleague Without GitHub" }
]
```

Every listed person gets their own avatar on the solution and their own
contributor page.

`category` is the one fixed category that best matches who uses the solution
and the business activity it supports: `Customer service`, `Sales & marketing`,
`IT & security`, `Operations`, `Project & communications management`, `HR`, `Finance`,
`Legal & compliance`, `Productivity & knowledge`, `Agent Building`, or `Other`. See
[Choose a category](submissions/README.md#choose-a-category) for who each one
is for. Contributors can't add new values yet: use `Other` and suggest one in
your pull request.
Use `tags` for anything more specific. Solutions
without a category still appear in the gallery, but not under category filters.

`featured: true` marks a solution as **Built by Microsoft**. Leave it `false`
unless the solution was built by a Microsoft team.

`hackathon` records a Copilot Studio Agents & Workflows Build-a-thon badge: `hacker` (built a
solution at the Build-a-thon) or `winner`. Maintainers set it during review, so
leave it out of your submission. Every credited author shows the badge on their
contributor page and in the contributors directory.

Every contributor automatically earns one **Copilot Studio Hatchling** badge
when their first solution is published. It appears alongside any Build-a-thon
awards on their profile and in the contributors directory; no metadata field is
needed. The badge links to their earliest published solution by `createdAt`,
with undated solutions after dated ones and ties resolved by name, then ID.
Demo-tagged submissions are not published and do not earn badges.

**Hook, Line & Sinker** automatically recognizes the current three published
solutions with the most hooks, including every solution tied at the third-place
cutoff. Only solutions with at least one hook qualify. Every credited author
receives a badge per qualifying solution, shown on their profile and in the
contributors directory. Rankings recalculate when the site rebuilds, so this is
not a permanent award. Hook counts come from distinct exported `AgentHook`
components owned by agents in the solution, not component names, tags, tool
filters, workflow steps, or the number of different hook event types.

Solution identity, version, publisher, agents, workflows, and their components
are derived from the exploded payload and cannot be overridden in metadata.
Whether a solution appears under Agents or Workflows comes from what it
contains. Designer notes in workflow canvases are not shown in the gallery.

#### Choose the hero workflow

Every solution containing workflows **must set `previewWorkflow`** in
`metadata.json`, even if it has only one workflow. Choose the workflow visitors
will see in the solution's top preview:

```json
"previewWorkflow": "Invoice Processing - Revised"
```

Use the exact workflow display name from `solution/customizations.xml`, or its
`WorkflowId` for a stable reference that survives display-name changes. IDs are
matched before names. Names must identify exactly one workflow; unknown or
ambiguous selections fail validation, as does selecting a workflow for an
agent-only solution.

**CI fails if a solution containing workflows omits `previewWorkflow` or leaves
it empty.** There is no automatic first-workflow fallback.

Omit the field for agent-only solutions, which show their agent overview.
The choice is gallery metadata only; it does not change the exported solution
or the download. This is the only workflow canvas on the page. The Workflows
tab lists every workflow's trigger, steps, connector services, and agent calls
without changing the hero.

### `README.md`

The optional README is written for gallery visitors. Explain the scenario,
agents, workflows, prerequisites, and import-time configuration. It becomes the
Overview tab and is never included in the downloadable solution ZIP.

## Workflow preview requirement

Each submitted `Workflows/*.json` must include the saved designer graph produced
by the modern workflow designer. The importer reads the graph's nodes, edges,
handles, and positions from the workflow JSON. A workflow without that graph
fails validation.

## Safety and privacy

- Remove secrets, tokens, customer data, tenant-specific email addresses, and
  other sensitive content before submitting.
- The repository never executes submitted solution code.
- Symlinks, path escapes, oversized files, and oversized payloads are rejected.
- The browser receives a compact normalized preview, not raw parameter schemas,
  icons, connection identifiers, or source blobs.
- The downloadable ZIP contains the submitted `solution/` contents verbatim, so
  review those files carefully.

## Validate locally

```bash
npm install
npm test
npm run check:submissions
npm run import:submissions
npm run astro -- check
npm run build
```

Copy [`submissions/_template/`](submissions/_template/) to start.

## Pull-request scope

Keep submission changes separate from site, importer, workflow, or repository
configuration changes. CI rejects mixed-scope pull requests unless maintainers
apply the `allow-mixed-changes` label.

By contributing, you agree that the submitted content is shared under this
repository's [MIT license](LICENSE).
