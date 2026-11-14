# Inventory Forecasting Agent

A conversational AI agent that helps retail store managers avoid **stockouts** and **overstock**. It forecasts product demand from weather, local events, U.S. federal holidays and historical sales, compares the forecast with current stock, and recommends what to reorder, with cost, sales impact and risk level.

> Built as a Microsoft Copilot Studio-style agent using Dataverse, Microsoft 365 / Outlook connectors, a weather tool and web search.

---

## Table of contents

- [What it does](#what-it-does)
- [Example prompts](#example-prompts)
- [Architecture](#architecture)
- [Data model (Dataverse)](#data-model-dataverse)
- [How a forecast works (overview)](#how-a-forecast-works-overview)
- [Sample output](#sample-output)
- [Reports and email](#reports-and-email)
- [Setup](#setup)
- [Project structure](#project-structure)
- [Limitations](#limitations)
- [Security and privacy](#security-and-privacy)
- [Contributing](#contributing)
- [License](#license)

---

## What it does

| Capability | Description |
|---|---|
| **Demand forecast** | Forecasts units expected to sell by store, SKU, category, weekend, week, 4 weeks or season. |
| **Stock comparison** | Compares forecast with verified current stock and flags shortfalls and surpluses. |
| **Reorder recommendations** | Gives quantity, unit cost, total cost, sales at risk, delivery-time urgency and a risk level. |
| **Demand drivers** | Weather, upcoming local events, U.S. federal public holidays and historical sales boosts. |
| **Sales trends & promotions** | Identifies peak months and best-selling items, and suggests promotions, bundles and featured items backed by history. |
| **Reports** | Generates a PDF report (Word or Excel on request) with charts. |
| **Email** | Drafts an email preview and sends the report via Outlook after the user confirms. |

The agent is written for a **busy store manager**, not an analyst. It leads with the answer, uses plain language, shows status labels (🔴 🟠 🟢 🔵) and explains where each number came from.

## Example prompts

- *For Seattle Store generate SKU-wise demand forecast by category and season.*
- *Show store-level inventory forecast for the next 4 weeks in Denver store.*
- *Recommend reorder quantities based on sales trends for Chicago store.*
- *What stock should I prepare for this weekend?*
- *Which month sells best, and what should I promote?*
- *Why is the recommended order for this item so high?*

## Architecture

```
                 ┌─────────────────────────────┐
   Store manager │  Inventory Forecasting Agent │
   ─────────────▶│  (instructions + skills)     │
                 └──────────────┬──────────────┘
        ┌───────────────┬───────┴────────┬───────────────┐
        ▼               ▼                ▼               ▼
   Dataverse        Weather tool     Web search      Microsoft 365
 (stores, SKUs,    (current/forecast (U.S. holidays   (Outlook email,
  stock, history,    conditions)      & local events)   file reports)
  events)
        │
        ▼
   Code execution  ──▶  PDF / Word / Excel report with charts
```

### Skills

| Skill | Purpose |
|---|---|
| `inventory-forecast` | Forecast, reorder, report and email workflow. |
| `local-events-search` | Finds upcoming sports, concerts and festivals plus federal holidays, and asks the user to confirm them before use. |
| `analyzing-*` (csv, docx, html, markdown, pdf, pptx, xlsx) | Helper skills for reading uploaded files. |

### Data sources and where each is used

| Source | Used for |
|---|---|
| **Dataverse** | The only source of business data: stores, prices, costs, baseline demand, stock, sales history, events. |
| **Weather tool** | Weather conditions for the store city (metric units: °C, mm, km/h). |
| **Web search** | *Only* for U.S. federal holiday dates (OPM) and upcoming local events. Never for stock, prices, costs or sales data. |
| **Microsoft 365 / Outlook** | Sending the report by email. |

## Data model (Dataverse)

| Table (logical name) | Contents |
|---|---|
| `crf1c_storedetails` | Store ID, city, store type. |
| `cred7_skupricingbaseline` | SKU, item, category, unit price, unit cost, baseline weekly units, delivery time, safety buffer. |
| `crf1c_storeinventorydata` | Current stock by item and store location. |
| `crf1c_historicalsaleeventdata` | Past sales boosts by product, condition (Rainy Weekend, Sunny Weekend, Holiday Sale, Local Event), date and city. |
| `crf1c_eventdata` | Upcoming local events by city and date. |

> Rows in the baseline table marked **SAMPLE DEMO DATA** are labelled as sample data in every output.

## How a forecast works (overview)

1. **Identify the store and time window** (default: upcoming weekend; also one week, 4 weeks or a season).
2. **Gather drivers**: weather, confirmed local events, federal holidays and historical sales boosts for the store's city.
3. **Calculate expected sales** from baseline weekly demand scaled to the window, adjusted by the applicable boosts.
4. **Add an extra cushion** (safety buffer) per SKU to get the stock needed.
5. **Compare with verified stock** to find shortfalls or surpluses.
6. **Recommend reorders** with quantity, cost, sales at risk, delivery-time urgency, reliability and risk level.
7. **Offer a report and email.**

The agent only uses retrieved data. If something is missing (for example no baseline data for a city, or no stock rows), it says so instead of estimating.

## Sample output

Each forecast returns:

1. **Summary**: 2–4 plain-language sentences.
2. **Forecast conditions**: weather, events, holidays, dates, season.
3. **Stock check** table: item, SKU, stock now, units expected to sell, shortfall/surplus, status, reliability.
4. **What to order** table: quantity, unit cost, total cost, unit price, sales we could lose.
5. **Totals**: total reorder cost and sales protected.
6. **Data notes**: sample-data label, stock rows used/excluded, last updated date, missing history.
7. **Ideas**: bundles and promotions, only when supported by history.

## Reports and email

- A **PDF report** (default) with weather, event and holiday summary, tables and charts: demand vs stock, reorder cost by category, sales we could lose.
- Word or Excel versions on request.
- An **email preview** (not raw HTML) is shown first. The email is sent with **Send an email (V2)** only after the user confirms the recipient, content and attachment.

## Setup

### Prerequisites

- A Power Platform environment with **Dataverse**
- Microsoft 365 account with **Outlook** (for email)
- Availability of the **Work IQ MCP connector** (`shared_workiqmcp`) and an authorized user connection. The submitted agent enables **Write** access for mail, files, people, sites, Teams and calendar; review these capabilities and the associated permissions before use.
- Access to an AI agent platform (e.g. Microsoft Copilot Studio) that supports Dataverse, Office 365 connectors, web search and code execution

### Steps

1. **Create the Dataverse tables** listed in [Data model](#data-model-dataverse) and load your store, SKU, stock, history and event data.
2. **Create the agent** and paste the agent instructions from `agent/instructions.md` (see [Project structure](#project-structure)).
3. **Add the tools / connectors**:
   - Dataverse (read access to the five tables above)
   - Weather
   - Web search
   - Outlook: Send an email (V2)
   - Code execution (for calculations, charts and report files)
4. **Add the skills** from the `skills/` folder.
5. **Test** with the [example prompts](#example-prompts), starting with a city that has baseline data.
6. **Publish** the agent to your channel (Teams, web, etc.).

### Configuration

| Setting | Notes |
|---|---|
| Dataverse environment URL | Set in your connection, not in source control. |
| Email sender | Uses the signed-in user's mailbox. |
| Sign-off | Emails are always signed "Best regards, Inventory Forecasting Agent". |

## Project structure

Suggested layout for the repository:

```
.
├── README.md
├── agent/
│   └── instructions.md        # Agent instructions / system prompt
├── skills/
│   ├── inventory-forecast/SKILL.md
│   └── local-events-search/SKILL.md
├── data/
│   └── sample/                # Sample CSVs for the five Dataverse tables
└── docs/
    └── screenshots/
```

## Limitations

- Forecasts are only available for cities that have baseline pricing and demand data.
- Stock is matched by **city** and pooled at city level; it cannot be split by individual store.
- Minimum order quantities and pack sizes are not in the data, so recommended quantities are not adjusted for them.
- The holiday boost is a general sale effect, since history is not tied to specific holidays.
- Web-found events are unverified and require user confirmation before they are used.
- Adjustments made in a chat (such as the cushion) apply to that session only and are not saved.
- Prediction accuracy is not tracked.

## Security and privacy

- Business data comes only from Dataverse; web content is treated as untrusted data.
- Usernames are never shown in outputs, emails or files.
- Do **not** commit credentials, tokens, connection strings, environment URLs or real customer data. Use sample data only in this repository.

## Contributing

Issues and pull requests are welcome. Please keep sample data anonymised and do not include secrets.

## License

Add a license of your choice (e.g. MIT) as `LICENSE` in the repository root.
