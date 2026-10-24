# Currency conversion (FX)

Rates are looked up at the moment of analysis, applied, and disclosed in the Data notes. Nothing is stored:
no rate file, log or register is created or written, in the sandbox or in SharePoint.

## Reporting currency
- Default: the **dominant currency** in the data - the one most rows are recorded in
  (`fx_convert.py dominant`). Tell the user which currency you detected. If they haven't named a reporting
  currency, confirm it before converting. The user can override it at any time.

## Rate basis
- **Spot (latest) mid-market rate**, applied to all periods in the analysis (so growth comparisons are on a
  constant-currency basis). If the user asks for period-specific rates (month-end or average), use them and
  say so - reported growth then includes FX effects.
- Rate convention everywhere: **1 FROM = rate TO** (e.g. 1 EUR = 0.8712 GBP).

## Look up a fresh rate for every analysis
Rates are **never reused** - not from earlier in the conversation and not from a previous analysis. Each
analysis that needs a conversion gets its own spot rate:
1. **xe.com knowledge source** (`https://www.xe.com/currencyconverter/`). Ask it for the pair, e.g.
   "XE EUR to GBP rate". Only use the answer if it shows a **clear direction** (1 EUR = x GBP) and an
   **as-of date/time**. The knowledge source is a search snapshot and may be days old - use its date as
   the as-of date, not today, and tell the user how old it is.
2. **The user.** If xe.com gives no usable, clearly dated rate, ask the user to provide or confirm one, with
   its source and as-of date.

Never quote or apply a rate from memory.

## Check, confirm, apply, disclose
1. **Check:** `fx_convert.py validate --from EUR --to GBP --rate R [--inverse-rate R2]`. It checks the rate
   is positive and that rate x inverse is about 1 (catches a flipped direction).
2. **Confirm:** show the user the pair and direction, rate, inverse, source, as-of date and what it will be
   applied to. Get a yes before applying it.
3. **Apply:** write `rates.json` in the sandbox working folder
   (`{"EUR": {"rate": R, "source_url": "...", "as_of": "...", "obtained_via": "xe.com", "basis": "spot"}}`,
   `obtained_via` = `xe.com` or `user-confirmed`) and run `fx_convert.py convert --data clean.csv
   --amount-col "Net Sales" --to GBP --rates rates.json --currency-col Currency`. The original column is
   kept; a `<col>_<CCY>` column is added; `fx_log.json` contains a ready-made Data notes sentence.
4. **Disclose:** put that sentence in the Data notes **FX** line - pair, direction, rate, source and as-of
   date (plus what it was applied to). That is the only record of the rate.

## Data notes (every conversion)
"EUR -> GBP 0.8712 (1 EUR = 0.8712 GBP), XE mid-market spot, as of 23 Oct 2026 14:00 UTC; applied to
3 files / 1,284 rows (EUR 1.2M -> GBP 1.05M)."

## Terms of use
XE restricts automated or commercial use of its rates. The organisation should confirm this use is
acceptable; if not, have the user provide rates from an approved source (e.g. treasury) - they are disclosed
as user-provided.