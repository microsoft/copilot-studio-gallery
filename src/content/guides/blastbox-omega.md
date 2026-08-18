---
title: BlastBox Omega Store Operations
slug: blastbox-omega
solution: WorkflowsBlastbox
---
BlastBox Omega is a retro-gaming store solution built around one store-associate
assistant and two specialist agents. Together they handle returns, warranty
swaps, membership changes, stock questions, fulfillment alternatives, policy
checks, and settlement.

The solution includes two modern workflows that reuse the same agent and MCP
data layer. They show how classification, loops, conditions, human review, and
agent nodes combine into practical store operations.

## Agents

- **Store Associate Assistant** coordinates the customer's complete visit and
  delegates stock and policy questions to its specialist agents.
- **Inventory & Fulfillment Agent** checks stock, alternatives, restock timing,
  compatibility, and inventory aging.
- **Store Policy Agent** grounds returns, warranty, membership, and markdown
  decisions in store policy.

The primary assistant also includes inline skills for prorated refunds, points
reconciliation, and PDF slip generation, plus MCP-backed order and membership
tools.

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

Download the rebuilt solution ZIP from this page and import it through Power
Platform. The package contains the original exploded solution files, including
its agents, workflows, connectors, skills, and connection references. Review and
replace environment-specific connections during import.
