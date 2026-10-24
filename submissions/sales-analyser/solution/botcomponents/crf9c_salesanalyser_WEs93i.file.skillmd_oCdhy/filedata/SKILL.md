---
name: newsletter-style-email-composer
description: "Use when the user asks to email a report, findings, or metrics to someone as a polished, newsletter-style message. Builds an Outlook-safe HTML email from figures that already exist (headline, KPI tiles, up to two bar charts drawn with HTML table cells so they render in classic Outlook, Gmail and dark mode, short findings, data notes and the non-audit disclaimer) using the shared brand tokens, attaches the PDF report, and creates a draft for the user to review. Do NOT use for a short plain-text status update, or for building the underlying analysis, charts, or report itself -- this skill only composes the email."
---

# Newsletter-style email composer

Composes the email only. Figures, Data notes and the PDF come from the analysis and report skills - if they
don't exist yet, run those first. Never recompute a number here.

> **Branding - edit here.** Colours, font stack, eyebrow and the footer disclaimer come from
> `spreadsheet-data-analysis-reporting/assets/style-tokens.json`, the single brand file shared with the
> charts and the PDF. The template in this skill contains no colour values.
> **Logo:** not shown in the email by design. Without a base64 `data:` image the only options are an
> inline (CID) attachment - which the Draft an email tool can't create - or an externally hosted image URL,
> which most clients block by default. The logo appears in the attached PDF; swap it via `brand.logo_path`.

## 1. Gather (ask only for what's missing)
- **Recipients and subject.** Ask if not given; the email is a draft, so a sensible subject is fine.
- **Content to reuse:** headline, 2-4 KPIs, the figures behind 1-2 simple charts, up to 3 bullets per finding,
  recommendations, the Data notes.
- **The PDF** (`report.pdf`) in the sandbox working folder, from the report skill.

## 2. Build the body
Copy `assets/email-content-example.json` to `email_content.json`, fill it in, then run:
```
python scripts/build_email.py email_content.json email.html --pdf report.pdf
```
- Charts are **HTML table-cell bars** (`bar_charts`): `mode: "bars"` for values (use `highlight` for the focus
  item), `mode: "variance"` for change (positive/negative colours plus signed labels). Max 2 charts, 8 bars.
- **No images in the body** - no base64 `data:` images, no SVG, no external image URLs. The full charts are
  in the attached PDF.
- The script fills brand tokens, sets the hidden preheader (headline by default), adds the "full report is
  attached as a PDF" line, the Data notes footnote and the disclaimer, and warns if the body nears Gmail's
  102 KB clipping limit or the PDF is large. It also writes `email.html.attachment.json` (PDF name and
  sandbox path).

## 3. Create the draft
Use the **Draft an email message** tool: `To`, `Subject`, `Body` = contents of `email.html`, and
`Attachments` = the PDF, named per `email.html.attachment.json` and referenced by its **sandbox file path**.
The tool reads the file from that path, so don't base64-encode the PDF or paste its content into the
conversation.
- If the tool rejects the attachment, tell the user and give them the PDF as a chat attachment instead.
  Never upload it to SharePoint.
- Tell the user it's a **draft** waiting in their mailbox for review - nothing is sent.

## Done when
Headline, KPIs, bars and bullets match the analysis; Data notes and disclaimer are present; the PDF is
attached; `build_email.py` ran without errors; the draft exists with the right recipients and
subject. Rendering rules and client quirks: `references/email-rendering-and-accessibility-notes.md`.
