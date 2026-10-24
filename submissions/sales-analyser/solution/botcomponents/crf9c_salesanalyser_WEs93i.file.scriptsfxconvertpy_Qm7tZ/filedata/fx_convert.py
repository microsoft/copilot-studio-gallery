"""
FX conversion helpers.

Every analysis that converts currency gets a FRESH spot rate at the moment of
analysis (xe.com knowledge source first, otherwise the user provides or confirms
one). The rate is applied and disclosed in the Data notes (pair, direction, rate,
source, as-of date). Nothing is stored or written anywhere else: rates are always
supplied by the caller - never hard-coded, guessed or reused here.

Rate convention: 1 FROM = rate TO   (e.g. EUR->GBP 0.8712 means 1 EUR = 0.8712 GBP)

Subcommands:
    dominant  --data clean.csv --amount-col Revenue [--currency-col Currency | --file-currency GBP]
              -> which currency most rows are recorded in (the default reporting currency)
    validate  --from EUR --to GBP --rate 0.8712 [--inverse-rate 1.1478]
              -> sanity checks (positive, different currencies, rate x inverse ~ 1 to catch a flipped direction)
    convert   --data clean.csv --amount-col Revenue --to GBP --rates rates.json
              [--currency-col Currency | --file-currency EUR] [--out converted.csv] [--log fx_log.json]
              rates.json: {"EUR": {"rate": 0.8712, "source_url": "https://www.xe.com/currencyconverter/",
                                    "as_of": "2026-10-23 14:00 UTC", "obtained_via": "xe.com", "basis": "spot"}}
              -> adds Revenue_GBP, keeps the original column, writes fx_log.json (in the sandbox working
                 folder) with the ready-made Data notes FX sentence

Requires: pandas (convert/dominant). validate uses only the standard library.
"""
from __future__ import annotations

import argparse
import json
import sys

OBTAINED_VIA = ("xe.com", "user-confirmed")


def validate(from_ccy, to_ccy, rate, inverse_rate=None, tolerance=0.01):
    issues = []
    if rate is None or rate <= 0:
        issues.append("Rate must be a positive number.")
    if from_ccy.upper() == to_ccy.upper():
        issues.append("From and to currency are the same.")
    if inverse_rate and rate and rate > 0:
        prod = rate * inverse_rate
        if abs(prod - 1) > tolerance:
            issues.append(f"rate x inverse = {prod:.4f}, not ~1. The direction may be flipped "
                          f"(is it 1 {from_ccy} = {rate} {to_ccy}, or the other way round?).")
    ok = not issues
    return {"ok": ok, "issues": issues,
            "statement": f"1 {from_ccy.upper()} = {rate:.6g} {to_ccy.upper()}  |  "
                         f"1 {to_ccy.upper()} = {1 / rate:.6g} {from_ccy.upper()}" if rate and rate > 0 else ""}


def dominant(data, amount_col, currency_col=None, file_currency=None):
    import pandas as pd
    df = pd.read_csv(data)
    if currency_col:
        if currency_col not in df.columns:
            print(f"ERROR: currency column '{currency_col}' not found.")
            sys.exit(1)
        counts = df[currency_col].astype(str).str.upper().str.strip().value_counts()
    elif file_currency:
        counts = pd.Series({file_currency.upper(): len(df)})
    else:
        print("ERROR: pass --currency-col or --file-currency (from prepare_data.py's currency detection).")
        sys.exit(1)
    shares = (counts / counts.sum()).round(4).to_dict()
    top = counts.idxmax()
    return {"dominant_currency": top, "row_share": shares,
            "message": f"Most rows ({shares[top]:.0%}) are in {top}. Propose {top} as the reporting currency "
                       "and confirm with the user unless they already named one."}


def data_note(entry, to_ccy):
    """Data notes FX sentence: pair, direction, rate, source, as-of date (plus what it was applied to)."""
    via = {"xe.com": "XE mid-market", "user-confirmed": "user-provided"}.get(
        entry.get("obtained_via"), entry.get("source") or "source not stated")
    source = entry.get("source") or ""
    src = f"{via} ({source})" if source and source not in via else via
    return (f"{entry['from']} -> {to_ccy} {float(entry['rate']):.6g} ({entry['statement']}), {src} "
            f"{entry.get('basis', 'spot')}, as of {entry.get('as_of') or 'not stated'}; applied to {entry['rows']} rows "
            f"({entry['original_total']:,.2f} {entry['from']} -> {entry['converted_total']:,.2f} {to_ccy})")


