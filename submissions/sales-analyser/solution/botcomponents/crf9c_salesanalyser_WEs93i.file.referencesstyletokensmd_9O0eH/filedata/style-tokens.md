# Style tokens: where the brand lives and how to change it

**Edit file:** `spreadsheet-data-analysis-reporting/assets/style-tokens.json`. It is the only place brand
values exist. `chart_style.py` (charts), `render_report.py` (PDF) and `build_email.py` (email) read it at run
time, so a change there flows into every output. No hex values are duplicated in this skill.

## What each token does

| Token | Used for |
|---|---|
| `brand.name` | PDF author metadata. |
| `brand.logo_path`, `brand.logo_height_pt` | Logo drawn top right of the PDF header band (default `logo-placeholder.png`, a placeholder bar-chart icon in `assets/`). Relative paths resolve from the `assets/` folder. Swap it by replacing the file under the same name or by pointing `logo_path` at a new file in `assets/`; `""` = no logo. Not used in the email (no inline images). |
| `text.header_eyebrow` | Small caps line above the report/email title (e.g. "Sales insights"). |
| `text.footer_disclaimer` | Non-audit disclaimer on every PDF page and in every email footer. Required. |
| `text.footer_note` | Small "Prepared with ..." line in the footer. |
| `colors.primary` | Brand blue: header band, KPI top rule, focus chart series, links, bar fills in email. |
| `colors.secondary` | Brand green: second series, highlights. |
| `colors.positive` / `colors.negative` | Up/down deltas and variance bars. Negative is amber (not red) so it stays distinct from green for colour-blind readers. Signs (+/-) and arrows always accompany colour. |
| `colors.context` | Grey for comparison series (prior year, "everything else"). |
| `colors.text`, `heading`, `muted` | Body text, headings, captions/labels. |
| `colors.surface`, `surface_alt`, `border`, `gridline`, `background` | Panels and KPI tiles, rules, chart gridlines, page. |
| `colors.on_primary` | Text on the primary colour (header band). |
| `chart_palette` | Categorical order for charts. Entries 4-5 are light tints: fills with value labels only. |
| `fonts.chart_family` | First installed font wins for charts (Segoe UI rarely exists in the sandbox; DejaVu Sans is the fallback). |
| `fonts.pdf_regular_ttf` / `pdf_bold_ttf` | Optional brand TTF paths for the PDF; default DejaVu Sans to match charts. |
| `fonts.email_stack` | CSS font stack for email (system fonts only - email clients don't load web fonts reliably). |
| `chart.report` / `chart.email` | Chart size and dpi per target. |

## Rules when changing colours
- Text colours need **4.5:1** contrast against the background (and against `surface` for text in tiles).
- Chart and graphic colours need **3:1** against white; lighter tints only as labelled fills.
- Run `python scripts/qa_report.py --tokens-only` after any change - it computes the ratios from the JSON.
- Keep primary and secondary clearly different in lightness as well as hue so they survive colour-blindness
  and greyscale printing.
