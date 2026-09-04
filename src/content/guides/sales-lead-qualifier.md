---
title: Sales Lead Qualifier
slug: sales-lead-qualifier
solution: SalesLeadQualifier
---
Sales Lead Qualifier turns a shared sales inbox into a scored, logged pipeline.
Each inbound enquiry is qualified against BANT, written to an Excel log, and
escalated to a seller when the lead is hot.

The workflow splits the work across two agents: one reasons but holds no tools,
the other holds every tool but makes no judgement.

## Agents

- **Classifier Agent** reads the email, decides whether it is a genuine sales
  enquiry, and scores it **Hot**, **Warm**, or **Cold** using BANT. It has no
  tools, so instructions hidden in the message body cannot act on your mailbox.
- **Logging Agent** owns the Excel, OneDrive, and Outlook tools. It trusts the
  Classifier's structured output, appends the lead to the right table, and sends
  the hot-lead notification.

Filtered mail — spam, newsletters, automated replies — stops at the Classifier,
so no If or Else node is needed.

## How the workflow runs

Mail arriving in the shared inbox starts the run. The Classifier qualifies the
enquiry and the Logging Agent persists it. On every run the Logging Agent checks
for the workbook and the **HotLeads**, **WarmLeads**, and **ColdLeads** tables,
creating whatever is missing before writing the row — so a first run works
against an empty OneDrive. Only Hot leads trigger an email.

## Configuration

| Variable | Purpose |
| --- | --- |
| `NotifyEmail` | Address that receives the hot-lead notification. |
| `SalesLogFileName` | Workbook the Logging Agent creates and logs to in the OneDrive root, for example `Sales Lead Log.xlsx`. |

## Customizations

Point the trigger at your own shared sales mailbox, then adjust:

- **BANT criteria and tier names** in the Classifier Agent. Rename tiers or
  change thresholds — but update the Logging Agent's table names to match.
- **Which tiers notify.** Only Hot emails today; Warm is a one-line change.
- **Logged columns** such as region, lead source, or score. Extend the
  Classifier's output and the Logging Agent's headers together.
- **Filtering strictness** for what counts as spam or noise.
- **Storage location** if you want SharePoint or a shared folder instead of the
  OneDrive root.

Keep the Classifier tool-less and let the Logging Agent trust its output — that
split is what keeps a malicious email from reaching your files.

## Prerequisites

Office 365 Outlook, Excel Online (Business), and OneDrive for Business
connections, plus write access to the OneDrive root.

## Import

Download the rebuilt solution ZIP from this page and import it through Power
Platform. Review and replace environment-specific connections during import,
then set `NotifyEmail` and `SalesLogFileName` before turning the workflow on.
