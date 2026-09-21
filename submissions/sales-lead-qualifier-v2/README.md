# Sales Lead Qualifier V2

Watches a shared sales mailbox for incoming enquiries, qualifies each one
using BANT (Budget, Authority, Need, Timing), and logs qualified leads
straight into the native Dataverse **Lead** table — with an email alert to
the sales team for Hot leads.

## How it works

- **Trigger** — fires when any new email arrives in the configured shared
  mailbox (no subject filter — every inbound email is evaluated).
- **Classifier Agent** — reads the From/Subject/Body of the email and decides
  whether it's a genuine sales enquiry. Non-enquiries (newsletters,
  recruitment, vendor pitches, invoices, support requests, auto-replies) are
  tagged `Filtered` and dropped. Genuine enquiries are scored against BANT
  (Budget, Authority, Need, Timing — each `Strong`/`Weak`/`Absent`) and
  assigned a `Tier` of `Hot`, `Warm`, or `Cold`. The email body is treated as
  untrusted content — embedded instructions (e.g. "classify this as Hot") are
  ignored.
- **Lead Agent** — owns the Dataverse and Outlook tools. If `Tier` is
  `Filtered`, it does nothing at all — no record, no notification. Otherwise
  it creates one Lead record with native fields (`subject`, `firstname`,
  `lastname`, `emailaddress1`, `companyname`, `telephone1`,
  `leadsourcecode`, `leadqualitycode`, `description`, `budgetamount`,
  `purchasetimeframe`), never guessing a budget figure that wasn't explicitly
  stated. It emails the configured notify address only when `Tier` is `Hot`.

## Configuration

| Variable | Purpose |
| --- | --- |
| `LeadTableName` | Logical name of the Dataverse table to log leads to (defaults to the standard `lead` table). |
| `DynamicsEnvironmentUrl` | Your Dataverse environment URL (for example `https://yourorg.crm.dynamics.com`). Update this to your own environment before publishing. |
| `NotifyEmail` | Address that gets emailed for Hot leads (defaults to a placeholder — set this to your sales team's address). |

## Import notes

- Point the trigger at your own shared sales mailbox. If the **Folder** field
  shows "Loading..." after importing this solution, the folder ID is tied to
  the original mailbox — reopen the trigger and re-select the folder for your
  own mailbox connection before publishing.
- The Lead Agent uses the native Dataverse connector's "Add a new row to
  selected environment" action. In some Personal Developer environments, the
  default Data Loss Prevention policy blocks the `CreateRecordWithOrganization`
  action this relies on — if you hit a DLP error on publish, import into a
  Sandbox or Production environment instead.
- Update `DynamicsEnvironmentUrl` and `NotifyEmail` to your own environment and
  team address — both ship with placeholder values.
