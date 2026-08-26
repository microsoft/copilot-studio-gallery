# Inbound Request Triage and Routing

Classifies inbound email requests, acknowledges the sender, and routes an
internal summary to the appropriate team.

## Workflow

The **Inbound Request Triage Routing** cloud flow:

1. Starts when an email with `Email Triage` in its subject arrives in the
   connected Microsoft 365 Outlook mailbox.
2. Ignores unsubscribe, out-of-office, and automatic-reply messages.
3. Sends valid requests to an AI agent that classifies them as HR, Finance,
   Sales, IT, Facilities, or Other and assigns an urgency.
4. Uses the agent's Outlook tool to send an acknowledgment to the requester and
   an internal routing email.

## Import notes

- Configure the Microsoft 365 Outlook connection used by the email trigger.
- Configure the Agent connection used by the request handler.
- Review the Outlook connection embedded in the agent's **Send an email** tool.
- Replace every `routing-team@example.com` mapping with the appropriate team
  mailbox before enabling the flow.
- Adjust the `Email Triage` subject filter if the target mailbox uses a
  different intake convention.

The solution is exported as unmanaged and includes a saved modern-designer
canvas for its workflow preview.