---
title: Inbound Request Triage
slug: inbound-request-triage
solution: InboundRequestTriageandRouting
---
Inbound Request Triage separates real work from noise in a busy shared mailbox.
Messages are classified, actionable requests are routed to the team that owns
them, the sender gets an acknowledgment, and the team gets a summary instead of
a forwarded thread.

Routing is decided by the agent rather than hard-coded, so adding or retiring a
team is a configuration change — no Switch node and no per-team branch.

## Agents

- **Agent - Request Handler** analyzes the request, decides the category and the
  `routingTeamEmail`, sends a polite acknowledgment to the requester, and
  dispatches an internal summary to the correct team.

## How the workflow runs

Mail arriving in the shared request inbox starts the run. A **Classify** node
sorts it into **Actionable request**, **Noise**, or **Other**. Actionable
requests continue to the Request Handler, which acknowledges and routes in the
same step. Noise and Other drop out, so routed teams only see real work.

## Configuration

| Variable | Purpose |
| --- | --- |
| `RoutingEmails` | Team addresses the agent chooses from when sending the internal alert. |

## Customizations

Point the trigger at your own shared mailbox and replace the sample addresses in
`RoutingEmails`. Then tune the classify categories to the noise in your mailbox —
and update the agent prompt to match, since those two always travel together.

Also worth adjusting:

- **Team descriptions** in the agent prompt. Routing quality depends almost
  entirely on how clearly these distinguish one team from another.
- **Acknowledgment and summary wording**, both agent-drafted.
- **What happens to Noise and Other** — consider a catch-all alias so ambiguous
  mail still reaches a human.
- **Destination channel** if teams prefer Teams posts or tickets over email.

Review the Noise category against a week of real mail before going live.
Anything classified as Noise is dropped silently.

## Prerequisites

An Office 365 Outlook connection with permission to send on behalf of the shared
mailbox, plus the team addresses used in `RoutingEmails`.

## Import

Download the rebuilt solution ZIP from this page and import it through Power
Platform. Review and replace environment-specific connections during import,
then set `RoutingEmails` and review the classify categories before turning the
workflow on.
