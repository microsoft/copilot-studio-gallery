---
title: Sales Lead Qualifier V2
slug: sales-lead-qualifier-v2
solution: SalesLeadQualifier
---
Watches a shared sales mailbox for incoming enquiries, qualifies each one
using BANT (Budget, Authority, Need, Timing), and logs qualified leads
directly to a dedicated **Sales Lead V2** Dataverse table — with an email
alert to the sales team for Hot leads.

The workflow splits the work across three agents: a tool-less classifier, a
tool-less reasoning agent that decides what to log, and a single-tool
notifier — so no agent both reasons over untrusted email content and holds
broad write access at the same time.

## Agents

- **Classifier Agent** reads the From/Subject/Body of the email and decides
  whether it's a genuine sales enquiry. Non-enquiries (newsletters,
  recruitment, vendor pitches, invoices, support requests, auto-replies) are
  tagged `Filtered`. Genuine enquiries are scored against BANT (each
  `Strong`/`Weak`/`Absent`) and assigned a `Tier` of `Hot`, `Warm`, or
  `Cold`. It has no tools, so instructions hidden in the email body can't
  act on your mailbox or Dataverse.
- **Lead Agent** reviews the Classifier's BANT tier and decides `ShouldLog`
  and every Sales Lead V2 field, including whether a notification is
  warranted (`ShouldNotify`, true only when `Tier` is `Hot`). It never
  guesses a budget figure that wasn't explicitly stated. It also holds no
  tools — it only reasons and produces structured output; Dataverse and
  Outlook access live elsewhere.
- **Notifier Agent** has exactly one tool, Outlook's "Send an email". It
  only sends when the Lead Agent's `ShouldNotify` was true; otherwise it
  takes no action. The email links to the record it just read back from the
  create step's response, so no separate environment-URL setting is needed.

## How the workflow runs

Mail arriving in the shared mailbox starts the run (no subject filter —
every inbound email is evaluated). The Classifier Agent scores the enquiry,
and the Lead Agent turns that score into a logging decision. An If/Else
node — the only deterministic gate in the flow — branches purely on the Lead
Agent's `ShouldLog` output. On the "yes" branch, a plain Dataverse "Add a new
row" step writes the Sales Lead V2 row with every field wired from the Lead
Agent's structured output, then the Notifier Agent runs and emails the sales
team if `ShouldNotify` was true.

## Configuration

| Variable | Purpose |
| --- | --- |
| `LeadTableName` | Logical/plural entity-set name of the Dataverse table to log leads to (this solution's sample table is `a3p_salesleadv2s`). |
| `NotifyEmail` | Address that gets emailed for Hot leads (defaults to a placeholder — set this to your sales team's address). |

## Customizations

- **Why a dedicated table instead of the native Lead entity** — this
  template logs to its own Sales Lead V2 table rather than the native
  Dataverse `Lead` entity. The classification fields (`Lead Source`,
  `Lead Quality`, `Purchase Timeframe`) are plain text columns here, not
  picklists — native Lead's equivalents are option sets, which bake specific
  option values into the exported solution and can collide or drift across
  environments. Plain text avoids that: the agent writes the tier name
  directly, with nothing to remap on import.
- **BANT criteria and tiers** — adjust the Classifier Agent's scoring rules
  or tier names; keep the Lead Agent's logic in sync if you rename a tier.
- **Which tiers notify** — only Hot triggers an email today; Warm is a
  one-line change in the Lead Agent's `ShouldNotify` logic.
- **Logged fields** — extend the Sales Lead V2 table and the Lead Agent's
  structured output together if you want to capture more than BANT plus
  source/quality/timeframe.

## Prerequisites

- A Dataverse table to log leads to (sample: `a3p_salesleadv2s`), with text
  columns for Lead Source, Lead Quality, and Purchase Timeframe alongside
  the BANT fields.
- Office 365 Outlook connection for the mailbox trigger and the Notifier
  Agent's send step.
- Dataverse reads/writes ("Add a new row") run as a plain flow connector
  step against the current environment, not as an agent tool — this is not
  the DLP-sensitive "...selected environment" variant, so no DLP exception
  or Sandbox/Production environment is required; a Personal Developer
  environment works.

## Import

Download the rebuilt solution ZIP from this page and import it through
Power Platform. Point the trigger at your own shared sales mailbox — if the
**Folder** field shows "Loading..." after importing, reopen the trigger and
re-select the folder for your own mailbox connection before publishing.
Then set `NotifyEmail` to your own sales team address before turning the
workflow on.
