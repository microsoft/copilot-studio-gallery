# Team Knowledge Inbox Assistant

Team Knowledge Inbox Assistant monitors a shared team inbox, researches questions
against the agent's configured knowledge sources, and replies to the original
sender in the same email thread with a professional HTML response.

## Automation

- The workflow starts when a new message arrives in the shared mailbox's Inbox.
- It passes the message body to the research agent, which answers questions
  strictly from configured knowledge sources, cites sources, lists unanswered
  questions, and suggests useful follow-ups.
- The workflow replies to the triggering message using its message ID. The agent
  cannot choose another message or recipient.
- Messages without questions produce no reply.

## Import notes

After importing the unmanaged solution:

1. Authorize the Office 365 Outlook and Microsoft Copilot Studio connection
   references.
2. Replace `team-inbox@example.com` with the team's shared mailbox address in
   both the trigger and the reply action. The connected account needs access to
   the mailbox and permission to send from it.
3. Add and review the knowledge sources the agent is allowed to use.
4. Test with a non-production shared mailbox before enabling the workflow.
5. The trigger handles new arrivals; it does not maintain a persistent
   idempotency ledger for manual replays or duplicate deliveries.

The agent does not use web search or unsupported outside knowledge.