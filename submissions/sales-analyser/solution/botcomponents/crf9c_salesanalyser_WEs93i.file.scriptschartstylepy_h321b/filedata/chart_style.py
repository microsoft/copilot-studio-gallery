"""
Shared chart theme for every chart this agent produces.

All colours, fonts and sizes come from assets/style-tokens.json (the single
branding source - edit that file, never hex values in here). Helpers return a
(fig, ax) pair so you can run visual_check.py before saving.

Usage (as a library):
    import sys; sys.path.insert(0, "<this skill>/scripts")
    import chart_style as cs
    tokens = cs.apply_theme(target="report")            # or "email"
    fig, ax = cs.bar_ranked(["EMEA", "AMER", "APAC"], [4.2e6, 3.1e6, 1.4e6],
                            title="Revenue by region",
                            subtitle="Q4 2026 (Oct-Dec), GBP", currency="GBP",
                            highlight="EMEA")
    cs.save_chart(fig, "revenue_by_region.png", target="report")

    Helpers: bar_ranked, column_by_period, line_trend, variance_bars,
    small_multiples. Formatters: fmt_money, fmt_pct, fmt_number.

Usage (as a script, renders demo charts to check the theme):
    python chart_style.py --demo ./chart_demo

Requires: matplotlib (pandas optional). Exits with a clear message if missing.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

try:
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from matplotlib import font_manager
    from matplotlib.ticker import FuncFormatter
except ImportError:
    print("ERROR: matplotlib is required for chart_style.py and is not available in this sandbox.")
    sys.exit(1)

SKILL_FOLDER = "spreadsheet-data-analysis-reporting"
TOKENS_ENV = "SALES_STYLE_TOKENS"
CURRENCY_SYMBOLS = {"GBP": "\u00a3", "EUR": "\u20ac", "USD": "$", "JPY": "\u00a5", "CNY": "\u00a5",
                    "INR": "\u20b9", "CHF": "CHF ", "AUD": "A$", "CAD": "C$", "SEK": "kr ", "NOK": "kr ",
                    "DKK": "kr "}

_TOKENS: dict | None = None
_TARGET = "report"


# ---------------------------------------------------------------------------
# Tokens
# ---------------------------------------------------------------------------

def _walk_for(base: Path, rel: str, max_depth: int = 4):
    base_depth = len(base.parts)
    for root, dirs, _files in os.walk(base):
        if len(Path(root).parts) - base_depth >= max_depth:
            dirs[:] = []
        candidate = Path(root) / rel
        if candidate.is_file():
            return candidate
    return None


def find_style_tokens(explicit: str | None = None) -> Path | None:
    """Locate style-tokens.json: explicit path -> $SALES_STYLE_TOKENS -> ./style-tokens.json
    -> this skill's assets -> a sibling skill folder -> a bounded search."""
    here = Path(__file__).resolve().parent
    rel = os.path.join(SKILL_FOLDER, "assets", "style-tokens.json")
    candidates = [Path(explicit)] if explicit else []
    if os.environ.get(TOKENS_ENV):
        candidates.append(Path(os.environ[TOKENS_ENV]))
    candidates += [Path.cwd() / "style-tokens.json", here.parent / "assets" / "style-tokens.json",
                   here.parent.parent / rel]
    for c in candidates:
        if c.is_file():
            return c
    for base in [here.parent.parent, Path.cwd()]:
        hit = _walk_for(base, rel)
        if hit:
            return hit
    return None


def load_tokens(path: str | None = None) -> dict:
    found = find_style_tokens(path)
    if not found:
        print("ERROR: style-tokens.json not found. It lives in "
              f"{SKILL_FOLDER}/assets/style-tokens.json. Copy it to the working folder or pass its path.")
        sys.exit(1)
    try:
        with open(found, "r", encoding="utf-8") as f:
            tokens = json.load(f)
    except (OSError, json.JSONDecodeError) as exc:
        print(f"ERROR: could not read {found}: {exc}")
        sys.exit(1)
    for key in ("colors", "chart_palette", "fonts", "chart"):
        if key not in tokens:
            print(f"ERROR: {found} is missing the '{key}' section.")
            sys.exit(1)
    tokens["_path"] = str(found)
    return tokens


def _pick_font(preferred: list[str]) -> str:
    available = {f.name for f in font_manager.fontManager.ttflist}
    for name in preferred:
        if name in available:
            return name
    return "DejaVu Sans"


