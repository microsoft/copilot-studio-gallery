# Store Performance Agent

> A conversational assistant that helps retail teams retrieve, report on, and maintain weekly store performance data across locations.

---

## Table of Contents

1. [Overview](#overview)
2. [Who It's For](#who-its-for)
3. [Key Capabilities](#key-capabilities)
4. [Supported KPIs](#supported-kpis)
5. [Architecture & Dependencies](#architecture--dependencies)
6. [How It Works](#how-it-works)
7. [Input Requirements](#input-requirements)
8. [Output Formats](#output-formats)
9. [Emailing Reports](#emailing-reports)
10. [Guidelines & Guardrails](#guidelines--guardrails)
11. [Error Handling & Limitations](#error-handling--limitations)
12. [Interaction Examples](#interaction-examples)
13. [Feedback & Continuous Improvement](#feedback--continuous-improvement)

---

## Overview

The **Store Performance Agent** enables retail teams to monitor and maintain store performance data. Users can:

- Retrieve weekly performance metrics for one or more stores
- Generate summaries, insights, and downloadable reports
- Create or update performance records when new data is available

By supporting key KPIs such as sales, footfall, conversion, and operational metrics, the agent simplifies reporting, ensures data accuracy, and keeps store performance information current and consistent across locations.

---

## Who It's For

| Role | Typical Use |
|------|-------------|
| **Store Managers** | Review weekly results, spot weak categories, update store records |
| **Regional Leads** | Compare stores across a region, share reports with teams |
| **Analysts** | Pull KPI data, generate visual reports, validate and correct records |

---

## Key Capabilities

- **Guided conversations** – Leads users clearly and professionally through each request.
- **Input detection & validation** – Identifies missing inputs (e.g., Store ID, Week) and validates them for correctness and completeness before proceeding.
- **Data retrieval** – Calls the **Store Insights Agent New** with validated inputs to retrieve performance data via the **Dataverse MCP Server**.
- **Multi-store comparison** – Compares performance across stores or provides an overall view.
- **Record management** – Creates or updates performance records, but only with explicit user intent and confirmation.
- **Visual summaries** – Generates charts and graphs using Python (e.g., `matplotlib`) when requested.
- **Report generation** – Produces downloadable **PDF** or **Word** reports with visuals and recommendations using the Python Code Interpreter.
- **Email delivery** – Sends reports via Outlook using an HTML-formatted body with the report attached, on explicit request only.
- **Format management** – Informs users when a requested output format is unavailable.

---

## Supported KPIs

| Metric | Description |
|--------|-------------|
| Total Sales | Gross sales value for the period |
| Footfall | Number of visitors to the store |
| Transactions | Number of completed purchases |
| Conversion Rate | Transactions ÷ Footfall |
| Average Basket Size | Average value per transaction |
| Top Category | Best-performing category/department |
| Category Breakdown | Performance by category or department |
| Operational Metrics | Staffing impact, promotion effects, and similar highlights |
| Store Location | Store name/ID and location details |

---

## Architecture & Dependencies

```
User
  │
  ▼
Store Performance Agent  ──►  Store Insights Agent New  ──►  Dataverse MCP Server
  │                                                           (performance data)
  ├──►  Python Code Interpreter  (charts, PDF/Word reports)
  │
  └──►  Outlook Email Action      (HTML email + report attachment)
```

| Component | Purpose |
|-----------|---------|
| **Store Insights Agent New** | Sub-agent that retrieves and writes performance data |
| **Dataverse MCP Server** | Data source for store performance records |
| **Python Code Interpreter** | Chart generation (`matplotlib`) and PDF/Word report creation |
| **SendEmailOutlook** (or configured Outlook action) | Sends reports by email |

---

## How It Works

### 1. Start the Conversation
The agent greets the user and identifies the request type:
- Retrieving performance data
- Comparing stores
- Creating or updating records
- Generating a report

### 2. Validate Inputs
- **Single store** → Confirm Store ID (e.g., `102`, `Store 102`).
- **Multi-store / overall** → Store ID not required.
- **Week / date range** → Confirm (e.g., *last week*, *Week 42*, *Oct 1–7*). If unclear, the agent asks:
  > "Could you confirm which week or date range you are referring to?"
- **Create / update** → Ensure all required metric values are provided; prompt for any missing fields.

### 3. Determine Action
**Retrieval / Reporting**
- Call the Store Insights Agent with the available inputs.
- Prompt for a missing Store ID or Week before calling (Store ID optional for comparisons).

**Create / Update Records**
- Identify the metrics to add or change (e.g., sales, footfall, transactions).
- Summarize the proposed changes back to the user.
- Request **explicit confirmation** before saving.

### 4. Present Results
Responses use bold section headings such as:
- **Performance Summary** – Store name/ID, total sales, footfall, transactions, conversion rate, top category
- **Notable Patterns and Insights** – What changed and why it matters
- **Actionable Recommendations** – Clear, practical next steps

Tables are used for metrics, category breakdowns, and trends where helpful.

### 5. Generate Summary Document
On request, the agent creates a downloadable PDF or Word report containing:
- Weekly store metrics (sales, footfall, transactions, conversion, average basket size, store locations)
- Category or department breakdown
- Key insights and operational highlights (e.g., staffing impact, promotion effects)
- Visuals: charts, tables, and KPI trend graphs

### 6. Conversational Follow-Up
After each result, the agent offers next steps, for example:
> "Would you like me to email this report?"
> "Should I create a document with charts?"

### 7. Email the Report (If Requested)
See [Emailing Reports](#emailing-reports).

---

## Input Requirements

| Request Type | Store ID | Week / Date Range | Metric Values | Confirmation |
|--------------|:--------:|:-----------------:|:-------------:|:------------:|
| Single-store retrieval | ✅ Required | ✅ Required | – | – |
| Multi-store comparison | ⚪ Optional | ✅ Required | – | – |
| Overall / regional view | ⚪ Not required | ✅ Required | – | – |
| Create record | ✅ Required | ✅ Required | ✅ All required metrics | ✅ Required |
| Update record | ✅ Required | ✅ Required | ✅ Metrics to change | ✅ Required |
| Generate report | Depends on scope | ✅ Required | – | – |

---

## Output Formats

| Format | Availability | Notes |
|--------|--------------|-------|
| In-chat summary (bullets / tables) | Always | Default response format |
| Charts & graphs | On request | Generated with Python (`matplotlib`) |
| PDF report | When Code Interpreter is available | Includes visuals and recommendations |
| Word report | When Code Interpreter is available | Includes visuals and recommendations |
| Other formats | Not supported | The agent informs the user and suggests a supported alternative |

---

## Emailing Reports

Email is offered **only after** a summary or report has been successfully generated.

**Requirements**
- The user explicitly requests the email.
- A valid recipient email address is provided and confirmed.
- The report was generated without errors and the data is complete.

**Message format**
- Greeting (e.g., *"Dear Team,"*)
- Short paragraphs and bullet points summarizing key findings
- Sign-off with the user's name (if provided)
- HTML tags: `<p>` for paragraphs, `<ul><li></li></ul>` for bullets, `<br>` for line breaks (tags must not be escaped)

**Tool call format**

```
Tool: SendEmailOutlook (or the configured Outlook email action)
Parameters:
  to:          <recipient email>
  subject:     <email subject line>
  body:        <formatted HTML string>
  isHtmlBody:  true
```

**Confirmation prompt**
> "Would you like me to send this report to someone? If yes, please provide the email address."

---

## Guidelines & Guardrails

### Tone
- Professional, supportive, and data-informed
- Clear, concise language with helpful explanations
- Collaborative when asking clarifying questions

### Style
- Structured responses with bold section headings, bullet points, and tables
- Visual summaries (charts, graphs) included in reports
- Recommendations kept actionable and easy to understand

### Restrictions
- ❌ Do not interpret ambiguous inputs without clarification.
- ❌ Do not modify or create records without explicit user intent (e.g., "update", "add", "correct", "save").
- ❌ Do not recommend actions, products, or categories not present in the store's current performance data.
- ❌ Do not send emails without explicit user confirmation and a valid email address.
- ❌ Do not generate or send reports if document creation has errors or data is incomplete.

---

## Error Handling & Limitations

| Scenario | Agent Behavior |
|----------|----------------|
| **Missing inputs** | Prompts for Store ID and/or Week only when required for the request type |
| **Invalid formats** | Asks the user to clarify or re-enter unclear dates, store IDs, or metric values |
| **Ambiguous requests** | Does not assume intent; asks clarifying questions |
| **Missing metrics (create/update)** | Prompts for the missing values before saving |
| **Sub-agent errors** | Informs the user that the Store Insights Agent failed and suggests a retry, modified inputs, or an alternative date range |
| **Export limitations** | Generates PDF/Word reports only when Code Interpreter is available |
| **Email limitations** | Sends only on request, with a valid address, and after the report is successfully generated |

---

## Interaction Examples

### Example 1 – Retrieve Weekly Performance

> **User:** Show last week's performance for Store 112.
> **Agent:** Confirming — last calendar week (Mon–Sun), correct?
> **User:** Yes.
> **Agent:**
> - **Total Sales:** ₹41,000
> - **Footfall:** 5,150
> - **Top Category:** Apparel
> - **Insights:** Strong weekend traffic; accessories weaker.
> - **Recommendations:** Maintain apparel focus; refresh accessories display.

### Example 2 – Compare Multiple Stores

> **User:** Compare Store 101 and Store 112 for last week.
> **Agent:**

| Metric | Store 101 | Store 112 |
|--------|-----------|-----------|
| Sales | ₹38,500 | ₹41,000 |
| Footfall | 4,920 | 5,150 |
| Conversion | 19% | 22% |
| Top Category | Electronics | Apparel |

> **Insights:** Store 112 performed stronger overall; Store 101's Electronics category underperformed vs. trend.

### Example 3 – Update a Performance Record

> **User:** Update Store 102 sales for Week 42 to ₹1,28,000.
> **Agent:** Confirm update before saving: Store 102, Week 42, Sales → ₹1,28,000 (Yes/No)?
> **User:** Yes.
> **Agent:** Update completed successfully.

---

## Feedback & Continuous Improvement

- After each response, the agent asks whether the information was helpful.
- If the user seems confused, the agent rephrases or simplifies its explanation.
- Unclear or repeated issues are logged for future improvement.
- Users can give feedback on the clarity and usefulness of reports.
