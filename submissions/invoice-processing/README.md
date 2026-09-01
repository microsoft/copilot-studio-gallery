# Invoice Processing

Reads invoice attachments from incoming email, extracts key invoice fields
using AI, and logs each invoice to an Excel workbook.

## Workflow

The **Invoice Processing** cloud flow uses two chained agents inside a loop
over each email's attachments:

1. Starts when an email with `invoice` in its subject arrives with at least
   one attachment.
2. Loops over every attachment in the email. For each attachment:
   - The **Extraction Agent** (no tools, reasoning only) reads the attachment
     content and extracts `InvoiceNumber`, `Vendor`, `InvoiceDate`, and
     `AmountDue`. It only extracts values that are clearly present, returning
     "Not found" for anything uncertain or for non-invoice attachments. It
     treats the attachment and email content as untrusted and ignores any
     instructions embedded within them.
   - The **Logging Agent** reads the Extraction Agent's output. If every field
     came back "Not found", it stops without logging. Otherwise it checks
     whether the configured log workbook and `Invoices` table exist via Excel
     **Get tables**, auto-creating the file (OneDrive **Create file**) and
     table (Excel **Create table**) if missing, then logs one row via **Add a
     row into a table**.

## Import notes

- Configure the Microsoft 365 Outlook connection used by the email trigger,
  and adjust the trigger's `invoice` subject filter and folder if your inbox
  uses a different intake convention.
- Configure the Agent connection used by both the Extraction and Logging
  agents.
- In the **Configuration** action, confirm the `InvoiceLogFileName` variable
  (`Invoice Log.xlsx`) matches the workbook name you want created/used at the
  root of your OneDrive.
- The Logging Agent's **Create file**, **Get tables**, **Create table**, and
  **Add a row into a table** tools have connection IDs hardcoded from the
  original authoring environment. Solution import does not remap these values,
  so open the Logging Agent node after import and re-select all tool
  connections (OneDrive and Excel Online Business) before enabling the flow.

The solution is exported as unmanaged and includes a saved modern-designer
canvas for its workflow preview.