def apply_theme(target: str = "report", tokens_path: str | None = None) -> dict:
    """Apply the brand theme to matplotlib globally. target: 'report' or 'email'."""
    global _TOKENS, _TARGET
    if target not in ("report", "email"):
        print("ERROR: target must be 'report' or 'email'.")
        sys.exit(1)
    _TOKENS = load_tokens(tokens_path)
    _TARGET = target
    c = _TOKENS["colors"]
    ch = _TOKENS["chart"]
    font = _pick_font(_TOKENS["fonts"].get("chart_family", []))
    size = ch[target]
    plt.rcdefaults()
    plt.rcParams.update({
        "figure.figsize": (size["width_in"], size["height_in"]),
        "figure.dpi": 100,
        "savefig.dpi": size["dpi"],
        "figure.facecolor": c["background"],
        "savefig.facecolor": c["background"],
        "axes.facecolor": c["background"],
        "figure.constrained_layout.use": True,
        "font.family": "sans-serif",
        "font.sans-serif": [font, "DejaVu Sans"],
        "font.size": ch.get("label_size", 10),
        "text.color": c["text"],
        "axes.labelcolor": c["muted"],
        "axes.edgecolor": c["border"],
        "axes.titlesize": ch.get("title_size", 14),
        "axes.titleweight": "bold",
        "axes.titlelocation": "left",
        "axes.titlecolor": c["heading"],
        "axes.spines.top": False,
        "axes.spines.right": False,
        "axes.spines.left": False,
        "axes.grid": True,
        "axes.grid.axis": "y",
        "axes.axisbelow": True,
        "grid.color": c["gridline"],
        "grid.linewidth": 0.8,
        "xtick.color": c["muted"],
        "ytick.color": c["muted"],
        "xtick.major.size": 0,
        "ytick.major.size": 0,
        "axes.prop_cycle": matplotlib.cycler(color=_TOKENS["chart_palette"]),
        "legend.frameon": False,
        "lines.linewidth": 2.2,
        "axes.unicode_minus": True,
    })
    return _TOKENS


def tokens() -> dict:
    if _TOKENS is None:
        apply_theme(_TARGET)
    return _TOKENS


# ---------------------------------------------------------------------------
# Number formatting
# ---------------------------------------------------------------------------

def _symbol(currency: str | None) -> str:
    if not currency:
        return ""
    return CURRENCY_SYMBOLS.get(currency.upper(), currency.upper() + " ")


def _trim(s: str) -> str:
    return s.rstrip("0").rstrip(".") if "." in s else s


def fmt_number(value: float, decimals: int = 1) -> str:
    """Compact number: 1234567 -> 1.2M, 600000 -> 600K, 2.15 -> 2.15."""
    if value is None:
        return "n/a"
    a = abs(value)
    sign = "\u2212" if value < 0 else ""
    for div, suffix in ((1e9, "B"), (1e6, "M"), (1e3, "K")):
        if a >= div:
            return f"{sign}{_trim(f'{a / div:,.{decimals}f}')}{suffix}"
    if float(a).is_integer():
        return f"{sign}{a:,.0f}"
    return f"{sign}{_trim(f'{a:,.2f}')}"


def fmt_money(value: float, currency: str | None = None, decimals: int = 1) -> str:
    if value is None:
        return "n/a"
    s = fmt_number(value, decimals)
    if s.startswith("\u2212"):
        return "\u2212" + _symbol(currency) + s[1:]
    return _symbol(currency) + s


def fmt_pct(value: float, decimals: int = 1, signed: bool = False) -> str:
    """value is a fraction (0.12 -> 12.0%)."""
    if value is None:
        return "n/a"
    sign = ("+" if value > 0 else "\u2212" if value < 0 else "") if signed else ("\u2212" if value < 0 else "")
    return f"{sign}{abs(value) * 100:.{decimals}f}%"


def money_axis(ax, currency: str | None, axis: str = "y"):
    fmt = FuncFormatter(lambda v, _p: fmt_money(v, currency, 0 if abs(v) < 1e3 else 1))
    (ax.yaxis if axis == "y" else ax.xaxis).set_major_formatter(fmt)


def pct_axis(ax, axis: str = "y"):
    fmt = FuncFormatter(lambda v, _p: fmt_pct(v, 0))
    (ax.yaxis if axis == "y" else ax.xaxis).set_major_formatter(fmt)


