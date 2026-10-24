# Chart selection guide

Pick the chart from the question being asked, build it with the `scripts/chart_style.py` helper named
below (brand theme from `assets/style-tokens.json`), then confirm it with `scripts/visual_check.py` before
presenting. Prefer the simplest chart that makes the point; a small table is often better than a chart.

| Question being answered | Chart | Why / caution |
|---|---|---|
| How has a metric moved over time? | Line chart - `line_trend` (prior year dashed grey, direct labels); `column_by_period` for 3-6 periods; `small_multiples` for 6+ series | One line per series; avoid more than 5-6 lines on one chart or it becomes unreadable — split into small multiples instead. |
| How do categories compare at one point in time? | Horizontal bar, sorted by value - `bar_ranked` (highlight the focus category; long tail grouped with `top_n`) | Sorting (not alphabetical or source order) lets the comparison read at a glance. Axis must start at zero — a truncated axis exaggerates differences. |
| How is a whole divided into parts? | 100% stacked bar (for 2+ periods) or a single bar/pie (for one period, 5 categories or fewer) | A pie chart with more than ~5 slices is hard to compare visually — use a sorted bar chart instead, or group small slices into "Other". |
| How does a part-to-whole split change over time? | 100% stacked bar or stacked area across periods | A stand-alone pie chart cannot show change over time; use multiple pies only as a last resort and never as the default. |
| What is the shape of a distribution (spread, outliers)? | Histogram or box plot | Choose bucket width deliberately — too few buckets hides shape, too many turns it into noise. |
| Is there a relationship between two measures? | Scatter plot | Add a trend line only when the relationship is genuinely linear; do not force one onto a non-linear pattern. |
| What changed vs the prior period, by category? | Diverging bar - `variance_bars` (positive/negative colours plus signed labels) | Sort by change. Use pp for share/margin changes, % or currency for values. |
| Comparing a metric against a target or threshold | Bar or line with a reference line/band | Label the reference line explicitly ("Target", "Prior year") so it is not mistaken for another data series. |

## General rules that apply to every chart type

- Title states the metric, the period, and the unit — a viewer should never have to infer what the numbers
  represent.
- Label axes with their unit (currency, percent, count) and avoid unlabeled dual axes, which routinely
  mislead by letting two unrelated scales visually coincide.
- Prefer direct labels over legends (the helpers do this). Keep categories to roughly 6-8 and group the long
  tail into "Other".
- Use colour with intent: the brand primary for the focus series, grey (`context`) for everything else, the
  categorical palette only when categories genuinely need distinguishing. Keep the same category-to-colour
  mapping across a report. Colour is never the only cue - labels and signs carry the meaning too.
- Never hard-code colours or fonts in chart code - they come from `assets/style-tokens.json`.
- Round and state the rounding ("GBP thousands", "rounded to nearest whole percent") rather than showing
  false precision that the underlying data does not support.
- Size: `apply_theme("report")` gives 200 dpi charts for the PDF; `apply_theme("email")` gives 1120x630 px
  (2x the 560 px email column) if a chart image is ever needed for email or chat.
