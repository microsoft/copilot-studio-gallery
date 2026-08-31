---
title: Inbound Request Triage and Routing
slug: inbound-request-triage
solution: InboundRequestTriageandRouting
---
Classifies inbound email requests, acknowledges the sender, and routes an
internal summary to the appropriate team.

## Workflow

The **Inbound Request Triage Routing** cloud flow:

1. Starts when an email arrives in the connected Microsoft 365 Outlook Inbox.
2. Uses an AI classifier to label the email as `Actionable request`, `Noise`,
  or `Other` based on its subject, sender, and body.
3. Ignores noise such as out-of-office responses, automatic acknowledgments,
  delivery reports, newsletters, unsubscribe messages, and spam. Ambiguous
  messages classified as `Other` are also left unprocessed.
4. Sends actionable requests to an AI agent that classifies them as HR,
  Finance, Sales, IT, Facilities, or Other and assigns an urgency.
5. Uses the agent's Outlook tool to send an acknowledgment to the requester and
  an internal routing email.

## Import notes

- Configure the Microsoft 365 Outlook connection used by the email trigger.
- Configure the Agent connection used by the classifier and request handler.
- Review the Outlook connection embedded in the agent's **Send an email** tool.
- In the **Configuration** action, replace the `hr@contoso.com`,
  `finance@contoso.com`, `sales@contoso.com`, `it@contoso.com`,
  `facilities@contoso.com`, and `other@contoso.com` values in the
  `RoutingEmails` object with the appropriate team mailboxes.
- Review the classifier category descriptions against the target mailbox's
  expected traffic before enabling the flow.
- The Agent-Request Handler's **Send an email** tool has a connection ID
  hardcoded from the original authoring environment. Solution import does not
  remap this value, so open the node after import and re-select the Outlook
  connection to bind the tool to your own connection before enabling the flow.

The solution is exported as unmanaged and includes a saved modern-designer
canvas for its workflow preview.
