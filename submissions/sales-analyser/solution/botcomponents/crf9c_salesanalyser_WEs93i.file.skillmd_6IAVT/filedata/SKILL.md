---
name: spreadsheet-data-analysis-reporting
description: "Use for any request that needs figures from the sales spreadsheets (Excel/CSV), even a single file or a single period - e.g. 'analyse Q4', 'how did sales do last month', 'compare regions', YoY/MoM/QoQ/YTD growth, top products, share of revenue, trends, outliers, currency-converted totals, or building/updating a consolidated master file. Finds and loads the relevant files, cleans and normalises them, computes metrics with standard definitions and edge-case handling, flags outliers and data issues, explains every transformation, and produces on-brand charts. Use this before the report or email skills whenever numbers must be computed. Do NOT use for questions that need no data (e.g. 'what does YoY mean') or for re-formatting results already computed in this conversation."
---

# Sales data analysis

Turns the user's sales spreadsheets into trustworthy figures, flags and charts, and always says how the
numbers were produced. Everything in `references/` is a **default**: adapt definitions and thresholds to the
data and the request (fiscal year, net vs gross, a different outlier threshold) and say what you changed.

> **Branding - edit here.** Colours, chart palette, fonts, logo and the header/footer/disclaimer
> text live in ONE file: `assets/style-tokens.json`. Charts (`scripts/chart_style.py`), the PDF report and
> the email all read it. Never type hex values anywhere else.
> **Logo:** `assets/logo-placeholder.png` is a placeholder bar-chart icon in the brand blue and green,
> drawn top right of the PDF header. To swap it, replace that file with your own PNG (same name), or add
> your file to `assets/` and set `brand.logo_path` to its name (`""` = no logo). The email never shows it.

## Analyse mode (default)

1. **Scope.** Work out the period, metric, breakdowns and comparison. Get today's date in the sandbox
   (`datetime.date.today()`) to resolve "last month", "this quarter" and to spot partial periods. Default to
   calendar quarters (Q4 = Oct-Dec); if a fiscal calendar is hinted or the request is ambiguous, ask. Ask at
   most one short question; otherwise state the assumption and continue.
2. **Find and load.** Default location: the SharePoint site set in the agent instructions, library `Shared Documents`,
   folder `Monthly Sales` (the user may point elsewhere). List the folder with the SharePoint tool, pick the
   files covering the period and its comparison period, and load them into the sandbox. Record files used
   and skipped (and why). SharePoint is **read-only**: list and read only - never create, write, move or
   delete anything there.
3. **Prepare.** For new or differently laid-out files run `scripts/discover_fields.py`; then always run
   `scripts/prepare_data.py` (all sheets, header detection, numbers-as-text, explicit date formats, labels,
   subtotal rows, duplicates, currency detection). Read its warnings and `transformation_log.json`; judgement
   calls are in `references/data-preparation.md`. Ask the user about ambiguous dates or duplicate keys.
4. **Currency.** If more than one currency appears, or the user wants another one, follow
   `references/fx-conversion.md` with `scripts/fx_convert.py`: dominant currency by default; a **fresh spot rate looked
   up at the moment of analysis** (xe.com, otherwise the user provides or confirms it - never reused); apply
   it and disclose pair, direction, rate, source and as-of date in the Data notes. Nothing is stored. Never
   invent a rate.
5. **Compute.** Use `scripts/compute_metrics.py` (period windows, YoY/MoM/QoQ/YTD/LTM, contribution, mix,
   constant currency) with the definitions and edge cases in `references/metrics-glossary.md`. Label partial
   periods provisional.
6. **Flag.** Run `scripts/flag_outliers.py` and read `references/outlier-guidance.md`. **Flag only** - show
   the notable flags with context; never exclude a value unless the user asks.
7. **Present.** Insight first, then a small table, then a chart only if it adds something, then the
   **Data notes** block (`assets/analysis-notes-template.md`). Save figures, chart PNGs and the data notes in
   the sandbox working folder so the report and email skills can reuse them without recomputing.

## Master-file mode (only when asked to build or extend a master file or a focused view)

Confirm which outcome is wanted: **extend** an existing master (append a new period, check schema and
duplicate keys first, never alter history, add a change-log line), **focused view** (filter periods/fields,
state what is in and out), or **build from scratch** (canonical fields from `discover_fields.py`, alias and
change-log sheets from the start). Use `references/field-mapping-checklist.md` before merging. Confirm the
field list with the user when it isn't obvious. Build the file in the sandbox and give it to the user as a
chat attachment - never write it to SharePoint.

## Guardrails (always)

- Name the denominator of every percentage; distinguish % change from percentage points.
- Sum only the lowest level of a hierarchy - never subtotals plus detail.
- Combine rates and ratios as sum(numerator)/sum(denominator), not an average of averages.
- No imputation: blanks stay blank and are reported. No causes the data can't show.

## Charts

Call `chart_style.apply_theme("report")` (or `"email"`), then use its helpers: `bar_ranked`,
`column_by_period`, `line_trend` (direct labels, prior year dashed), `variance_bars`, `small_multiples`.
Pick the type with `references/chart-selection-guide.md`, run `scripts/visual_check.py` (pass `target=`) and
fix any FAIL, then `save_chart`. Title = what it shows; subtitle = unit, currency, period.

## Output contract

Every answer that contains figures ends with **Data notes**: scope and files; transformations; FX; flags
and outliers; caveats. Keep it to 3-6 short lines. No bare numbers without unit, period and basis.
