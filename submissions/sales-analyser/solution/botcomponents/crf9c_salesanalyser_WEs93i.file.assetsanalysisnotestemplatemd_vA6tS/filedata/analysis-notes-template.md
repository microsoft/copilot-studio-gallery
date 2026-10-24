# Data notes (attach to every answer, report and email that contains figures)

Keep it short: 3-6 lines in chat, a compact section in the PDF, a 2-3 line footnote in the email. Omit a
line only if it is genuinely "none" - and then say "none".

**Data notes**
- **Scope:** [period and definition, e.g. "Q4 2026 = 1 Oct - 31 Dec 2026 (calendar)"] vs [comparison];
  [n] files from [SharePoint source folder, e.g. "Monthly Sales"] - [file names, or "12 monthly files Jan-Dec 2026"]; skipped: [file - reason].
- **Transformations:** [from transformation_log.json, e.g. "removed 3 subtotal rows (GBP 9.9M), 1 duplicate
  row (GBP 84K); mapped 'Emea' -> 'EMEA' (14 rows); 1 'n/a' treated as blank, not zero"].
- **FX:** [pair, direction, rate, source and as-of date, e.g. "EUR -> GBP 0.8712 (1 EUR = 0.8712 GBP), XE
  mid-market spot, as of 23 Oct 2026 14:00 UTC; applied to 3 rows (EUR 99.2K -> GBP 86.5K)"] or "none - all
  in GBP".
- **Flags:** [top 1-3 from flags.json with context, e.g. "EMEA Nov order of GBP 2.5M (26% of total) -
  included; confirm if one-off"] or "none above default thresholds".
- **Caveats:** [partial period / provisional, fiscal vs calendar assumption, missing comparison, coverage gaps,
  "figures rounded; may not sum"].

Reports and emails also carry the non-audit disclaimer from `assets/style-tokens.json` (`text.footer_disclaimer`).
