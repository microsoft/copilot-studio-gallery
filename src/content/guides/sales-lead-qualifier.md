---
title: Sales Lead Qualifier
slug: sales-lead-qualifier
solution: SalesLeadQualifier
---
Reads inbound sales enquiries from a shared mailbox, qualifies each one using
BANT (Budget, Authority, Need, Timing), logs it by tier, and notifies the sales
team only when the lead is Hot.

## Workflow

The **Sales Lead Qualifier** cloud flow uses two chained agents:

1. Starts when an email arrives in a shared sales mailbox.
2. The **Classifier Agent** (no tools, reasoning only) reads the email and
   decides whether it is a genuine sales enquiry. Non-enquiries (newsletters,
   recruitment, vendor pitches, invoices, support requests, out-of-office or
   auto-reply messages) are set to `Filtered` and go no further. Genuine
   enquiries are scored against BANT (Budget, Authority, Need, Timing) and
   assigned a tier:
   - **Hot** — Budget and Authority are both Strong, and Need or Timing is Strong.
   - **Warm** — at least one Strong signal but short of the Hot bar.
   - **Cold** — mostly Weak or Absent signals with no clear buying intent.
   The Classifier treats the email body as untrusted content and ignores any
   instructions embedded in it (e.g. attempts to force a Hot classification or
   to leak configuration values).
3. The **Logging Agent** reads the Classifier's output and owns all Excel,
   OneDrive, and Outlook actions. If Tier is `Filtered`, it does nothing.
   Otherwise it:
   - Checks whether the configured log workbook exists via **Get tables**, and
     auto-creates the file (via OneDrive **Create file**) and any of the
     `HotLeads` / `WarmLeads` / `ColdLeads` tables that are missing (via Excel
     **Create table**), so a first run with no existing file or tables is
     handled automatically.
   - Logs one row to the table matching the tier via **Add a row into a
     table**.
   - For Hot leads only, sends a notification email via Outlook **Send an
     email** summarizing the company, contact, need, and the Strong signals.

## Import notes

- Configure the Microsoft 365 Outlook connection used by the shared-mailbox
  trigger, and set the trigger's mailbox address and folder to your own shared
  sales mailbox.
- Configure the Agent connection used by both the Classifier and Logging agents.
- In the **Configuration** action, replace `sales-lead-notify@example.com`
  (the `NotifyEmail` variable) with the address that should receive Hot lead
  notifications.
- In the **Configuration_Init_SalesLogFileName** action, confirm the
  `SalesLogFileName` variable (`Sales Lead Log.xlsx`) matches the workbook name
  you want created/used at the root of your OneDrive.
- The Logging Agent's **Create file**, **Get tables**, **Create table**, **Add
  a row into a table**, and **Send an email** tools have connection IDs
  hardcoded from the original authoring environment. Solution import does not
  remap these values, so open the Logging Agent node after import and
  re-select all five tool connections (OneDrive, Excel Online Business, and
  Outlook) before enabling the flow.

The solution is exported as unmanaged and includes a saved modern-designer
canvas for its workflow preview.
