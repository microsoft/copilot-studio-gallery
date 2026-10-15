# SharePoint List Email Notifier

SharePoint List Email Notifier reacts to created or modified list items and asks
an autonomous agent to retrieve the current item before notifying the invoking
user through Teams, Outlook calendar, and email.

## Automation

- The workflow polls the selected SharePoint list for created or modified
  items.
- It passes the site, list, item identifier, title, status, priority, and direct
  item link to the agent.
- The inline skill retrieves authoritative item data, resolves the current user,
  and attempts Teams, calendar, and HTML email notifications in that order.
- A failed notification channel does not prevent the other channels from being
  attempted.

## Import notes

After importing the unmanaged solution:

1. Authorize the SharePoint Online and Microsoft Copilot Studio connection
   references.
2. Replace `<site-url>`, `<list-id>`, and `<list-name>` in the SharePoint trigger
   and agent prompt with values from the target environment.
3. Configure the SharePoint retrieval, current-user identity, Teams, Outlook
   calendar, and Outlook mail tools required by the inline skill.
4. Confirm the target list exposes the fields referenced by the workflow, or
   update the prompt mappings for the target schema.
5. Review the one-minute polling interval and notification recipients before
   enabling the workflow.
6. Test create and update events with a non-production list.

The agent sends notifications to the resolved current user and does not accept
an arbitrary recipient from the trigger payload.