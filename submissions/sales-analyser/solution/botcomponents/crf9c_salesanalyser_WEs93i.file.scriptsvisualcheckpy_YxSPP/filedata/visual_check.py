"""
Automated visual QC pass for a matplotlib chart, run before presenting any
chart to the user. Build charts with chart_style.py (brand theme), pick the
type with references/chart-selection-guide.md, then run this to catch the
failure modes that make a correct chart misleading or unreadable.

Usage (as a library, after building a matplotlib Figure/Axes):
    from visual_check import run_checks, print_report
    results = run_checks(ax, chart_type="barh", title="Revenue by region", target="report")
    print_report(results)

Requires: matplotlib. Prints a clear error and exits non-zero if matplotlib is
not installed, rather than failing with a raw traceback.
"""
import sys

try:
    import matplotlib  # noqa: F401
    import matplotlib.pyplot as plt
except ImportError:
    print("ERROR: matplotlib is required for visual_check.py and is not available.")
    sys.exit(1)

MIN_WIDTH_PX = {"report": 1200, "email": 1000}


def _check_title(ax, title):
    title = title or ax.get_title(loc="left") or ax.get_title()
    has_title = bool(title) and len(title.strip()) > 0
    note = "Title is present." if has_title else "Add a title stating the metric, period, and unit."
    return ("has_title", has_title, note)


def _check_axis_labels(ax):
    xlabel = ax.get_xlabel()
    ylabel = ax.get_ylabel()
    ok = bool(xlabel) or bool(ylabel)
    note = "At least one axis is labeled." if ok else "Label the value axis with its unit (currency, percent, count)."
    return ("has_axis_label", ok, note)


def _check_bar_zero_baseline(ax, chart_type):
    if chart_type not in ("bar", "barh", "variance"):
        return ("bar_zero_baseline", True, "Not a bar chart -- not applicable.")
    vmin, vmax = ax.get_xlim() if chart_type in ("barh", "variance") else ax.get_ylim()
    ok = vmin <= 0 <= vmax
    note = "Bar axis includes zero." if ok else "Bar chart axis does not start at zero -- this exaggerates differences between bars. Reset the axis to start at zero."
    return ("bar_zero_baseline", ok, note)


def _check_legend_size(ax, max_categories=8):
    legend = ax.get_legend()
    if legend is None:
        return ("legend_size", True, "No legend present -- not applicable.")
    n = len(legend.get_texts())
    ok = n <= max_categories
    note = f"Legend has {n} categories." if ok else f"Legend has {n} categories, more than the readable {max_categories} -- group the long tail into 'Other'."
    return ("legend_size", ok, note)


def _check_line_series_count(ax, chart_type, max_lines=6):
    if chart_type != "line":
        return ("line_series_count", True, "Not a line chart -- not applicable.")
    n = len(ax.get_lines())
    ok = n <= max_lines
    note = f"{n} line series." if ok else f"{n} line series on one chart, more than the readable {max_lines} -- split into small multiples instead."
    return ("line_series_count", ok, note)


def _check_label_overlap(ax):
    labels = ax.get_xticklabels()
    if not labels:
        return ("label_overlap", True, "No tick labels to check.")
    rotations = set(round(float(l.get_rotation())) for l in labels)
    long_labels = any(len(l.get_text()) > 10 for l in labels)
    n_labels = len(labels)
    risky = long_labels and n_labels > 8 and (0 in rotations)
    ok = not risky
    note = "Label length/rotation looks readable." if ok else "Many long, unrotated tick labels -- rotate them or abbreviate, or they will overlap/truncate."
    return ("label_overlap", ok, note)


def _check_size(ax, target):
    if target not in MIN_WIDTH_PX:
        return ("output_size", True, "No target given -- size not checked.")
    fig = ax.figure
    dpi = plt.rcParams.get("savefig.dpi", fig.dpi)
    dpi = fig.dpi if dpi == "figure" else dpi
    width = int(fig.get_size_inches()[0] * float(dpi))
    ok = width >= MIN_WIDTH_PX[target]
    note = (f"Will save at ~{width}px wide." if ok else
            f"Will save at ~{width}px wide, below {MIN_WIDTH_PX[target]}px for {target} -- use chart_style.apply_theme('{target}').")
    return ("output_size", ok, note)


def run_checks(ax, chart_type, title="", target=None):
    """ax: a matplotlib Axes. chart_type: 'line', 'bar', 'barh', 'variance',
    'scatter', 'histogram', 'pie', 'stacked_bar'. title: optional (read from
    the axes if omitted). target: 'report' or 'email' to check output size.
    Returns a list of (check_name, passed: bool, note: str)."""
    checks = [
        _check_size(ax, target),
        _check_title(ax, title),
        _check_axis_labels(ax),
        _check_bar_zero_baseline(ax, chart_type),
        _check_legend_size(ax),
        _check_line_series_count(ax, chart_type),
        _check_label_overlap(ax),
    ]
    return checks


def print_report(results):
    all_passed = all(passed for _, passed, _ in results)
    for name, passed, note in results:
        print(("PASS" if passed else "FAIL"), "-", name, "-", note)
    print()
    print("Overall:", "PASS -- safe to present." if all_passed else "FAIL -- fix the items above before presenting.")
    return all_passed


if __name__ == "__main__":
    print("This module is meant to be imported and run against a chart you just built:")
    print("  from visual_check import run_checks, print_report")
    print("  results = run_checks(ax, chart_type='barh', target='report')")
    print("  print_report(results)")
