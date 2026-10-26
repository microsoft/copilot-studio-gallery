# Accountant Document Intake & Q&A

Accountants receive source documents in every format: Excel and CSV exports,
native PDFs, scanned image PDFs, and Word letters. This sample removes the
manual data entry. A workflow reads each new file once, thoroughly, and stores
the figures **plus the reasoning and anomalies behind them** in Dataverse. A
conversational agent then answers the accountant's questions from that data
and only opens the original file when the stored data can't answer.

The design principle is "do the hard part once": the workflow captures enough
context per document (how each figure was derived, what looked unusual,
whether the read was complete) that the agent rarely needs to re-read a source
file.

## What's inside

### Workflow

**Document Extraction** runs whenever a file is created in a SharePoint intake
folder, whatever its type.

1. **Skip non-documents.** Folders and Office lock files (`~$…`) end the run.
2. **Get file content** from SharePoint.
3. **Extract** with an inline agent that reads the actual content, including
   scanned and handwritten pages, with no separate OCR step. It returns a
   structured output: invoice number, invoice date, vendor, amount due,
   currency, an extraction status (Full / Partial), a transformation note (how
   each figure was derived or interpreted), an outliers note (anything a human
   should look at), and an `isSourceDocument` flag.
4. **Skip previous outputs.** Reports, summaries, exports and reconciliations
   (`isSourceDocument = false`) end the run, so they never become rows.
5. **Create a row** in the **Accounting** Dataverse table, adding the source
   file name and an ingestion timestamp so every row traces back to its
   document.

A document that is only partly readable is never discarded. It is written with
status **Partial** and the reason in the notes. There is no per-file email; the
table is the live source of truth.

### Agent

**Accountant Q&A Assistant** is the accountant's single conversational
interface. It knows only the table name, **Accounting**. It discovers the
columns at runtime, so you can change the table without rewriting the agent.

| Skill | What it does |
| --- | --- |
| **query-accounting-data** | Used first for nearly every question. Discovers the schema, maps the question to columns, runs read-only SQL (filter, sort, group, sum), and shows the workflow's notes next to the figures. For calculations it deliberately excludes rows marked as test data and extra copies of duplicate documents, treats credit notes separately (never as amounts owed), and always says what was left out and how much it would change the result. The accountant can ask to include everything. |
| **ad-hoc-source-document-analysis** | The fallback when the table can't answer. Finds the file (using the source file name stored on the row), reads PDF, scanned PDF, Word and Excel/CSV content, verifies or challenges a stored figure, reconciles documents, and cites the page, sheet or section. Asks one focused clarifying question at most. |
| **write-back-changes** | The only skill that changes anything. Corrects or adds rows and saves analyses to SharePoint, but only when the accountant explicitly asks. It shows exactly what will be written and waits for a "yes". |

The agent connects to data through two **MCP servers**, each split into a read
tool and a write tool:

| Tool | MCP server | Tools enabled | Approval |
| --- | --- | --- | --- |
| Accounting data (Dataverse MCP) - read | Dataverse | `search`, `describe`, `read_query` (plus older names `list_tables`, `describe_table`, `fetch`) | None |
| Accounting data (Dataverse MCP) - create and update | Dataverse | `create_record`, `update_record` | Every call |
| Source documents (SharePoint MCP) - read | SharePoint | `getFileOrFolderMetadataByUrl`, `getSiteByPath`, `listDocumentLibrariesInSite`, `getDefaultDocumentLibraryInSite`, `getFolderChildren`, `findFileOrFolder`, `getFileOrFolderMetadata`, `readSmallTextFile`, `readSmallBinaryFile` | None |
| Source documents (SharePoint MCP) - save files | SharePoint | `createFolder`, `createSmallTextFile`, `createSmallBinaryFile` | Every call |

**No delete tools are enabled.** Deleting records, files, tables or columns,
and changing table structure, is not possible from the agent.

### Dataverse table

The solution includes the **Accounting** table (`cr900_accounting`) that the
workflow writes to:

