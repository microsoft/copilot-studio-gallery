"""Check normalized yield arithmetic and explicit reasons for blank yields."""

import argparse
import csv
import json
import sys
from decimal import Decimal, InvalidOperation
from pathlib import Path


REQUIRED_FIELDS = {
    "dose_g", "beverage_mass_g", "tds_pct", "extraction_yield_pct", "yield_status"
}
EXCLUDED_STATUSES = {
    "duplicate_export", "missing_input", "invalid_input",
    "ambiguous_units", "unsupported_method",
}
TOLERANCE = Decimal("0.00000001")


def number(row, field):
    try:
        value = Decimal(row[field].strip())
    except InvalidOperation as error:
        raise ValueError(f"{field} must be numeric") from error
    if not value.is_finite():
        raise ValueError(f"{field} must be finite")
    return value


def check_file(path):
    computed = excluded = 0
    with Path(path).open(newline="", encoding="utf-8-sig") as handle:
        reader = csv.DictReader(handle)
        fields = reader.fieldnames or []
        missing = REQUIRED_FIELDS.difference(fields)
        if missing:
            raise ValueError(f"{path}: missing columns: {', '.join(sorted(missing))}")
        if len(fields) != len(set(fields)):
            raise ValueError(f"{path}: duplicate column names")
        for line, row in enumerate(reader, start=2):
            try:
                if None in row or any(value is None for value in row.values()):
                    raise ValueError("row does not match the CSV header")
                status = row["yield_status"].strip()
                if status in EXCLUDED_STATUSES:
                    if row["extraction_yield_pct"].strip():
                        raise ValueError(f"{status} requires a blank extraction_yield_pct")
                    excluded += 1
                    continue
                if status != "computed":
                    raise ValueError(f"unknown yield_status: {status!r}")
                dose = number(row, "dose_g")
                mass = number(row, "beverage_mass_g")
                tds = number(row, "tds_pct")
                actual = number(row, "extraction_yield_pct")
                if dose <= 0 or mass <= 0 or not 0 <= tds <= 100:
                    raise ValueError("computed yield requires positive masses and TDS in 0..100")
                expected = tds * mass / dose
                if abs(actual - expected) > TOLERANCE:
                    raise ValueError(
                        f"extraction_yield_pct is {actual}; expected {expected}"
                    )
                computed += 1
            except ValueError as error:
                raise ValueError(f"{path}: CSV record {line}: {error}") from error
    if not computed + excluded:
        raise ValueError(f"{path}: no observations")
    return {"path": str(path), "computed": computed, "excluded": excluded}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("csv_files", nargs="+", type=Path)
    args = parser.parse_args()
    try:
        results = [check_file(path) for path in args.csv_files]
    except (OSError, ValueError, csv.Error) as error:
        print(f"Yield checks failed: {error}", file=sys.stderr)
        return 1
    print(json.dumps({"success": True, "studies": results}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
