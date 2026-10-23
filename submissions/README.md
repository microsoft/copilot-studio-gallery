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

## Choose a hero workflow

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

## Choose a category

`category` in `metadata.json` is optional but recommended. It places your
solution under one of the gallery's category filters. Pick **one** value from
this fixed list (spelling and capitalization must match exactly). New values
can't be added in a submission yet. If none fits, use `Other` and suggest a
new category in your pull request.

Choose by **who uses the solution and which business activity it supports**,
not by the technology it uses or the industry it serves. Industries and
technologies such as `retail`, `sharepoint`, or `mcp` belong in `tags`.

| Category | Use it when the solution mainly serves… | Examples |
| --- | --- | --- |
| `Customer service` | Support and frontline teams helping customers | Case triage, store associate assistant |
| `Sales & marketing` | Sellers and marketers | Lead qualification, account briefs, RFP responses, campaign content |
| `IT & security` | IT, engineering, and security teams | Incident response, access reviews, telemetry analytics |
| `Operations` | Teams running day-to-day processes and intake | Request routing, field dispatch, governance front doors |
| `Project & communications management` | Project leads and people coordinating work | Meeting coordination, status reports, stakeholder updates |
| `HR` | HR teams, managers, and employees on people processes | Onboarding, welcome packets |
| `Finance` | Finance and accounts payable teams | Invoice processing, exception handling |
| `Legal & compliance` | Legal and compliance reviewers | Contract review, policy checks |
| `Productivity & knowledge` | Individuals working with email, calendar, documents, and knowledge | Email summaries, calendar management, research answers |
| `Agent Building` | Makers and developers learning to build and extend agents | Agent-building tutorials, hooks labs, reusable agent patterns |
| `Other` | None of the above fits | Mention the category you'd like in your pull request |

```json
"category": "Operations",
```

## More details

See the repository [contribution guide](../CONTRIBUTING.md) for metadata fields,
validation rules, and local commands.
