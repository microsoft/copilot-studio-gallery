---
title: BlastBox Omega Store Operations
slug: blastbox-omega
solution: BlastBoxOmega
---
BlastBox Omega is the complete sample from the
[Copilot Studio tech guide](https://github.com/microsoft/new-copilot-studio-tech-guide):
a retro-gaming store where agents and workflows share one MCP data layer. This
package combines the guide's connectors, agents, and workflows solutions, so a
single import brings in everything.

## Agents

- **Store Associate Assistant** is the in-store lead agent. It coordinates the
  customer's visit and hands stock and policy questions to its specialists. Its
  skills cover prorated refunds, BlastPoints reconciliation, and PDF slip
  generation.
- **Returns & Service Assistant** is the self-serve agent for membership card
  reissues. Its skills handle the reissue flow and generate the new card image.
- **Store Policy Agent** grounds returns, warranty, membership, and markdown
  decisions in store policy.
- **Inventory & Fullfilment Agent** checks stock, alternatives, restock timing,
  and inventory aging.

## MCP servers

Four MCP servers ship as custom connectors with inline code, so no external
hosting is needed. The agents and workflows share them: Order Management MCP,
Membership MCP v2, Policy RAG MCP v2, and Warehouse MCP.

## BlastBox Post Sales Service

An email with the subject **BlastBox Customer Service** starts the workflow. A
classification step separates shipping issues, defective products, and general
post-sale questions. Each branch calls the appropriate agents, checks order,
stock, weather, and policy context, and asks for human input only when the
customer's choice or an exception requires it.

## BlastBox Weekly Inventory Health

This workflow reviews active SKUs with the inventory agent, loops through stock
aging results, and branches between price adjustment, reorder, and keep-price
paths. Markdown policy and human review protect consequential discount
decisions. The run ends with an HTML inventory report sent by email.

## Import

1. Download the solution ZIP from this page and import it through Power
   Platform. Create or select the connections it asks for.
2. MCP tools don't survive solution export, so attach the MCP servers again
   after import. In each agent, go to **Tools → Add a tool → Model Context
   Protocol (MCP)**, pick **`<Name> Server`**, and select the existing
   connection.

   | Agent | MCP server(s) to add |
   | --- | --- |
   | Store Policy Agent | Policy RAG MCP v2 |
   | Inventory & Fullfilment Agent | Warehouse MCP |
   | Returns & Service Assistant | Membership MCP v2 |
   | Store Associate Assistant | Order Management MCP **and** Membership MCP v2 |

3. Add the MCP servers to the inline agent steps in the workflows too:

   | Workflow | Inline agent | MCP server(s) to add |
   | --- | --- | --- |
   | BlastBox Post Sales Service | Review Order, Stock & Weather | Order Management MCP, Policy RAG MCP v2, Warehouse MCP |
   | BlastBox Post Sales Service | Review Order & Policy | Order Management MCP, Policy RAG MCP v2 |
   | BlastBox Post Sales Service | Trigger Order Return/Exchange | Order Management MCP |
   | BlastBox Weekly Inventory Health | Review Order History & Policy | Order Management MCP, Policy RAG MCP v2 |

4. Publish the agents, then turn on the two workflows.

All data is mock.
