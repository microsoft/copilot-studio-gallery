"""
Metric helpers with explicit edge-case handling. Definitions are in
references/metrics-glossary.md - they are DEFAULTS: adapt them to the data or
the request (fiscal year, net vs gross) and say so in the Data notes.

Scalar helpers return a Result dict instead of raising:
    {"value": float | None, "status": "ok" | "n/a" | "provisional", "note": str}
so a zero or missing prior period shows as "n/a - new" / "n/a - no comparable
period" rather than crashing or printing a misleading number.

Scalar:  share_of_total, pct_change, pct_point_change, yoy, mom, qoq, wow, cagr,
         weighted_average, run_rate, fmt_result
Periods: quarter_bounds, month_bounds, to_date_bounds, prior_year, prior_period,
         partial_period_note
Tables (pandas): period_totals, period_compare, to_date_compare, ltm,
         contribution_to_growth, mix_shift, constant_currency_growth

Usage:
    from compute_metrics import period_compare, quarter_bounds, fmt_result
    cur = quarter_bounds(2026, 4)                    # calendar Q4 = Oct-Dec
    cmp = period_compare(df, "Order Date", "Revenue_GBP", cur, prior_year(cur), by="Region")

Self-test:  python compute_metrics.py
"""
from __future__ import annotations

import calendar
import sys
from datetime import date, timedelta

try:
    import pandas as pd
except ImportError:  # scalar helpers still work without pandas
    pd = None


def _res(value, status="ok", note=""):
    return {"value": value, "status": status, "note": note}


def fmt_result(r, kind="pct", decimals=1, currency=""):
    """Display a Result: pct -> '+12.3%', pp -> '+3.0 pp', abs -> '1,234'."""
    if r["value"] is None:
        return r["note"] or "n/a"
    v = r["value"]
    if kind == "pct":
        s = f"{v * 100:+.{decimals}f}%"
    elif kind == "pp":
        s = f"{v:+.{decimals}f} pp"
    else:
        s = f"{currency}{v:,.{decimals}f}"
    return s + (" (provisional)" if r["status"] == "provisional" else "")


# ---------------------------------------------------------------------------
# Scalar metrics
# ---------------------------------------------------------------------------

def share_of_total(part, whole):
    """part / whole as a fraction. Always name the whole next to the result."""
    if whole is None or part is None:
        return _res(None, "n/a", "n/a - missing value")
    if whole == 0:
        return _res(None, "n/a", "n/a - total is zero")
    return _res(part / whole)


def pct_change(current, previous, *, partial=False):
    """(current - previous) / |previous| with edge cases:
    previous missing -> 'n/a - no comparable period'; previous 0 -> 'n/a - new';
    sign change / negative base -> value None, note gives the absolute change."""
    if current is None:
        return _res(None, "n/a", "n/a - no current value")
    if previous is None or (isinstance(previous, float) and previous != previous):
        return _res(None, "n/a", "n/a - no comparable period")
    if previous == 0:
        return _res(None, "n/a", "n/a - new (prior was zero)" if current else "n/a - zero in both periods")
    if previous < 0 or (previous > 0 > current):
        return _res(None, "n/a", f"n/a - sign change; absolute change {current - previous:+,.2f}")
    status = "provisional" if partial else "ok"
    return _res((current - previous) / previous, status,
                "current period is partial - label as provisional" if partial else "")


def pct_point_change(current_pct, previous_pct):
    """Difference between two percentages, in percentage points (inputs in %)."""
    if current_pct is None or previous_pct is None:
        return _res(None, "n/a", "n/a - missing value")
    return _res(current_pct - previous_pct)


def yoy(current, same_period_last_year, *, partial=False):
    return pct_change(current, same_period_last_year, partial=partial)


def mom(current, prior_month, *, partial=False):
    """Seasonality-sensitive - pair with YoY when seasonality is plausible."""
    return pct_change(current, prior_month, partial=partial)


def qoq(current, prior_quarter, *, partial=False):
    return pct_change(current, prior_quarter, partial=partial)


