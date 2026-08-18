# Submit an exploded solution

Every gallery entry is one `submissions/<slug>/` folder containing:

```text
metadata.json
README.md          # optional
solution/          # complete exploded Power Platform solution
```

The `solution/` directory must contain `solution.xml` and `customizations.xml`.
It may include agents, workflows, connectors, connection references, code, and
other normal solution assets.

The importer derives the published agent and workflow previews and rebuilds a
deterministic `<slug>.zip` whose archive root is the contents of `solution/`.
Gallery sidecars are excluded.

See the repository [contribution guide](../CONTRIBUTING.md) for metadata fields,
validation rules, and local commands.
