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
- **Inventory & Fulfillment Agent** checks stock, alternatives, restock timing,
  and inventory aging.

## MCP servers

Four MCP servers ship as custom connectors with inline code, so no external
hosting is needed. The agents and workflows share them.

| MCP server | Used by |
| --- | --- |
| Order Management MCP | Store Associate Assistant |
| Membership MCP v2 | Store Associate Assistant, Returns & Service Assistant |
| Policy RAG MCP v2 | Store Policy Agent |
| Warehouse MCP | Inventory & Fulfillment Agent |

## BlastBox Post-Sales Service

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
   Platform. Create or select the connections it asks for, such as Office 365
   Outlook, Approvals, and the four MCP connectors.
2. Attach each MCP server to the agents that use it (see the table above). MCP
   tool attachments are environment-specific, so they aren't included in the
   package.
3. Publish the agents, then turn on the two workflows.

For a scripted deployment and step-by-step validation scenarios, see the
[tech guide's sample solution](https://github.com/microsoft/new-copilot-studio-tech-guide/tree/main/sample/solution).
All data is mock.