def wow(current, prior_week, *, partial=False):
    return pct_change(current, prior_week, partial=partial)


def cagr(beginning, ending, n_periods):
    if beginning is None or ending is None:
        return _res(None, "n/a", "n/a - missing value")
    if beginning <= 0 or ending < 0:
        return _res(None, "n/a", "n/a - CAGR needs positive start and non-negative end values")
    if n_periods <= 0:
        return _res(None, "n/a", "n/a - number of periods must be positive")
    return _res((ending / beginning) ** (1.0 / n_periods) - 1)


def weighted_average(values, weights):
    """sum(v*w)/sum(w). Use for rates/ratios across groups of different size."""
    pairs = [(v, w) for v, w in zip(values, weights) if v is not None and w is not None]
    if len(values) != len(weights):
        return _res(None, "n/a", "n/a - values and weights differ in length")
    tw = sum(w for _, w in pairs)
    if tw == 0:
        return _res(None, "n/a", "n/a - total weight is zero")
    dropped = len(values) - len(pairs)
    return _res(sum(v * w for v, w in pairs) / tw, "ok", f"{dropped} pair(s) with blanks ignored" if dropped else "")


def run_rate(period_to_date, days_elapsed, days_in_period):
    """Projection of a partial period - always label it a projection."""
    if days_elapsed <= 0:
        return _res(None, "n/a", "n/a - no days elapsed")
    return _res(period_to_date / days_elapsed * days_in_period, "provisional", "projection, not actual")


# ---------------------------------------------------------------------------
# Period helpers (calendar by default; fiscal_start_month shifts the year)
# ---------------------------------------------------------------------------

def month_bounds(year, month):
    return date(year, month, 1), date(year, month, calendar.monthrange(year, month)[1])


def quarter_bounds(year, q, fiscal_start_month=1):
    """Q1..Q4 of (fiscal) year. Calendar default: Q4 2026 = 1 Oct - 31 Dec 2026.
    With fiscal_start_month=4, FY2026 Q1 = Apr-Jun 2025 (fiscal year named by its END year)."""
    if q not in (1, 2, 3, 4):
        raise ValueError("quarter must be 1-4")
    start_month = (fiscal_start_month - 1 + (q - 1) * 3) % 12 + 1
    start_year = year if fiscal_start_month == 1 else year - 1
    start_year += (fiscal_start_month - 1 + (q - 1) * 3) // 12
    end_month = (start_month + 1) % 12 + 1
    end_year = start_year + (1 if end_month < start_month else 0)
    return date(start_year, start_month, 1), month_bounds(end_year, end_month)[1]


def prior_year(bounds):
    s, e = bounds
    def back(d):
        try:
            return d.replace(year=d.year - 1)
        except ValueError:  # 29 Feb
            return d.replace(year=d.year - 1, day=28)
    e_prior = back(e)
    if e.day == calendar.monthrange(e.year, e.month)[1]:
        e_prior = date(e_prior.year, e_prior.month, calendar.monthrange(e_prior.year, e_prior.month)[1])
    return back(s), e_prior


