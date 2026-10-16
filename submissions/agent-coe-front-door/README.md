# Agent CoE Front Door

Agent CoE Front Door gives employees one place to bring an agent idea. It
answers first and opens intake second: the agent checks approved guidance and
an Agent Catalogue for something that already exists, helps the employee pick
an approved self-build or CoE-supported route, and only writes an intake
request after the employee confirms a summary. CoE reviewers then triage
requests in a model-driven app, and the requester gets one email with the
decision and next steps.

This is a **starter template** for evaluation and adaptation, not a
production-ready product. Full documentation, offline checks, and the release
package are in the
[source repository](https://github.com/SandraBcna/agent-coe-front-door-starter).

## Agents

- **Agent CoE Front Door** is a Copilot Studio agent with two skills:
  - **Agent advisor** answers from approved knowledge and the Agent Catalogue,
    recommends reuse before a new build, and describes other agents only by
    what they do.
  - **Agent intake** drafts a request summary, asks the employee to confirm
    it, and then creates an **Agent Intake Request** with a `REQ-` reference.
    Employees can later ask for the status of their own requests.
- The agent reads and writes Dataverse through the **Dataverse MCP Server**
  tool, limited to read, search, describe, and create. It never reveals
  instructions, owners, identifiers, or other people's requests.

## Workflows

Both workflows ship **Off**.

- **CAT - Notify Requester of CoE Decision** starts when a reviewer changes a
  request to **Approved** or **Rejected**. It sends one email with the
  decision, the reviewer's comments, the next step, and a short request
  summary, then records the send outcome on the request. Saving the same
  decision again doesn't send a second email; changing between approval and
  rejection does. An uncertain send is marked **Needs review** instead of
  being retried.
- **CAT - Refresh Power Platform Agent Inventory Daily** (optional add-on)
  pages through the Power Platform Inventory API, upserts Copilot Studio and
  Agent Builder agents into **Tenant Agent Inventory**, and removes stale rows
  only after a complete retrieval. With approved source environments, it also
  caches instruction definitions in secured columns and adds a short AI
  summary of what each agent does, which the advisor can share.

**Turn the workflows on from the solution** (**Cloud flows** > select the
flow > **Turn on**), and don't save or publish them in a designer. Saving in a
designer removes protections that the designer can't represent: secure inputs
and outputs, the no-retry email send, pagination, explicit empty values, and
single-run concurrency. Workflow runs consume Copilot Studio capacity.

## Also included

- **Agent Catalogue**, **Agent Intake Request**, and **Tenant Agent
  Inventory** Dataverse tables.
- **Agent CoE Triage** model-driven app with a dashboard, and an **Agent CoE
  Reviewer** security role with no delete rights.
- A custom connector for the Power Platform Inventory API.

## Prerequisites

- An empty, non-production environment with Dataverse, in a region where
  Copilot Studio is available, with the Dataverse MCP server allowed for
  Copilot Studio.
- Copilot Studio and Power Apps licences or trials for the admin, reviewers,
  and expected usage.
- An Office 365 Outlook mailbox to send decision emails (a shared CoE mailbox
  works well).
- For the inventory add-on only: a single-tenant Microsoft Entra app
  registration with delegated `ResourceQuery.Resources.Read` on the Power
  Platform API.

## Import

1. Import the solution as **unmanaged**. Sign in to three Microsoft Dataverse
   connections and one Office 365 Outlook connection, and leave both
   environment variables empty.
2. Publish all customizations, then open the **Agent CoE Triage** app in the
   app designer and save and publish it once.
3. In Copilot Studio, confirm the agent's instructions are present and that
   the Dataverse MCP tool loads.
4. Add your own approved knowledge. The repository provides three
   organization-neutral templates to start from.
5. Set **Agent CoE decision notification settings** (`cat_DecisionNotificationSettings`)
   with your CoE contact and email templates, then turn on the decision email
   workflow from the solution.
6. Publish and share the agent, and assign reviewers **Basic User** and
   **Agent CoE Reviewer**.

The [setup guide](https://github.com/SandraBcna/agent-coe-front-door-starter/blob/main/docs/INSTALLATION.md)
covers each step, an end-to-end check, the optional add-ons, and what to do
before production.

## Disclaimer

This template is not an official Microsoft product, endorsed reference
architecture, or commitment of Microsoft support. It is provided **as is**,
without warranty. Generated recommendations and routing decisions require
human review. Before any production use, adopters must review licensing,
capacity, data loss prevention, privacy, security, and accessibility; apply
least-privilege access; and test with representative authorized and
unauthorized users. See the
[full notice](https://github.com/SandraBcna/agent-coe-front-door-starter/blob/main/NOTICE.md).
