# Data preparation and normalisation (defaults)

`scripts/prepare_data.py` applies these rules and logs every one in `transformation_log.json` (step, rule,
rows affected, value impact). Use this file for the judgement calls the script can't make. Whatever you
change, it goes in the Data notes.

## Layout
- **All sheets are read.** Skip sheets that are clearly notes, pivots or charts, and say which.
- **Header row may not be row 1.** Titles and blank rows above the header are skipped. Check the detected
  header if the column names look wrong; merged or two-row headers may need a manual rename.
- **Wide vs long.** Months as columns (Jan, Feb, ...) need melting to one row per month before analysis.

## Blanks are not zero
- `''`, `-`, `n/a`, `#N/A`, `TBC` and similar become **blank**, never 0. Report how many.
- A blank value is excluded from sums and averages and counted in coverage. Don't fill it - instead flag it,
  and if the user has the missing figure, ask them to add the source file to the SharePoint folder.
- Only estimate a value if the user explicitly asks; label it "estimate" everywhere.

## Numbers stored as text
- Thousands separators (`1,234`), currency symbols/codes (`GBP 1,234`, `£1,234`), negatives as `(500)` or
  `500-`, `%` strings (`12%` -> 0.12) and European formats (`1.234,56`) are converted.
- **Scale**: headers like "(000s)", "in £k", "$M" mean the values are scaled. Multiply consistently and note it.
  A ~1000x gap between files for the same field is a scale mismatch, not a trend.

## Dates
- Parsed with an **explicit format per source file**, never guessed across files. Excel serial numbers are
  converted.
- **Ambiguous dates** (03/04/2026 where every day and month is <= 12) are flagged. Ask the user for the order
  (or use the file's locale) and re-run with `--date-order dmy|mdy`.
- Month labels ("Oct-26", "October 2026") are parsed to the 1st of the month.

## Labels and categories
- Whitespace is trimmed and case variants (`Emea`, `EMEA `) are merged to the most common spelling.
- Synonyms the script can't know (`Europe` vs `EMEA`, `UK` vs `United Kingdom`) go in a label map
  (`--label-map labels.json`). **Show the mapping to the user** when it changes any totals.
- Don't merge categories that might genuinely differ (e.g. `UK` vs `UK&I`) without asking.

## Duplicates and overlaps
- **Exact duplicate rows** are removed (first kept) and the value impact is logged.
- **Duplicate keys** (same order ID, different values) are flagged, not removed: ask which version wins
  (often the latest file or a re-issued export).
- **Overlapping files** (a "Q4" file and three monthly files) double-count. Choose one source per period and
  say which.

## Subtotal and total rows
- Rows labelled Total, Subtotal, Grand total, All regions etc. are removed so the sum isn't doubled. Check
  the logged value impact - if a "total" row is actually data, restore it.
- Never add subtotals and their detail rows together.

## Returns, credits and adjustments
- Negative rows are kept (net revenue) and flagged. Say "net of returns" in the Data notes, or show gross and
  returns separately if asked.
- Manual adjustment rows or notes columns are **decision-relevant extras** - surface them, don't drop them.

## Currency
- A currency column, or symbols/codes in the values, are detected. Several currencies -> convert before any
  aggregation (`references/fx-conversion.md`). No indicator -> confirm the currency with the user.

## Coverage
- Report non-blank coverage for key fields. A field that drops from ~95% to ~10% filled in one month usually
  means a source-system change: flag it rather than trending through it.
