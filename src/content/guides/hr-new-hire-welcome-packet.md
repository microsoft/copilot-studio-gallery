---
title: HR New Hire Welcome Packet
slug: hr-new-hire-welcome-packet
solution: HROnboarding
---
HR New Hire Welcome Packet watches a SharePoint new-hire list, works out which
audience a hire belongs to from their job title, and emails them a welcome
packet assembled from a SharePoint links list.

One agent owns every tool and every decision, so there is no per-audience
branching logic to maintain — adding or retiring an audience is a list edit,
not a workflow change.

## Agents

- **Onboarding Agent** owns all three tools (SharePoint `Get items`/`Update
  item`, Office 365 Outlook `Send an email`) and makes every decision itself.
  If the row's `Packet sent` column already has a value it stops, so a re-run
  or list re-sync can't double-send. If a required field is blank it emails HR
  naming exactly which field is missing and leaves the row unstamped, rather
  than sending a half-filled packet. Otherwise it reads `Welcome Links`,
  decides which single `Audience` value the job title matches — never
  inventing one that isn't already a value in that list — and builds the mail
  from every `Everyone` row plus the matched audience's rows.

## How the workflow runs

The trigger fires when a new item is created in the `New Hires` list. The
Onboarding Agent then runs its checks and, when the row is complete, calls
**Get items** once on `Welcome Links`, decides which audience the job title
matches (or that none do), and selects which rows belong in the packet itself
— the agent does this selection, not a SharePoint filter, using only rows
actually present in what Get items returned. It sends the mail (To:
the hire, Cc: their manager) and stamps `Packet sent` with today's date. Every
link, URL, and description in the mail comes from the `Welcome Links` list —
the agent never authors content, only selects and formats it. If no audience
matches, it still sends the `Everyone` rows plus a line saying the manager will
follow up, and separately tells HR which title couldn't be placed.

## Configuration

| Variable | Purpose |
| --- | --- |
| `HRNotifyEmail` | Address the agent emails when a title can't be placed or a required field is missing. Ships as a placeholder (`hr@contoso.com`) — set it to your HR team's address. |
| `WelcomeLinksSite` | Full SharePoint site URL where the `Welcome Links` list lives (e.g. `https://yourtenant.sharepoint.com/teams/YourSiteName`). This only locates the site to find the list on — it isn't a source of links itself; every link, URL, and description the agent sends always comes from rows inside the `Welcome Links` list. |
| `WelcomeLinksList` | The `Welcome Links` list's display name (e.g. `Welcome_Links`) — not a GUID. |

## Customizations

- **Audiences** are entirely data-driven from `Welcome Links`' `Audience`
  column — add, rename, or retire one by editing the list, not the agent.
- **Required fields** the agent checks before sending. Extend or relax the set
  in the agent's instructions if your list has fewer or more required columns.
- **Dedupe column.** `Packet sent` is what stops a re-run from double-sending —
  keep it out of any intake form so only the agent writes to it.
- **Notification routing** if you want a Teams post or a ticket instead of an
  email when a title can't be placed.

Keep the audience list as the single source of truth — that's what keeps this
a one-agent workflow instead of growing a branch per audience.

## Prerequisites

A SharePoint site with two lists and an Office 365 Outlook connection:

- `New Hires` — six columns: `Preferred name`, `Work email`, `Job title`,
  `Start date` (Date), `Manager email`, `Packet sent` (Date, written by the
  agent — leave it out of any forms).
- `Welcome Links` — four columns: `Audience` (`Everyone` or a role word your
  org uses), `Link name`, `URL` (Hyperlink), `Description` (optional).
  Populate this with your own `Everyone` rows (payroll, badge, benefits, IT
  setup) before going live — the packet is only as good as this list.

## Import

Download the rebuilt solution ZIP from this page and import it through Power
Platform. Connections don't carry over to a new user or environment — on the
**Onboarding Agent** node, delete and re-add each tool so it authenticates
against your own account (the canvas has a note listing exactly which tools
to re-add), and reopen the trigger and the agent's SharePoint actions to
re-point them at your own `New Hires` and `Welcome Links` lists. Re-pointing
the trigger will break every `field_N` dynamic-content token used in the
agent's prompt (SharePoint assigns these per-list) — reopen the agent and
re-insert each one from the dynamic content picker against your own list's
columns. Then set `HRNotifyEmail`, `WelcomeLinksSite`, and `WelcomeLinksList`
before turning the workflow on.