def _fmt_value(v, currency, unit):
    if unit == "pct":
        return fmt_pct(v, 1)
    if unit == "pp":
        return f"{'+' if v > 0 else chr(0x2212) if v < 0 else ''}{abs(v):.1f} pp"
    if unit == "count":
        return fmt_number(v, 1)
    return fmt_money(v, currency)


# ---------------------------------------------------------------------------
# Figure scaffolding
# ---------------------------------------------------------------------------

def new_figure(target: str | None = None):
    t = tokens()
    size = t["chart"][target or _TARGET]
    return plt.subplots(figsize=(size["width_in"], size["height_in"]))


def set_titles(ax, title: str, subtitle: str = ""):
    """Bold left-aligned title with a muted subtitle (unit, period, currency)."""
    t = tokens()
    ax.set_title(title, loc="left", pad=26 if subtitle else 10)
    if subtitle:
        ax.annotate(subtitle, xy=(0, 1), xycoords="axes fraction", xytext=(0, 8),
                    textcoords="offset points", ha="left", va="bottom",
                    fontsize=t["chart"].get("subtitle_size", 10), color=t["colors"]["muted"])


def _colors_for(labels, highlight):
    c = tokens()["colors"]
    if highlight is None:
        return [c["primary"]] * len(labels)
    focus = set(highlight if isinstance(highlight, (list, tuple, set)) else [highlight])
    return [c["primary"] if lab in focus else c["context"] for lab in labels]


# ---------------------------------------------------------------------------
# Chart helpers
# ---------------------------------------------------------------------------

def bar_ranked(labels, values, *, title, subtitle="", currency=None, unit="money",
               highlight=None, top_n=None, other_label="Other"):
    """Horizontal bars sorted largest first. Use for category comparisons.
    highlight: label (or list) drawn in the brand colour, others in grey."""
    pairs = sorted(zip(labels, values), key=lambda p: p[1], reverse=True)
    if top_n and len(pairs) > top_n:
        head, tail = pairs[:top_n], pairs[top_n:]
        pairs = head + [(other_label, sum(v for _, v in tail))]
    labs = [str(p[0]) for p in pairs][::-1]
    vals = [p[1] for p in pairs][::-1]
    fig, ax = new_figure()
    bars = ax.barh(labs, vals, color=_colors_for(labs, highlight), height=0.62)
    ax.grid(False)
    ax.grid(True, axis="x")
    ax.set_xlim(left=min(0, min(vals)))
    if unit == "money":
        money_axis(ax, currency, "x")
        ax.set_xlabel(f"{currency or ''} (value)".strip())
    elif unit == "pct":
        pct_axis(ax, "x")
        ax.set_xlabel("Percent")
    else:
        ax.set_xlabel("Count")
    if len(vals) <= tokens()["chart"].get("max_value_labels", 12):
        span = max(abs(v) for v in vals) or 1
        for b, v in zip(bars, vals):
            ax.text(b.get_width() + span * 0.01, b.get_y() + b.get_height() / 2,
                    _fmt_value(v, currency, unit), va="center", ha="left",
                    color=tokens()["colors"]["text"], fontsize=tokens()["chart"].get("label_size", 10))
        ax.set_xlim(right=max(vals) + span * 0.15)
    set_titles(ax, title, subtitle)
    return fig, ax


def column_by_period(periods, values, *, title, subtitle="", currency=None, unit="money",
                     highlight_last=True):
    """Vertical columns for a short run of periods (e.g. 3-12 months)."""
    labs = [str(p) for p in periods]
    c = tokens()["colors"]
    colors = [c["context"]] * len(labs)
    if highlight_last and labs:
        colors[-1] = c["primary"]
    else:
        colors = [c["primary"]] * len(labs)
    fig, ax = new_figure()
    bars = ax.bar(labs, values, color=colors, width=0.62)
    ax.set_ylim(bottom=min(0, min(values)))
    if unit == "money":
        money_axis(ax, currency)
        ax.set_ylabel(currency or "Value")
    elif unit == "pct":
        pct_axis(ax)
        ax.set_ylabel("Percent")
    else:
        ax.set_ylabel("Count")
    if len(values) <= tokens()["chart"].get("max_value_labels", 12):
        span = max(abs(v) for v in values) or 1
        for b, v in zip(bars, values):
            ax.text(b.get_x() + b.get_width() / 2, b.get_height() + span * 0.015,
                    _fmt_value(v, currency, unit), ha="center", va="bottom", fontsize=9, color=c["text"])
        ax.set_ylim(top=max(values) + span * 0.12)
    if len(labs) > 6:
        plt.setp(ax.get_xticklabels(), rotation=0, fontsize=9)
    set_titles(ax, title, subtitle)
    return fig, ax


