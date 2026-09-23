---
title: Invoice Processing V2
slug: invoice-processing-v2
solution: Invoiceprocessing
---
Watches a shared mailbox for incoming invoices, extracts the invoice data from
each attachment (PDF or image), and logs it to a Dataverse table with
duplicate detection — no manual data entry required.

## How it works

- **Trigger** — fires when a new email arrives in the configured shared
  mailbox, filtered to subjects containing "invoice" and only when the email
  has attachments.
- **Loop** — iterates once per attachment on the incoming email, so the
  Extract node and Ledger Agent process each invoice separately.
- **Extract** (built-in extraction node) — reads the attachment content and
  extracts `Vendor`, `InvoiceNumber`, `InvoiceDate`, `Currency`, `AmountDue`,
  and `ExtractionStatus` (`Complete`/`Partial`/`Failed`) as structured output.
  Leaves a field blank rather than guessing when it can't be found, and treats
  attachment content as untrusted, ignoring any instructions embedded in it.
- **List rows** (plain Dataverse connector step) — queries the configured
  table for any existing row whose invoice number matches this attachment's,
  feeding the duplicate check below. Runs unconditionally, before the agent.
- **Ledger Agent** — tool-less; it only reasons and produces structured
  output. It reviews the Extract node's fields and the List rows result, then
  decides `ShouldLog` and every field value for the row, including
  `DuplicateOf` when a match was found. It does not touch Dataverse itself —
  whether a row actually gets written depends entirely on this decision.
- **If/Else** — the only deterministic gate in the flow, branching purely on
  the Ledger Agent's own `ShouldLog` output.
- **Add a new row** (plain Dataverse connector step, inside the "yes" branch
  only) — writes the row, with every field wired from the Ledger Agent's
  structured output via a JSON expression.

Attachments the Extract node can't read as an invoice (`ExtractionStatus:
Failed`) still get evaluated by the Ledger Agent rather than being silently
dropped — it decides whether that still warrants a row.

### Why Dataverse runs as plain steps, not agent tools

Invoking Dataverse's "List rows"/"Add a new row" actions as Copilot Studio
agent tools currently fails on every tested environment and tenant with
`400: Invalid organization URL` — a platform-level issue in how that
connector resolves the caller's org for agent-tool invocations, not a
configuration mistake. The identical actions succeed immediately as plain
flow connector steps, which is why this template reads and writes Dataverse
with plain nodes and lets the agent only make the logging decision.

## Configuration

| Variable | Purpose |
| --- | --- |
| `InvoiceTableName` | The Dataverse table's logical/schema name (for example `a3p_invoiceledgerv2s`, not the display name "Invoice Ledgers V2"). There are no pickers on the canvas for this, so it must be typed exactly. |

## Import notes

- The workflow is named "Invoice Processing V2" (distinct from any V1 you may
  have imported) — Copilot Studio prefers the latest version when two
  workflows share a display name, which previously made V1 untestable
  alongside this one. If you still hit a naming collision, delete the older
  version before importing this one.
- Point the trigger at your own shared mailbox. If the **Folder** field shows
  "Loading..." after importing this solution, the folder ID is tied to the
  original mailbox — reopen the trigger and re-select the folder for your own
  mailbox connection before publishing.
- Create a Dataverse table to log invoices to, with columns matching the
  fields the Ledger Agent produces (`Invoice Number`, `Vendor`, `Invoice
  Date`, `Currency`, `Amount Due`, `Extraction Status`, `Attachment Name`,
  `Source Email Id`, `Received On`, `Duplicate Of`, and a record-name column
  for the "New column"/`RecordName` field), and set `InvoiceTableName` to its
  logical/plural name (Dataverse's Web API needs the plural entity-set name,
  e.g. `a3p_invoiceledgerv2s`, not the singular schema name). If you've
  already imported an earlier version of this table (e.g. from V1), give the
  new one a distinct logical name to avoid a naming collision.
- Dataverse reads/writes ("List rows" / "Add a new row") run as plain flow
  connector steps against the current environment, not as agent tools — see
  "Why Dataverse runs as plain steps" above. No DLP exception or Sandbox/
  Production environment is required for this; a Personal Developer
  environment works.
