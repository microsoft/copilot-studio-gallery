# CAT Agents & Workflows Gallery

A community gallery for complete **Copilot Studio agent and workflow
solutions**. Each entry is generated from an exploded Power Platform solution,
so visitors can inspect its agent architecture and saved workflow canvases before
downloading and importing it.

The site uses Astro, Tailwind CSS, React Flow, and static GitHub Pages deployment.

## Features

- Searchable gallery of complete solutions, filterable by agents or workflows,
  category, tag, contributor, and component types. The **Contains** filter requires
  every selected type: for example, MCP servers and Skills must both be present
  in the solution.
- Separate Microsoft and community browsing sections that stay in place during
  search and filtering, with their own matches and empty states. Homepage sorting
  applies to community solutions; the dedicated
  Microsoft listing has its own sort control. Both pages share the same search
  and filter controls, and their navigation links carry the active filters and
  sort order. Filters stay selected even when they have no Microsoft matches;
  counts and results reflect the gallery being viewed. The homepage's
  **View more** link sits beside the Microsoft solution count
  and appears only when the responsive preview leaves additional cards hidden.
- One entry per solution, with Overview and Files tabs. Agents and Workflows
  tabs appear only when those assets are present.
- Agent component tables listing each agent's tools, MCP servers, skills, and
  connected agents.
- An informational workflow table listing each workflow's trigger, steps,
  connector services, and agent calls, including inline agents.
  It shares the Agents roster's icon-led rows and typography, with step counts
  beneath workflow names. There is no second canvas or preview selector.
  On phones, rows stack into compact summaries.
- Every submission containing workflows must set `previewWorkflow` in
  `metadata.json` to a workflow ID or unique display name, even with only one
  workflow. CI rejects missing or invalid selections; there is no automatic
  default. Agent-only submissions omit this field.
- The hero renders each export's saved designer graph, preserving loop containers
  and parent-relative step positions. Zoom, full-screen viewing, and node details
  remain available, with agent steps showing their components on hover or select.
- Workflow nodes keep their submitted titles and separately identify connector
  services and trigger types (such as HTTP, email, or manual) from export metadata.
  Titles and metadata wrap without truncation. Missing types are explained once
  per workflow and in node details, never guessed from the step title.
- Deterministic downloadable ZIP rebuilt from the submitted exploded solution.
- Compact downloads near the top of narrow solution pages, with a visible trust
  checkbox and support disclaimer. The ZIP stays locked until the import warning
  is acknowledged. Microsoft-provided samples and community examples have distinct
  acknowledgement text; package metadata is available in the **Files** tab.
- Contributor directory, individual contributor profiles, and JSON catalog endpoint.
- Pull-request validation for metadata, solution structure, graph availability,
  unsafe filesystem entries, and generated output.

## Local development

```bash
npm install
npm run import:submissions
npm run dev
```

The site is configured for GitHub Pages at:

```text
http://localhost:4321/copilot-studio-gallery/
```

Useful commands:

```bash
npm test
npm run seed:demos
npm run check:submissions
npm run import:submissions
npm run astro -- check
npm run build
npm run preview
```

`npm run seed:demos` recreates the 12 deterministic demo submissions used to
develop and preview the gallery's category-led discovery experience.

## Submit a solution

Add one folder under [`submissions/`](submissions/) and open a pull request:

```text
submissions/<slug>/
├── metadata.json
├── README.md
└── solution/
    ├── solution.xml
    ├── customizations.xml
    ├── Workflows/
    ├── bots/
    └── ...
```

Submit the solution **exploded**, not as a ZIP. The gallery validates and
rebuilds the installable ZIP. See [CONTRIBUTING.md](CONTRIBUTING.md) for the full
contract.

## Deployment

Pull requests run validation, tests, type checks, and a production build.
Merges to `main` deploy the static site to:

<https://microsoft.github.io/copilot-studio-gallery/>

## License

[MIT](LICENSE)