def line_trend(x, series: dict, *, title, subtitle="", currency=None, unit="money",
               focus=None, prior=None, prior_label="Prior year"):
    """Line chart with direct end labels instead of a legend.
    series: {label: [values]} aligned to x. focus: label drawn in brand colour
    and thicker (others muted palette colours). prior: optional list aligned to
    x drawn as a dashed grey comparison line."""
    t = tokens()
    c = t["colors"]
    palette = t["chart_palette"]
    fig, ax = new_figure()
    xs = list(range(len(x)))
    if prior is not None:
        ax.plot(xs, prior, color=c["context"], linestyle="--", linewidth=1.6)
        ax.annotate(prior_label, xy=(xs[-1], prior[-1]), xytext=(6, 0), textcoords="offset points",
                    va="center", color=c["muted"], fontsize=9)
    for i, (label, vals) in enumerate(series.items()):
        if focus is None:
            color, lw = palette[i % len(palette)], 2.2
        elif label == focus:
            color, lw = c["primary"], 2.8
        else:
            color, lw = c["context"], 1.6
        ax.plot(xs, vals, color=color, linewidth=lw)
        ax.annotate(f"{label}  {_fmt_value(vals[-1], currency, unit)}", xy=(xs[-1], vals[-1]),
                    xytext=(6, 0), textcoords="offset points", va="center", color=color,
                    fontsize=9, fontweight="bold" if label == focus else "normal")
    ax.set_xticks(xs)
    ax.set_xticklabels([str(v) for v in x], fontsize=9)
    ax.margins(x=0.02)
    ax.set_xlim(right=xs[-1] + max(1.5, len(xs) * 0.22))
    if unit == "money":
        money_axis(ax, currency)
        ax.set_ylabel(currency or "Value")
    elif unit == "pct":
        pct_axis(ax)
        ax.set_ylabel("Percent")
    else:
        ax.set_ylabel("Count")
    set_titles(ax, title, subtitle)
    return fig, ax


def variance_bars(labels, deltas, *, title, subtitle="", currency=None, unit="money", sort=True):
    """Horizontal diverging bars for change vs prior (positive = positive colour,
    negative = negative colour, signed labels so colour is never the only cue).
    unit: 'money', 'pct' (fractions) or 'pp' (percentage points)."""
    c = tokens()["colors"]
    pairs = list(zip(labels, deltas))
    if sort:
        pairs.sort(key=lambda p: p[1])
    labs = [str(p[0]) for p in pairs]
    vals = [p[1] for p in pairs]
    fig, ax = new_figure()
    colors = [c["positive"] if v >= 0 else c["negative"] for v in vals]
    bars = ax.barh(labs, vals, color=colors, height=0.62)
    ax.grid(False)
    ax.grid(True, axis="x")
    ax.axvline(0, color=c["muted"], linewidth=1)
    span = max(abs(v) for v in vals) or 1
    for b, v in zip(bars, vals):
        txt = _fmt_value(v, currency, unit)
        if v > 0 and not txt.startswith("+"):
            txt = "+" + txt
        ax.text(v + (span * 0.02 if v >= 0 else -span * 0.02), b.get_y() + b.get_height() / 2, txt,
                va="center", ha="left" if v >= 0 else "right", fontsize=9, color=c["text"])
    ax.set_xlim(min(0, min(vals)) - span * 0.2, max(0, max(vals)) + span * 0.2)
    if unit == "money":
        money_axis(ax, currency, "x")
        ax.set_xlabel(f"Change ({currency})" if currency else "Change")
    elif unit == "pct":
        pct_axis(ax, "x")
        ax.set_xlabel("Change (%)")
    else:
        ax.set_xlabel("Change (percentage points)")
    set_titles(ax, title, subtitle)
    return fig, ax


