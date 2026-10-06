---
title: HR New Hire Welcome Packet
slug: hr-new-hire-welcome-packet
solution: HROnboarding
---
HR New Hire Welcome Packet watches a SharePoint new-hire list and sends two
emails per hire, in parallel: a welcome packet assembled from a SharePoint
links list, and a "Meet your new team" email introducing the hire to their
manager and teammates with AI-generated, confidence-scored bios.

Each email is owned by its own agent. The welcome packet's audience matching
is entirely data-driven, so there's no per-audience branching logic to
maintain — adding or retiring an audience is a list edit, not a workflow
change. The team-intro email's roster is built live from your org's manager/
direct-report structure every run, and whether it sends itself or waits for
a human is a deterministic, org-configurable setting, not something either
agent decides.

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

- **Team Intro Agent** runs in parallel with Onboarding Agent off the same
  trigger — the two are independent, so neither blocks or is blocked by the
  other. It uses Office 365 Users' `Get manager` and `Get direct reports`
  (both read-only) to build the hire's team roster, then web search to look
  up each person's public LinkedIn profile and write a short, confidence-gated
  bio. It never sends email or updates any row itself — it only outputs a
  subject and an HTML body. A deterministic If/Else downstream of the agent,
  not the agent itself, decides whether that email sends automatically or is
  saved as a draft for review, based on the `AutoSendTeamIntro` setting.

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

In parallel, **Team Intro Agent** calls `Get manager` on the hire's work
email, then `Get direct reports` on the manager to get the manager's team. It
drops anyone with a blank job title (shadow/placeholder directory accounts),
removes the hire themselves if a timing quirk surfaces them in their own
manager's list, and keeps at most 10 people — manager first. For the manager
and each remaining person, it searches the web for a matching public LinkedIn
profile and rates its own confidence (0.0–1.0) that it found the right
person. At 0.75 or higher it writes a short, strictly factual 2–3 sentence
bio with a source link; below that — or with no clear single match — it uses
a fixed "Additional profile details weren't available" line instead of
guessing. It composes one HTML email (the manager's card first, then the
team), each card with a `mailto:` "Schedule a 1:1" link, and a disclaimer
stating the bios are AI-generated from public information and may be
inaccurate.

A deterministic If/Else then checks `AutoSendTeamIntro`: if `Yes`, **Send an
email (V2)** sends it straight to the hire (Cc HR); if `No`, **Draft an email
message** creates the same email as a draft in HR's mailbox instead, for a
human to review and send manually. That decision is made by the If/Else, not
the agent, so it's never affected by model variance.

## Configuration

| Variable | Purpose |
| --- | --- |
| `HRNotifyEmail` | Address the agent emails when a title can't be placed or a required field is missing. Ships as a placeholder (`hr@contoso.com`) — set it to your HR team's address. |
| `WelcomeLinksSite` | Full SharePoint site URL where the `Welcome Links` list lives (e.g. `https://yourtenant.sharepoint.com/teams/YourSiteName`). This only locates the site to find the list on — it isn't a source of links itself; every link, URL, and description the agent sends always comes from rows inside the `Welcome Links` list. |
| `WelcomeLinksList` | The `Welcome Links` list's display name (e.g. `Welcome_Links`) — not a GUID. |
| `AutoSendTeamIntro` | Controls whether the "Meet your new team" email sends automatically (`Yes`, the default) or is created as a draft in HR's mailbox for manual review (`No`). Ships defaulting to `Yes` so the automation works out of the box; an org's admin can flip it to `No` if they'd rather have every AI-generated bio reviewed before it reaches the new hire. |

## Customizations

- **Audiences** are entirely data-driven from `Welcome Links`' `Audience`
  column — add, rename, or retire one by editing the list, not the agent.
- **Required fields** the agent checks before sending. Extend or relax the set
  in the agent's instructions if your list has fewer or more required columns.
- **Dedupe column.** `Packet sent` is what stops a re-run from double-sending —
  keep it out of any intake form so only the agent writes to it.
- **Notification routing** if you want a Teams post or a ticket instead of an
  email when a title can't be placed.
- **Bio confidence threshold.** Team Intro Agent only writes a bio at ≥0.75
  confidence of a correct LinkedIn match — raise or lower this in the agent's
  instructions if you want it stricter, or more willing to take a guess.
- **Auto-send vs. draft.** `AutoSendTeamIntro` is the only thing gating
  whether the team-intro email sends itself or waits for a human — flip the
  default in Configuration if your org wants review-before-send to be the
  out-of-box behavior instead of the exception.

Keep the audience list as the single source of truth — that's what keeps the
welcome packet a single agent's decision instead of growing a branch per
audience.

## Prerequisites

A SharePoint site with two lists, an Office 365 Outlook connection, and an
Office 365 Users connection:

- `New Hires` — six columns: `Preferred name`, `Work email`, `Job title`,
  `Start date` (Date), `Manager email`, `Packet sent` (Date, written by the
  agent — leave it out of any forms).
- `Welcome Links` — four columns: `Audience` (`Everyone` or a role word your
  org uses), `Link name`, `URL` (Hyperlink), `Description` (optional).
  Populate this with your own `Everyone` rows (payroll, badge, benefits, IT
  setup) before going live — the packet is only as good as this list.
- Office 365 Users needs read access to your org's manager/direct-report
  structure — Team Intro Agent uses it to build the team roster, and it
  works against any tenant (unlike Microsoft Graph, which depends on
  tenant-specific setup).

## Import

Download the rebuilt solution ZIP from this page and import it through Power
Platform. Connections don't carry over to a new user or environment — on the
**Onboarding Agent** node, delete and re-add each tool so it authenticates
against your own account; do the same for **Team Intro Agent**'s two Office
365 Users tools and for the **Send an email** / **Draft an email message**
nodes downstream of its If/Else (the canvas has a note listing exactly which
tools/connections to re-add in each case). Reopen the trigger and the
Onboarding Agent's SharePoint actions to re-point them at your own `New
Hires` and `Welcome Links` lists. Re-pointing the trigger will break every
`field_N` dynamic-content token used in both agents' prompts (SharePoint
assigns these per-list) — reopen each agent and re-insert every token from
the dynamic content picker against your own list's columns. Then set
`HRNotifyEmail`, `WelcomeLinksSite`, `WelcomeLinksList`, and
`AutoSendTeamIntro` before turning the workflow on.
