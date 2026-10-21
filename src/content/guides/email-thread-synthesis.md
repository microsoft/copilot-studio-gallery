---
title: Project Thread Synthesis
slug: email-thread-synthesis
solution: EmailThreadSynthesis
---
Project Thread Synthesis retrieves a specific Outlook conversation about a team
or project and produces a structured, factual recap of its decisions, action
items, open questions, and risks. After reviewing the recap, the user can
confirm a destination team and standard channel for posting it, or schedule a
follow-up meeting.

## Agent and actions

- The Outlook Mail MCP tool reads the selected thread and is explicitly
  restricted from sending, replying, forwarding, or drafting email.
- The synthesis skill resolves ambiguous thread requests, grounds every recap
  item in the retrieved messages, and performs a confidentiality review.
- The Teams action can post the HTML recap to a user-confirmed standard channel.
- The agent shows the recap and confirms the destination before posting. It does
  not post sensitive recaps to a channel.
- Calendar actions check for an existing follow-up before creating a new event.

## Import notes

After importing the unmanaged solution:

1. Authorize the Outlook Mail, Outlook Calendar, and Microsoft Teams connection
   references.
2. Confirm the Outlook tool remains read-only for mail operations.
3. Review permissions for Teams channel posting and calendar event creation.
4. Test thread selection by project, subject, sender, date range, topic, and link.
5. Verify ambiguous requests ask for clarification and that confidential content
   is not delivered without the expected review behavior.
6. Test duplicate follow-up detection before enabling calendar creation.

The agent does not send or modify email and does not invent owners or dates that
are absent from the retrieved thread. The Teams connector does not support
posting to private channels; confirm the team and standard channel with the user
before posting.
