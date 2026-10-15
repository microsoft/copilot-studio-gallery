# ICM Agent with Trigger

ICM Agent with Trigger retrieves authoritative incident data for interactive
operations questions and scheduled reporting. Its dual-mode skill keeps chat
answers concise while producing a structured executive summary and incident
list for autonomous runs.

## Agents and tools

- The ICM Operations Agent answers incident-specific and aggregated operational
  questions without inventing details that are absent from tool responses.
- The ICM MCP tool retrieves incidents, searches operational data, resolves
  teams, and gets on-call contacts.
- The Mail tool sends the autonomous summary to the invoking user.
- Two calendar agents included by the exported solution provide Outlook calendar
  assistance and meeting-management capabilities.

## Automation

The recurrence trigger runs weekly by default. It asks for incidents assigned
to the invoking user during the previous week and sends an email summary even
when no incidents are returned.

## Import notes

After importing the unmanaged solution:

1. Authorize the ICM MCP, Outlook Mail, and calendar connection references.
2. Replace the `<team-name>` placeholder in the ICM Operations Agent
   instructions with the importing user's ICM team.
3. Configure the recurrence frequency, interval, start time, and time zone.
4. Confirm the importing user can read the intended ICM data and send mail from
   the selected mailbox.
5. Review the included calendar agents and remove or configure them as required
   before publishing.
6. Test both an interactive incident query and an autonomous recurrence run.

The autonomous flow sends results only to the invoking user.