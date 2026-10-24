# Sales Analyser

Sales Analyser is an agent for finance and revenue operations teams. It reads
monthly sales exports (CSV or Excel) from a SharePoint folder, cleans and
reconciles them, and answers questions like *"analyse Q4 for me"* or *"compare
regions year on year"* with figures you can trace back to the source files.
When you're ready to share, it turns the analysis into a branded PDF report
and an Outlook-ready newsletter email.

Every answer ends with a short **Data notes** block: the files used, every
transformation applied (cleaning, label mappings, de-duplication, currency
conversion), the exchange rates and their as-of dates, the outliers it found,
and any caveats. No bare numbers.

## What's inside

### Agent

| Agent | Role |
| --- | --- |
| **Sales Analyser** | Finds the right sales files, prepares the data, computes the metrics and hands off to the report and email skills. Reads SharePoint only and never writes to it. Generated files are returned in the chat and attached to email drafts. |

### Skills

The skills ship with the agent, including their Python scripts, reference
guides and assets. They run in the Copilot Studio code sandbox using only
preinstalled packages (pandas, matplotlib, reportlab, Pillow).

| Skill | What it does |
| --- | --- |
| **spreadsheet-data-analysis-reporting** | The analysis engine. Discovers and maps fields across files with different layouts, prepares the data, computes metrics with standard definitions and edge-case handling, flags outliers without excluding them, converts currencies and draws charts with a shared theme. Also builds or extends a consolidated master file on request. |
| **polished-report-builder** | Renders a branded PDF: header band, headline callout, KPI tiles, charts, tables with right-aligned numbers, Data notes, and a non-audit disclaimer on every page. A QA script checks length, chart resolution and colour contrast before delivery. |
| **newsletter-style-email-composer** | Builds a newsletter-style summary email that renders in classic Outlook, new Outlook, Gmail and dark mode. KPI tiles and bar charts are built from HTML table cells, with no embedded images, and the PDF report is attached. |

### Tools and knowledge

| Name | Type | Used for |
| --- | --- | --- |
| SharePoint (Work IQ SharePoint MCP) | Tool | Listing and reading the sales files. Limited to read operations. |
| Draft an email message (Office 365 Outlook) | Tool | Creating the email draft with the PDF attached. Nothing is sent automatically. |
| `https://www.xe.com/currencyconverter/` | Knowledge | Looking up spot exchange rates at the moment of analysis. |

## Before you start

- A Power Platform environment with **Dataverse** and **Copilot Studio**, with
  the **new Copilot Studio experience** turned on so that agent skills and the
  code sandbox are available. A First Release or Early Release environment is
  strongly preferred.
- Permission to import solutions and create connections in that environment.
- The agent is configured to use **Claude Opus 5**. Anthropic models must be
  allowed in your tenant, or you can pick another model after import.
- A SharePoint folder that holds your sales exports, ideally one file per month
  (for example `sales_export_2025-10.csv`). Files don't need identical layouts;
  the agent reconciles column names, date formats, currencies and labels.
  Typical columns are order date, region, product, customer, quantity, unit
  price, currency and unit cost.
- An Outlook (Office 365) mailbox, if you want email drafts.

## Set it up

### 1. Import the solution

Download the solution ZIP from this page and import it through **Solutions →
Import solution**. Create or select connections for **Office 365 Outlook** and
**Work IQ SharePoint** when asked.

### 2. Point the agent at your sales data

Open **Sales Analyser** in Copilot Studio. In **Instructions**, under
**Data**, replace `<your-sharepoint-site-url>` with your site URL, and change
the library (`Shared Documents`) and folder (`Monthly Sales`) if yours are
different.

Until you do, the agent asks each user where their sales files are. Users can
always point it at another site, library or folder in the chat.

### 3. Check the tools and knowledge

- Under **Tools**, open **SharePoint** and **Draft an email message** and make
  sure both have a connection.
- Under **Knowledge**, wait until the **xe.com** source shows as ready.