def small_multiples(x, series: dict, *, title, subtitle="", currency=None, unit="money", ncols=3):
    """One small line chart per series with a shared y-axis - use instead of a
    spaghetti chart with more than ~5 lines."""
    t = tokens()
    c = t["colors"]
    n = len(series)
    ncols = max(1, min(ncols, n))
    nrows = (n + ncols - 1) // ncols
    size = t["chart"][_TARGET]
    fig, axes = plt.subplots(nrows, ncols, sharey=True, squeeze=False,
                             figsize=(size["width_in"], max(size["height_in"], 2.0 * nrows + 0.8)))
    xs = list(range(len(x)))
    for idx, (label, vals) in enumerate(series.items()):
        ax = axes[idx // ncols][idx % ncols]
        ax.plot(xs, vals, color=c["primary"], linewidth=2)
        ax.set_title(label, fontsize=10, loc="left")
        ax.set_xticks([xs[0], xs[-1]])
        ax.set_xticklabels([str(x[0]), str(x[-1])], fontsize=8)
        if unit == "money":
            money_axis(ax, currency)
        elif unit == "pct":
            pct_axis(ax)
    for j in range(n, nrows * ncols):
        axes[j // ncols][j % ncols].set_visible(False)
    fig.suptitle(title, x=0.01, ha="left", fontweight="bold", fontsize=t["chart"].get("title_size", 14),
                 color=c["heading"])
    if subtitle:
        axes[0][0].set_ylabel(subtitle, fontsize=9)
    return fig, axes


def save_chart(fig, path: str, target: str | None = None) -> dict:
    """Save at the token DPI on a solid background. Returns pixel size."""
    t = tokens()
    dpi = t["chart"][target or _TARGET]["dpi"]
    fig.savefig(path, dpi=dpi, facecolor=t["colors"]["background"])
    w, h = fig.get_size_inches()
    plt.close(fig)
    info = {"path": path, "width_px": int(round(w * dpi)), "height_px": int(round(h * dpi)), "dpi": dpi}
    print(f"Saved {path} ({info['width_px']}x{info['height_px']}px @ {dpi} dpi)")
    return info


# ---------------------------------------------------------------------------
# Demo
# ---------------------------------------------------------------------------

def _demo(outdir: str):
    os.makedirs(outdir, exist_ok=True)
    apply_theme("report")
    months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    out = []
    fig, _ = bar_ranked(["EMEA", "AMER", "APAC", "LATAM"], [4.2e6, 3.1e6, 1.4e6, 0.6e6],
                        title="Revenue by region", subtitle="Q4 2026 (Oct-Dec), GBP", currency="GBP",
                        highlight="EMEA")
    out.append(save_chart(fig, os.path.join(outdir, "demo_bar_ranked.png")))
    cur = [v * 1e6 for v in (1.1, 1.2, 1.3, 1.2, 1.4, 1.5, 1.4, 1.6, 1.7, 1.8, 1.9, 2.1)]
    pri = [v * 1e6 for v in (1.0, 1.1, 1.1, 1.2, 1.2, 1.3, 1.3, 1.4, 1.4, 1.5, 1.6, 1.7)]
    fig, _ = line_trend(months, {"2026": cur}, prior=pri, title="Monthly revenue",
                        subtitle="GBP, 2026 vs 2025", currency="GBP", focus="2026", prior_label="2025")
    out.append(save_chart(fig, os.path.join(outdir, "demo_line_trend.png")))
    fig, _ = variance_bars(["EMEA", "AMER", "APAC", "LATAM"], [0.28, 0.05, -0.12, 0.02],
                           title="Revenue change vs Q4 2025", subtitle="% change, GBP", unit="pct")
    out.append(save_chart(fig, os.path.join(outdir, "demo_variance.png")))
    apply_theme("email")
    fig, _ = column_by_period(["Oct", "Nov", "Dec"], [2.4e6, 2.9e6, 3.6e6], title="Q4 revenue by month",
                              subtitle="GBP", currency="GBP")
    out.append(save_chart(fig, os.path.join(outdir, "demo_columns_email.png")))
    print(json.dumps(out, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Brand chart theme. Import it, or run --demo to preview.")
    parser.add_argument("--demo", metavar="OUTDIR", help="Render demo charts into OUTDIR.")
    parser.add_argument("--tokens", help="Path to style-tokens.json (optional).")
    args = parser.parse_args()
    if args.tokens:
        os.environ[TOKENS_ENV] = args.tokens
    if args.demo:
        _demo(args.demo)
    else:
        parser.print_help()
