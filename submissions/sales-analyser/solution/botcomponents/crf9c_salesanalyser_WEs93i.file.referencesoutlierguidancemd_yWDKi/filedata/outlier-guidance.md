# Outlier and anomaly guidance (defaults)

Policy: **flag, never exclude automatically.** Outliers are often the story (a big new customer, a
mis-keyed value, a returns batch). Show them to the user with context and let the user decide.

`scripts/flag_outliers.py` runs these checks. Thresholds are defaults - change them with the script options
when the data calls for it (very small datasets, very seasonal products) and say so.

| Check | Default threshold | Typical meaning |
|---|---|---|
| Negative values | any < 0 | Returns, credit notes, corrections. |
| Extreme row value | robust z-score (median/MAD) > 3.5; IQR x 3 if MAD = 0 | Large one-off deal, typo (extra zero), wrong currency or scale. |
| Concentration | one row > 25% of the total | Result depends on one transaction - say so. |
| Period swing | total or group moves > +/-50% period-on-period | Real event, missing file, partial period, or duplicated export. |
| Share shift | a group's share moves > 5 pp between the last two periods | Mix change worth calling out. |
| Coverage drop | a column's fill rate falls > 30 pp between periods | Source system or template change. |

Robust z (MAD) and IQR are used instead of mean/standard deviation because sales data is skewed and a single
huge value inflates the standard deviation enough to hide itself. Groups with fewer than 8 rows are not
tested for extreme values - too few to judge.

## How to present flags
- Pick the 1-3 flags that change the reading of the headline. Give **value, context and impact**:
  "EMEA had one GBP 2.5M order on 20 Nov - 26% of Q4 revenue; excluding it, EMEA growth would be +4% not +38%."
- Show the "with / without" figure only as context. The headline keeps **all** data unless the user asks.
- Say what you'd check ("confirm whether this is a one-off or a mis-keyed value") and offer to exclude it.
- If the user asks to exclude something, record it in the Data notes (what, why, value impact, who decided).
- Put minor flags in the Data notes as a count ("7 smaller flags - list available").
