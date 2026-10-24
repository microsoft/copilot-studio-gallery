---
name: polished-report-builder
description: "Use when the user asks to turn analysis results, metrics, or findings into a polished, presentation-ready report, one-pager, or executive summary -- especially when existing analysis (e.g. from the spreadsheet analysis skill) needs to become a document someone will actually read. Builds a branded PDF with reportlab from a short content file (headline, KPI tiles, one chart per point, data notes and the non-audit disclaimer) using the shared brand tokens, and runs a QA pass before delivery to catch walls of text, chart clutter, low-resolution charts, missing data notes or poor contrast. Do NOT use for a quick inline chat answer, a single ad-hoc chart with no report structure around it, a raw data export with no narrative, or to compute the figures themselves."
---

# Polished report builder (PDF)

A good report is one headline the reader can repeat, a few numbers with context, one chart per point and
honest data notes - not page count. This skill turns analysis that already exists into a branded PDF.

> **Branding - edit here.** Colours, fonts, logo, header eyebrow and the footer disclaimer all come
> from `spreadsheet-data-analysis-reporting/assets/style-tokens.json` - the single brand file shared with
> the charts and the email. Don't edit colours in this skill. `references/style-tokens.md` explains each token.
> **Logo:** the PDF header draws `spreadsheet-data-analysis-reporting/assets/logo-placeholder.png` (a
> placeholder bar-chart icon on a white tile). To swap it, replace that file with your own PNG under the same
> name, or add your file to that `assets/` folder and change `brand.logo_path`; `brand.logo_height_pt` sets its
> size. The header band is brand blue, so use a logo with its own light background or a light mark.

## 1. Clarify (one short question at most)
- **Headline:** if the user hasn't given a conclusion, propose one from the analysis.
- **Length:** default one-pager; short or multi-section only when asked (`references/content-balance-guide.md`).
- **Inputs:** reuse the figures, chart PNGs and Data notes from the analysis skill. If figures don't exist yet,
  run the analysis skill first - never compute figures here.
- **Delivery:** the PDF goes to the user as a chat attachment; for email, hand over to
  `newsletter-style-email-composer`, which attaches the PDF to the draft. Never save it to SharePoint.

## 2. Draft the content file
Copy `assets/report-content-example.json` to the working folder as `report_content.json` and fill it in:
- `headline`: one sentence, 20-35 words, with a number and a comparison.
- `kpis`: 2-5 tiles; each has a value, what it is, and its comparison (`delta`, `direction`). Set
  `good_when_down: true` for costs/returns so colours read correctly.
- `sections`: one chart per point (`chart` = PNG from `chart_style.py` with `apply_theme("report")`), a
  caption, up to 3 bullets of ~20 words, optional small table (`numeric_columns` are right-aligned).
- `recommendations`: actions, not observations.
- `data_notes`: scope, transformations, fx, flags, caveats - all required (write "none" if nothing applies).

## 3. Render
`python scripts/render_report.py report_content.json report.pdf` - A4 PDF with a brand header band, headline
callout, KPI tiles, charts at full column width, right-aligned table numbers, Data notes and the disclaimer
plus page numbers on every page. Uses DejaVu Sans (bundled with matplotlib) so text matches the charts;
chart PNGs are compressed for a small file.

## 4. QA before anyone sees it
`python scripts/qa_report.py report_content.json --pdf report.pdf [--report-type one-pager]` checks density
budgets, headline, KPI labels, chart resolution (>= 1000 px), Data notes, page count, PDF size and brand
contrast. Fix every FAIL and re-run; mention any WARN. Open the PDF and look at it once before delivering.

## 5. Deliver
- **Chat:** give the headline, KPIs and the Data notes, and attach `report.pdf` to your reply as a chat
  attachment.
- **Email:** hand over to `newsletter-style-email-composer` with the PDF (sandbox file path), the headline,
  KPIs and Data notes; it attaches the PDF to the draft.
- Never upload, save or move the PDF (or any output) to SharePoint - it is read-only for this agent.
