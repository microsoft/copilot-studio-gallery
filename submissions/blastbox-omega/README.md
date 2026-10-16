# BlastBox Omega Store Operations

BlastBox Omega is a retro-gaming store where agents and workflows share one
MCP data layer. One import brings in the agents, workflows, skills, and MCP
servers. All data is mock; serials, prices, and confirmation numbers are
illustrative.

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

**BlastBox Post Sales Service** handles one support inbox with three kinds of
post-sale problem. An email with the subject **BlastBox Customer Service**
starts it, and a Classify node routes the email:

- **Shipment:** an inline agent reviews the order, live stock, restock date,
  and local weather, then emails the customer their options. The customer picks
  one: wait, or return/exchange.
- **Defect:** an inline agent weighs the order against policy. If the case is an
  exception, a manager approves or rejects it before anything changes.
- **Other:** the Store Policy Agent answers from policy, with no human step.

The shipment and defect branches merge into one shared return/exchange step.

**BlastBox Weekly Inventory Health** is a scheduled review of every active
gaming SKU. The Inventory & Fullfilment Agent returns a structured SKU list,
and a loop sends each SKU down one of three lanes:

- **Stale:** an inline agent proposes a pricing change, and a manager confirms
  the discount in an Outlook card.
- **Reorder:** keep the price and keep it on the main shelf.
- **Healthy:** no action.

The run ends with one HTML staff digest email, not a message per SKU.

## Before you start

- A Power Platform environment with **Dataverse** and **Copilot Studio**, with
  the **new Copilot Studio experience** turned on. A First Release or Early
  Release environment is strongly preferred.
- Permission to import solutions and create connections in that environment.
- An Outlook (Office 365) mailbox for the workflows.

## Set it up

### 1. Import the solution

Download the solution ZIP from this page and import it through **Solutions →
Import solution**. Create or select the connections it asks for.

### 2. Attach the MCP servers to the agents

MCP tool connections don't survive solution export, so the agents ship
**without** their MCP tools. Add them back in Copilot Studio (5 attachments):

1. Open the agent and go to **Tools → Add a tool → Model Context Protocol (MCP)**.
2. Search for the connector by name and pick **`<Name> Server`**.
3. Select the connection, then **Add**.
4. **Save** and **publish** the agent.

| Agent | MCP server(s) to add |
| --- | --- |
| Store Policy Agent | Policy RAG MCP v2 |
| Inventory & Fullfilment Agent | Warehouse MCP |
| Returns & Service Assistant | Membership MCP v2 |
| Store Associate Assistant | Order Management MCP **and** Membership MCP v2 |

Publish the specialists (Store Policy Agent, Inventory & Fullfilment Agent)
before the agents that hand off to them.

### 3. Attach the MCP servers to the workflows' inline agents

The workflows' inline agents also lose their MCP tools on import. Open each
workflow, select the inline agent step, and add these MCP servers:

| Workflow | Inline agent | MCP server(s) to add |
| --- | --- | --- |
| BlastBox Post Sales Service | Review Order, Stock & Weather | Order Management MCP, Policy RAG MCP v2, Warehouse MCP |
| BlastBox Post Sales Service | Review Order & Policy | Order Management MCP, Policy RAG MCP v2 |
| BlastBox Post Sales Service | Trigger Order Return/Exchange | Order Management MCP |
| BlastBox Weekly Inventory Health | Review Order History & Policy | Order Management MCP, Policy RAG MCP v2 |

The **Call Store Policy Agent** and **Call Inventory & Fullfilment Agent** steps
use the published agents, so they work once step 2 is done.

### 4. Configure the workflows

- **BlastBox Post Sales Service** triggers on new email with the subject
  **BlastBox Customer Service** in a specific Outlook folder. The folder comes
  from the original author's mailbox, so open the trigger and select a folder
  in the connected mailbox (for example, your Inbox).
- **BlastBox Weekly Inventory Health**: set the **Email** variable to your own
  mailbox. The manager review card and the weekly digest are sent there.

Save and turn on both workflows.

## Try it

### Store Associate Assistant: Block Party Trade-Up

Open **Store Associate Assistant** in **Preview** and paste these turns one at
a time:

1. > Customer's running a gaming-league block party this weekend and his main
   > console just died about 10 days after he bought it — he's got the receipt.
   > He wants a replacement if one's in stock, otherwise a refund, and while he's
   > here he wants to cancel his BlastPass, member ID MEGA-BLAST-1024. Walk me
   > through all of it.
2. > Manufacturing fault — just won't power on, no physical or liquid damage.
3. > He's torn — he likes the idea of the MEGA Edition but he's not sure it's
   > worth the extra hundred bucks over just waiting the four days for the base
   > console to come back in stock. Give me something I can tell him to help him
   > decide.
4. > Do it: warranty-swap him into the MEGA Edition, cancel the BlastPass and
   > apply the $76.66 as store credit toward the upgrade, and tell me what he
   > owes. Also — after Triple BLAST Weekend, what are his BlastPoints worth, in
   > case he wants to knock down the balance? Then print me the slip as a PDF.

Expect a free warranty swap, `$76.66` BlastPass credit, a `$100.00` upgrade
difference, **`$23.34`** to pay, three MEGA exclusive titles, **21,400 points
worth `$105.00`**, and a generated PDF slip. Confirmation numbers vary per run.

### Returns & Service Assistant: Self-Serve Card Reissue

Open **Returns & Service Assistant** in **Preview** and paste these turns one
at a time:

1. > Hi — I lost my BlastPass card. Can you send me a new one?
2. > Sure, it's MEGA-BLAST-1024.
3. > It's Jordan Pixel, and the last 4 are 1024.

Expect the agent to ask for the member ID, then verify the name and console
serial, deactivate the old card, issue a new card serial, and generate a
`blastpass_card.png` digital card.

### BlastBox Post Sales Service

Send these from your own mailbox to the connected mailbox, with the subject
starting **BlastBox Customer Service**, so the replies come back to you.

**A. Shipment** (you pick an option in the reply email)

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

**B. Defect** (pauses for a manager to approve or reject the exception)

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

**C. General enquiry** (answered by the Store Policy Agent, no human step)

```text
Ticket 2122755 - General enquiry
Sender Email: john.doe@example.com
Sender Enquiry:
Hi, thinking about BlastPass before I commit: what's the difference between Plus
and Plus Extra, and is there a fee if I cancel partway through the year? Thanks!
```

### BlastBox Weekly Inventory Health

Start the workflow with **Run**. In the manager review card, select **Accept
Promo** and set **Minimum Discount (%)** to `12` and **Maximum Discount (%)**
to `20`. One "Store Pricing - Weekly Update" email arrives with a pricing note
for each SKU.
