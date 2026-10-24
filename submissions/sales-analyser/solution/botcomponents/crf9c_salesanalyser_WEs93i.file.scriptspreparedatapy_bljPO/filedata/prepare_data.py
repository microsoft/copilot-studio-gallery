"""
Load, clean and normalise sales spreadsheets, and log every transformation.

Reads every sheet of every file, finds the header row, drops blank and
subtotal/total rows, converts numbers stored as text, parses dates with an
explicit format, normalises category labels, removes exact duplicate rows and
detects currencies. Writes the clean table plus transformation_log.json, which
feeds the "Data notes" block (see references/data-preparation.md).

Nothing is imputed. Blanks stay blank. Duplicate *keys* are flagged, not dropped.

Usage:
    python prepare_data.py file1.xlsx file2.csv --out clean.csv --log transformation_log.json
    Options:
      --value-col Revenue          value column used to report value impact (auto-detected if omitted)
      --label-map labels.json      {"Region": {"Europe": "EMEA", "Emea": "EMEA"}} explicit mappings
      --date-order dmy|mdy         resolve ambiguous dates like 03/04/2026 (otherwise detected/flagged)
      --key Order_ID [--key ...]   columns that should be unique; duplicates are flagged
      --sheets "Sheet1,Data"       only read these sheet names

Usage (as a library): from prepare_data import load_tables, prepare

Requires: pandas, openpyxl. Exits with a clear message on missing packages or unreadable files.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from datetime import datetime

try:
    import pandas as pd
    import numpy as np
except ImportError:
    print("ERROR: pandas and numpy are required for prepare_data.py and are not available.")
    sys.exit(1)

BLANK_TOKENS = {"", "-", "\u2013", "\u2014", "n/a", "na", "N/A", "NA", "#N/A", "null", "NULL", "None",
                "none", "nan", "NaN", "#VALUE!", "#REF!", "#DIV/0!", "tbc", "TBC"}
TOTAL_RE = re.compile(r"^\s*(grand\s+total|sub[\s-]?total|total|totals|sum|overall|all\s+regions|all\s+products)\b",
                      re.IGNORECASE)
CURRENCY_SYMBOLS = {"\u00a3": "GBP", "\u20ac": "EUR", "$": "USD", "\u00a5": "JPY", "\u20b9": "INR"}
ISO_CCY = {"GBP", "EUR", "USD", "JPY", "CNY", "INR", "CHF", "AUD", "CAD", "SEK", "NOK", "DKK", "PLN",
           "CZK", "HUF", "ZAR", "BRL", "MXN", "SGD", "HKD", "NZD", "AED", "SAR", "TRY", "KRW"}
DATE_FORMATS_DMY = ["%d/%m/%Y", "%d-%m-%Y", "%d.%m.%Y", "%d/%m/%y", "%d-%m-%y"]
DATE_FORMATS_MDY = ["%m/%d/%Y", "%m-%d-%Y", "%m/%d/%y"]
DATE_FORMATS_ISO = ["%Y-%m-%d", "%Y/%m/%d", "%Y-%m-%d %H:%M:%S", "%Y-%m", "%Y%m%d"]
DATE_FORMATS_TEXT = ["%b %Y", "%B %Y", "%b-%y", "%b-%Y", "%B-%Y", "%d %b %Y", "%d %B %Y", "%b %d, %Y",
                     "%B %d, %Y", "%Y %b", "%Y-%b"]
VALUE_HINTS = ("net sales", "revenue", "sales", "amount", "value", "total", "turnover", "gross")


class Log:
    def __init__(self):
        self.steps: list[dict] = []
        self.warnings: list[str] = []

    def add(self, step, rule, rows=0, value_impact=None, detail=None):
        entry = {"step": step, "rule": rule, "rows_affected": int(rows)}
        if value_impact is not None:
            entry["value_impact"] = round(float(value_impact), 2)
        if detail:
            entry["detail"] = detail
        self.steps.append(entry)

    def warn(self, msg):
        self.warnings.append(msg)


# ---------------------------------------------------------------------------
# Loading
# ---------------------------------------------------------------------------

def _detect_header_row(raw: pd.DataFrame, max_scan: int = 15) -> int:
    best_row, best_score = 0, -1
    for i in range(min(max_scan, len(raw))):
        row = raw.iloc[i]
        non_null = row.dropna()
        if len(non_null) < 2:
            continue
        texts = sum(1 for v in non_null if isinstance(v, str) and not _looks_numeric(v))
        score = texts * 2 + len(non_null) - (len(non_null) - texts) * 2
        if score > best_score:
            best_row, best_score = i, score
    return best_row


def _looks_numeric(s: str) -> bool:
    return _parse_number(s) is not None


def load_tables(paths, sheets=None, log: Log | None = None):
    """Return a list of (file, sheet, DataFrame) with header row detected and
    source_file/source_sheet/source_row columns added."""
    log = log or Log()
    tables = []
    for path in paths:
        if not os.path.exists(path):
            print(f"ERROR: file not found: {path}")
            sys.exit(1)
        ext = os.path.splitext(path)[1].lower()
        try:
            if ext in (".xlsx", ".xlsm", ".xls"):
                book = pd.read_excel(path, sheet_name=None, header=None, dtype=object)
            elif ext == ".csv":
                book = {"csv": pd.read_csv(path, header=None, dtype=object, keep_default_na=False,
                                           encoding_errors="replace", sep=None, engine="python")}
            else:
                print(f"ERROR: unsupported file type '{ext}' for {path}. Use .xlsx, .xls or .csv.")
                sys.exit(1)
        except Exception as exc:  # noqa: BLE001
            print(f"ERROR: could not read {path}: {exc}")
            sys.exit(1)
        for sheet, raw in book.items():
            if sheets and sheet not in sheets:
                continue
            raw = raw.dropna(how="all").dropna(axis=1, how="all")
            raw = raw.loc[~raw.apply(lambda r: all(str(v).strip() in BLANK_TOKENS for v in r), axis=1)]
            if raw.empty:
                log.add("load", f"Skipped empty sheet '{sheet}' in {os.path.basename(path)}")
                continue
            h = _detect_header_row(raw)
            header = [str(v).strip() if v is not None and str(v).strip() not in BLANK_TOKENS else f"column_{j + 1}"
                      for j, v in enumerate(raw.iloc[h].tolist())]
            header = _dedupe_names(header)
            body = raw.iloc[h + 1:].copy()
            body.columns = header
            body.insert(0, "source_row", [int(i) + 1 for i in body.index])
            body.insert(0, "source_sheet", sheet)
            body.insert(0, "source_file", os.path.basename(path))
            if h > 0:
                log.add("load", f"Header found on row {int(raw.index[h]) + 1} (rows above skipped)", rows=h,
                        detail=f"{os.path.basename(path)} / {sheet}")
            tables.append((path, sheet, body.reset_index(drop=True)))
    return tables


def _dedupe_names(names):
    seen, out = {}, []
    for n in names:
        n = re.sub(r"\s+", " ", n)
        if n in seen:
            seen[n] += 1
            out.append(f"{n}_{seen[n]}")
        else:
            seen[n] = 0
            out.append(n)
    return out


# ---------------------------------------------------------------------------
# Value parsing
# ---------------------------------------------------------------------------

_NUM_RE = re.compile(r"^[+-]?\d+(\.\d+)?$")


def _parse_number(v):
    """Parse '1,234.50', '(500)', '500-', '£1.2k'? (no), '12%', '1.234,56'. Returns float or None."""
    if v is None:
        return None
    if isinstance(v, (int, float, np.integer, np.floating)) and not isinstance(v, bool):
        return None if (isinstance(v, float) and np.isnan(v)) else float(v)
    s = str(v).strip()
    if s in BLANK_TOKENS:
        return None
    neg = False
    if s.startswith("(") and s.endswith(")"):
        neg, s = True, s[1:-1].strip()
    if s.endswith("-") and len(s) > 1:
        neg, s = True, s[:-1].strip()
    pct = s.endswith("%")
    s = s.rstrip("%").strip()
    s = re.sub(r"^[A-Z]{3}\s*|\s*[A-Z]{3}$", "", s)
    s = s.replace("\u00a3", "").replace("\u20ac", "").replace("$", "").replace("\u00a5", "").replace("\u20b9", "")
    s = s.replace("\u2212", "-").replace(" ", "").replace("\u00a0", "").replace("'", "")
    if s.startswith("-"):
        neg, s = (not neg), s[1:]
    if re.match(r"^\d{1,3}(\.\d{3})+(,\d+)?$", s):      # European 1.234.567,89
        s = s.replace(".", "").replace(",", ".")
    elif re.match(r"^\d+,\d{1,2}$", s):                  # European 1234,5
        s = s.replace(",", ".")
    else:
        s = s.replace(",", "")
    if not _NUM_RE.match(s):
        return None
    val = float(s)
    if pct:
        val /= 100.0
    return -val if neg else val


def _currency_in(v):
    s = str(v)
    for sym, code in CURRENCY_SYMBOLS.items():
        if sym in s:
            return code
    m = re.search(r"\b([A-Z]{3})\b", s)
    if m and m.group(1) in ISO_CCY:
        return m.group(1)
    return None


# ---------------------------------------------------------------------------
# Dates
# ---------------------------------------------------------------------------

def _try_format(values, fmt):
    ok = 0
    for v in values:
        try:
            datetime.strptime(v, fmt)
            ok += 1
        except (ValueError, TypeError):
            pass
    return ok / max(1, len(values))


def detect_date_format(values, date_order=None):
    """Return (format | 'excel_serial' | 'datetime' | None, ambiguous: bool)."""
    vals = [v for v in values if v is not None and str(v).strip() not in BLANK_TOKENS]
    if not vals:
        return None, False
    if all(isinstance(v, (datetime, pd.Timestamp)) for v in vals):
        return "datetime", False
    nums = [_parse_number(v) for v in vals]
    if all(n is not None and 20000 <= n <= 80000 and float(n).is_integer() for n in nums):
        return "excel_serial", False
    svals = [str(v).strip().split(" 00:00:00")[0] for v in vals]
    ambiguous = False
    candidates = DATE_FORMATS_ISO + DATE_FORMATS_TEXT
    slashy = [s for s in svals if re.match(r"^\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}$", s)]
    if slashy:
        firsts = [int(re.split(r"[/.-]", s)[0]) for s in slashy]
        seconds = [int(re.split(r"[/.-]", s)[1]) for s in slashy]
        if date_order == "dmy" or any(f > 12 for f in firsts):
            candidates = DATE_FORMATS_DMY + candidates
        elif date_order == "mdy" or any(s2 > 12 for s2 in seconds):
            candidates = DATE_FORMATS_MDY + candidates
        else:
            ambiguous = True
            candidates = DATE_FORMATS_DMY + DATE_FORMATS_MDY + candidates
    best, best_rate = None, 0.0
    for fmt in candidates:
        rate = _try_format(svals, fmt)
        if rate > best_rate:
            best, best_rate = fmt, rate
    if best_rate < 0.8:
        return None, False
    return best, ambiguous


def parse_dates(series: pd.Series, fmt: str) -> pd.Series:
    if fmt == "datetime":
        return pd.to_datetime(series, errors="coerce")
    if fmt == "excel_serial":
        nums = series.map(_parse_number)
        return pd.to_datetime(nums, unit="D", origin="1899-12-30", errors="coerce")
    cleaned = series.map(lambda v: None if v is None or str(v).strip() in BLANK_TOKENS
                         else str(v).strip().split(" 00:00:00")[0])
    return pd.to_datetime(cleaned, format=fmt, errors="coerce")


# ---------------------------------------------------------------------------
# Pipeline
# ---------------------------------------------------------------------------

def _guess_value_col(df, numeric_cols):
    for hint in VALUE_HINTS:
        for c in numeric_cols:
            if hint in c.lower():
                return c
    return numeric_cols[0] if numeric_cols else None


def prepare(paths, value_col=None, label_map=None, date_order=None, keys=None, sheets=None):
    log = Log()
    tables = load_tables(paths, sheets=sheets, log=log)
    if not tables:
        print("ERROR: no readable data found in the files provided.")
        sys.exit(1)
    meta_cols = ["source_file", "source_sheet", "source_row"]
    frames = [t[2] for t in tables]
    all_cols = sorted({c for f in frames for c in f.columns if c not in meta_cols})
    df = pd.concat(frames, ignore_index=True, sort=False)
    rows_in = len(df)
    log.add("load", f"Loaded {len(tables)} sheet(s) from {len(paths)} file(s)", rows=rows_in,
            detail=[f"{os.path.basename(p)} / {s}: {len(t)} rows" for p, s, t in tables])
    for c in all_cols:
        missing_in = [f"{os.path.basename(p)}/{s}" for p, s, t in tables if c not in t.columns]
        if missing_in and len(missing_in) < len(tables):
            log.warn(f"Column '{c}' is missing from: {', '.join(missing_in)} (left blank there, not filled).")

    data_cols = [c for c in df.columns if c not in meta_cols]

    # Currency detection (symbols inside values, or a currency/ccy column)
    ccy_counts: dict[str, int] = {}
    ccy_col = next((c for c in data_cols if re.search(r"\b(currency|ccy|cur)\b", c.lower())), None)
    if ccy_col:
        for v in df[ccy_col].dropna():
            code = str(v).strip().upper()
            code = CURRENCY_SYMBOLS.get(code, code)
            if code in ISO_CCY:
                ccy_counts[code] = ccy_counts.get(code, 0) + 1
    # Numeric coercion
    numeric_cols, symbol_ccy = [], {}
    for c in data_cols:
        if c == ccy_col:
            continue
        s = df[c]
        non_blank = s[s.map(lambda v: v is not None and not (isinstance(v, float) and np.isnan(v))
                            and str(v).strip() not in BLANK_TOKENS)]
        if non_blank.empty:
            continue
        parsed = non_blank.map(_parse_number)
        if parsed.notna().mean() >= 0.8 and not re.search(r"date|period|month|year|week|id$|code|zip|postcode",
                                                          c.lower()):
            text_like = non_blank.map(lambda v: isinstance(v, str)).sum()
            for v in non_blank:
                code = _currency_in(v) if isinstance(v, str) else None
                if code:
                    symbol_ccy[code] = symbol_ccy.get(code, 0) + 1
            blanks_as_tokens = int(s.map(lambda v: isinstance(v, str) and v.strip() in BLANK_TOKENS
                                         and v.strip() != "").sum())
            df[c] = s.map(_parse_number)
            numeric_cols.append(c)
            if text_like:
                log.add("types", f"Converted text to numbers in '{c}' (separators, symbols, (negatives), %)",
                        rows=text_like)
            if blanks_as_tokens:
                log.add("blanks", f"Treated placeholders ('-', 'n/a', etc.) as blank, not zero, in '{c}'",
                        rows=blanks_as_tokens)
            unparsed = int(parsed.isna().sum())
            if unparsed:
                log.warn(f"{unparsed} value(s) in '{c}' could not be read as numbers and are blank now.")
    if not ccy_counts:  # no currency column: fall back to symbols/codes inside the values
        ccy_counts = dict(symbol_ccy)

    value_col = value_col if value_col in df.columns else _guess_value_col(df, numeric_cols)
    if value_col and value_col not in numeric_cols:
        log.warn(f"Value column '{value_col}' is not numeric; value impact not reported.")
        value_col = None

    def impact(mask):
        return float(df.loc[mask, value_col].sum(skipna=True)) if value_col else None

    # Dates
    date_cols, date_formats = [], {}
    for c in data_cols:
        if c in numeric_cols and not re.search(r"date|period|month", c.lower()):
            continue
        if not re.search(r"date|period|month|day|time|week", c.lower()) and c not in numeric_cols:
            sample = df[c].dropna().astype(str).head(50).tolist()
            if not sample or not all(re.search(r"\d", v) for v in sample):
                continue
        parsed = pd.Series(pd.NaT, index=df.index, dtype="datetime64[ns]")
        fmts, any_ambiguous = {}, []
        for (src_file, src_sheet), idx in df.groupby(["source_file", "source_sheet"]).groups.items():
            fmt, ambiguous = detect_date_format(df.loc[idx, c].tolist(), date_order)
            if not fmt:
                continue
            parsed.loc[idx] = parse_dates(df.loc[idx, c], fmt)
            fmts[f"{src_file} / {src_sheet}"] = fmt
            if ambiguous:
                any_ambiguous.append(f"{src_file} / {src_sheet}")
        if not fmts or parsed.notna().mean() < 0.5:
            continue
        had_value = df[c].map(lambda v: v is not None and not (isinstance(v, float) and np.isnan(v))
                              and str(v).strip() not in BLANK_TOKENS)
        unparsed = int((parsed.isna() & had_value).sum())
        df[c] = parsed
        if c in numeric_cols:
            numeric_cols.remove(c)
        date_cols.append(c)
        date_formats[c] = fmts
        log.add("dates", f"Parsed '{c}' with an explicit format per source file", rows=int(parsed.notna().sum()),
                detail=fmts)
        if unparsed:
            log.warn(f"{unparsed} value(s) in '{c}' could not be read as dates and are blank now.")
        for src in any_ambiguous:
            log.warn(f"Dates in '{c}' ({src}) are ambiguous (day and month both <= 12). Parsed as "
                     f"{fmts[src]}; confirm with the user or re-run with --date-order.")

    # Subtotal / total rows
    text_cols = [c for c in data_cols if c not in numeric_cols and c not in date_cols]
    total_mask = df[text_cols].apply(lambda r: any(isinstance(v, str) and TOTAL_RE.match(v) for v in r),
                                     axis=1) if text_cols else pd.Series(False, index=df.index)
    if total_mask.any():
        log.add("subtotals", "Removed subtotal/total rows embedded in the sheets", rows=int(total_mask.sum()),
                value_impact=impact(total_mask),
                detail=df.loc[total_mask, ["source_file", "source_sheet", "source_row"]].head(20)
                .to_dict("records"))
        df = df.loc[~total_mask].reset_index(drop=True)

    # Label normalisation
    label_map = label_map or {}
    for c in text_cols:
        s = df[c]
        if s.dropna().nunique() > 200:
            continue
        cleaned = s.map(lambda v: re.sub(r"\s+", " ", v).strip() if isinstance(v, str) else v)
        cleaned = cleaned.map(lambda v: None if isinstance(v, str) and v in BLANK_TOKENS else v)
        groups: dict[str, dict[str, int]] = {}
        for v in cleaned.dropna():
            if isinstance(v, str):
                groups.setdefault(v.lower(), {}).setdefault(v, 0)
                groups[v.lower()][v] += 1
        mapping = {}
        for variants in groups.values():
            if len(variants) > 1:
                canonical = max(variants.items(), key=lambda kv: kv[1])[0]
                for variant in variants:
                    if variant != canonical:
                        mapping[variant] = canonical
        mapping.update(label_map.get(c, {}))
        changed = int((cleaned != s).sum() - (cleaned.isna() & s.isna()).sum())
        if mapping:
            mapped = cleaned.map(lambda v: mapping.get(v, v) if isinstance(v, str) else v)
            n = int((mapped != cleaned).sum() - (mapped.isna() & cleaned.isna()).sum())
            log.add("labels", f"Normalised labels in '{c}'", rows=n,
                    detail={k: v for k, v in list(mapping.items())[:40]})
            cleaned = mapped
        elif changed:
            log.add("labels", f"Trimmed whitespace / blanked placeholders in '{c}'", rows=changed)
        df[c] = cleaned
    for c, m in label_map.items():
        if c not in df.columns:
            log.warn(f"Label map refers to column '{c}', which was not found.")

    # Exact duplicates (ignoring where the row came from)
    dup_mask = df.duplicated(subset=[c for c in df.columns if c not in meta_cols], keep="first")
    if dup_mask.any():
        files = sorted(set(df.loc[dup_mask, "source_file"]))
        log.add("duplicates", "Removed exact duplicate rows (kept first occurrence)", rows=int(dup_mask.sum()),
                value_impact=impact(dup_mask), detail={"duplicate_rows_found_in": files})
        subset = [c for c in df.columns if c not in meta_cols]
        all_dups = df[df.duplicated(subset=subset, keep=False)]
        spans = all_dups.groupby(subset, dropna=False)["source_file"].nunique()
        if (spans > 1).any():
            log.warn("Some duplicate rows appear in more than one file - check for overlapping or re-issued exports "
                     "and confirm which file wins.")
        df = df.loc[~dup_mask].reset_index(drop=True)

    # Duplicate keys (flag only)
    if keys:
        missing = [k for k in keys if k not in df.columns]
        if missing:
            log.warn(f"Key column(s) not found: {missing}")
        else:
            kd = df.duplicated(subset=keys, keep=False)
            if kd.any():
                log.warn(f"{int(kd.sum())} rows share a key ({', '.join(keys)}) but differ in other fields. "
                         "Not removed - ask the user which version wins.")
                log.add("duplicate_keys", "Flagged rows with duplicate keys (kept, not removed)",
                        rows=int(kd.sum()), value_impact=impact(kd))

    # Currency summary
    dominant = max(ccy_counts.items(), key=lambda kv: kv[1])[0] if ccy_counts else None
    if len(ccy_counts) > 1:
        log.warn(f"Multiple currencies detected {ccy_counts}. Convert to one reporting currency before "
                 "aggregating (scripts/fx_convert.py).")
    if not ccy_counts:
        log.warn("No currency indicator found in the data. Confirm the currency with the user.")

    summary = {
        "files": [os.path.basename(p) for p in paths],
        "sheets": [f"{os.path.basename(p)} / {s}" for p, s, _ in tables],
        "rows_in": rows_in,
        "rows_out": int(len(df)),
        "columns": [c for c in df.columns if c not in meta_cols],
        "numeric_columns": numeric_cols,
        "date_columns": date_formats,
        "value_column": value_col,
        "value_total_after_cleaning": round(float(df[value_col].sum(skipna=True)), 2) if value_col else None,
        "currency_column": ccy_col,
        "currencies_detected_row_counts": ccy_counts,
        "dominant_currency": dominant,
        "date_range": {c: [str(df[c].min().date()) if df[c].notna().any() else None,
                           str(df[c].max().date()) if df[c].notna().any() else None] for c in date_cols},
        "imputation": "none - blanks left blank",
    }
    return df, {"summary": summary, "steps": log.steps, "warnings": log.warnings}


def main():
    ap = argparse.ArgumentParser(description="Clean and normalise sales spreadsheets with a transformation log.")
    ap.add_argument("files", nargs="+")
    ap.add_argument("--out", default="clean.csv")
    ap.add_argument("--log", default="transformation_log.json")
    ap.add_argument("--value-col")
    ap.add_argument("--label-map", help="JSON file: {column: {from_label: to_label}}")
    ap.add_argument("--date-order", choices=["dmy", "mdy"])
    ap.add_argument("--key", action="append")
    ap.add_argument("--sheets", help="Comma-separated sheet names to read")
    a = ap.parse_args()
    label_map = None
    if a.label_map:
        try:
            with open(a.label_map, "r", encoding="utf-8") as f:
                label_map = json.load(f)
        except (OSError, json.JSONDecodeError) as exc:
            print(f"ERROR: could not read label map {a.label_map}: {exc}")
            sys.exit(1)
    sheets = [s.strip() for s in a.sheets.split(",")] if a.sheets else None
    df, log = prepare(a.files, a.value_col, label_map, a.date_order, a.key, sheets)
    df.to_csv(a.out, index=False)
    with open(a.log, "w", encoding="utf-8") as f:
        json.dump(log, f, indent=2, default=str)
    s = log["summary"]
    print(f"Wrote {a.out}: {s['rows_out']} rows (from {s['rows_in']}), {len(s['columns'])} columns.")
    print(f"Value column: {s['value_column']}  total after cleaning: {s['value_total_after_cleaning']}")
    print(f"Currencies: {s['currencies_detected_row_counts'] or 'none detected'}  dominant: {s['dominant_currency']}")
    print("Transformations:")
    for st in log["steps"]:
        vi = f", value impact {st['value_impact']:,}" if "value_impact" in st else ""
        print(f"  - [{st['step']}] {st['rule']} ({st['rows_affected']} rows{vi})")
    if log["warnings"]:
        print("Warnings (tell the user):")
        for w in log["warnings"]:
            print(f"  ! {w}")
    print(f"Wrote {a.log}")


if __name__ == "__main__":
    main()
