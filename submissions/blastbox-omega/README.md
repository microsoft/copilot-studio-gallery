# BlastBox Omega Store Operations

BlastBox Omega is the complete sample from the
[Copilot Studio tech guide](https://github.com/microsoft/new-copilot-studio-tech-guide):
a retro-gaming store where agents and workflows share one MCP data layer. This
package combines the guide's connectors, agents, and workflows solutions, so a
single import brings in everything. All data is mock; serials, prices, and
confirmation numbers are illustrative.

## What's inside

### Agents

| Agent | Role | Skills |
| --- | --- | --- |
| **Store Associate Assistant** | Lead agent for the in-store visit. Hands stock and policy questions to Store Policy Agent and Inventory & Fullfilment Agent. | prorated-refund-calculator, points-reconciliation, slip-pdf-generator |
| **Returns & Service Assistant** | Self-serve agent for membership card reissues. | card-reissue, membership-card-png |
| **Store Policy Agent** | Specialist that grounds returns, warranty, membership, and markdown decisions in store policy. | |
| **Inventory & Fullfilment Agent** | Specialist for stock, alternatives, restock timing, and inventory aging. | |

The Python skills come with the agents and register when you publish. You
don't need to upload them.

### MCP servers

Four MCP servers ship as custom connectors with inline code, so no external
hosting is needed. The agents and the workflows share them.

| MCP server | Tools | Used by |
| --- | --- | --- |
| Order Management MCP | Search orders, order details, shipment tracking, returns | Store Associate Assistant, workflow inline agents |
| Membership MCP v2 | `get_membership`, `cancel_membership`, `reissue_card` | Store Associate Assistant, Returns & Service Assistant |
| Policy RAG MCP v2 | `search_policy`, `get_tier_refund_policy`, `get_markdown_policy` | Store Policy Agent, workflow inline agents |
| Warehouse MCP | Stock, fulfilment pipeline, alternatives, restock dates | Inventory & Fullfilment Agent, workflow inline agents |

### Workflows

- **BlastBox Post Sales Service**: one support inbox, three kinds of post-sale
  problem. A Classify node routes each email to a shipment, defect, or general
  enquiry branch. Inline agents combine order, stock, weather, and policy facts,
  and human review guards the consequential decisions. The shipment and defect
  branches merge into one shared return/exchange step.
- **BlastBox Weekly Inventory Health**: the Inventory & Fullfilment Agent
  returns a structured list of active SKUs. A loop sends each SKU down a
  stale, reorder, or healthy lane (a manager reviews the stale lane), and one
  HTML staff digest is emailed at the end.

## Before you start

- A Power Platform environment with **Dataverse** and **Copilot Studio**, with
  the **new Copilot Studio experience** turned on. A First Release or Early
  Release environment is strongly preferred.
- Permission to import solutions and create connections in that environment.
- An Outlook (Office 365) mailbox for the workflows.
- The [Power Platform CLI (`pac`)](https://learn.microsoft.com/power-platform/developer/cli/introduction),
  signed in to the target environment, for the connector step below.
- Prefer an environment in **Europe**. The tech guide found the US custom-code
  capacity pool can be exhausted (`Unable to find an unassigned function app in 'East US'`).

## Set it up

### 1. Import the solution

Download the solution ZIP from this page and import it through **Solutions →
Import solution**. Create or select the connections it asks for, such as Office
365 Outlook, Approvals, and the agent connection. The import can take a while.

### 2. Deploy the MCP connectors' code

Importing registers the four connectors but **doesn't deploy their inline
code**, so their tools won't load yet. Deploy each connector's code with `pac`,
using the files in the tech guide's
[`sample/solution/connectors/`](https://github.com/microsoft/new-copilot-studio-tech-guide/tree/main/sample/solution/connectors)
folder:

```bash
pac connector list            # find each connector's ID in your environment

pac connector update \
  --connector-id <connector-id> \
  --environment <environment-url> \
  --api-definition-file connectors/<slug>/apiDefinition.json \
  --api-properties-file connectors/<slug>/apiProperties.json \
  --script-file connectors/<slug>/script.csx
```

| Connector | Folder (`<slug>`) |
| --- | --- |
| Membership MCP v2 | `membership-mcp-v2` |
| Order Management MCP | `order-management-mcp` |
| Policy RAG MCP v2 | `policy-rag-mcp-v2` |
| Warehouse MCP | `warehouse-mcp` |

Then **publish all customizations** (Solutions → **Publish all
customizations**). This step is what makes the connectors appear in Copilot
Studio's **Add a tool → Model Context Protocol** picker.

> `pac connector update` can take a long time, or keep running after the code
> has deployed. Deploy **Warehouse MCP** a second time and publish again: after
> its first deploy it can appear in the picker but fail at runtime.

### 3. Create the MCP connections

In Power Apps, go to **Connections → New connection** and create one
connection for each of the four MCP connectors. They don't need
authentication.

### 4. Attach the MCP servers to the agents

MCP tool connections don't survive solution export, so the agents ship
**without** their MCP tools. Add them back in Copilot Studio (5 attachments):

1. Open the agent and go to **Tools → Add a tool → Model Context Protocol (MCP)**.
2. Search for the connector by name and pick **`<Name> Server`**.
3. Select the **existing connected connection** (don't create a new one), then
   **Add**.
4. **Save** and **publish** the agent.

| Agent | MCP server(s) to add |
| --- | --- |
| Store Policy Agent | Policy RAG MCP v2 |
| Inventory & Fullfilment Agent | Warehouse MCP |
| Returns & Service Assistant | Membership MCP v2 |
| Store Associate Assistant | Order Management MCP **and** Membership MCP v2 |

Publish the specialists (Store Policy Agent, Inventory & Fullfilment Agent)
before the agents that hand off to them.

### 5. Attach the MCP servers to the workflows' inline agents

The workflows' inline agents also lose their MCP tools on import. Open each
workflow, select the inline agent step, and add these MCP servers:

| Workflow | Inline agent | MCP server(s) to add |
| --- | --- | --- |
| BlastBox Post Sales Service | Review Order, Stock & Weather | Order Management MCP, Policy RAG MCP v2, Warehouse MCP |
| BlastBox Post Sales Service | Review Order & Policy | Order Management MCP, Policy RAG MCP v2 |
| BlastBox Post Sales Service | Trigger Order Return/Exchange | Order Management MCP |
| BlastBox Weekly Inventory Health | Review Order History & Policy | Order Management MCP, Policy RAG MCP v2 |

The **Call Store Policy Agent** and **Call Inventory & Fullfilment Agent** steps
use the published agents, so they work once step 4 is done.

### 6. Configure the workflows

- **BlastBox Post Sales Service** triggers on new email with the subject
  **BlastBox Customer Service** in a specific Outlook folder. The folder comes
  from the original author's mailbox, so open the trigger and select a folder
  in the connected mailbox (for example, your Inbox).
- **BlastBox Weekly Inventory Health**: set the **Email** variable to your own
  mailbox. The manager review card and the weekly digest are sent there.

Save and turn on both workflows.

## Try it

### Agents

- **Block Party Trade-Up**: open **Store Associate Assistant** in
  **Preview** and paste the turns from the
  [runbook](https://github.com/microsoft/new-copilot-studio-tech-guide/blob/main/sample/archive/store-solution/evals/flagship-block-party-trade-up-runbook.md)
  (member `MEGA-BLAST-1024`). Expect `$76.66` / `$100.00` / `$23.34`, the three
  MEGA exclusives, and a generated PDF slip.
- **Self-Serve Card Reissue**: open **Returns & Service Assistant** in
  **Preview** and paste the turns from
  [self-serve-card-reissue.md](https://github.com/microsoft/new-copilot-studio-tech-guide/blob/main/sample/archive/store-solution/evals/self-serve-card-reissue.md)
  (member `MEGA-BLAST-1024`). Expect identity verification, the old card
  deactivated, a new card serial, and a generated PNG card.

More scenarios: [tech guide scenarios](https://microsoft.github.io/new-copilot-studio-tech-guide/#scenarios).

### BlastBox Post Sales Service

Send these from your own mailbox to the connected mailbox, with the subject
starting **BlastBox Customer Service**, so the replies come back to you.

**A. Shipment** (routes to the shipment branch; you pick an option in the reply email)

```text
Ticket 2592780
Customer Name: Jordan Pixel
Customer Email: jordan.pixel@example.com
Customer Order: ORD-10502, placed 9 June 2026
Customer message:
Hi, I'm getting worried about my order. I bought a BlastBox Omega console and it
still hasn't arrived. My gaming-league night is this weekend, can you tell me where
it is, or what my options are?
```

**B. Defect** (an exception, so it pauses for a manager to approve or reject)

```text
Ticket 2492749
Customer Name: Jordan Pixel
Customer Email: jordan.pixel@example.com
Customer Order: ORD-10502, placed 9 June 2026
Customer message:
My BlastBox Omega Core arrived and after using it for a month, it won't power on
at all anymore. At arrival, I noticed the box had suffered damage during transit.
I ignored it assuming the product inside would be protected. I want it replaced
or refunded. Can you assist?
```

**C. General enquiry** (answered by Store Policy Agent, no human step)

```text
Ticket 2122755 - General enquiry
Sender Email: john.doe@example.com
Sender Enquiry:
Hi, thinking about BlastPass before I commit: what's the difference between Plus
and Plus Extra, and is there a fee if I cancel partway through the year? Thanks!
```

### BlastBox Weekly Inventory Health

Run the workflow on demand with **Run**. In the manager review card, select
**Accept Promo** and set **Minimum Discount (%)** to `12` and **Maximum
Discount (%)** to `20`. One "Store Pricing - Weekly Update" email arrives with a
pricing note for each SKU.

## Troubleshooting

- **The MCP servers don't appear in the picker.** Make sure each connector's
  code was deployed (step 2), then publish all customizations again.
- **Warehouse MCP appears but its tools fail.** Deploy its code again and
  publish all customizations.
- **A skill is present but doesn't work.** Re-upload its ZIP from the tech
  guide's [`sample/solution/skills/`](https://github.com/microsoft/new-copilot-studio-tech-guide/tree/main/sample/solution/skills)
  folder through the agent's **Add a skill** dialog, then publish.

## Scripted deployment

The tech guide also ships a script that imports the sample (as separate
connectors and agents solutions), deploys the connector code, creates the
connections, and publishes the agents. You still attach the MCP servers by
hand. See [`deploy/README.md`](https://github.com/microsoft/new-copilot-studio-tech-guide/blob/main/deploy/README.md).
