# HR New Hire Welcome Packet

Watches a SharePoint new-hire list for new rows, works out which audience the
hire belongs to from their job title, and emails them a welcome packet
assembled from a SharePoint links list — one agent, three tools, no
per-audience branching logic to maintain.

## How it works

- **Trigger** — fires when a new item is created in the `New Hires` list.
- **Onboarding Agent** — owns all three tools and makes every decision itself:
  - If the row's `Packet sent` column already has a value, it stops — the row
    was already processed, so a re-run or list re-sync can't double-send.
  - If `Work email`, `Job title`, `Start date`, or `Manager email` is blank, it
    emails HR naming exactly which field is missing and leaves the row
    unstamped, rather than sending a half-filled packet.
  - Otherwise it calls **Get items** on `Welcome Links`, decides which single
    `Audience` value (if any) the job title matches — never inventing an
    audience that isn't already a value in that list — and builds the mail
    from two blocks: every `Everyone` row, then the matched audience's rows.
    If nothing matches, it sends the `Everyone` rows plus a line saying the
    manager will follow up, and separately tells HR which title couldn't be
    placed.
  - It sends the mail (To: the hire, Cc: their manager) and, unless the row
    was missing a field, stamps `Packet sent` with today's date.
- Every link, URL, and description in the mail comes from the `Welcome Links`
  list — the agent never authors content, only selects and formats it.

## Configuration

| Variable | Purpose |
| --- | --- |
| `HRNotifyEmail` | Address the agent emails when a title can't be placed or a required field is missing. Ships as a placeholder (`hr@contoso.com`) — set it to your HR team's address. |

## Import notes

- The trigger and the `Get items`/`Update item` tools are bound to a specific
  SharePoint site and list on export. Reopen each SharePoint action after
  importing and re-point it at your own `New Hires` and `Welcome Links` lists.
- `New Hires` needs six columns: `Preferred name`, `Work email`, `Job title`,
  `Start date` (Date), `Manager email`, `Packet sent` (Date, written by the
  agent — leave it out of any forms).
- `Welcome Links` needs four columns: `Audience` (`Everyone` or a role word
  your org uses — the set of audiences is read from this column, there's no
  second place to declare it), `Link name`, `URL` (Hyperlink), `Description`
  (optional).
- Populate `Welcome Links` with your own `Everyone` rows (payroll, badge,
  benefits, IT setup) before going live — the packet is only as good as this
  list, and there is no other configuration surface.
