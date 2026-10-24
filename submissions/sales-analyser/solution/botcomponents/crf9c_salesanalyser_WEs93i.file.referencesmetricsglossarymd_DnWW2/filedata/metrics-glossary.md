# Standard metrics glossary (defaults)

Reference definitions for the measures this skill computes most often. They are **defaults**: if the data or
the request needs a variation (fiscal year, net vs gross, a different comparison base), adapt it and state the
definition you used in the Data notes. Implementations are in `scripts/compute_metrics.py`; they return
`{value, status, note}` so edge cases surface as labelled "n/a" instead of errors or misleading numbers.

## Periods

| Term | Default definition |
|---|---|
| Month / quarter / year | Calendar: Q1 Jan-Mar, Q2 Apr-Jun, Q3 Jul-Sep, Q4 Oct-Dec. Fiscal: pass `fiscal_start_month` (fiscal year named by its end year) - only when the user confirms a fiscal calendar. |
| YTD / QTD / MTD | Period start to the as-of date, inclusive. Compare **like-for-like**: the same cut-off day in the prior year (`to_date_compare`), never a partial YTD vs a full prior year. |
| LTM / TTM | Last twelve months ending at the as-of date, vs the twelve months before (`ltm`). Smooths seasonality. |
| Partial period | Today, or the latest date in the data, is before the period end. Label results "provisional" or compare like-for-like days (`partial_period_note`). |

## Growth and change

| Metric | Formula | Notes |
|---|---|---|
| Absolute change | current - prior | Always show it next to a % change. |
| % change (YoY, MoM, QoQ, WoW) | (current - prior) / prior | YoY = same period last year; MoM/QoQ/WoW = immediately preceding period of the same length. MoM/QoQ are seasonal - pair with YoY when seasonality is plausible. Keep week boundaries consistent. |
| Percentage-point change | current% - prior% | For rates, margins and shares: 20% -> 23% is +3 pp, not +15%. |
| CAGR | (end / start)^(1/n) - 1 | For growth over more than two periods; never average period growth rates. |
| Contribution to growth | (current_i - prior_i) / prior_total, in pp | Contributions sum to total % growth (`contribution_to_growth`). Best way to say which region drove growth. |
| Mix / share shift | share_current - share_prior, in pp | `mix_shift`. |
| Constant-currency growth | Growth with both periods converted at the **same** rate | Separates real growth from FX movement (`constant_currency_growth`). Reported growth uses each period's rate; say which one you show. |
| Run rate | to-date / days elapsed x days in period | A projection - label it, never add it to actuals. |

## Levels and ratios

| Metric | Formula | Notes |
|---|---|---|
| Share of total | part / whole | Always name the whole ("share of Q4 EMEA revenue"). |
| Weighted average | sum(v x w) / sum(w) = sum(numerator) / sum(denominator) | For any rate across groups of different size. |
| Average selling price | revenue / units | Same filter on both. |
| Margin % | (revenue - cost) / revenue | Changes in margin are in pp. |

## Edge cases (apply everywhere)

| Situation | Show | Why |
|---|---|---|
| Prior period is 0 | "n/a - new" (show the absolute value) | Percentage from zero is undefined. |
| Prior period missing (no data) | "n/a - no comparable period" | Different from zero - say which it is. |
| Negative base or sign change | Absolute change only, e.g. "-5K to +5K (+10K)" | A % across a sign change is meaningless. |
| Partial current period | "provisional", or like-for-like days | Never compare partial vs full without saying so. |
| Uneven trading days / calendars | Note it; offer per-day figures if material | E.g. 4-4-5 months, Easter timing. |
| Rounding | Compute from unrounded values; note "figures rounded; may not sum" | Avoid totals that don't add up silently. |
| Category only in one period | Keep it; show "n/a - new" or "n/a - not present this period" | Don't drop it from totals. |
| Mixed currencies | Convert first (`references/fx-conversion.md`) | Never sum different currencies. |
| Returns / credit notes | Net them off by default and say so; show gross if the user asks | Negative rows are flagged by `flag_outliers.py`. |
