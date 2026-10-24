"""
Discover and reconcile fields across multiple spreadsheet files.

Usage:
    python discover_fields.py file1.xlsx file2.csv file3.xlsx ... [--date-order dmy|mdy]

Reads EVERY sheet of each file, detects the header row (it may not be row 1),
infers a simple type per column (dates are detected with explicit formats, not
guessed), and clusters columns across files/sheets that likely represent the
same field (synonym table + fuzzy label matching). Prints a readable cluster
report. Use it before prepare_data.py when the files are new or unfamiliar,
and before building or extending a master file (see SKILL.md).

Requires: pandas, openpyxl (for .xlsx). Prints a clear error and exits non-zero
if a file cannot be read or a dependency is missing, rather than failing with a
raw traceback.
"""
import sys
import os
import re
import difflib

try:
    import pandas as pd  # noqa: F401
except ImportError:
    print("ERROR: pandas is required for discover_fields.py and is not available.")
    sys.exit(1)

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
try:
    from prepare_data import load_tables, detect_date_format, _parse_number, BLANK_TOKENS
except ImportError:
    print("ERROR: prepare_data.py must sit next to discover_fields.py (same scripts folder).")
    sys.exit(1)

DATE_ORDER = None

# Common synonyms seen across business spreadsheets. Extend this table rather
# than relying on fuzzy matching alone when you know a recurring label pair.
SYNONYMS = {
    "revenue": {"revenue", "net sales", "sales", "rev", "total sales", "gross sales", "net revenue",
                "sales amount", "amount", "turnover", "sales value"},
    "currency": {"currency", "ccy", "cur", "currency code"},
    "cost": {"cost", "cogs", "cost of goods sold", "total cost", "expense", "expenses"},
    "profit": {"profit", "net income", "net profit", "margin $", "earnings"},
    "units": {"units", "units sold", "quantity", "qty", "volume"},
    "date": {"date", "period", "month", "transaction date", "order date"},
    "region": {"region", "territory", "area", "market"},
    "customer": {"customer", "account", "client", "customer name", "account name"},
    "product": {"product", "sku", "item", "product name"},
}


def normalize_label(label):
    label = str(label).strip().lower()
    label = re.sub(r"[\(\)\[\]\$%]", "", label)
    label = re.sub(r"[_\-]+", " ", label)
    label = re.sub(r"\s+", " ", label).strip()
    return label


def synonym_group(norm_label):
    for canonical, aliases in SYNONYMS.items():
        if norm_label in aliases:
            return canonical
    return None


def infer_type(series):
    values = [v for v in series.tolist() if v is not None and str(v).strip() not in BLANK_TOKENS]
    if not values:
        return "empty"
    fmt, ambiguous = detect_date_format(values, DATE_ORDER)
    if fmt:
        return f"date ({fmt}{', AMBIGUOUS d/m' if ambiguous else ''})"
    parsed = [_parse_number(v) for v in values]
    if sum(p is not None for p in parsed) / len(values) >= 0.8:
        return "numeric"
    return "text"


def cluster_columns(file_columns):
    """file_columns: {file_path: [raw_column_labels]} -> list of clusters.
    Each cluster: {"canonical": str, "members": [(file, raw_label)]}.
    """
    clusters = []
    assigned = {}  # (file, raw_label) -> cluster index

    all_entries = [(f, c) for f, cols in file_columns.items() for c in cols]

    for file, raw in all_entries:
        if (file, raw) in assigned:
            continue
        norm = normalize_label(raw)
        syn = synonym_group(norm)
        placed = False
        for idx, cluster in enumerate(clusters):
            for (cf, craw) in cluster["members"]:
                cnorm = normalize_label(craw)
                csyn = synonym_group(cnorm)
                same_synonym = syn is not None and syn == csyn
                fuzzy = difflib.SequenceMatcher(None, norm, cnorm).ratio() >= 0.82
                if same_synonym or fuzzy:
                    cluster["members"].append((file, raw))
                    assigned[(file, raw)] = idx
                    placed = True
                    break
            if placed:
                break
        if not placed:
            clusters.append({"canonical": syn or norm, "members": [(file, raw)]})
            assigned[(file, raw)] = len(clusters) - 1

    return clusters


def main(argv):
    global DATE_ORDER
    paths = [a for a in argv if not a.startswith("--")]
    if "--date-order" in argv:
        i = argv.index("--date-order")
        DATE_ORDER = argv[i + 1] if i + 1 < len(argv) else None
        paths = [p for p in paths if p != DATE_ORDER]
    if len(paths) < 1:
        print("ERROR: provide at least one spreadsheet path.")
        sys.exit(1)

    dataframes = {}
    for path, sheet, df in load_tables(paths):
        key = f"{os.path.basename(path)} / {sheet}"
        dataframes[key] = df.drop(columns=["source_file", "source_sheet", "source_row"])

    file_columns = {k: list(df.columns) for k, df in dataframes.items()}
    clusters = cluster_columns(file_columns)

    n_sources = len(dataframes)
    print(f"Scanned {len(paths)} file(s), {n_sources} sheet(s). Found {len(clusters)} candidate field cluster(s).\n")

    backbone, extras = [], []
    for cluster in clusters:
        present = sorted(set(f for f, _ in cluster["members"]))
        coverage = f"{len(present)}/{n_sources}"
        if len(present) == n_sources or len(present) >= max(2, n_sources - 1):
            backbone.append((cluster, coverage))
        else:
            extras.append((cluster, coverage))

    def print_cluster(cluster, coverage):
        print(f"Field: {cluster['canonical']}  (present in {coverage} sheets)")
        for src, raw in cluster["members"]:
            col = dataframes[src][raw]
            non_blank = col.map(lambda v: v is not None and str(v).strip() not in BLANK_TOKENS)
            print(f"  - {src}: column '{raw}' (type={infer_type(col)}, non-blank={round(100 * non_blank.mean(), 1)}%)")
        print()

    print("=== Backbone fields (present in most/all sheets) ===\n")
    for cluster, coverage in backbone:
        print_cluster(cluster, coverage)

    print("=== Decision-relevant extras (present in only some sheets) ===\n")
    if not extras:
        print("(none found)\n")
    for cluster, coverage in extras:
        print_cluster(cluster, coverage)


if __name__ == "__main__":
    main(sys.argv[1:])
