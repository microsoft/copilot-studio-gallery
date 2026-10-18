# SharePoint List Change Notifier

SharePoint List Change Notifier monitors a configured SharePoint list and gives
the agent tools to retrieve the changed item, resolve the connected user, and
send a Teams message, Outlook calendar event, and HTML email.

## Automation

- The workflow polls the configured SharePoint list for created or modified
  items and passes a readable, one-field-per-line summary to the agent.
- The configured site URL, list ID, and list display name are static setup
  values. The trigger output contains item ID, Title, `field_2`, `field_3`, and
  `{Link}`; it does not return the site URL or list display name.
- `field_2` and `field_3` are sample mappings. Replace them with the target
  list's internal column names and update the trigger schema if necessary.
- The agent uses included tools to retrieve the item, resolve the connected
  user's profile, and send the notifications. Failed channels are reported
  without stopping attempts on the others.

## Import notes

After importing the unmanaged solution:

1. Authorize the SharePoint Online, Office 365 Users, Microsoft Teams, Office
   365 Outlook, and Microsoft Copilot Studio connection references.
2. Set the SharePoint trigger's Site Address and List Name (the connector's
   `table` parameter) to the target site and list. In the agent prompt, replace
   `<site-url>`, `<list-id>`, and `<list-name>` with those configured values.
   The list ID and display name are supplied as static text because the trigger
   output does not contain them.
3. Update `field_2` and `field_3` in the trigger output schema and prompt to
   match the target list's internal column names. The trigger does not provide
   friendly display names for arbitrary columns.
4. Ensure the connected accounts have permission to read the list, message the
   current user in Teams, create calendar events, and send email.
5. Review the one-minute polling interval. Calendar events are created only
   when the item contains a real date; the agent must not invent dates or
   availability.
6. Test create and update events with a non-production list.

Notifications go only to the profile returned by the current-user tool, not to
an arbitrary recipient from the item payload.