def convert(data, amount_col, to_ccy, rates_path, currency_col=None, file_currency=None, out=None, log_path=None):
    import pandas as pd
    df = pd.read_csv(data)
    if amount_col not in df.columns:
        print(f"ERROR: amount column '{amount_col}' not found.")
        sys.exit(1)
    try:
        with open(rates_path, "r", encoding="utf-8") as f:
            rates = {k.upper(): v for k, v in json.load(f).items()}
    except (OSError, json.JSONDecodeError) as exc:
        print(f"ERROR: could not read rates file {rates_path}: {exc}")
        sys.exit(1)
    to_ccy = to_ccy.upper()
    if currency_col:
        ccy = df[currency_col].astype(str).str.upper().str.strip()
        ccy = ccy.where(~ccy.isin(["", "NAN", "NONE", "NULL"]), other=(file_currency or "").upper())
        if (ccy == "").any():
            print(f"ERROR: {int((ccy == '').sum())} row(s) have no currency. Ask the user, then pass "
                  "--file-currency for the default or fix the data.")
            sys.exit(1)
    elif file_currency:
        ccy = pd.Series(file_currency.upper(), index=df.index)
    else:
        print("ERROR: pass --currency-col or --file-currency.")
        sys.exit(1)
    needed = sorted(set(ccy) - {to_ccy})
    missing = [c for c in needed if c not in rates]
    if missing:
        print(f"ERROR: no rate supplied for {missing} -> {to_ccy}. Get a fresh spot rate from xe.com or the "
              "user for this analysis.")
        sys.exit(1)
    bad = [c for c in needed if not validate(c, to_ccy, float(rates[c].get("rate") or 0))["ok"]]
    if bad:
        print(f"ERROR: invalid rate for {bad} -> {to_ccy}. Run the validate subcommand.")
        sys.exit(1)
    amounts = pd.to_numeric(df[amount_col], errors="coerce")
    factor = ccy.map(lambda c: 1.0 if c == to_ccy else float(rates[c]["rate"]))
    new_col = f"{amount_col}_{to_ccy}"
    df[new_col] = amounts * factor
    entries = []
    for c in sorted(set(ccy)):
        mask = ccy == c
        entry = {"from": c, "to": to_ccy, "rows": int(mask.sum()),
                 "original_total": round(float(amounts[mask].sum()), 2),
                 "converted_total": round(float(df.loc[mask, new_col].sum()), 2)}
        if c != to_ccy:
            r = rates[c]
            entry.update({"rate": r["rate"], "statement": f"1 {c} = {float(r['rate']):.6g} {to_ccy}",
                          "source": r.get("source_url") or r.get("source", ""), "as_of": r.get("as_of", ""),
                          "obtained_via": r.get("obtained_via", ""), "basis": r.get("basis", "spot")})
        entries.append(entry)

    log = {"reporting_currency": to_ccy, "new_column": new_col, "original_column_kept": amount_col,
           "conversions": entries,
           "data_note": "; ".join(data_note(e, to_ccy) for e in entries if e["from"] != to_ccy)
           or f"No conversion needed - all rows already in {to_ccy}."}
    out = out or data.replace(".csv", f"_{to_ccy}.csv")
    df.to_csv(out, index=False)
    log_path = log_path or "fx_log.json"
    with open(log_path, "w", encoding="utf-8") as f:
        json.dump(log, f, indent=2)
    log["written"] = [out, log_path]
    return log


def main():
    ap = argparse.ArgumentParser(description="FX conversion helpers (fresh rate per analysis, nothing stored).")
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("dominant"); p.add_argument("--data", required=True); p.add_argument("--amount-col", required=True)
    p.add_argument("--currency-col"); p.add_argument("--file-currency")
    p = sub.add_parser("validate"); p.add_argument("--from", dest="f", required=True); p.add_argument("--to", dest="t", required=True)
    p.add_argument("--rate", type=float, required=True); p.add_argument("--inverse-rate", type=float)
    p = sub.add_parser("convert"); p.add_argument("--data", required=True); p.add_argument("--amount-col", required=True)
    p.add_argument("--to", dest="t", required=True); p.add_argument("--rates", required=True)
    p.add_argument("--currency-col"); p.add_argument("--file-currency"); p.add_argument("--out"); p.add_argument("--log")
    a = ap.parse_args()
    try:
        if a.cmd == "dominant":
            res = dominant(a.data, a.amount_col, a.currency_col, a.file_currency)
        elif a.cmd == "validate":
            res = validate(a.f, a.t, a.rate, a.inverse_rate)
        else:
            res = convert(a.data, a.amount_col, a.t, a.rates, a.currency_col, a.file_currency, a.out, a.log)
    except ImportError:
        print("ERROR: pandas is required for this subcommand and is not available.")
        sys.exit(1)
    print(json.dumps(res, indent=2, default=str))
    if a.cmd == "validate" and not res["ok"]:
        sys.exit(2)


if __name__ == "__main__":
    main()
