# Outlook Triggered Workflow Agent

Outlook Triggered Workflow Agent monitors an inbox for new messages, passes the
message body to a research agent, and prepares a professional HTML response
grounded only in the agent's configured knowledge sources.

## Automation

- The workflow starts when a new message arrives in the Inbox folder.
- It captures the incoming message and invokes the email research agent with the
  message body.
- The inline skill extracts each question, researches supported answers, cites
  its sources, identifies unanswered questions, and suggests useful follow-ups.

## Import notes

After importing the unmanaged solution:

1. Authorize the Office 365 Outlook and Microsoft Copilot Studio connection
   references.
2. Add and review the knowledge sources the agent is allowed to use.
3. Configure the email action required to send the generated HTML response.
4. Confirm whether responses should go to the importing user or the original
   sender; the exported agent instructions and inline skill describe different
   recipient behavior.
5. Review the monitored Outlook folder and test with a non-production mailbox
   before enabling the workflow.
6. Verify duplicate or previously processed messages cannot produce another
   response.

The agent does not use web search or unsupported outside knowledge.