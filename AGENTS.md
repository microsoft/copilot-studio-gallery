## Development

When starting the dev server, use background mode:

```
astro dev --background
```

Manage the background server with `astro dev stop`, `astro dev status`, and `astro dev logs`.

Before building or serving the gallery, generate content from the exploded
submissions:

```bash
npm run import:submissions
npm test
npm run check
npm run build
```

Generated files under `src/content/solutions/`, `src/content/guides/`, and
`public/bundles/` come from `submissions/`; do not hand-edit them.

## Documentation

Full documentation: https://docs.astro.build

Consult these guides before working on related tasks:

- [Adding pages, dynamic routes, or middleware](https://docs.astro.build/en/guides/routing/)
- [Working with Astro components](https://docs.astro.build/en/basics/astro-components/)
- [Using React, Vue, Svelte, or other framework components](https://docs.astro.build/en/guides/framework-components/)
- [Adding or managing content](https://docs.astro.build/en/guides/content-collections/)
- [Adding styles or using Tailwind](https://docs.astro.build/en/guides/styling/)
- [Supporting multiple languages](https://docs.astro.build/en/guides/internationalization/)

## Important Notes

- One gallery entry represents one complete exploded Power Platform solution.
- Each submission lives at `submissions/<slug>/solution/` with gallery-only
  `metadata.json` and optional `README.md` beside it.
- Modern workflow exports include their saved canvas under an
  `associatedData.graph` object inside each `Workflows/*.json`. It contains the
  nodes, edges, handles, and x/y positions needed for an accurate preview.
- The first release rejects workflows without a saved graph rather than guessing
  a layout from executable actions.
- Agent architecture is derived from `bots/**` and `botcomponents/**`; component
  ownership must be resolved per agent rather than applying every solution
  component to every bot.
- Detail pages render the imported workflow and agent topology. Gallery cards
  instead show a fixed asset inventory for workflows, agents, tools, MCP
  servers, and skills so dense graphs are not compressed into unreadable
  thumbnails.
- The browser receives compact allowlisted graph data. Raw schemas, icons,
  environment connection identifiers, and source blobs stay out of generated
  content.
- Download ZIPs are deterministic rebuilds of the `solution/` contents at archive
  root; gallery sidecars are excluded. Downloads stay locked until the visitor
  acknowledges that community solutions should be reviewed and imported only
  from a trusted source.
