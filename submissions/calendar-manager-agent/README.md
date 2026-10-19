# Calendar Manager Agent

Calendar Manager Agent helps project teams prepare for Outlook meetings, focus
on decisions, and follow through on action items and RSVPs. It combines focused
calendar skills with Outlook Calendar and Mail MCP tools, using only the work
data accessible through the invoking user's authorized connections.

## Capabilities

- Summarizes available meeting notes into supported decisions and action items.
- Detects overlapping or back-to-back meetings and suggests alternatives.
- Handles cancelled meetings, participant notifications, and follow-up options.
- Prepares time-boxed agendas for project-team discussions, decisions, blockers,
  and follow-ups. When the invitation lacks sufficient context, proactively
  searches relevant email before asking the user for the meeting's goal.
- Finds unanswered invitations and supports RSVP reminders.
- Uses the user's date and time-zone settings when presenting calendar times.

## Grounded agenda preparation

The agent checks the invitation and available related meeting context first.
For sparse invitations, it searches Outlook Mail using meeting subject and
project/topic keywords, refined with organizer/attendees and recent related
threads. A shared attendee alone does not make a thread relevant.

Responses distinguish source-supported context from suggested agenda items and
identify email subjects, senders, and dates returned by the tool, with links only
when provided. Owners and decisions are never invented. If checked context is
still insufficient, the agent asks one focused clarification; mail access or
search failures are disclosed explicitly rather than reported as no context.
Existing full agendas are preserved unless the user requests a rewrite, and
invitation updates require confirmation after the proposed changes are reviewed.

## Import notes

After importing the unmanaged solution:

1. Bind the Outlook Calendar and Outlook Mail MCP connection references during
   import, and configure authorization for the intended users before publishing.
2. Both tools use `authMode: Invoker`: each invoking user must authorize the
   connections and have the required calendar and mail permissions, including
   mail search/read and any intended send/update operations. Importing the
   solution does not grant access to teammates' mailboxes or team-wide email.
3. Review web-search availability and disable it if calendar assistance must
   remain limited to connected work data.
4. Test date and time-zone handling for the importing user's locale.
5. Review any proposed attendee notifications before enabling autonomous use.
6. Test summaries, conflict resolution, cancellation handling, agenda
   suggestions, and RSVP tracking before publishing.

## Acceptance scenarios

- **Empty invite, relevant mail:** Request an agenda for a project meeting with
  an empty body. Search mail without prompting first, use relevant recent
  project threads, identify their sources, and propose time-boxed items clearly
  separated from factual context. Do not update the invite without confirmation.
- **Unrelated mail:** Return threads sharing an attendee but not the project or
  meeting purpose. Exclude them; refine the search using topic keywords and ask
  one focused question only if the remaining context is insufficient.
- **No mail context:** Complete a successful search with no relevant results.
  State that outcome accurately; if invite context is also insufficient, ask
  about the specific goal or decision needed instead of inventing filler.
- **Mail failure:** Deny mail access or make search fail. Disclose the failure
  and that email could not be checked, use verified invitation context, and ask
  one focused question only if needed. Do not claim no relevant email exists.
- **Full agenda:** Provide an invitation with a complete agenda. Preserve it,
  offer tighter time-boxing, or confirm the user wants a rewrite. Keep changes
  within the meeting duration and require confirmation before saving.