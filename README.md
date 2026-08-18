# CAT Agents & Workflows Gallery

A community gallery for complete **Copilot Studio agent and workflow
solutions**. Each entry is generated from an exploded Power Platform solution,
so visitors can inspect its agent architecture and saved workflow canvases before
downloading and importing it.

The site uses Astro, Tailwind CSS, React Flow, and static GitHub Pages deployment.

## Features

- Searchable, filterable gallery of complete solutions.
- One entry per solution, with Overview, Agents, Workflows, and Files tabs.
- Interactive agent architecture graphs showing agents, tools, skills, and
  connected-agent delegation.
- Interactive workflow previews rendered from each export's saved designer graph.
- Deterministic downloadable ZIP rebuilt from the submitted exploded solution.
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
