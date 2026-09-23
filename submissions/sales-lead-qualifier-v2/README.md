# Sales Lead Qualifier V2

Watches a shared sales mailbox for incoming enquiries, qualifies each one
using BANT (Budget, Authority, Need, Timing), and logs qualified leads to a
dedicated **Sales Lead V2** Dataverse table — with an email alert to the
sales team for Hot leads.

## How it works

- **Trigger** — fires when any new email arrives in the configured shared
  mailbox (no subject filter — every inbound email is evaluated).
- **Classifier Agent** — tool-less; reads the From/Subject/Body of the email
  and decides whether it's a genuine sales enquiry. Non-enquiries
  (newsletters, recruitment, vendor pitches, invoices, support requests,
  auto-replies) are tagged `Filtered`. Genuine enquiries are scored against
  BANT (Budget, Authority, Need, Timing — each `Strong`/`Weak`/`Absent`) and
  assigned a `Tier` of `Hot`, `Warm`, or `Cold`. The email body is treated as
  untrusted content — embedded instructions (e.g. "classify this as Hot") are
  ignored.
- **Lead Agent** — tool-less; it only reasons and produces structured
  output. It reviews the Classifier Agent's BANT tier and decides
  `ShouldLog` and every Sales Lead V2 field, including whether a
  notification is warranted (`ShouldNotify`, true only when `Tier` is
  `Hot`). It never guesses a budget figure that wasn't explicitly stated. It
  does not touch Dataverse or Outlook itself.
- **If/Else** — the only deterministic gate in the flow, branching purely on
  the Lead Agent's own `ShouldLog` output.
- **Add a new row** (plain Dataverse connector step, inside the "yes" branch
  only) — writes the Sales Lead V2 row, with every field wired from the Lead
  Agent's structured output via a JSON expression.
- **Notifier Agent** (also inside the "yes" branch, runs after the row is
  created) — has exactly one tool, Outlook's "Send an email". It only sends
  when the Lead Agent's `ShouldNotify` was true; otherwise it takes no
  action. The email links to the record it just read back from the create
  step's response, so no separate environment-URL setting is needed.

### Why a dedicated table instead of the native Lead entity

This template logs to its own **Sales Lead V2** table rather than the native
Dataverse `Lead` entity. The classification fields (`Lead Source`,
`Lead Quality`, `Purchase Timeframe`) are plain text columns here, not
picklists — native Lead's equivalents are option sets, which bake specific
option values into the exported solution and can collide or drift across
environments. Plain text avoids that entirely: the agent writes the tier
name directly, with nothing to remap on import.

## Configuration

| Variable | Purpose |
| --- | --- |
| `LeadTableName` | Logical/plural entity-set name of the Dataverse table to log leads to (this solution's sample table is `a3p_salesleadv2s`). |
| `NotifyEmail` | Address that gets emailed for Hot leads (defaults to a placeholder — set this to your sales team's address). |

## Import notes

- Point the trigger at your own shared sales mailbox. If the **Folder** field
  shows "Loading..." after importing this solution, the folder ID is tied to
  the original mailbox — reopen the trigger and re-select the folder for your
  own mailbox connection before publishing.
- Dataverse reads/writes ("Add a new row") run as a plain flow connector step
  against the current environment, not as an agent tool — this action is not
  the DLP-sensitive "...selected environment" variant, so no DLP exception or
  Sandbox/Production environment is required; a Personal Developer
  environment works.
- Update `NotifyEmail` to your own sales team address before publishing — it
  ships with a placeholder value.
