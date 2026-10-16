# Invoice Processing

Invoice Processing includes two alternative workflows in one solution. Both
watch an Inbox for emails with **invoice** in the subject and at least one
attachment, then process each attachment separately.

Choose either workflow based on your storage needs, use case, and available
Power Platform licensing. You do not need to run both.

## Authors

Isha Gautam, Jasmita Lamba, and Pulkit Bhagat.

## Choose a workflow

| | Invoice Processing - Original | Invoice Processing - Revised |
| --- | --- | --- |
| Best fit | A lightweight, spreadsheet-based invoice log. | A structured finance ledger with extraction status and duplicate tracking. |
| Mailbox | The connected user's Inbox. | A shared mailbox Inbox, checked every minute. |
| Storage | An `Invoices` table in `invoices.xlsx` at the OneDrive root. | The included **Invoice Ledger V2** Dataverse table. |
| Extracted data | Invoice number, vendor, invoice date, and amount due as text. | The same invoice fields, plus separate currency and extraction status; amount due is numeric and dates use ISO format. |
| Missing data | Uses `Not found` during extraction; leaves corresponding Excel cells blank. | Leaves missing fields blank and classifies extraction as `Complete`, `Partial`, or `Failed`. |
| Duplicate handling | No duplicate lookup. | Matches existing rows by invoice number and records a `DuplicateOf` reference. Duplicates are still logged, not rejected. |
| Licensing considerations | Requires access to the workflow's AI capabilities and Outlook, Excel, and OneDrive connections; avoiding Dataverse does not make it license-free. | Also requires an entitlement covering the premium Dataverse connector and appropriate table permissions. |

### Original: Excel logging

New email -> attachment loop -> Extraction Agent -> Logging Agent.

- **Extraction Agent** uses Claude Opus 5 to read the attachment, with the email
  subject and body as supporting context. It returns **InvoiceNumber**,
  **Vendor**, **InvoiceDate**, and **AmountDue**, without guessing missing data.
  It has no tools and treats email and attachment content as untrusted.
- **Logging Agent** uses Sonnet 5 and owns the Excel and OneDrive tools. It checks
  for the configured workbook and the **Invoices** table, auto-creates them if
  missing, and adds a row for usable invoice data. Attachments whose four fields
  are all `Not found` are skipped.

### Revised: Dataverse logging

Shared mailbox email -> attachment loop -> Extract -> List rows -> Ledger Agent
-> ShouldLog condition -> Add a new row.

- **Extract** uses Claude Opus 5 and returns **InvoiceNumber**, **Vendor**,
  **InvoiceDate**, numeric **AmountDue**, **Currency**, and **ExtractionStatus**.
- **List rows** queries the configured Dataverse table for matching invoice
  numbers.
- **Ledger Agent** uses Claude Opus 5 with no tools. It produces structured row
  data and a **ShouldLog** decision, including a duplicate reference when a
  matching record exists.
- **ShouldLog condition** controls the explicit Dataverse row-creation action.
  `Complete` and `Partial` extractions are logged; `Failed` extractions are
  skipped. Rows also contain the attachment name, received timestamp,
  source-email field, and a human-readable record name.

## Configuration

| Setting | Purpose |
| --- | --- |
| Subject filter | Both workflows use `invoice`. Adjust it to match your suppliers' emails. |
| `InvoiceLogFileName` | Original workflow: workbook created and used at the OneDrive root. Default: `invoices.xlsx`. |
| Shared mailbox address | Revised workflow: `alias@contoso.com` is a placeholder. Replace it with a mailbox you can access. |
| `InvoiceTableName` | Revised workflow: `iwf_iv2_invoiceledgerv2s`, the entity set for the included Invoice Ledger V2 table. |

The Dataverse table and AI model selections are unchanged.

## Customizations

Adjust the trigger first — suppliers rarely agree on subject lines, so the
subject filter, monitored folder, and attachment requirement usually need edits.
Then consider:

- **Extracted fields** such as PO number, tax, or due date. For Original, update
  the Extraction Agent's output and the Logging Agent's headers together. For
  Revised, update Extract, the Ledger Agent's output, and the Dataverse mapping.
- **Attachment filtering** if suppliers attach cover sheets or logos alongside
  the invoice.
- **Storage location** if AP needs SharePoint or a shared folder rather than
  OneDrive or Dataverse.
- **An approval step** before logging when `AmountDue` exceeds a threshold.
- **Duplicate policy** if resubmitted invoices should be rejected rather than
  logged with a reference. Revised already tracks matching invoice numbers.

Keep extraction tool-less and treat attachment content as untrusted. Preserve
the per-attachment loop so separate invoices are not blended into one summary.

## Prerequisites

- **Both workflows:** a Power Platform environment where you can import the
  solution, access to the AI workflow capabilities and selected models, an
  Outlook connection, and the applicable licensing and capacity.
- **Original:** Excel Online (Business) and OneDrive for Business connections,
  plus write access to the OneDrive root.
- **Revised:** access to the shared mailbox, a Dataverse connection, and read and
  create permissions on the included Invoice Ledger V2 table.

### Licensing

Choose Original if Excel storage meets your needs and you do not have an
entitlement covering the Revised workflow's Dataverse use. Choose Revised if
you need Dataverse storage and duplicate tracking and your organization's Power
Platform licensing covers that scenario.

Original is not a license-free alternative: both workflows use AI capabilities
whose licensing and capacity requirements must be checked. Microsoft Dataverse
is classified as a premium connector, but the applicable entitlement depends on
your execution scenario and existing licenses. Confirm coverage with your
administrator before enabling either workflow; a generic "Power Platform
license" alone is not enough to establish coverage.

See [Copilot Studio licensing requirements](https://learn.microsoft.com/en-us/microsoft-copilot-studio/requirements-licensing)
and the [Microsoft Dataverse connector classification](https://learn.microsoft.com/en-us/connectors/commondataserviceforapps/).

## Import

Download the rebuilt solution ZIP from this page and import it through Power
Platform. The ZIP contains both workflows and the Dataverse table, even if you
intend to use only Original.

1. Review and replace environment-specific connections during import.
2. Choose **Original** or **Revised** and verify its prerequisites and licensing.
3. For Original, confirm `InvoiceLogFileName`. For Revised, replace
   `alias@contoso.com` and confirm access to Invoice Ledger V2.
4. Check the subject filter and test with a known invoice, a non-invoice
   attachment, and an email with multiple attachments. For Revised, also test a
   duplicate and a partially populated invoice.
5. Enable only the selected workflow and leave the other disabled.

The exported Revised workflow should be reviewed before production use: its
executable Extract message contains a literal `{document}` placeholder even
though the saved canvas binds the current attachment. Confirm that attachment
binding works in the imported workflow. Also, its `SourceEmailId` currently maps
to the email sender rather than the message ID; update that mapping if message
traceability is required.
