# Calendar Manager Agent

Calendar Manager Agent helps users prepare for and manage Outlook meetings. It
combines focused calendar skills with Outlook Calendar and Mail MCP tools so
meeting information and notifications remain grounded in the user's mailbox.

## Capabilities

- Summarizes meetings into key decisions and action items.
- Detects overlapping or back-to-back meetings and suggests alternatives.
- Handles cancelled meetings, participant notifications, and follow-up options.
- Proposes agendas for meetings that need more structure.
- Finds unanswered invitations and supports RSVP reminders.
- Uses the user's date and time-zone settings when presenting calendar times.

## Import notes

After importing the unmanaged solution:

1. Authorize the Outlook Calendar and Outlook Mail MCP connection references.
2. Confirm the importing user can read calendar events and send mail from the
   intended mailbox.
3. Review web-search availability and disable it if calendar assistance must
   remain limited to connected work data.
4. Test date and time-zone handling for the importing user's locale.
5. Review any proposed attendee notifications before enabling autonomous use.
6. Test summaries, conflict resolution, cancellation handling, agenda
   suggestions, and RSVP tracking before publishing.

Calendar and mail access runs with the importing user's authorized connections.