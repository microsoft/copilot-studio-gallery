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
  "description": "Agents and workflows for triage, policy review, and assisted resolution.",
  "tags": ["customer-service", "triage", "human-in-the-loop"],
  "author": "Your Name",
  "authorUrl": "https://github.com/your-login",
  "createdAt": "2026-08-12",
  "updatedAt": "2026-08-12",
  "featured": false
}
```

Required fields: `name`, `description`, `tags`, and `author`. Optional fields:
`authorUrl`, `authorGithub`, `createdAt`, `updatedAt`, and `featured`.

Solution identity, version, publisher, component counts, agents, and workflows
are derived from the exploded payload and cannot be overridden in metadata.

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
