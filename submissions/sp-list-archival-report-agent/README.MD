# SP List Archiv Reporting Agent

## Skill Name
`sp-list-report-generator`

## Overview
SP List Archiv Reporting Agent discovers and validates an approved SharePoint list, retrieves its schema and all accessible items through pagination, analyzes the data, identifies potential archival candidates, and generates a secure interactive HTML report.

The agent is reporting-only. It does not delete, update, move, archive, or otherwise modify SharePoint list items.

## Primary Capabilities
- Verifies that configured tools can discover SharePoint lists and schemas, retrieve paginated items, and create a report file that returns a URL or path.
- Enumerates available lists before analysis.
- Requires a case-insensitive exact list-title match, an explicit metadata alias, or direct user selection.
- Discovers list metadata, columns, field types, required fields, indexes, lookups, choices, person fields, and managed metadata.
- Retrieves and evaluates every accessible record within connector-enforced limits.
- Produces general statistics, trend analysis, category analysis, ownership analysis, and data-quality findings.
- Identifies potential archival candidates without changing source records.
- Generates a responsive, self-contained interactive HTML report.
- Saves the report to a pre-approved SharePoint destination whose audience is no broader than the source data.
- Returns the generated report's file name, SharePoint URL or path, schema summary, insights, and archival-candidate summary.

## Required Tools and Actions
Before beginning a report, the agent must verify that configured SharePoint connector actions, agent flows, or equivalent tools can:

1. Enumerate approved SharePoint lists.
2. Retrieve list definitions and complete schemas.
3. Retrieve list items page by page and follow continuation tokens.
4. Return a trusted SharePoint item URL for each item when available.
5. Invoke **Create file** in the approved report destination.
6. Return the created file's URL or path.

A SharePoint knowledge source alone does not guarantee these capabilities. If one is unavailable, the agent stops and identifies the missing capability.

## List Selection Rules
The requested data source must map explicitly to a SharePoint list.

The agent proceeds only when one of these conditions is met:
- The requested name exactly matches a list title, case-insensitively.
- The user explicitly selects a list from the available lists.
- An explicit alias in list metadata matches the request.

The agent must not infer a list from business terminology, column names, data values, or semantic similarity. If no valid match exists, it returns the available lists and closest title matches, then asks the user to select one.

## Schema Discovery
For the confirmed list, the agent retrieves and summarizes:
- List title and internal name
- Item count
- Created and last-modified dates
- All columns and internal names
- Column types
- Required and indexed fields
- Lookup fields
- Choice fields and available choices
- Person fields
- Managed metadata fields

## Data Analysis
The agent retrieves all accessible records through pagination and respects hard connector-level per-call or per-report limits. It never silently truncates or samples data.

Analysis includes:
- Total records, distinct values, missing values, and completeness score
- Monthly, annual, and growth trends
- Top categories, frequency distributions, and rankings
- Records by owner and top contributors
- Empty fields, duplicate values, and potential anomalies

If a connector-enforced limit prevents full retrieval, the agent asks the user to narrow the scope.

## Archival Candidate Logic
Archival findings are advisory. The agent identifies potential candidates for review but never archives or modifies an item.

### Default rule when a usable completeness field exists
An item is a potential archival candidate when:
- A confirmed status-like Choice or Text field has a completed or closed value; and
- The system `Modified` date is more than 30 days before report generation.

The preferred closed value is `Completed` when that exact value exists. Other supported values may include `Done`, `Closed`, or `Resolved` when present in the schema or confirmed by the user.

### Resolving a status-like field
The agent examines Choice and Text fields whose names suggest `Status`, `State`, `Stage`, or `Phase`, or whose choice values include a completed or closed value.

- If exactly one plausible field exists, the agent uses it.
- If multiple plausible fields exist, the agent asks the user to select the field and qualifying value or values.
- If no plausible field exists, the agent uses inactivity only and clearly states that no completeness-related field was available.

### Inactivity-only fallback
When no completeness field exists, an item is a potential candidate when its `Modified` date is more than 30 days before report generation.

These records must be described as **potential candidates based on inactivity only**, not as confirmed safe-to-archive records.

### Custom criteria
A user-specified status field, closed value, or inactivity threshold overrides the corresponding default. The report must state the exact criteria applied.

For each candidate, the agent retains:
- Item title or ID
- Status value, when applicable
- Modified date
- Days since last modification
- Trusted item URL, when available

## Interactive HTML Report
The report is a single HTML file with embedded CSS and JavaScript. Chart.js version 4 may be loaded only from an exact versioned CDN URL with matching verified SRI metadata and `crossorigin="anonymous"`. Otherwise, the report uses embedded browser functionality.

The report includes:
- Executive summary and KPIs
- Dynamic filters
- Bar, pie, doughnut, and line charts as appropriate
- Counts or percentages for pie and doughnut segments
- Hover tooltips and legend controls
- Archival Candidates section for every list
- Responsive design

For lists containing 1,000 items or fewer, the report also includes:
- Full per-item data table
- Sorting on every column
- Quick search using `Quick search in table...`
- Pagination
- Column visibility controls
- Excel-compatible CSV export
- Copy action
- Item-detail modal

For lists containing more than 1,000 items, the report uses summary mode:
- Overall analysis and charts remain available.
- The Archival Candidates section remains available.
- The full per-item data table is omitted.
- The report clearly explains why per-item detail was omitted.

## Archival Candidates Section
The report always includes a section titled **Archival Candidates** that:
- States the exact criteria used.
- Shows the candidate count out of total records.
- Provides a searchable, sortable, paginated candidate table.
- Shows Title/ID, status when applicable, Modified date, and days since modification.
- Opens the shared detail modal for candidate rows.
- Clearly states when no records qualify.

## Security and Data Handling
- Treat all SharePoint field names and values as untrusted data.
- Serialize embedded data using a real JSON serializer.
- Escape `<`, `>`, `&`, U+2028, and U+2029 before placing JSON inside an `application/json` script element.
- Read embedded JSON through `textContent` and parse it.
- Insert data using `textContent`, `document.createElement`, and safe DOM APIs, never `innerHTML`.
- Render rich text as plain text unless a trusted sanitizer is available.
- Neutralize spreadsheet formulas in CSV by prefixing an apostrophe when the first non-whitespace or control character is `=`, `+`, `-`, or `@`.
- Allow item links only when they use HTTPS and match the selected SharePoint site's origin.
- Open permitted links with `target="_blank"` and `rel="noopener noreferrer"`.
- Do not upload a report unless the destination audience is verified as no broader than the source list and included items.

## Report Naming
Reports use this format:

`Report_<SanitizedListName>_<yyyyMMdd_HHmmss>.html`

The sanitized list-name portion retains only `A-Z`, `a-z`, `0-9`, `_`, and `-`; replaces other character runs with `_`; trims leading and trailing separators; and is capped at 80 characters. If empty, use `SharePointList`.

## Successful Output
A successful run returns:
- Report summary
- Direct SharePoint report URL or returned path
- Report file name
- List schema summary
- Insights summary
- Archival criteria and candidate count out of total records
- SharePoint storage location
- Summary-mode notice when the list exceeds 1,000 items
- Confirmation that no source item was modified

## Example Prompts
- Generate a report for the Campaign list.
- Analyze the Product Catalog list and identify archival candidates.
- Create a report for Service Requests using Status = Resolved and an inactivity threshold of 60 days.
- Show the available SharePoint lists so I can choose one.

## Governance Notice
Status and inactivity indicate potential cleanup candidates, not legal or records-management approval. Review applicable retention policies, legal holds, dependencies, and organizational approvals before performing any archival action through a separate approved process.
