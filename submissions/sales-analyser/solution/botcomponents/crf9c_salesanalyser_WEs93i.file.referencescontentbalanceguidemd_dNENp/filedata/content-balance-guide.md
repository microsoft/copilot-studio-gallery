# Content balance guide: data quality, visual impact, short statements

A report's value comes from three things multiplying together, not adding: accurate data, a chart that makes
the point at a glance, and a sentence the reader can repeat afterward. More pages, more charts, and more
prose do not add value -- past a point they actively subtract it, because the reader has to work harder to
find the one thing that matters. This file gives the concrete budgets referenced from Stage 2 of SKILL.md.

## Density budgets by report length

Pick the budget that matches what the user asked for (or default to one-pager when unspecified).

| Report type | Total word budget | Charts/images | Sections | When to use it |
|---|---|---|---|---|
| One-pager | 400-600 words | 1-2 | Headline + 3-5 metrics + 1 chart + up to 3 insights + up to 3 recommendations | A leadership update, a status check-in, anything meant to be read in under two minutes. This is the default. |
| Short report | 800-1,200 words | 2-4 | One-pager sections plus 1-2 supporting sections with their own single chart each | A monthly or quarterly review that needs a bit more supporting detail than a one-pager, but still a single sitting read. |
| Multi-section report | 1,500-2,500 words | 4-8 | Executive summary (itself a one-pager) plus distinct named sections, each independently respecting the one-pager's per-section budget | A deep-dive the user explicitly asked for, where different sections serve different audiences or questions. Even here, each section is held to its own mini density budget -- a multi-section report is several disciplined one-pagers, not one long undisciplined document. |

Treat any total that runs noticeably over its budget as a flag to cut, not a reason to shrink fonts or
margins to fit more in. `scripts/qa_report.py` checks the word, chart and page counts against these numbers.

## What "short, impactful statements" means in practice

- **The headline takeaway is one sentence, 20-35 words.** It states the single most important fact and why
  it matters, with a number and a comparison where possible: "Q3 revenue grew 12% to $4.2M, beating target by
  $300K" -- not "This report covers Q3 performance across several dimensions."
- **A bullet is one idea, not several joined by "and."** If a bullet needs a semicolon or more than ~20
  words, it is two bullets or it needs to be cut to its single most important clause.
- **Every number states its unit and its comparison.** A percentage without its denominator, or a total
  without what it is being compared to (prior period, target, another segment), is not yet a statement a
  reader can act on -- it is a number waiting for context.
- **Recommendations are actions, not observations.** "Margin declined in the East region" is an observation;
  "Review East region pricing before Q4 renewals" is a recommendation. A report built for action should lean
  toward the second form wherever the data supports it.

## What "visual impact" means in practice

- **One chart proves one point.** Choose the chart that makes the headline takeaway visually obvious, not
  every chart the data could support. A section with three charts competing for attention makes none of them
  land -- if more than one is genuinely needed, caption each with the specific question it answers so they
  do not blur together.
- **A chart replaces a paragraph, it does not sit next to one that repeats it.** If the surrounding text
  narrates every data point already visible in the chart, cut the narration down to the one-sentence
  takeaway the chart itself cannot carry (the "why it matters", not the "what the chart shows").
- **Consistent color and style across charts in the same report.** Building every chart with `chart_style.py`
  (palette and fonts from `style-tokens.json`) rather than letting each chart tool pick its own defaults is what
  makes a multi-chart report read as one coherent document instead of several unrelated exports pasted
  together.

## What "not overpacked, not lacking spaces" means in practice

- **Overpacked** looks like: more than three bullets in a section, more than one chart answering the same
  question, a headline takeaway that is actually a paragraph, or a page where every line of vertical space is
  used for content with no breathing room between sections.
- **Lacking spaces** looks like: headings butted directly against the paragraph before them with no gap,
  paragraphs run together with no line between them, or a chart placed flush against surrounding text with no
  margin -- all of which read as cramped and amateurish even when the content itself is fine. `render_report.py`
  already encodes generous spacing (section margins, heading spacing, line height) by default --
  the fix for "lacking spaces" is almost always to stop overriding that spacing to fit more content in, not to
  add spacing by hand.
- The right balance is a page that looks like it has room to breathe: clear section breaks, one idea per
  block, and never a block competing with its neighbor for the reader's eye.

## When more length is actually justified

More pages are the right call when the audience genuinely needs independently-addressable sections (a
deep-dive review covering several distinct questions, an appendix of supporting detail for an audit trail) --
never as a default or because there was more data available to include. When in doubt, build the one-pager
first and ask whether the user wants the supporting detail added as a clearly-separated appendix, rather
than folding everything into one undifferentiated long document.
