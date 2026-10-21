---
title: Team Knowledge Inbox Assistant
slug: outlook-triggered-workflow-agent
solution: OutlookTriggeredWorkflowAgent
---
Team Knowledge Inbox Assistant monitors a shared team inbox, researches each
question in an incoming email against the agent's own knowledge sources, and
replies to the original sender in the same email thread with a sourced,
professional HTML response.

## How it works

Shared mailbox email -> Team Knowledge Inbox Agent -> **Check whether a reply is
needed** condition -> Reply to original email.

1. The workflow starts when a new message arrives in the shared mailbox's
   Inbox and passes the message body to the agent.
2. **Team Knowledge Inbox Agent** uses Claude Opus 5 with the
   `email-question-research-reply` skill. It extracts every question, researches
   each one strictly against its configured knowledge sources, cites a source
   link for each answer, lists the questions the sources cannot answer, and
   suggests two to four follow-up questions. Web search is disabled and the
   agent is instructed not to use general knowledge.
3. The agent returns structured output that drives the workflow:
   - `EmailReply`: the reply body, already formatted as HTML the way it should
     appear in the email.
   - `ReplyNeeded`: a Yes/No flag the agent sets when a reply is warranted.
4. The **Check whether a reply is needed** condition branches on `ReplyNeeded`.
   **No** ends the run without sending anything. **Yes** continues to **Reply to
   original email**, which uses `EmailReply` as the body.
5. The reply is sent from the shared mailbox to the triggering message using its
   message ID. The agent has no email tools and cannot choose another message or
   recipient.

Emails with no question, such as an FYI, an automated notification, or a
thank-you note, set `ReplyNeeded` to No and produce no reply. Emails with
questions the knowledge sources do not cover still get a reply that states
plainly which questions could not be answered.

## Configuration

| Setting | Purpose |
| --- | --- |
| Shared mailbox address | The trigger and the reply action use `team-inbox@example.com`. Replace this placeholder in both places with your team's shared mailbox. |
| Folder | The trigger monitors the shared mailbox's `Inbox`. |
| Knowledge sources | None are included. Add your own to the agent after import. |
| Agent model | Claude Opus 5. |

The trigger has no subject, sender, or attachment filters, so every new Inbox
message starts a run.

## Required setup: add your own knowledge sources

The agent ships **without any knowledge sources**. This is intentional, but it
means the agent cannot answer questions until you add your own. After import,
add the approved sources (for example, your team's SharePoint sites, documents,
or public documentation) in Copilot Studio and wait until they are ready.
Without them, every question is reported as unanswered.

Web search is disabled, and the agent is instructed not to use general
knowledge, so its answers only reflect the sources you configure.

## Customizations

Point the trigger at your own shared mailbox, then adjust:

- **Trigger filters** such as subject, sender, or folder if the inbox receives
  mail that should not be researched.
- **Knowledge sources** to match the topics your team's inbox receives.
- **Reply format and tone** in the agent instructions and the skill. Keep the
  reply as plain HTML so `EmailReply` can be sent as written.
- **When to reply** in the agent's `ReplyNeeded` decision, for example if
  messages that only partly match your sources should not get a reply.

Keep the agent free of email tools and keep the reply bound to the triggering
message, so it cannot change the recipient or thread.

## Prerequisites

- A Power Platform environment where you can import the solution, with access
  to Copilot Studio, the AI workflow capabilities, and the selected agent model,
  plus the applicable licensing and capacity.
- An Office 365 Outlook connection whose account can access the shared mailbox
  and has permission to send from it.
- Knowledge sources the agent is allowed to use.

## Import

Download the rebuilt solution ZIP from this page and import it through Power
Platform.

1. Authorize the Office 365 Outlook and Microsoft Copilot Studio connection
   references.
2. Replace `team-inbox@example.com` with the team's shared mailbox address in
   both the trigger and the reply action.
3. Add and review the knowledge sources the agent is allowed to use (see
   [Required setup](#required-setup-add-your-own-knowledge-sources)).
4. Test with a non-production shared mailbox using an email with questions, an
   email with no question, and an email whose questions your sources do not
   cover.
5. Enable the workflow.

The trigger handles new arrivals; it does not maintain a persistent idempotency
ledger for manual replays or duplicate deliveries.
