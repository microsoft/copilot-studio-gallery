# Sales Lead Qualifier

Sales Lead Qualifier includes two alternative workflows in one solution. Both
monitor a shared Inbox for emails with **sales** in the subject, qualify each
enquiry using BANT (Budget, Authority, Need, and Timing), and notify a seller
only when a lead is **Hot**.

Choose either workflow based on your storage needs, use case, and available
Power Platform licensing. You do not need to run both.

## Authors

Isha Gautam, Jasmita Lamba, and Pulkit Bhagat.

## Choose a workflow

| | Sales Lead Qualifier - Original | Sales Lead Qualifier - Revised |
| --- | --- | --- |
| Best fit | A lightweight, spreadsheet-based sales pipeline. | Structured lead records in Dataverse with richer contact details and linked alerts. |
| Storage | `HotLeads`, `WarmLeads`, and `ColdLeads` tables in `Sales Log.xlsx` at the OneDrive root. | The included custom **Sales Lead V2** Dataverse table, not the standard Dynamics Lead table. |
| Classification | BANT results as a labeled text block. | BANT results as structured fields, including phone when explicitly provided. |
| Logging | Logging Agent manages Excel and OneDrive tool calls and workbook/table setup. | Tool-less Lead Agent prepares fields; an explicit connector action creates the record. |
| Filtering | Logging Agent skips leads classified as `Filtered`. | An explicit condition skips the Lead Agent and downstream steps for `Filtered` emails. |
| Hot-lead alert | Logging Agent sends an email with the qualification summary. | A separate Notifier Agent sends a High-importance email with a link to the created record. |
| Licensing considerations | Requires access to AI workflow capabilities and Outlook, Excel, and OneDrive connections; avoiding Dataverse does not make it license-free. | Also requires an entitlement covering the premium Dataverse connector and appropriate table permissions. |

### Original: Excel logging

Shared mailbox email -> Classifier Agent -> Logging Agent.

- **Classifier Agent** uses Sonnet 5 with no tools. It reads the email as
  untrusted data and classifies it as **Hot**, **Warm**, **Cold**, or **Filtered**.
  Its labeled text output includes contact details and the BANT rationale.
- **Logging Agent** uses Sonnet 5 and owns Excel, OneDrive, and Outlook tools.
  For non-Filtered leads, it checks for the workbook and the three tier-specific
  tables, creates missing resources, and writes the lead to the matching table.
  Only Hot leads trigger an email to `NotifyEmail`.

### Revised: Dataverse logging

Shared mailbox email -> Classifier Agent -> exclude Filtered -> Lead Agent
-> ShouldLog condition -> Add a new row -> ShouldNotify condition -> Notifier Agent.

- **Classifier Agent** uses Claude Opus 5 with no tools. It returns structured
  contact details, phone, tier, BANT signals, reasons, and the Hot-lead subject.
- **Filtered condition** prevents non-sales emails from reaching the Lead Agent,
  record creation, or notification.
- **Lead Agent** uses Claude Opus 5 with no tools. It prepares the record name,
  subject, first and last names, email address, company, phone, lead source,
  quality, description, numeric budget when explicitly stated, and purchase
  timeframe. It sets `ShouldLog` to true for genuine enquiries and
  `ShouldNotify` to true only for Hot leads.
- **Add a new row** is a Dataverse connector action, not an agent tool. It runs
  only when `ShouldLog` is true.
- **Notifier Agent** uses Claude Opus 5 with only the Outlook Send email tool.
  It runs after successful record creation, only when `ShouldNotify` is true,
  and appends a deep link built from the created record's response.

### Qualification rules

- **Hot:** Budget Strong and Authority Strong, plus Need Strong or Timing Strong.
- **Warm:** At least one Strong signal without meeting the Hot criteria.
- **Cold:** Mostly Weak or Absent signals, generic requests, or no clear buying
  intent.
- **Filtered:** Non-sales messages such as newsletters, recruitment, invoices,
  support requests, and automated replies. Neither workflow logs or notifies
  these messages.

There is no duplicate lookup in either workflow; repeated enquiries can create
additional rows.

## Configuration

| Setting | Purpose |
| --- | --- |
| Shared mailbox address | Both triggers use `alias@contoso.com`. Replace this placeholder with a mailbox you can access. |
| Subject filter | Both workflows use `sales`. Adjust it to match your inbound enquiries. |
| Folder and polling | Both workflows monitor `Inbox` every minute. |
| `NotifyEmail` | Both workflows use `alias2@contoso.com` for Hot-lead alerts. Replace it with your sales notification address. |
| `SalesLogFileName` | Original workflow: workbook created and used at the OneDrive root. Default: `Sales Log.xlsx`. |
| `TriggerMailbox` | Revised workflow: `alias@contoso.com`. This variable does not drive the trigger; update the trigger address separately when changing mailboxes. |
| `LeadTableName` | Revised workflow: `iwf_sl2_salesleadv2s`, the entity set for the included Sales Lead V2 table. |

The Dataverse table, BANT rules, and AI model selections are unchanged.

## Customizations

Point the trigger at your own shared sales mailbox, then adjust:

- **BANT criteria and tier names** in the Classifier Agent. For Original, keep
  Logging Agent table mappings aligned. For Revised, update downstream
  conditions and Lead Agent mappings together.
- **Which tiers notify.** Only Hot leads notify by default. Update Original's
  Logging Agent instructions or Revised's Lead Agent `ShouldNotify` decision.
- **Logged fields** such as region or lead score. For Original, extend the
  Classifier's output and Logging Agent headers together. For Revised, update
  structured outputs, the Dataverse schema, and the row-creation mapping.
- **Filtering strictness** for what counts as spam or noise.
- **Storage location** if you need SharePoint or a shared folder rather than
  OneDrive or Dataverse.
- **Duplicate handling** if repeat enquiries should update or reference an
  existing lead instead of creating another record.

Keep classification tool-less, treat email content as untrusted, and constrain
tool-bearing agents to their intended logging or notification actions.

## Prerequisites

- **Both workflows:** a Power Platform environment where you can import the
  solution, access to the AI workflow capabilities and selected models,
  applicable licensing and capacity, an Outlook connection, access to the
  shared mailbox, and permission to send notifications.
- **Original:** Excel Online (Business) and OneDrive for Business connections,
  plus write access to the OneDrive root.
- **Revised:** a Dataverse connection and create permissions on the included
  Sales Lead V2 table. Notification recipients also need access to the record
  to open its link.

### Licensing

Choose Original if Excel storage meets your needs and you do not have an
entitlement covering the Revised workflow's Dataverse use. Choose Revised if
you need structured Dataverse records and linked alerts and your organization's
Power Platform licensing covers that scenario.

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
3. Replace `alias@contoso.com` in the selected trigger and
   `alias2@contoso.com` in `NotifyEmail`. For Revised, also update
   `TriggerMailbox` to keep its configuration consistent.
4. For Original, confirm `SalesLogFileName`. For Revised, confirm access to
   Sales Lead V2 and verify that notification recipients can open record links.
5. Test Hot, Warm, Cold, and non-sales emails with `sales` in the subject.
   Confirm that genuine enquiries are logged, Filtered messages are skipped,
   and only Hot leads notify. For Revised, also test missing budget, phone, and
   contact-name fields.
6. Enable only the selected workflow and leave the other disabled. Both use
   the same mailbox and subject filter, so enabling both can produce duplicate
   processing and alerts.

Each matching email invokes classification and consumes AI capacity. Turn the
workflow off between experiments to avoid unnecessary consumption.
