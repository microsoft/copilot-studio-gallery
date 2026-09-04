---
title: Invoice Processing
slug: invoice-processing
solution: Invoiceprocessing
---
Invoice Processing watches a mailbox for incoming invoices, reads every
attachment, extracts the fields an accounts-payable team needs, and appends them
to a running Excel ledger.

A loop handles one attachment at a time, so an email carrying five invoices
produces five rows rather than one blended summary.

## Agents

- **Extraction Agent** reads the attachment plus the email subject and body for
  context, and extracts **InvoiceNumber**, **Vendor**, **InvoiceDate**, and
  **AmountDue**. Missing fields fall back to `Not found` rather than being
  guessed. It has no tools and treats the email and attachment as untrusted.
- **Logging Agent** owns the Excel and OneDrive tools and writes one row per
  attachment from the Extraction Agent's structured output.

## How the workflow runs

The trigger fires on new Inbox mail with **invoice** in the subject and at least
one attachment. The loop then runs the two agents per attachment. On each run the
Logging Agent checks for the workbook and an **Invoices** table, auto-creating
either if missing, so a first run works against an empty OneDrive.

## Configuration

| Variable | Purpose |
| --- | --- |
| `InvoiceLogFileName` | Workbook the Logging Agent creates and logs to in the OneDrive root, for example `Invoice Log.xlsx`. |

## Customizations

Adjust the trigger first — suppliers rarely agree on subject lines, so the
subject filter, monitored folder, and attachment requirement usually need edits.
Then consider:

- **Extracted fields** such as PO number, currency, tax, or due date. Extend the
  Extraction Agent's output and the Logging Agent's headers together.
- **Attachment filtering** if suppliers attach cover sheets or logos alongside
  the invoice.
- **Storage location** if AP needs SharePoint or a shared folder.
- **An approval step** before logging when `AmountDue` exceeds a threshold.
- **Duplicate detection** on `InvoiceNumber` to catch resubmitted invoices.

Keep the Extraction Agent tool-less and keep the loop — an attacker-supplied PDF
is exactly what the tool-less design guards against.

## Prerequisites

Office 365 Outlook, Excel Online (Business), and OneDrive for Business
connections, plus write access to the OneDrive root.

## Import

Download the rebuilt solution ZIP from this page and import it through Power
Platform. Review and replace environment-specific connections during import,
then set `InvoiceLogFileName` and confirm the trigger filter before turning the
workflow on.
