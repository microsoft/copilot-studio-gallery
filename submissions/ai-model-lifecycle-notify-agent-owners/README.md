# AI model lifecycle - notify agent owners

Microsoft regularly retires, migrates and upgrades the AI models that Copilot
Studio agents use, and announces it in the Microsoft 365 Message Center. In a
tenant with hundreds or thousands of agents, nobody knows which agents use the
model a post is about, or who owns them.

This workflow closes that gap. Once a day it reads new Message Center posts,
skips the ones it has already handled,
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
the querying and emailing. That keeps the cost at **one agent run per new post
from a model service**, however many agents are impacted.

1. **Recurrence** runs the workflow once a day.
2. **Set configuration** holds every environment-specific value in one `Config`
   object (see [Setup](#import-and-setup)).
3. **Set model lifecycle filter** lists the Message Center services whose posts
   can affect Copilot Studio agents.
4. **Get Message Center posts** calls
   `GET https://graph.microsoft.com/v1.0/admin/serviceAnnouncement/messages`
   through the **HTTP With Microsoft Entra ID** connector, signed in as the
   connection user. No app registration, secret or certificate is needed. It
   reads posts modified in the last `lookbackDays`, up to 1,000 in one call.
5. **List processed posts**, **Select processed post IDs** and **Filter new
   posts** read the *AI model processed post* Dataverse table and drop every
   post that is already in it. Each post is handled once, even when Microsoft
   updates it later or the lookback windows of two runs overlap. The lookup
   pages through up to 100,000 rows (years of posts); see
   [Processed posts](#processed-posts-dataverse).
6. **Get model summary** queries the Power Platform inventory once and returns
   one row per `model` + `harness` combination with an agent count. This stays
   small even in tenants with thousands of agents. Agents on *Copilot Studio
   default* and *Microsoft 365 Copilot* are excluded, because Microsoft moves
   them automatically.
7. **For each new post** (one at a time, so the per-post variables are not
   shared):
   1. **Is it from a model service?** keeps posts that list one of the
      filter's services. This is the only deterministic gate: there is no
      keyword list to maintain. Posts from other services are skipped without
      an agent run.
   2. **Identify impacted models** (agent node) reads the whole post, including
      retirement tables, decides whether it is about AI model lifecycle at all,
      and maps the affected models to the inventory summary. It normalizes
      names, requires exact versions and maps harness names. It returns
      structured output only: `verdict` (`impacted`, `no_impact` or
      `not_about_models`), `inventoryKeys`, `impacts` (model, harness, change,
      replacement, date), `actionBy`, `headline` and `reason`.
   3. **Validate the agent's keys.** *Select returned keys* splits the agent's
      `inventoryKeys`, and *Filter matched keys* / *Filter unmatched keys*
      compare them (case-insensitively) with the keys in the model summary.
      Only keys that really exist in the inventory are queried, so a mistyped
      or invented key can never select the wrong agents.
   4. **Any agents impacted?** is true when the verdict is `impacted` **and** at
      least one key is valid. Otherwise *Record no impact* saves the post with
      the agent's reason and status `not_about_models`, `no_impact`, or
      `unmatched_keys` (the agent said impacted but none of its keys exist in
      the inventory), and the workflow moves on. Unmatched keys are listed in
      the reason, so a bad match is distinguishable from a genuine no-impact.
   5. **Read all impacted agents** queries the inventory once per post for the
      matched keys and follows the `skipToken` page by page (1,000 rows per
      page, up to 100 pages). *Select owner ids*, *Filter owner ids*, *Join
      owner ids* and *Select owners* then build the owner list in the workflow:
      one entry per owner with an agent count. Agents with no owner are left out
      of the owner emails.
   6. **For each owner** (5 in parallel) runs over the owners sorted by agent
      count (most first, ties by owner id), so when the email cap applies the
      most impacted owners are emailed first and the selection is the same on
      every run. *Filter owner agents* takes that owner's agents from the rows
      already read (no second query), *Get owner profile* resolves the name and
      email in Entra, and *Send owner email* sends the email. If the profile
      lookup fails, *Add unresolved owner* records the owner id for the admin
      summary and the email goes to `adminEmail` instead. The email is High
      importance when the action-by date is within 30 days. Migration steps are
      only included for impacts that list a replacement model; for upgrades,
      automatic migrations and behavior changes owners are asked to test.
   7. **Send admin summary** emails `adminEmail` with the scope, totals, whether
      the email cap was hit, owners not found in Entra, any keys the agent
      returned that are not in the inventory, and the first 500 impacted agents.
   8. **Record processed post** saves the post as `notified` (or
      `notified_with_errors` when an owner email or the admin summary failed)
      with the number of impacted agents.

   **Retries.** If a step before the emails fails (reading posts, the agent or
   the inventory queries), nothing is recorded and the next run retries the post,
   as long as it is still inside `lookbackDays`. A post recorded as
   `notified_with_errors` is **not** retried automatically. Check the run
   history, then delete its row to send it again. That re-sends to every owner of
   the post, so owners who already got the email get it twice.

Every customization point has a **CUSTOMIZE** note on the workflow canvas. The
blue notes explain the steps in between. Open the workflow in the designer to
read them.

## Prerequisites

- A Dataverse environment with Copilot Studio workflows, plus permission to
  import an unmanaged solution (it creates one table) and create connections.
- **Read and Create** access to the *AI model processed post* table for the
  account behind the *Microsoft Dataverse* connection (for example through a
  security role). Without it, runs fail before any post is processed, or posts
  are not recorded and are handled again.
- **Message Center access for the Graph connection.** The account behind the
  *HTTP With Microsoft Entra ID* connection needs the **Message Center Reader**
  role (or a higher admin role). An admin must also consent to the delegated
  Microsoft Graph permission `ServiceMessage.Read.All` for the connector's app
  (*PowerPlatform-webcontentsv2-Connector*). Without consent, signing in fails
  with a "needs admin approval" message.
- **A Power Platform administrator (or Global administrator)** account for the
  *Power Platform for Admins V2* connection. The inventory only returns all
  agents to an admin. After you assign the role, sign in to the connection again,
  because old tokens keep returning 403.
- A mailbox to send from (the *Office 365 Outlook* connection) and an admin or
  governance mailbox to receive the summaries.
- Copilot Credits: one agent run per new post from a filtered service (each post
  is handled once). Check the credits used per run in the run history. The
  first run reads the whole `lookbackDays` window, so start with a small
  `lookbackDays` or a few services if you want to limit that first batch.

## Import and setup

1. Import the unmanaged solution through Power Platform **Solutions**. When using
   the exploded source directly, package the contents of `solution/` as a ZIP
   with `solution.xml` and `customizations.xml` at its root. Do not include the
   gallery metadata or this README.
2. Bind the connection references. No connections or credentials are included.

   | Connection reference | Connector | Used for |
   | --- | --- | --- |
   | `new_sharedwebcontentsv2_aimodel` | HTTP With Microsoft Entra ID. Set both *Base Resource URL* and *Microsoft Entra ID Resource URI* to `https://graph.microsoft.com` | Reading Message Center posts |
   | `new_sharedpowerplatformadminv2_aimodel` | Power Platform for Admins V2 | Agent inventory queries |
   | `new_sharedcommondataserviceforapps_aimodel` | Microsoft Dataverse (this environment) | Reading and recording processed posts |
   | `new_sharedagentnode_50374135` | Agent | *Identify impacted models* |
   | `new_sharedoffice365_aimodel` | Office 365 Outlook | Sending the emails (sender) |
   | `new_sharedoffice365users_aimodel` | Office 365 Users | Owner names and emails |

3. Open **Set configuration** and replace the placeholders:

   | Field | Default | Meaning |
   | --- | --- | --- |
   | `adminEmail` | `ai-governance@contoso.com` | Gets one summary per post, and every email in test mode |
   | `contactText` | `your Power Platform environment admins` | Who owners should contact, shown in the owner email |
   | `lookbackDays` | `30` | How far back to read posts each run. A safety window: missed or failed runs catch up, and posts already handled are skipped |
   | `testMode` | `true` | Owner emails go to `adminEmail` only, with a banner showing the real recipient |
   | `testModeMaxEmails` | `3` | Owner emails per post in test mode |
   | `maxOwnerEmailsPerPost` | `100` | Safety cap on owner emails per post. The summary says when it was hit |
   | `environmentIds` | `[]` | **Scope**: environment IDs to check, for example `["<env-id-1>", "<env-id-2>"]`. Leave `[]` for the whole tenant |

4. Optionally adjust the services in **Set model lifecycle filter**. Fewer
   services means fewer agent runs; the agent decides relevance for the rest.
5. Test it from the designer (**Test** / **Run now**), scoped to one or two
   environments with `environmentIds`. In test mode, every email arrives in
   `adminEmail`.
6. Test runs also record the posts they handle. Before going live, delete the
   test rows from the *AI model processed post* table (see below) so owners get
   those posts too. Then set `testMode` to `false` and leave the workflow on. It
   runs **daily**; you can change the frequency without touching `lookbackDays`.

### Processed posts (Dataverse)

The solution includes the **AI model processed post** table
(`at_aimodelprocessedpost`). The workflow adds one row per post it has handled:

| Column | Content |
| --- | --- |
| Name (`at_name`) | Message Center ID, for example `MC1234567` |
| Title | Post title |
| Status | `notified`, `notified_with_errors`, `no_impact`, `not_about_models` or `unmatched_keys` |
| Agents impacted | Number of impacted agents in scope |
| Post last modified | The post's `lastModifiedDateTime` when it was handled |
| Reason | The agent's reasoning |

Posts from services outside the filter are not recorded, so they cost nothing.
Every post the agent reads is recorded, so it never costs a second agent run.
Review `unmatched_keys` rows: they usually mean the agent matched a model name
that is written differently in the inventory. To send a post
again (for example after changing the scope or the email text), delete its row.

*List processed posts* reads up to 100,000 rows each run. Past that, older rows
are not read and their posts could be handled again if they come back into the
lookback window. Delete rows older than `lookbackDays` from time to time (they
are no longer needed) to stay well below that.

### Who the emails come from

*Send owner email* and *Send admin summary* use **Send an email (V2)**, so they
are sent from the account behind the *Office 365 Outlook* connection. To send
from a shared mailbox instead (for example `ai-governance@...`), swap both steps
to **Send an email from a shared mailbox (V2)** and give the connection account
*Send As* permission on that mailbox.

### Keeping the connections running

All connections sign in as a user, so the workflow stores no secrets. If that
user's sign-in expires or the user loses a role, runs fail with 401 or 403. For
production, use a dedicated service account for the connections. Only the
connections change, not the workflow.

## Data and actions

- **Reads:** Microsoft 365 Message Center posts for your tenant (Graph), Copilot Studio agents and environments in the Power Platform
  inventory, and owner profiles in Entra.
- **Writes:** sends emails to agent owners and to `adminEmail`, and adds one
  row per handled post to the *AI model processed post* table. Nothing in your
  agents or environments is changed. The post content and the model summary are
  sent to the agent node's model.

## Limitations

- This is a sample, not a production-ready service. Review the service filter, the
  agent instructions and the email text before turning off test mode.
- The agent's matches, dates and replacements are model output and can be wrong.
  Every email links to the original post, and the admin summary shows the
  agent's reasoning. Check before you act.
- The agent maps the Message Center *Microsoft Copilot harness* to the
  inventory's `GitHub Copilot` harness. Adjust rule 4 in its instructions if
  your posts or inventory name harnesses differently.
- `properties.model` in the inventory is a preview field and reflects the
  **published** version of each agent. Draft-only changes are not seen.
- Impacted agents are read in pages of 1,000, up to 100,000 per post. If a post
  impacts more, the owner emails say the list is partial and the admin summary
  says how many were read. The admin summary lists at most 500 agents (totals
  are always exact).
- The admin summary counts the owners **selected** for an email. If any send
  fails it shows a red warning; check *Send owner email* in the run history.
- An owner who can't be found in Entra (for example a deleted user) gets no
  email. The email goes to `adminEmail` with an *Owner not found* banner
  instead, and the admin summary lists the owner id.
- A post is handled once. If Microsoft later updates it (for example with a new
  date), owners are not emailed again; delete the post's row to re-send it.
- Each run reads up to 1,000 posts modified within `lookbackDays` (30 days is
  usually a few hundred). If a very large window returns more, the rest are not
  read in that run.
- Posts older than `lookbackDays` are never read. If the workflow is off for
  longer than that, raise `lookbackDays` for one run to catch up.
- The sample was built and tested in its source environment, scoped to a few
  environments. No fresh-environment import has been verified yet.
