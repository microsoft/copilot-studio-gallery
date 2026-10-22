---
title: SharePoint List Change Notifier
slug: sharepoint-list-update-notifier
solution: SharePointListEmailNotifier
---
SharePoint List Change Notifier watches a SharePoint list and notifies the
connected user whenever an item is created or modified. For each changed item,
the agent retrieves the current values and sends a Teams message and an HTML
email with a summary and the direct item link.

## How it works

SharePoint trigger -> agent -> Get SharePoint list item -> Resolve current user
-> Send Teams notification -> Send email notification.

- **Trigger:** the **SharePoint List Notifier Trigger** workflow polls the
  configured list every minute for created or modified items and calls the agent
  once per item. The message lists the site URL, list ID, optional list display
  name, item ID, `Title`, `field_2`, `field_3`, and the direct item link, one per
  line.
- **Agent:** a single autonomous agent that uses Claude Sonnet 5.5 and works only
  on the item supplied by the workflow. It treats the retrieved item as the
  source of truth and does not invent fields, display names, or links. It
  refuses requests unrelated to SharePoint list items.
- **Tools:** all four connector tools run as the invoking user.

| Tool | Connector | Purpose |
| --- | --- | --- |
| Get SharePoint list item | SharePoint Online | Retrieves the item by site URL, list ID, and item ID. |
| Resolve current user | Office 365 Users | Gets the connected user's profile, the sole notification recipient. |
| Send Teams notification | Microsoft Teams | Posts an HTML summary in a chat with Flow bot. |
| Send email notification | Office 365 Outlook | Sends an HTML summary with the item link. |

The agent sends notifications only to the email address (or user principal name)
returned by Resolve current user, never to a recipient found in the item. A
failed channel does not stop the other, and the agent reports the item title,
recipient, and a sent, failed, or not-applicable result for Teams and email.

## Configuration

| Setting | Purpose |
| --- | --- |
| Trigger **Site Address** | Replace `<site-url>` with your SharePoint site URL. |
| Trigger **List Name** | Replace `<list-id>` with your list ID (the connector's `table` parameter). |
| Prompt `<site-url>` and `<list-id>` | Replace with the same values; the agent passes them to Get SharePoint list item. |
| Prompt `<list-name>` | Optional list display name. The agent mentions it only when supplied. |
| `field_2` and `field_3` | Sample status and priority columns. Replace with your list's internal column names. |
| Polling interval | One minute by default. |

The site URL, list ID, and display name are typed into the prompt because the
trigger output does not return them.

## Customizations

- **Fields:** add or remove one line per field in the prompt, for example
  `Title: @{triggerBody()?['Title']}`. The agent follows the field names and
  values returned by Get SharePoint list item, not the generic `field_2` and
  `field_3` labels.
- **Polling interval:** adjust the one-minute recurrence for the list's volume.
- **Teams delivery:** connector tools do not fix input values, so the agent
  instructions direct Teams messages to a chat with Flow bot. Change the
  instructions if you want a different delivery location.

Keep Resolve current user as the only source of the recipient.

## Prerequisites

- A Power Platform environment where you can import the solution and use the new
  Copilot Studio agent experience.
- Connections for SharePoint Online, Office 365 Users, Microsoft Teams, Office 365
  Outlook, and Microsoft Copilot Studio.
- Access for the connected account to read the target list, message the current
  user in Teams, and send email.

## Import

Download the solution ZIP from this page and import it through Power Platform.

1. Review and replace environment-specific connections during import.
2. Replace `<site-url>` and `<list-id>` in the SharePoint trigger and in the
   agent prompt, and set `<list-name>` or remove it.
3. Replace `field_2` and `field_3` in the prompt with your list's column names.
4. Test with a non-production list by creating and updating an item.
5. Turn on the workflow once both notifications arrive as expected.
