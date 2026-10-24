"""
Flag notable outliers and data issues - FLAG ONLY, never exclude.

Runs the default checks from references/outlier-guidance.md on a cleaned table
(output of prepare_data.py) and writes flags.json. Show the top flags to the
user with context and ask before excluding anything.

Checks (thresholds are defaults - adjust with the options and say so):
  - negative values in the value column (returns/credit notes?)
  - row-level extreme values: robust z-score (MAD) > 3.5, IQR x 3 fallback
  - concentration: one row > 25% of the total
  - period-on-period swings beyond +/-50% (total and per group)
  - share shifts beyond 5 percentage points between the last two periods
  - coverage drops: a column's fill rate falling > 30 pp between periods

Usage:
    python flag_outliers.py clean.csv --value Revenue [--date "Order Date"] [--group Region]
                            [--freq M|Q] [--out flags.json] [--z 3.5] [--iqr 3]
                            [--swing 0.5] [--share-pp 5] [--concentration 0.25] [--top 10]

Requires: pandas, numpy.
"""
from __future__ import annotations

import argparse
import json
import sys

try:
    import numpy as np
    import pandas as pd
except ImportError:
    print("ERROR: pandas and numpy are required for flag_outliers.py.")
    sys.exit(1)

SEVERITY_ORDER = {"high": 0, "medium": 1, "low": 2}


def _flag(kind, severity, message, **context):
    return {"type": kind, "severity": severity, "message": message, "context": context}


def _row_ref(row):
    parts = [str(row.get(c)) for c in ("source_file", "source_sheet", "source_row") if c in row and pd.notna(row.get(c))]
    return " / ".join(parts)


def robust_outliers(df, value, group=None, z=3.5, iqr_k=3.0):
    flags = []
    groups = df.groupby(group) if group else [(None, df)]
    for g, sub in groups:
        s = sub[value].dropna()
        if len(s) < 8:
            continue
        med = s.median()
        mad = (s - med).abs().median()
        if mad > 0:
            scores = 0.6745 * (s - med) / mad
            hits = scores[scores.abs() > z]
            method = f"robust z > {z}"
        else:
            q1, q3 = s.quantile(0.25), s.quantile(0.75)
            spread = q3 - q1
            if spread == 0:
                continue
            hits = s[(s < q1 - iqr_k * spread) | (s > q3 + iqr_k * spread)]
            scores = (s - med) / spread
            method = f"outside IQR x {iqr_k}"
        for idx in hits.index:
            row = df.loc[idx]
            flags.append(_flag("extreme_value", "medium",
                               f"{value} = {row[value]:,.2f} is far from the typical {med:,.2f}"
                               + (f" for {group} '{g}'" if group else "") + f" ({method}).",
                               row=_row_ref(row), group=g, value=float(row[value]), median=float(med),
                               score=round(float(scores.loc[idx]), 2)))
    return flags


def negatives(df, value):
    neg = df[df[value] < 0]
    if neg.empty:
        return []
    return [_flag("negative_values", "medium",
                  f"{len(neg)} row(s) have negative {value} (total {neg[value].sum():,.2f}). Likely returns or "
                  "credit notes - confirm whether they should net off.",
                  rows=len(neg), total=float(neg[value].sum()),
                  examples=[_row_ref(r) for _, r in neg.head(5).iterrows()])]


def concentration(df, value, threshold=0.25):
    total = df[value].sum()
    if total <= 0:
        return []
    big = df[df[value] / total > threshold]
    return [_flag("concentration", "medium",
                  f"One row makes up {r[value] / total:.0%} of total {value}.",
                  row=_row_ref(r), value=float(r[value]), share=round(float(r[value] / total), 4))
            for _, r in big.iterrows()]


def period_swings(df, value, date, freq="M", group=None, swing=0.5):
    flags = []
    d = df.dropna(subset=[date]).copy()
    d["_period"] = pd.to_datetime(d[date]).dt.to_period(freq)
    keys = ["_period"] + ([group] if group else [])
    agg = d.groupby(keys)[value].sum().reset_index()
    series = agg.groupby(group) if group else [(None, agg)]
    for g, sub in series:
        sub = sub.sort_values("_period")
        prev = None
        for _, r in sub.iterrows():
            if prev is not None and prev[value] != 0:
                ch = (r[value] - prev[value]) / abs(prev[value])
                if abs(ch) > swing:
                    flags.append(_flag("period_swing", "high" if abs(ch) > 2 * swing else "medium",
                                       f"{value}{' for ' + str(g) if g is not None else ''} moved {ch:+.0%} from "
                                       f"{prev['_period']} to {r['_period']}.",
                                       group=g, period=str(r["_period"]), previous=float(prev[value]),
                                       current=float(r[value]), change=round(float(ch), 4)))
            prev = r
    return flags


