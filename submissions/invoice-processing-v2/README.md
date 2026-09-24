# Invoice Processing V2

Watches a shared mailbox for incoming invoices, extracts the invoice data from
each attachment (PDF or image), and logs it to a Dataverse table with
duplicate detection — no manual data entry required.

A loop handles one attachment at a time, so an email carrying several
invoices produces one row per invoice rather than one blended summary.

## Agents

- **Ledger Agent** reviews the built-in Extract node's fields (`Vendor`,
  `InvoiceNumber`, `InvoiceDate`, `Currency`, `AmountDue`,
  `ExtractionStatus`) alongside a duplicate lookup, then decides `ShouldLog`
  and every field value for the row, including `DuplicateOf` when a match
  was found. It has no tools — it only reasons and produces structured
  output; whether a row actually gets written depends entirely on this
  decision. Attachments the Extract node can't read as an invoice
  (`ExtractionStatus: Failed`) still reach the Ledger Agent rather than
  being silently dropped, so it can decide whether that still warrants a
  row.

## How the workflow runs

The trigger fires on new mail in the shared mailbox with "invoice" in the
subject and at least one attachment. A loop then runs once per attachment:
the built-in Extract node reads the attachment content (leaving a field
blank rather than guessing when it can't be found, and treating the
attachment as untrusted content), a plain Dataverse "List rows" step checks
for any existing row with a matching invoice number, and the Ledger Agent
turns both results into a logging decision. An If/Else node — the only
deterministic gate in the flow — branches purely on the Ledger Agent's
`ShouldLog` output, and on the "yes" branch a plain Dataverse "Add a new
row" step writes the row with every field wired from the Ledger Agent's
structured output.

## Configuration

| Variable | Purpose |
| --- | --- |
| `InvoiceTableName` | The Dataverse table's logical/schema name (for example `a3p_invoiceledgerv2s`, not the display name "Invoice Ledgers V2"). There are no pickers on the canvas for this, so it must be typed exactly. |

## Customizations

Adjust the trigger first — suppliers rarely agree on subject lines, so the
subject filter, monitored folder, and attachment requirement usually need
edits. Then consider:

- **Extracted fields** such as PO number, tax, or a cost-center code. Extend
  the Extract node's output and the Ledger Agent's field list together.
- **Duplicate-detection scope** — today it matches only on `InvoiceNumber`;
  broaden it to vendor plus amount if suppliers reuse numbers.
- **An approval step** before logging when `AmountDue` exceeds a threshold.
- **Storage location** if you'd rather log to Excel/SharePoint than
  Dataverse — swap the "List rows"/"Add a new row" steps accordingly.

Keep the Ledger Agent tool-less and keep the loop — an attacker-supplied PDF
is exactly what the tool-less design guards against.

### Why Dataverse runs as plain steps, not agent tools

Invoking Dataverse's "List rows"/"Add a new row" actions as Copilot Studio
agent tools currently fails on every tested environment and tenant with
`400: Invalid organization URL` — a platform-level issue in how that
connector resolves the caller's org for agent-tool invocations, not a
configuration mistake. The identical actions succeed immediately as plain
flow connector steps, which is why this template reads and writes Dataverse
with plain nodes and lets the agent only make the logging decision.

## Prerequisites

- A Dataverse table to log invoices to, with columns matching the fields
  the Ledger Agent produces (`Invoice Number`, `Vendor`, `Invoice Date`,
  `Currency`, `Amount Due`, `Extraction Status`, `Attachment Name`, `Source
  Email Id`, `Received On`, `Duplicate Of`, and a record-name column for the
  "New column"/`RecordName` field).
- Office 365 Outlook connection for the mailbox trigger.
- Dataverse reads/writes ("List rows" / "Add a new row") run as plain flow
  connector steps against the current environment, not as agent tools — see
  "Why Dataverse runs as plain steps" above. No DLP exception or Sandbox/
  Production environment is required for this; a Personal Developer
  environment works.

## Import

Download the rebuilt solution ZIP from this page and import it through
Power Platform. The workflow is named "Invoice Processing V2" (distinct
from any V1 you may have imported) — Copilot Studio prefers the latest
version when two workflows share a display name, which previously made V1
untestable alongside this one; delete the older version if you still hit a
naming collision. Point the trigger at your own shared mailbox — if the
**Folder** field shows "Loading..." after importing, reopen the trigger and
re-select the folder for your own mailbox connection before publishing. Set
`InvoiceTableName` to your table's logical/plural name (e.g.
`a3p_invoiceledgerv2s`, not the singular schema name) — give it a distinct
logical name if you've already imported an earlier version of this table
(e.g. from V1).