def prior_period(bounds):
    """The immediately preceding period of the same number of whole months."""
    s, e = bounds
    months = (e.year - s.year) * 12 + e.month - s.month + 1
    ps_month_index = s.year * 12 + s.month - 1 - months
    ps = date(ps_month_index // 12, ps_month_index % 12 + 1, 1)
    pe = s - timedelta(days=1)
    return ps, pe


def to_date_bounds(as_of, kind="YTD", fiscal_start_month=1):
    """YTD/QTD/MTD from period start to as_of (inclusive)."""
    if kind == "MTD":
        return date(as_of.year, as_of.month, 1), as_of
    if kind == "QTD":
        offset = (as_of.month - fiscal_start_month) % 3
        m_index = as_of.year * 12 + as_of.month - 1 - offset
        return date(m_index // 12, m_index % 12 + 1, 1), as_of
    if kind == "YTD":
        y = as_of.year if as_of.month >= fiscal_start_month else as_of.year - 1
        return date(y, fiscal_start_month, 1), as_of
    raise ValueError("kind must be YTD, QTD or MTD")


def partial_period_note(bounds, data_max_date, today=None):
    """Return a note if the period isn't complete in the data or in time."""
    today = today or date.today()
    s, e = bounds
    if today < e:
        return f"partial period: today is {today:%d %b %Y}, period ends {e:%d %b %Y} - provisional"
    if data_max_date is not None and data_max_date < e:
        return f"data only runs to {data_max_date:%d %b %Y} (period ends {e:%d %b %Y}) - provisional"
    return ""


# ---------------------------------------------------------------------------
# Table helpers (pandas)
# ---------------------------------------------------------------------------

def _need_pandas():
    if pd is None:
        print("ERROR: pandas is required for table helpers.")
        sys.exit(1)


def _slice(df, date_col, bounds):
    s, e = bounds
    d = pd.to_datetime(df[date_col], errors="coerce")
    return df[(d >= pd.Timestamp(s)) & (d <= pd.Timestamp(e))]


def period_totals(df, date_col, value_col, freq="M", by=None):
    """Totals per month ('M'), quarter ('Q') or year ('Y') - calendar periods."""
    _need_pandas()
    d = df.copy()
    d["period"] = pd.to_datetime(d[date_col], errors="coerce").dt.to_period(freq)
    keys = ["period"] + ([by] if by else [])
    return d.dropna(subset=["period"]).groupby(keys, dropna=False)[value_col].sum().reset_index()


def period_compare(df, date_col, value_col, current, prior, by=None, partial=False):
    """Current vs prior window, overall or by a dimension. Adds abs and % change
    with edge-case notes, plus share of current total."""
    _need_pandas()
    cur = _slice(df, date_col, current)
    pri = _slice(df, date_col, prior)
    if by:
        c = cur.groupby(by, dropna=False)[value_col].sum()
        p = pri.groupby(by, dropna=False)[value_col].sum()
        out = pd.DataFrame({"current": c, "prior": p})
        out = out.reset_index()
    else:
        out = pd.DataFrame({"current": [cur[value_col].sum()], "prior": [pri[value_col].sum() if len(pri) else None]})
    if by:
        present_prior = set(pri[by].dropna().unique())
        out["prior"] = [p if (k in present_prior) else None for k, p in zip(out[by], out["prior"])]
    out["abs_change"] = [None if p is None or pd.isna(p) else (0 if pd.isna(cv) else cv) - p
                         for cv, p in zip(out["current"], out["prior"])]
    res = [pct_change(None if pd.isna(cv) else float(cv), None if p is None or pd.isna(p) else float(p), partial=partial)
           for cv, p in zip(out["current"], out["prior"])]
    out["pct_change"] = [r["value"] for r in res]
    out["note"] = [r["note"] for r in res]
    total = out["current"].sum()
    out["share_of_current"] = out["current"] / total if total else None
    out.attrs["windows"] = {"current": [str(x) for x in current], "prior": [str(x) for x in prior]}
    out.attrs["rows_in_window"] = {"current": int(len(cur)), "prior": int(len(pri))}
    return out


def to_date_compare(df, date_col, value_col, as_of, kind="YTD", fiscal_start_month=1, by=None):
    """Like-for-like YTD/QTD/MTD: same cutoff day in the prior year."""
    cur = to_date_bounds(as_of, kind, fiscal_start_month)
    return period_compare(df, date_col, value_col, cur, prior_year(cur), by=by)


def ltm(df, date_col, value_col, as_of, by=None):
    """Last twelve months (LTM/TTM) ending as_of, vs the twelve months before."""
    m_index = as_of.year * 12 + as_of.month - 1 - 11
    start = date(m_index // 12, m_index % 12 + 1, 1)
    cur = (start, as_of)
    return period_compare(df, date_col, value_col, cur, prior_year(cur), by=by)


def contribution_to_growth(compare_df):
    """Each group's contribution to total growth, in percentage points:
    (current_i - prior_i) / prior_total * 100. Sums to total % growth."""
    prior_total = compare_df["prior"].fillna(0).sum()
    out = compare_df.copy()
    out["contribution_pp"] = ((out["current"].fillna(0) - out["prior"].fillna(0)) / prior_total * 100
                              if prior_total else None)
    return out


def mix_shift(compare_df):
    """Change in share of total, in percentage points."""
    out = compare_df.copy()
    ct, pt = out["current"].fillna(0).sum(), out["prior"].fillna(0).sum()
    out["share_current_pct"] = out["current"].fillna(0) / ct * 100 if ct else None
    out["share_prior_pct"] = out["prior"].fillna(0) / pt * 100 if pt else None
    if ct and pt:
        out["mix_shift_pp"] = out["share_current_pct"] - out["share_prior_pct"]
    return out


def constant_currency_growth(current_local: dict, prior_local: dict, rates: dict, reporting_ccy: str):
    """Growth excluding FX effects: convert BOTH periods' local-currency totals
    at the SAME rates. current_local/prior_local: {ccy: amount}; rates: {ccy: rate to reporting}."""
    def conv(d):
        return sum(v * (1.0 if c.upper() == reporting_ccy.upper() else rates[c.upper()]) for c, v in d.items())
    r = pct_change(conv(current_local), conv(prior_local))
    r["note"] = (r["note"] + "; " if r["note"] else "") + "constant currency (same rates both periods)"
    return r


# ---------------------------------------------------------------------------

def _self_test():
    assert abs(share_of_total(25, 100)["value"] - 0.25) < 1e-9
    assert abs(pct_change(110, 100)["value"] - 0.10) < 1e-9
    assert pct_change(5, 0)["note"].startswith("n/a - new")
    assert pct_change(5, None)["note"] == "n/a - no comparable period"
    assert pct_change(5, -5)["value"] is None
    assert pct_change(110, 100, partial=True)["status"] == "provisional"
    assert abs(pct_point_change(23, 20)["value"] - 3) < 1e-9
    assert abs(cagr(100, 133.1, 3)["value"] - 0.10) < 1e-3
    assert abs(weighted_average([0.5, 0.2], [100, 900])["value"] - 0.23) < 1e-9
    assert abs(run_rate(50, 10, 30)["value"] - 150) < 1e-9
    assert quarter_bounds(2026, 4) == (date(2026, 10, 1), date(2026, 12, 31))
    assert quarter_bounds(2026, 1, fiscal_start_month=4) == (date(2025, 4, 1), date(2025, 6, 30))
    assert prior_year((date(2026, 10, 1), date(2026, 12, 31))) == (date(2025, 10, 1), date(2025, 12, 31))
    assert prior_period((date(2026, 10, 1), date(2026, 12, 31))) == (date(2026, 7, 1), date(2026, 9, 30))
    assert to_date_bounds(date(2026, 5, 15), "QTD") == (date(2026, 4, 1), date(2026, 5, 15))
    assert to_date_bounds(date(2026, 2, 10), "YTD", 4) == (date(2025, 4, 1), date(2026, 2, 10))
    if pd is not None:
        df = pd.DataFrame({"d": ["2025-10-05", "2025-11-05", "2026-10-05", "2026-11-05", "2026-12-05"],
                           "v": [100, 100, 150, 100, 50], "r": ["A", "B", "A", "B", "C"]})
        cmp = period_compare(df, "d", "v", quarter_bounds(2026, 4), prior_year(quarter_bounds(2026, 4)), by="r")
        row_c = cmp[cmp["r"] == "C"].iloc[0]
        assert row_c["note"] == "n/a - no comparable period"
        contrib = contribution_to_growth(cmp)
        assert abs(contrib["contribution_pp"].sum() - 50.0) < 1e-9
    print("All self-tests passed.")


if __name__ == "__main__":
    _self_test()