def share_shifts(df, value, date, group, freq="M", pp=5.0):
    d = df.dropna(subset=[date]).copy()
    d["_period"] = pd.to_datetime(d[date]).dt.to_period(freq)
    periods = sorted(d["_period"].unique())
    if len(periods) < 2:
        return []
    last, prev = periods[-1], periods[-2]
    def shares(p):
        s = d[d["_period"] == p].groupby(group)[value].sum()
        return s / s.sum() if s.sum() else s * 0
    a, b = shares(prev), shares(last)
    flags = []
    for g in sorted(set(a.index) | set(b.index), key=str):
        diff = (b.get(g, 0) - a.get(g, 0)) * 100
        if abs(diff) > pp:
            flags.append(_flag("share_shift", "medium",
                               f"{group} '{g}' share moved {diff:+.1f} pp ({prev} -> {last}).",
                               group=g, from_period=str(prev), to_period=str(last), change_pp=round(float(diff), 2)))
    return flags


def coverage_drops(df, date, freq="M", drop_pp=30.0):
    d = df.dropna(subset=[date]).copy()
    d["_period"] = pd.to_datetime(d[date]).dt.to_period(freq)
    cols = [c for c in d.columns if c not in ("_period", date, "source_file", "source_sheet", "source_row")]
    fill = d.groupby("_period")[cols].apply(lambda x: x.notna().mean() * 100).sort_index()
    flags = []
    for c in cols:
        s = fill[c]
        for i in range(1, len(s)):
            if s.iloc[i - 1] - s.iloc[i] > drop_pp:
                flags.append(_flag("coverage_drop", "high",
                                   f"'{c}' fill rate fell from {s.iloc[i - 1]:.0f}% to {s.iloc[i]:.0f}% in "
                                   f"{s.index[i]} - possible source system change; don't trend through it blindly.",
                                   column=c, period=str(s.index[i])))
    return flags


def run(df, value, date=None, group=None, freq="M", z=3.5, iqr_k=3.0, swing=0.5, share_pp=5.0, conc=0.25):
    if value not in df.columns:
        print(f"ERROR: value column '{value}' not found. Columns: {list(df.columns)}")
        sys.exit(1)
    df = df.copy()
    df[value] = pd.to_numeric(df[value], errors="coerce")
    flags = negatives(df, value) + robust_outliers(df, value, group, z, iqr_k) + concentration(df, value, conc)
    if date:
        if date not in df.columns:
            print(f"ERROR: date column '{date}' not found.")
            sys.exit(1)
        df[date] = pd.to_datetime(df[date], errors="coerce")
        flags += period_swings(df, value, date, freq, None, swing)
        if group:
            flags += period_swings(df, value, date, freq, group, swing)
            flags += share_shifts(df, value, date, group, freq, share_pp)
        flags += coverage_drops(df, date, freq)
    flags.sort(key=lambda f: SEVERITY_ORDER.get(f["severity"], 3))
    return {"policy": "flag only - nothing excluded", "thresholds": {
        "robust_z": z, "iqr_k": iqr_k, "period_swing": swing, "share_shift_pp": share_pp,
        "concentration": conc, "coverage_drop_pp": 30.0}, "count": len(flags), "flags": flags}


def main():
    ap = argparse.ArgumentParser(description="Flag outliers and data issues (never excludes).")
    ap.add_argument("data")
    ap.add_argument("--value", required=True)
    ap.add_argument("--date")
    ap.add_argument("--group")
    ap.add_argument("--freq", default="M", choices=["M", "Q", "Y"])
    ap.add_argument("--out", default="flags.json")
    ap.add_argument("--z", type=float, default=3.5)
    ap.add_argument("--iqr", type=float, default=3.0)
    ap.add_argument("--swing", type=float, default=0.5)
    ap.add_argument("--share-pp", type=float, default=5.0)
    ap.add_argument("--concentration", type=float, default=0.25)
    ap.add_argument("--top", type=int, default=10)
    a = ap.parse_args()
    try:
        df = pd.read_csv(a.data) if a.data.lower().endswith(".csv") else pd.read_excel(a.data)
    except Exception as exc:  # noqa: BLE001
        print(f"ERROR: could not read {a.data}: {exc}")
        sys.exit(1)
    if a.group and a.group not in df.columns:
        print(f"ERROR: group column '{a.group}' not found.")
        sys.exit(1)
    freq = {"M": "M", "Q": "Q", "Y": "Y"}[a.freq]
    result = run(df, a.value, a.date, a.group, freq, a.z, a.iqr, a.swing, a.share_pp, a.concentration)
    with open(a.out, "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2, default=str)
    print(f"{result['count']} flag(s) (policy: flag only, nothing excluded). Top {min(a.top, result['count'])}:")
    for fl in result["flags"][:a.top]:
        print(f"  [{fl['severity']}] {fl['type']}: {fl['message']}")
    print(f"Wrote {a.out}")


if __name__ == "__main__":
    main()
