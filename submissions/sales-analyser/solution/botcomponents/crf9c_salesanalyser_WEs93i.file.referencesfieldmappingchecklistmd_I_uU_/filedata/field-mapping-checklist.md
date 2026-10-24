# Field reconciliation checklist

Read this when merging columns from different spreadsheets that are supposed to represent the same field.
Each item below is a concrete way two "matching" columns turn out not to actually match. Cleaning rules
(blanks, numbers as text, subtotal rows, duplicates) are in `data-preparation.md`.

## Label mismatches (the easy case)

`discover_fields.py` normalizes labels (lowercase, strip punctuation, collapse whitespace) and applies a
synonym table before fuzzy-matching, so "Net Sales", "net_sales", and "Revenue ($)" cluster together. Still
review the cluster report — a fuzzy match above the threshold can be a false positive ("Net Sales" vs "Net
Savings" are textually close but not the same field). When in doubt, open a few sample values from each side
of the cluster and confirm they are the same kind of number before merging.

## Unit mismatches

Two columns can carry the same concept in different units and merge into nonsense if concatenated directly:

- Currency: one file in USD, another in local currency, another already converted. Check for a currency
  column or a note in the file before assuming a shared currency.
- Scale: one file in raw units, another in thousands or millions (common header hints: "(000s)", "in $M").
  Compare typical magnitudes between the two columns — a 1000x gap in typical value for an otherwise-matched
  field is a scale mismatch, not a data story.
- Time basis: a "rate" column that is annualized in one file and monthly in another will not combine cleanly
  with simple concatenation.

## Date and period mismatches

- Date formats differ (`MM/DD/YYYY` vs `DD/MM/YYYY` vs serial Excel date numbers) and can silently swap day
  and month for ambiguous dates (`03/04/2026`). `prepare_data.py` parses dates with an explicit format per
  source file and flags ambiguous ones - confirm the order with the user rather than guessing.
- Period boundaries differ: a "month" column that is calendar-month in one file and a 4-4-5 fiscal month in
  another will not align for a month-over-month comparison. Confirm the period convention per source before
  merging a time series.

## ID / key mismatches

- The same entity (a customer, product, region) can have different identifiers across files (an internal ID
  in one, a display name in another, a different ID scheme in a third system export). Reconciling on display
  name alone invites duplicates from trivial formatting differences ("Acme Corp" vs "Acme Corp."). Prefer the
  most stable identifier available, and when only names are available, normalize case/punctuation/whitespace
  before matching and still spot-check a sample of matches.
- Watch for one-to-many or many-to-one relationships hiding behind what looks like a one-to-one key (e.g. a
  file keyed by store, another keyed by store-and-channel) — a naive join on the shared key silently
  duplicates or drops rows.

## Coverage and missingness

- A field that is present in every file but blank for many rows is different from a field present in only
  some files. Report the non-blank coverage percentage for every backbone field (discover_fields.py prints
  this) so the user can judge whether a field is reliable enough to anchor a metric on.
- A sudden coverage change for one period (e.g. a field went from 95% populated to 10% populated starting a
  given month) usually signals a source system change, not a real shift in the underlying data — flag it
  rather than computing a trend straight through it.