| Column | Logical name | Type | Notes |
| --- | --- | --- | --- |
| Vendor Name | `cr900_vendorname` | Text (850) | Primary column. `Unknown` when it can't be determined. |
| Invoice Number | `cr900_invoicenumber` | Text (100) | |
| Invoice Date | `cr900_invoicedate` | Date only | |
| Amount Due | `cr900_amountdue` | Decimal | |
| Currency | `cr900_currency` | Text (100) | ISO code, e.g. GBP, EUR, USD |
| Extraction Status | `cr900_extractionstatus` | Choice | `1` = Full, `2` = Partial |
| Transformation Note | `cr900_transformationnote` | Multiline text (8,000) | How figures were derived or interpreted |
| Outliers Note | `cr900_outliersnote` | Multiline text (8,000) | Anything unusual worth a human's attention |
| Source File Name | `cr900_sourcefilename` | Text (100) | Name of the original file |
| Ingestion Timestamp | `cr900_ingestiontimestamp` | Date and time | When the row was written |

All business columns except the vendor name are optional, because not every
document contains every field.

## Before you start

- A Power Platform environment with **Dataverse** and **Copilot Studio**, with
  the **new Copilot Studio experience** turned on. A First Release or Early
  Release environment is preferred.
- Permission to import solutions and create connections in that environment.
- A **SharePoint document library** with an intake folder for source documents.
  The sample uses library **Shared Documents** and folder **Monthly Docs**.
- **Dataverse MCP enabled for Copilot Studio.** In the Power Platform admin
  center, open the environment and allow Copilot Studio as a Dataverse MCP
  client. Dataverse MCP calls are billed; check your licensing before rollout.
- The **SharePoint MCP server** connector must be allowed by your data policies.
- Users of the agent need a security role with read access to the Accounting
  table, and create and write access if they will use the write-back skill.
  The agent's tools run as the signed-in user.

## Set it up (recreate the sample as-is)

### 1. Prepare SharePoint

Create (or choose) a SharePoint site and library, and add an intake folder,
for example **Shared Documents / Monthly Docs**. Make sure the people who will
use the agent can read it.

### 2. Import the solution

Download the solution ZIP from this page and import it through **Solutions →
Import solution**. Create or select connections for:

| Connection reference | Connector | Used by |
| --- | --- | --- |
| `new_sharedsharepointonline_f336d932` and `new_sharedsharepointonline_c6307d22` | SharePoint | Workflow trigger and *Get file content* |
| `new_sharedagentnode_423b8` | Agents | Workflow *Extract* step |
| `new_sharedcommondataserviceforapps_affed` | Microsoft Dataverse | Workflow *Create row* and the agent's Dataverse MCP tools |
| `new_sharedworkiqsharepoint_b9b7a` | SharePoint MCP | The agent's SharePoint MCP tools |

The import creates the **Accounting** table, the **Document Extraction**
workflow and the **Accountant Q&A Assistant** agent.

### 3. Point the workflow at your folder

Open **Document Extraction** and select the trigger **When a file is created
(properties only)**. The site in the sample is a placeholder
(`https://contoso.sharepoint.com/sites/AccountsIntake`). Select your **Site
address**, **Library name** and **Folder**. Then open the **Get file content**
step and select the same **Site address**. Save and turn on the workflow.

### 4. Point the agent at your folder

The agent needs to know where the source documents live. Replace
`https://contoso.sharepoint.com/sites/AccountsIntake` (and the library or
folder name, if yours differ) in these three places:

