# Invoice Processing V2

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
- **Ledger Agent** — owns the Dataverse tools. On each run it looks up the
  invoice number in the configured table; if a match exists, it still logs the
  row but flags `Duplicate Of` the existing record so nothing is silently
  dropped or double-counted. It trusts the Extract node's output and does not
  re-evaluate the original untrusted email or attachment content.

Attachments the Extract node can't read as an invoice (`ExtractionStatus:
Failed`) are skipped rather than logged.

## Configuration

| Variable | Purpose |
| --- | --- |
| `InvoiceTableName` | The Dataverse table's logical/schema name (for example `a3p_invoiceledger`, not the display name "Invoice Ledgers"). There are no pickers on the canvas for this, so it must be typed exactly. |

## Import notes

- Point the trigger at your own shared mailbox. If the **Folder** field shows
  "Loading..." after importing this solution, the folder ID is tied to the
  original mailbox — reopen the trigger and re-select the folder for your own
  mailbox connection before publishing.
- Create a Dataverse table to log invoices to, with columns matching the
  fields above (`Vendor`, `Invoice Number`, `Invoice Date`, `Currency`,
  `Amount Due`, `Duplicate Of`), and set `InvoiceTableName` to its logical name.
- The Ledger Agent uses the native Dataverse connector's "List rows" and "Add
  a new row to selected environment" actions. In some Personal Developer
  environments, the default Data Loss Prevention policy blocks the
  `CreateRecordWithOrganization` action used by "Add a new row to selected
  environment" — if you hit a DLP error on publish, import into a Sandbox or
  Production environment instead.