### 4. Publish

**Save** and **publish** the agent, then share it with the people who'll use it.

## Make it yours

The agent's logic is deliberately not over-prescriptive. Definitions and rules
are defaults that the agent adapts to each dataset and discloses in the Data
notes. These are the places to tailor:

| What to change | Where | Notes |
| --- | --- | --- |
| **Data location** | Agent instructions, **Data** section | Site, library and folder the agent reads by default. |
| **Branding** (colours, fonts, header and footer text, disclaimer) | `assets/style-tokens.json` in the **spreadsheet-data-analysis-reporting** skill | The single source for charts, the PDF and the email. Ships with a blue and green palette checked for contrast. Keep text at 4.5:1 or more against white; the report QA script checks it. |
| **Logo** | `assets/logo-placeholder.png` in the same skill | Replace the placeholder with your own PNG under the same name, or add a file and set `brand.logo_path`. The logo appears in the PDF header only, because email clients block inline images. |
| **Metric definitions** (YoY, MoM, QoQ, YTD, LTM, contribution to growth, mix, constant currency) | `references/metrics-glossary.md` | Includes edge cases such as a missing or zero prior period, partial periods and rounding. |
| **Cleaning rules** (blanks, duplicates, subtotal rows, numbers stored as text, date formats) | `references/data-preparation.md`, `scripts/prepare_data.py` | Pass `--label-map` to `prepare_data.py` for recurring label mappings, for example `{"Region": {"Europe": "EMEA"}}`. |
| **Field synonyms** | `SYNONYMS` table in `scripts/discover_fields.py` | Add your own column names, for example `"turnover"` for revenue. |
| **Outlier thresholds** | `references/outlier-guidance.md`, `scripts/flag_outliers.py` | Defaults: robust z-score above 3.5, a period swing over ±50%, a share shift over 5 pp, and one row above 25% of the total. Outliers are flagged, never excluded automatically. |
| **Fiscal calendar** | Agent instructions, **Dates and periods** | Defaults to calendar quarters (Q4 = Oct–Dec). The agent asks when a request is ambiguous. Change the default if your organisation works to a fiscal year. |
| **Currency source** | **Knowledge** and `references/fx-conversion.md` | See the note on exchange rates below. |
| **Email layout** | `assets/newsletter-email-template.html` in the email skill | Table-based layout for Outlook compatibility. |

### Exchange rates

The reporting currency defaults to the dominant currency in the data, and the
agent confirms it with the user. For every analysis it looks up a fresh spot
rate from the xe.com knowledge source. It only uses a rate when the rate is
clearly dated and the direction is unambiguous; otherwise it asks the user to
provide or confirm one. Rates aren't stored. Each one is disclosed in the Data
notes with its pair, direction, source and as-of date.

Website knowledge works from an indexed snapshot of the page, so rates can be
a few days old. Review XE's terms of use before relying on them. For official
reporting, swap the knowledge source for your treasury's published rates.

## Try it

Open **Sales Analyser** in **Preview** and try these one at a time:

1. > Analyse Q4 for me.

   Expect the agent to state the period it used, report the dominant currency
   and the exchange rates it found for you to confirm, and then return the
   headline, comparison tables and a Data notes block.
2. > Compare regions year on year and show me the monthly trend.
3. > Build the branded PDF report with charts.

   The PDF comes back as a chat attachment.
4. > Draft an email to me with the summary and attach the PDF.

   A draft appears in your Outlook mailbox. Nothing is sent.
5. > What does YoY mean?

   This is answered directly, without running an analysis.

## Good to know

- **Read-only access to SharePoint.** The agent never creates, uploads, moves or
  deletes files there. Reports and other generated files are returned in the
  chat.
- **File size.** Files are read through the SharePoint tool, so very large
  workbooks can exceed its limits. Monthly exports of a few thousand rows work
  well.
- **Not an audit tool.** Every report and email carries a non-audit
  disclaimer, which you can edit in `style-tokens.json`.