| Where | What to change |
| --- | --- |
| Agent **Instructions**, section *Where the data lives* | Site URL, library and intake folder |
| Skill **ad-hoc-source-document-analysis**, *Intake location* and the `getFileOrFolderMetadataByUrl` example | Site URL, library and folder path |
| Skill **write-back-changes**, *Location* | The intake folder name, if you renamed it (analyses are saved to a sibling folder, **Accountant Analyses**, so the workflow doesn't pick them up as new documents) |

### 5. Check the MCP tools

Open the agent's **Tools**. Each MCP tool should show its connection and the
enabled tools listed in [Agent](#agent). If a tool lost its connection on
import, select it and pick your connection. If a tool is missing, add it again
through **Tools → Add a tool → Model Context Protocol**, choose **Dataverse**
or **SharePoint**, then turn on only the tools in the table above and set the
create, update and save tools to require approval.

### 6. Test and publish

Drop a few documents in the intake folder, wait for the rows to appear in the
Accounting table, then open the agent in **Preview**. When you're happy,
**Publish** it.

## Tailor it

The workflow owns the structure; the agent adapts. Use this table to see what
to change, and where, for common adjustments.

| You want to… | Change in the workflow | Change in Dataverse | Change in the agent |
| --- | --- | --- | --- |
| Capture a new field (e.g. due date, VAT, PO number, document type) | Add the property to the **Extract** step's output schema, with a clear description, and map it in **Create row** | Add the column to **Accounting** | Nothing. The schema is discovered at runtime. |
| Remove a field | Remove it from the output schema and the **Create row** mapping | Delete the column | Nothing |
| Rename the table | Update the **Create row** step | Rename the table | Replace "Accounting" in the instructions and in the **query-accounting-data** skill (*Step 1*) |
| Change the extraction status values | Keep the output schema `enum` values in step with the choice values | Edit the **Extraction Status** choice | Nothing (labels are read from the schema) |
| Watch a different folder or library | Trigger and **Get file content** step | — | Instructions and **ad-hoc-source-document-analysis** (see step 4 above) |
| Skip other kinds of files | Extend the first condition (e.g. by extension) or tighten the `isSourceDocument` description | — | — |
| Store credit notes as negative amounts | Tell the extractor in the `amountDue` description to return credits as negative numbers, or add a document-type field | Optional document-type column | Nothing. The agent already recognises credit notes from the amount, number, file name or notes. |
| Change how totals are calculated | — | — | **query-accounting-data**, *Step 3b - Clean the calculation set* (test data, duplicates, credit notes) |
| Allow or restrict writes | — | Security roles on the table | The MCP tools' enabled tools and approval setting, and the **write-back-changes** skill |
| Use a different model | The **Extract** step's model | — | The agent's model setting |

When you change the extractor, keep every field optional and keep the two
notes. The notes are what let the agent explain a figure without reopening the
file.

## Try it

Drop a mix of documents in the intake folder: a native PDF invoice, a scanned
or handwritten invoice, a Word letter, an Excel or CSV export, a resent copy of
an invoice, a credit note, and a file that isn't a financial document. Then ask
the agent:

1. > What's the total amount due, by currency?

   Expect totals per currency, never converted or combined, followed by a
   *Not included in this calculation* list: duplicate copies counted once,
   rows marked as test data left out, and credit notes shown as credits with a
   separate net figure, each with its impact on the total.

2. > How much do we owe *&lt;vendor&gt;*, and is anything wrong?

   Expect the amount, with duplicates and anomalies (unusual amounts,
   placeholder bank details, handwritten changes) quoted from the workflow's
   notes.

3. > Which invoices are dated in October 2026, earliest first?

   Expect each document once, with dates read correctly from every format
   (US, European and written-out dates).

4. > For the *&lt;vendor&gt;* invoice, what was the original printed total before the handwritten change?

   Expect an answer from the stored notes, then an offer to open the scan to
   verify it; accepting it runs the source-document skill.

5. > Delete the *&lt;vendor&gt;* record and its file.

   Expect a refusal: deletion is disabled, so the data owner must do it.

## Notes

- **The agent reads files through the SharePoint MCP server**, which is limited
  to files up to about 5 MB. Scanned PDFs are read by extracting the page image
  in the agent's code sandbox; expect a few minutes per document. The agent
  says so plainly when it can't read a file and gives you the link instead.
- **Citations** in answers can show raw query output, including internal
  column names.
- **The workflow processes each new file independently.** Duplicates and
  out-of-range amounts are flagged by the extractor from the document itself;
  the agent's duplicate rules catch the rest when calculating.
- **Clear out test rows** before go-live. The agent excludes rows that are
  clearly marked as test data, but it can't delete them.
