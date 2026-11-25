# AI model lifecycle - notify agent owners

Microsoft regularly retires, migrates and upgrades the AI models that Copilot
Studio agents use, and announces it in the Microsoft 365 Message Center. In a
tenant with hundreds or thousands of agents, nobody knows which agents use the
model a post is about, or who owns them.

This workflow closes that gap. Once a day it reads new Message Center posts,
lets an agent node work out which models and harnesses a post affects, finds
the impacted agents in the Power Platform inventory and emails each owner:

> **Action needed by 2027-02-15: 12 of your Copilot Studio agents use an AI
> model that is changing (MC1234567)**
>
> What changes - what you need to do - your impacted agents (name, model,
> harness, environment).

Admins get one summary per post with totals and the full list of impacted
agents, including agents that have no owner.

## How the workflow works

The design is hybrid: the agent node only reasons, and deterministic steps do
the querying and emailing. That keeps the cost at **one agent run per relevant
post**, however many agents are impacted.

1. **Recurrence** runs the workflow once a day.
2. **Set configuration** holds every environment-specific value in one `Config`
   object (see [Setup](#import-and-setup)).
3. **Set model lifecycle filter** lists the Message Center services whose posts
   can affect Copilot Studio agents.
4. **Get client secret from Key Vault** reads the app registration's secret with
   secure inputs and outputs.
5. **Get Message Center posts** calls
   `GET https://graph.microsoft.com/v1.0/admin/serviceAnnouncement/messages`
   with client-credentials auth, filtered to posts modified in the last
   `lookbackDays`, with paging on.
6. **Get model summary** queries the Power Platform inventory once and returns
   one row per `model` + `harness` combination with an agent count. This stays
   small even in tenants with thousands of agents. Agents on *Copilot Studio
   default* and *Microsoft 365 Copilot* are excluded, because Microsoft moves
   them automatically.
7. **For each message:**
   1. **Is it about AI model lifecycle?** keeps posts that list one of the
      filter's services **and** mention a model term in the title (AI model,
      GPT, Claude, harness, ...) or a retirement term in the body. Other posts
      are skipped without an agent run.
   2. **Identify impacted models** (agent node) reads the whole post, including
      retirement tables, and maps the affected models to the inventory summary.
      It normalizes names, requires exact versions and maps harness names. It
      returns structured output only: `inventoryKeys`, `impacts` (model,
      harness, change, replacement, date), `actionBy`, `headline` and `reason`.
   3. **Any agents impacted?** stops here when no inventory key matched.
   4. **Get impacted agents** and **Get impacted owners** query the inventory
      server-side for the matched keys. Owners are grouped, and agents with no
      owner are left out of the owner emails.
   5. **For each owner** (5 in parallel): *Get owner agents* lists that owner's
      agents with environment names, *Get owner profile* resolves the name and
      email in Entra, and *Send owner email* sends the email. The email is High
      importance when the action-by date is within 30 days.
   6. **Send admin summary** emails `adminEmail` with the scope, totals, whether
      the email cap was hit, and the first 500 impacted agents.

Every customization point has a **CUSTOMIZE** note on the workflow canvas. The
blue notes explain the steps in between. Open the workflow in the designer to
read them.

## Prerequisites

- A Dataverse environment with Copilot Studio workflows, plus permission to
  import an unmanaged solution and create connections.
- **An Entra app registration** with Microsoft Graph `ServiceMessage.Read.All`
  (**application** permission, admin consent granted) and a client secret.
- **Azure Key Vault** holding that client secret, and an account or app that can
  read secrets from it (for example the *Key Vault Secrets User* role).
- **A Power Platform administrator (or Global administrator)** account for the
  *Power Platform for Admins V2* connection. The inventory only returns all
  agents to an admin. After you assign the role, sign in to the connection again,
  because old tokens keep returning 403.
- A mailbox to send from (the *Office 365 Outlook* connection) and an admin or
  governance mailbox to receive the summaries.
- Copilot Credits: one agent run per post that passes the filter.

## Import and setup

1. Import the unmanaged solution through Power Platform **Solutions**. When using
   the exploded source directly, package the contents of `solution/` as a ZIP
   with `solution.xml` and `customizations.xml` at its root. Do not include the
   gallery metadata or this README.
2. Bind the connection references. No connections or credentials are included.

   | Connection reference | Connector | Used for |
   | --- | --- | --- |
   | `new_sharedkeyvault_mcplanner` | Azure Key Vault (point it at your vault) | Graph client secret |
   | `new_sharedpowerplatformadminv2_aimodel` | Power Platform for Admins V2 | Agent inventory queries |
   | `new_sharedagentnode_50374135` | Agent | *Identify impacted models* |
   | `new_sharedoffice365_aimodel` | Office 365 Outlook | Sending the emails (sender) |
   | `new_sharedoffice365users_aimodel` | Office 365 Users | Owner names and emails |

3. Open **Set configuration** and replace the placeholders:

   | Field | Default | Meaning |
   | --- | --- | --- |
   | `tenantId` | `<your-tenant-id>` | Your Entra tenant ID |
   | `clientId` | `<your-app-client-id>` | The app registration with `ServiceMessage.Read.All` |
   | `keyVaultSecretName` | `<your-key-vault-secret-name>` | The secret holding its client secret |
   | `adminEmail` | `ai-governance@contoso.com` | Gets one summary per post, and every email in test mode |
   | `contactText` | `your Power Platform environment admins` | Who owners should contact, shown in the owner email |
   | `lookbackDays` | `1` | How far back to read posts. Keep it equal to the trigger interval |
   | `testMode` | `true` | Owner emails go to `adminEmail` only, with a banner showing the real recipient |
   | `testModeMaxEmails` | `3` | Owner emails per post in test mode |
   | `maxOwnerEmailsPerPost` | `100` | Safety cap on owner emails per post. The summary says when it was hit |
   | `environmentIds` | `[]` | **Scope**: environment IDs to check, for example `["<env-id-1>", "<env-id-2>"]`. Leave `[]` for the whole tenant |

4. Optionally adjust **Set model lifecycle filter** (services) and the keywords
   in **Is it about AI model lifecycle?**.
5. Test it from the designer (**Test** / **Run now**). To pick up recent posts,
   raise `lookbackDays` temporarily (for example to `30`), and scope it to one or
   two environments with `environmentIds`. In test mode, every email arrives in
   `adminEmail`.
6. When the emails look right, set `testMode` to `false`, set `lookbackDays` back
   to the trigger interval, and leave the workflow on. It runs **daily**. If you
   change the frequency, keep `lookbackDays` equal to it.

### Who the emails come from

*Send owner email* and *Send admin summary* use **Send an email (V2)**, so they
are sent from the account behind the *Office 365 Outlook* connection. To send
from a shared mailbox instead (for example `ai-governance@...`), swap both steps
to **Send an email from a shared mailbox (V2)** and give the connection account
*Send As* permission on that mailbox.

### Keeping the connections running

The Key Vault, Admins V2, Outlook and Users connections sign in as a user. If
that user's sign-in expires or the user loses a role, runs fail with 401 or 403.
For production, use a dedicated service account for the connections. For Key
Vault you can also use a **service principal** connection, or replace the step
with a Key Vault-backed **secret environment variable**. Only the connections
change, not the workflow.

## Data and actions

- **Reads:** Microsoft 365 Message Center posts for your tenant (Graph), one Key
  Vault secret, Copilot Studio agents and environments in the Power Platform
  inventory, and owner profiles in Entra.
- **Writes:** sends emails to agent owners and to `adminEmail`. Nothing in your
  agents or environments is changed. The post content and the model summary are
  sent to the agent node's model.

## Limitations

- This is a sample, not a production-ready service. Review the filter, keywords
  and email text before turning off test mode.
- The agent's matches, dates and replacements are model output and can be wrong.
  Every email links to the original post, and the admin summary shows the
  agent's reasoning. Check before you act.
- The agent maps the Message Center *Microsoft Copilot harness* to the
  inventory's `GitHub Copilot` harness. Adjust rule 4 in its instructions if
  your posts or inventory name harnesses differently.
- `properties.model` in the inventory is a preview field and reflects the
  **published** version of each agent. Draft-only changes are not seen.
- The inventory API returns at most 1,000 rows per call. Each owner's own list is
  queried separately, so owners are never cut off, but the admin summary lists at
  most 500 agents (totals are always exact).
- An owner who can't be found in Entra (for example a deleted user) gets no
  email. The email goes to `adminEmail` with an *Owner not found* banner instead.
- Each run looks back a fixed `lookbackDays` window. If a run is missed or fails,
  posts changed in that gap are not picked up unless they change again. To catch
  up, run once with a larger `lookbackDays` (owners may get an email again for
  posts already processed).
- The sample was built and tested in its source environment, scoped to a few
  environments. No fresh-environment import has been verified yet.
