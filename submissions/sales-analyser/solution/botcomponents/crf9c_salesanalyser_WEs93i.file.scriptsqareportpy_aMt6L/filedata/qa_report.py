"""
QA pass for a report before it is shown or sent. Checks the content JSON
(density budgets, headline, data notes), the chart images (size/resolution),
the rendered PDF (exists, page count, size) and the brand tokens in
style-tokens.json (WCAG contrast), so a branding edit that breaks readability
is caught here.

Usage:
    python qa_report.py report_content.json --pdf report.pdf [--report-type one-pager|short|multi-section]
    python qa_report.py --tokens-only            # just check style-tokens.json contrast

Library:
    from qa_report import check_custom_contrast
    ratio, ok = check_custom_contrast("#1460AA", "#FFFFFF")

Exit code 0 = no FAIL (WARN is allowed, but mention it to the user). Requires
Pillow for image checks (skipped with a note if missing).
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path

try:
    from PIL import Image
    _HAS_PIL = True
except ImportError:
    _HAS_PIL = False

SKILL_FOLDER = "spreadsheet-data-analysis-reporting"
TOKENS_ENV = "SALES_STYLE_TOKENS"
BUDGETS = {
    # type: (max_words, max_images, max_pages, max_bullets_per_section)
    "one-pager": (600, 2, 2, 3),
    "short": (1200, 4, 4, 3),
    "multi-section": (2500, 8, 8, 3),
}
MIN_CHART_WIDTH = 1000
PDF_WARN_KB, PDF_FAIL_KB = 1000, 3000


# ---------------------------------------------------------------------------
# Contrast (WCAG 2.1)
# ---------------------------------------------------------------------------

def _lin(c):
    c /= 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def _lum(hex_color):
    h = hex_color.lstrip("#")
    if len(h) != 6:
        raise ValueError(f"'{hex_color}' is not a 6-digit hex colour")
    r, g, b = (int(h[i:i + 2], 16) for i in (0, 2, 4))
    return 0.2126 * _lin(r) + 0.7152 * _lin(g) + 0.0722 * _lin(b)


def check_custom_contrast(fg, bg, large_text=False):
    """(ratio, passes). 4.5:1 for text, 3:1 for large text and graphics."""
    a, b = _lum(fg), _lum(bg)
    ratio = (max(a, b) + 0.05) / (min(a, b) + 0.05)
    return ratio, ratio >= (3.0 if large_text else 4.5)


def find_style_tokens(explicit=None):
    here = Path(__file__).resolve().parent
    rel = os.path.join(SKILL_FOLDER, "assets", "style-tokens.json")
    cands = [Path(explicit)] if explicit else []
    if os.environ.get(TOKENS_ENV):
        cands.append(Path(os.environ[TOKENS_ENV]))
    cands += [Path.cwd() / "style-tokens.json", here.parent.parent / rel]
    for c in cands:
        if c.is_file():
            return c
    for base in (here.parent.parent, Path.cwd()):
        depth0 = len(base.parts)
        for root, dirs, _f in os.walk(base):
            if len(Path(root).parts) - depth0 >= 4:
                dirs[:] = []
            if (Path(root) / rel).is_file():
                return Path(root) / rel
    return None


def check_tokens(tokens, tokens_dir=None):
    c = tokens.get("colors", {})
    res = []
    bg = c.get("background", "#FFFFFF")
    text_pairs = [("text", bg), ("heading", bg), ("muted", bg), ("primary", bg), ("secondary", bg),
                  ("positive", bg), ("negative", bg), ("text", c.get("surface", bg)), ("muted", c.get("surface", bg)),
                  ("on_primary", c.get("primary", "#000000"))]
    for name, back in text_pairs:
        if name not in c:
            res.append(("FAIL", f"token:{name}", "missing from style-tokens.json"))
            continue
        ratio, ok = check_custom_contrast(c[name], back)
        res.append(("PASS" if ok else "FAIL", f"contrast:{name} on {back}", f"{ratio:.2f}:1 (text needs 4.5:1)"))
    if "context" in c:
        ratio, ok = check_custom_contrast(c["context"], bg, large_text=True)
        res.append(("PASS" if ok else "WARN", "contrast:context (graphics)", f"{ratio:.2f}:1 (graphics need 3:1)"))
    for i, col in enumerate(tokens.get("chart_palette", [])):
        ratio, ok = check_custom_contrast(col, bg, large_text=True)
        lvl = "PASS" if ok or i >= 3 else "FAIL"
        res.append((lvl, f"palette[{i}] {col}", f"{ratio:.2f}:1 vs background"
                    + ("" if ok else " - light tint: use as a fill with value labels only")))
    disclaimer = tokens.get("text", {}).get("footer_disclaimer", "").strip()
    res.append(("PASS" if disclaimer else "FAIL", "footer_disclaimer",
                "present" if disclaimer else "empty - the non-audit disclaimer is required"))
    logo = (tokens.get("brand", {}).get("logo_path") or "").strip()
    if logo:
        cands = [logo] if os.path.isabs(logo) else [os.path.join(b, logo) for b in (tokens_dir, os.getcwd()) if b]
        found = next((p for p in cands if os.path.isfile(p)), None)
        if found:
            res.append(("PASS", "logo_path", f"found: {found}"))
        else:
            res.append(("WARN", "logo_path", f"'{logo}' not found next to style-tokens.json or here - "
                        "the PDF will render without it"))
    return res


# ---------------------------------------------------------------------------
# Content checks
# ---------------------------------------------------------------------------

def _words(text):
    return len(re.findall(r"[A-Za-z0-9%.'-]+", str(text)))


def check_content(content, base, report_type):
    max_words, max_images, _pages, max_bullets = BUDGETS[report_type]
    res = []
    hw = _words(content.get("headline", ""))
    res.append(("PASS" if 12 <= hw <= 35 else "FAIL", "headline_length",
                f"{hw} words (aim for one sentence, 20-35 words, with a number and a comparison)"))
    if not re.search(r"\d", content.get("headline", "")):
        res.append(("WARN", "headline_number", "headline has no number - state the key figure"))
    kpis = content.get("kpis", [])
    res.append(("PASS" if 2 <= len(kpis) <= 5 or not kpis else "FAIL", "kpi_count", f"{len(kpis)} KPI tiles (2-5)"))
    for i, k in enumerate(kpis):
        if not k.get("label"):
            res.append(("FAIL", f"kpi[{i}]", "missing label - every number needs what it is and its basis"))
    total = hw + sum(_words(k.get("label", "")) + _words(k.get("delta", "")) for k in kpis)
    images = 0
    for i, sec in enumerate(content.get("sections", [])):
        bullets = sec.get("bullets", [])
        total += _words(sec.get("heading", "")) + _words(sec.get("caption", "")) + sum(_words(b) for b in bullets)
        if len(bullets) > max_bullets:
            res.append(("FAIL", f"section[{i}] bullets", f"{len(bullets)} bullets (max {max_bullets})"))
        long = [b for b in bullets if _words(b) > 25]
        if long:
            res.append(("WARN", f"section[{i}] bullet length", f"{len(long)} bullet(s) over 25 words - split or cut"))
        if sec.get("chart"):
            images += 1
            res.extend(check_image(os.path.join(base, sec["chart"]), sec["chart"]))
            if not sec.get("caption"):
                res.append(("WARN", f"section[{i}] caption", "chart has no caption stating what it shows"))
    total += sum(_words(r) for r in content.get("recommendations", []))
    res.append(("PASS" if total <= max_words else "FAIL", "total_words", f"{total} words (budget {max_words})"))
    res.append(("PASS" if images <= max_images else "FAIL", "total_charts", f"{images} chart(s) (budget {max_images})"))
    notes = content.get("data_notes", {})
    for key in ("scope", "transformations", "fx", "flags", "caveats"):
        res.append(("PASS" if notes.get(key) else "FAIL", f"data_notes.{key}",
                    "present" if notes.get(key) else "missing - write 'none' if nothing applies"))
    return res


def check_image(path, label):
    if not os.path.isfile(path):
        return [("FAIL", f"chart:{label}", f"not found: {path}")]
    if not _HAS_PIL:
        return [("WARN", f"chart:{label}", "Pillow missing - resolution not checked")]
    try:
        with Image.open(path) as im:
            w, h = im.size
            dpi = im.info.get("dpi", (None, None))[0]
    except Exception as exc:  # noqa: BLE001
        return [("FAIL", f"chart:{label}", f"cannot open: {exc}")]
    out = [("PASS" if w >= MIN_CHART_WIDTH else "FAIL", f"chart:{label}",
            f"{w}x{h}px" + ("" if w >= MIN_CHART_WIDTH else f" - below {MIN_CHART_WIDTH}px; re-save with chart_style"))]
    if dpi and dpi < 140:
        out.append(("WARN", f"chart:{label} dpi", f"{dpi:.0f} dpi - use chart_style.apply_theme('report')"))
    return out


def check_pdf(pdf_path, report_type):
    if not pdf_path:
        return [("WARN", "pdf", "no --pdf given - rendered PDF not checked")]
    if not os.path.isfile(pdf_path):
        return [("FAIL", "pdf", f"not found: {pdf_path} - run render_report.py first")]
    size_kb = os.path.getsize(pdf_path) / 1024
    with open(pdf_path, "rb") as f:
        data = f.read()
    pages = len(re.findall(rb"/Type\s*/Page[^s]", data))
    max_pages = BUDGETS[report_type][2]
    res = [("PASS" if pages <= max_pages else "FAIL", "pdf_pages", f"{pages} page(s) (max {max_pages} for {report_type})")]
    lvl = "PASS" if size_kb <= PDF_WARN_KB else ("WARN" if size_kb <= PDF_FAIL_KB else "FAIL")
    res.append((lvl, "pdf_size", f"{size_kb:.0f} KB" + ("" if lvl == "PASS" else
                " - large for an email attachment; re-render with fewer or smaller charts")))
    return res


def print_report(results):
    for lvl, name, note in results:
        print(f"{lvl} - {name} - {note}")
    levels = {lvl for lvl, _n, _t in results}
    worst = "FAIL" if "FAIL" in levels else "WARN" if "WARN" in levels else "PASS"
    print()
    print("Overall:", {"PASS": "PASS - ready to deliver.", "WARN": "PASS with warnings - mention them or fix.",
                       "FAIL": "FAIL - fix the items above and re-run."}[worst])
    return worst != "FAIL"


def main():
    ap = argparse.ArgumentParser(description="QA a report before delivery.")
    ap.add_argument("content_json", nargs="?")
    ap.add_argument("--pdf")
    ap.add_argument("--report-type", default="one-pager", choices=list(BUDGETS))
    ap.add_argument("--tokens")
    ap.add_argument("--tokens-only", action="store_true")
    a = ap.parse_args()
    tpath = find_style_tokens(a.tokens)
    if not tpath:
        print(f"ERROR: style-tokens.json not found ({SKILL_FOLDER}/assets/style-tokens.json).")
        sys.exit(1)
    with open(tpath, "r", encoding="utf-8") as f:
        tokens = json.load(f)
    results = check_tokens(tokens, str(Path(tpath).resolve().parent))
    if not a.tokens_only:
        if not a.content_json or not os.path.isfile(a.content_json):
            print("ERROR: pass the report content JSON (or --tokens-only).")
            sys.exit(1)
        with open(a.content_json, "r", encoding="utf-8") as f:
            content = json.load(f)
        base = os.path.dirname(os.path.abspath(a.content_json))
        results += check_content(content, base, a.report_type)
        results += check_pdf(a.pdf, a.report_type)
    sys.exit(0 if print_report(results) else 1)


if __name__ == "__main__":
    main()
