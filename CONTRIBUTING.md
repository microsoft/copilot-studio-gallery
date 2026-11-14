# Contributing a sample

Share one complete sample per `submissions/<slug>/` folder. Choose its format,
prepare the source, add gallery metadata and documentation, validate it, and
open a pull request.

| Your sample | Source to submit | Preparation |
| --- | --- | --- |
| A managed app built with code, Cowork, or Copilot Studio | Portable source in `app/`, with `submissionType: "managed-app"` | [Contributing a managed app](#contributing-a-managed-app) |
| Agents and/or workflows in a Power Platform solution | Complete exploded export in `solution/`; omit `submissionType` or use `"solution"` | [Contributing a solution](#contributing-a-solution) |

Both formats use the same [gallery metadata](#shared-gallery-metadata),
[local checks](#validate-locally), and [pull-request process](#open-a-pull-request).
Each has its own fresh-environment test. Do not submit a ZIP, a deployed app's
identity, or a mixture of `app/` and `solution/` in one entry.

## Start in the gallery repository

Fork this repository, clone your fork, and create a contribution branch. From
the gallery checkout, install its dependencies:

```bash
npm ci
```

The gallery requires Node >=22.12. App source export and testing also require
the [managed app CLI prerequisites](docs/managed-apps.md#contribute-an-app),
including Node >=24.11 and compatible Git/Git Credential Manager.

Use a unique slug containing lowercase letters, numbers, and single hyphens.
Prepare only the source format that matches your sample below.

## Contributing a managed app

1. Start with local app source built with code, or clone an existing app's
   platform-managed repository using the native CLI. Keep this source outside
   the gallery checkout. Follow the
   [app source preparation instructions](docs/managed-apps.md#contribute-an-app);
   play access alone does not grant source export/edit access.
2. From the gallery checkout, review and prepare its portable source:

   ```bash
   npm run prepare:app -- /path/to/your-app-source my-app --dry-run
   npm run prepare:app -- /path/to/your-app-source my-app
   ```

3. Replace the generated metadata and README placeholders. Keep
   `submissionType: "managed-app"` and declare **every** required connector,
   logical data source, table/schema, and setup instruction. Do not copy
   original deployment bindings or credentials.
4. Include the app's `package.json`, npm lockfile, and source license.
   The supported build produces `dist/index.html`. Review all source files;
   the preparation helper is not a secret scanner or a portability guarantee.
5. Write the required README for visitors: purpose, usage, data requirements,
   permissions, limitations, and customization. Screenshots are strongly
   recommended; declare the primary PNG in metadata for the gallery preview.
   Keep installation and CLI steps in the
   [shared app guide](docs/managed-apps.md#install-an-app), not each app README.
6. Run the [shared local checks](#validate-locally), then
   [test in a fresh managed app](#test-in-a-fresh-environment) before opening
   your pull request.

```text
submissions/<slug>/
├── metadata.json          # required; submissionType: "managed-app"
├── README.md              # required visitor overview
├── app/                   # portable application source
│   ├── package.json
│   ├── package-lock.json
│   ├── LICENSE
│   └── ...source files
└── screenshots/           # optional PNGs
```

See the [complete app contract](docs/managed-apps.md#contribute-an-app) for
connector and screenshot metadata, or [Team Ideas Board](submissions/team-ideas-board/)
for a working example. Gallery ingestion never installs or executes app code.

## Contributing a solution

Contribute one complete Copilot Studio / Power Platform solution by adding an
exploded solution folder to `submissions/` and opening a pull request.

### Export and unpack

1. Export the solution from Power Platform as an **unmanaged** solution.
2. Unpack the exported ZIP with `pac solution unpack`, Power Platform CLI, or a
   standard ZIP tool.
3. Copy the unpacked files into `submissions/<slug>/solution/`.
4. Add the gallery sidecar files described below.

Start from [`submissions/_template/`](submissions/_template/), replacing its
placeholders. Keeping the payload exploded makes agents, workflows, connectors,
and code reviewable in the pull request.

### Submission layout

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

Set `previewWorkflow` whenever the solution contains workflows, and ensure each
workflow includes its saved designer graph. See
[Solution workflow previews](#solution-workflow-previews) below.
Run the [shared local checks](#validate-locally), then
[test in a fresh environment](#test-in-a-fresh-environment) before opening your
pull request.

### Solution workflow previews

These requirements apply only to solutions. Apps use screenshots instead.

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

#### Saved designer graph

Each submitted `Workflows/*.json` must include the saved designer graph produced
by the modern workflow designer. The importer reads the graph's nodes, edges,
handles, and positions from the workflow JSON. A workflow without that graph
fails validation.

The graph is a preview, not the executable workflow. Submit the full export,
including `properties.definition` (or `definition`) with typed triggers and
actions. Graph-only JSON fails validation. Nested actions and their local
`runAfter` references must be structurally valid.

Every workflow file must have exactly one mapping in `customizations.xml`,
including its `Name`, `WorkflowId`, and `JsonFileName`. Missing files, duplicate
identities/mappings, unsafe paths, dangling graph edges, and component
`parentbotid` references to missing local bots fail validation. Connected-agent
targets may be external; they are not treated as missing local parent bots.
These checks do not certify Power Platform importability or runtime behavior.

## Shared gallery metadata

Both formats require `metadata.json` beside their source directory. Use these
shared fields; apps also need the
[app setup metadata](docs/managed-apps.md#contribute-an-app).

```json
{
  "name": "Customer Service Operations",
  "description": "Help service teams triage requests, review policies, and resolve cases.",
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

Every listed person gets their own avatar on the sample and their own
contributor page.

`category` is the one fixed category that best matches who uses the sample
and the business activity it supports: `Customer service`, `Sales & marketing`,
`IT & security`, `Operations`, `Project & communications management`, `HR`, `Finance`,
`Legal & compliance`, `Productivity & knowledge`, `Agent Building`, `Governance`, or `Other`. See
[Choose a category](submissions/README.md#choose-a-category) for who each one
is for. Contributors can't add new values yet: use `Other` and suggest one in
your pull request.
Use `tags` for anything more specific. Submissions
without a category still appear in the gallery, but not under category filters.

`featured: true` marks a sample as **Built by Microsoft**. Leave it `false`
unless the sample was built by a Microsoft team.

`hackathon` records a Copilot Studio Agents & Workflows Build-a-thon badge: `hacker` (built a
solution at the Build-a-thon) or `winner`. Maintainers set it during review, so
leave it out of your submission. Every credited author shows the badge on their
contributor page.

Every contributor automatically earns one **Copilot Studio Hatchling** badge
when their first app or solution is published. It appears alongside any Build-a-thon
awards on their profile; no metadata field is
needed. The badge links to their earliest published submission by `createdAt`,
with undated submissions after dated ones and ties resolved by name, then ID.
Demo-tagged submissions are not published and do not earn badges.

**Hook, Line & Sinker** automatically recognizes the current three published
solutions with the most hooks, including every solution tied at the third-place
cutoff. Only solutions with at least one hook qualify. Every credited author
receives a badge per qualifying solution, shown on their profile.
Rankings recalculate when the site rebuilds, so this is
not a permanent award. Hook counts come from distinct exported `AgentHook`
components owned by agents in the solution, not component names, tags, tool
filters, workflow steps, or the number of different hook event types.

Solution identity, version, publisher, agents, workflows, and their components
are derived from the exploded payload and cannot be overridden in metadata.
Whether a solution appears under Agents or Workflows comes from what it
contains. Designer notes in workflow canvases are not shown in the gallery.
App version comes from `app/package.json`; apps appear under Apps without
requiring solution identity or agent/workflow graphs.

ZIP hashes and public download counts are generated, not contributor-authored
metadata. Release-asset counts are collected on the bot-owned `download-stats`
branch and joined into submission detail pages when the site builds. Do not add
or edit counters in `metadata.json`; see [Gallery analytics](docs/analytics.md#release-backed-zip-counts).

## Write the visitor overview

`README.md` becomes the Overview tab and stays outside the downloadable source
or solution ZIP.

| Format | README requirement | What to explain |
| --- | --- | --- |
| Managed app | Required; screenshots strongly recommended | Purpose, usage, exact data structures, permissions, limitations, and customization; use the shared guide for installation |
| Solution | Optional, recommended | Scenario, agents/workflows, prerequisites, and import-time configuration |

Both formats can offer optional [supporting data files](submissions/README.md#supporting-files)
in CSV, JSON, or plain-text format. These are separate downloads, not included
in the payload ZIP or imported automatically.

## Safety and privacy

- Remove secrets, tokens, customer data, tenant-specific email addresses, and
  other sensitive content before submitting.
- Gallery validation never executes submitted solution or app code or installs
  app dependencies. Fresh-app testing is a separate, intentional execution step.
- Symlinks, path escapes, oversized files, and oversized payloads are rejected.
- The browser receives a compact normalized preview, not raw parameter schemas,
  icons, connection identifiers, or source blobs.
- Review the source under `app/` or `solution/` carefully: it is the payload
  visitors receive, not just the normalized gallery preview.

## Validate locally

```bash
npm run check:submissions
npm run import:submissions
npm test
npm run check
npm run build
```

Run these commands from the gallery checkout for **either** format. Fix every
failure before submitting. Generated files under `src/content/solutions/`,
`src/content/guides/`, and `public/bundles/` come from the importer; do not
hand-edit them.

## Test in a fresh environment

Local gallery checks validate packaging and metadata, not whether the sample
works for another user.

| Format | Required test |
| --- | --- |
| Managed app | Create a fresh platform-managed app from the submitted source with only its documented prerequisites, regenerate native data-source clients, and verify authenticated preview and intended connector operations. Follow [Testing before publication](docs/managed-apps.md#testing-before-publication); a new submission's public `main` template is not available before merge. |
| Solution | Import the same submitted solution payload into a fresh environment containing only its documented prerequisites, without skipping dependency checks. |

Complete the matching attestation in the
[pull-request template](.github/pull_request_template.md). For apps, also
complete its source/privacy review checklist. No test report or screenshot is
required. Fresh-environment attestations do not apply to site or repository-only
changes.

## Open a pull request

Commit the submission source, metadata, and documentation on your fork's
contribution branch, push it, and open a pull request to this repository's
`main`. Describe the sample and its prerequisites, complete the attestation
for its format, and mark the other format's section N/A. Check that CI passes
and respond to review feedback before merge.

### Pull-request scope

Ordinary contributions change one `submissions/<slug>/` entry, optionally with
its regenerated outputs. Choose an existing category and use only documented
metadata fields. Do not edit generated files by hand.

Repository-wide and maintainer-owned changes require explicit PR labels:

| Label | Required for |
| --- | --- |
| `allow-metadata-changes` | Changing the category vocabulary or metadata contract in `src/lib/submissionMetadata.ts`, shared submission guidance in `submissions/README.md`, template metadata, or existing `featured` / `hackathon` values. Newly granting these distinctions also requires this label. |
| `allow-site-changes` | Changing layout, behavior, graph schemas, importer logic, tests, tooling, installers, workflows, configuration, or other repository files, including `CONTRIBUTING.md`. |

These are independent approvals, required even on PRs without submissions.
A PR affecting both boundaries needs **both** labels. For example, expanding the
category vocabulary and updating the filter UI needs both. Selecting an existing
category or preserving an existing award during an ordinary submission update
needs neither. An omitted `featured` value is equivalent to `false`.

Multi-entry metadata/README maintenance needs `allow-metadata-changes`;
multi-entry payload maintenance needs `allow-site-changes`. Changes to privileged
metadata still require the metadata label even when site changes are authorized.
The old `allow-mixed-changes` label no longer grants an exception.

Maintainers apply these labels using GitHub's repository permissions. Labels
authorize the **scope of changes**, not invalid content: unsupported metadata,
malformed payloads, broken references, failing tests, and build errors remain
blocking. New metadata fields or category values require a valid schema update,
not just a label.

### What CI checks

The required `Guard pull request scope` status evaluates actual PR files and
base/head metadata using trusted base-branch code. It reads PR data through the
GitHub API and writes the result to the PR's head commit; it does not check out
or execute contributor code. Adding/removing a label reruns the policy.

The normal PR workflow validates submissions, tests the repository, regenerates
gallery content for **forks and internal PRs**, type checks, and builds. Only
internal PRs with changes under `submissions/<slug>/` automatically commit
regenerated content. Repository-only PRs regenerate for validation and builds
without committing unrelated stale outputs; generated-only edits remain blocked.
Deployment regenerates content from source again.

Existing repository-owned graph-only demos are exempted only by exact
slug/path/content fingerprints while designated as demos. Adding a `demo` tag,
copying a demo to a new slug, or changing an exempt workflow does not grant an
exception. Test fixtures use minimal executable definitions; their preview
graphs remain reduced test data.

CI checks structural consistency, not a successful fresh-environment import,
functional usefulness, or security approval. Contributors remain responsible
for fresh-environment testing; Copilot and maintainers review claims, permissions,
dependencies, and limitations.

### Minimal content review

The [Copilot review instructions](.github/instructions/submission-review.instructions.md)
limit solution content review to changed agent/workflow definitions, including
their instructions, skills, hooks, and tool bindings. README and metadata provide
context; reviewers do not audit the entire exploded solution or its attachments.
This is not a full-payload secret scan or a review of managed app implementations.

[Managed-app review instructions](.github/instructions/managed-app-review.instructions.md)
separately cover changed app source and directly relevant configuration, using
static review only. Review automation must not install or run submitted apps.

Describe the submission as a sample, not production-ready. For healthcare,
financial, legal, or other high-stakes use, include a visitor-facing disclaimer
that outputs are illustrative, may be incorrect, are not professional advice,
and require qualified human review before real-world use. An absent README
does not waive these disclosures; put them in the visitor-facing overview.

The remaining review bar is no embedded secrets/private data in reviewed
definitions, disclosed consequential actions and data destinations with
appropriate safeguards, honest capability claims, and documented essential
prerequisites. Copilot should report concrete evidence, not style preferences
or speculative concerns. Maintainers retain the publication decision.

### Policy activation

The trusted policy workflow activates once present on the default branch.
When first introducing or changing that policy, maintainers must review the
bootstrap PR directly; a PR cannot activate its own new trusted policy.

### Shared contributor PR task queue

The **Submission PR tasks** workflow maintains one **Submission next steps**
comment per open, non-draft contribution PR. It separates contributor tasks,
maintainer tasks, and waiting on automation, with links to the relevant review
threads and CI runs. No individual maintainer is automatically assigned.
Site/layout, dependency, repository-maintenance, and mixed site/submission PRs
remain outside this queue. Multi-entry submission mistakes remain visible.

| Queue label | Who acts next |
| --- | --- |
| [`needs-contributor`](https://github.com/microsoft/copilot-studio-gallery/pulls?q=is%3Apr+is%3Aopen+label%3Aneeds-contributor) | Contributor: fix or discuss findings, correct scope, update the branch, or complete the matching test attestations. |
| [`needs-maintainer`](https://github.com/microsoft/copilot-studio-gallery/pulls?q=is%3Apr+is%3Aopen+label%3Aneeds-maintainer) | Maintainer: inspect/authorize fork CI, request a missing Copilot review, follow up on fixes/disputed findings, or formally approve. |
| [`awaiting-copilot`](https://github.com/microsoft/copilot-studio-gallery/pulls?q=is%3Apr+is%3Aopen+label%3Aawaiting-copilot) | A native review of the current revision is still needed; the comment says whether a review must be requested. |
| [`ready-for-merge`](https://github.com/microsoft/copilot-studio-gallery/pulls?q=is%3Apr+is%3Aopen+label%3Aready-for-merge) | Maintainer: perform the final review and merge manually if satisfied. This label is not an approval or a bypass. |

Contributor and maintainer tasks can coexist. A new push needs fresh evidence;
an old finding is neither automatically still valid nor automatically fixed.
Copilot can resolve its own addressed findings on rereview; humans retain
responsibility for their discussions and disputed findings. Missing CI is not
reported as failing code when the run is actually waiting for authorization.
The bot reads checked attestations, not proof that an import or authenticated
app test occurred. It does not add a new attestation enforcement check.

The coordinator reads GitHub metadata and small submission metadata JSON files
through the API; it never checks out contributor code, installs dependencies,
downloads run artifacts, approves CI, submits reviews, or merges. The existing
CI authorization policy remains unchanged. It updates on PR lifecycle/body
changes and CI/policy completion, with scheduled reconciliation every 15 minutes
for review/thread changes and external checks. Scheduled jobs can be delayed by
GitHub; always use the live merge box, not an old label, as the final authority.
The comment names the assessed head/base. API failures withdraw prior readiness,
invalidate an existing comment where possible, and fail the workflow visibly.

#### Maintainer setup and rollout

1. Human-review and merge the infrastructure change first. The workflow executes
   only trusted `main` code and cannot activate itself from a PR. Merging enables
   its event/scheduled updates; it creates missing queue labels as needed. Its
   token needs contents/Actions/checks/status read and pull-request write access
   for comments and labels, not Actions write, review approval, or merge calls.
   If repository/organization policy denies those permissions, an admin must
   resolve that policy explicitly; the workflow fails rather than weakening it.
2. Ask a repository admin to edit the existing
   [automatic Copilot review rule](https://github.com/microsoft/copilot-studio-gallery/rules/26852430)
   and enable **Review new pushes**. Current maintain access is not admin access.
   This native setting applies throughout the rule's repository-wide scope,
   while this queue handles contribution PRs only. Leave formal Copilot approvals,
   human-review requirements, and fork-workflow authorization policies unchanged.
3. Preview the backlog from **Actions > Submission PR tasks > Run workflow** with
   **dry_run** enabled. To publish the shared checklists, rerun with **dry_run**
   disabled; optionally specify one **pr_number**. Equivalent commands:

   ```sh
   gh workflow run submission-pr-status.yml -f dry_run=true
   gh workflow run submission-pr-status.yml -f pr_number=100 -f dry_run=false
   ```

4. On existing PRs, request a native Copilot rereview if the current head has none,
   inspect and authorize outstanding fork CI runs individually, then follow the
   comment's remaining human-review tasks. Resolve an addressed human thread
   rather than asking the contributor to repeat an already supplied remedy.
   Do not assume enabling push reviews retroactively reviews the backlog.

For local read-only inspection using Node 24, set `GH_TOKEN`,
`GITHUB_REPOSITORY`, and optionally `PR_NUMBER`, then run
`node scripts/submission-pr-status.ts --dry-run`. No repository dependencies are
needed for the coordinator. Do not run it locally without `--dry-run`; published
comments are deliberately recognized only when authored by `github-actions[bot]`.

By contributing, you agree that the submitted content is shared under this
repository's [MIT license](LICENSE).
