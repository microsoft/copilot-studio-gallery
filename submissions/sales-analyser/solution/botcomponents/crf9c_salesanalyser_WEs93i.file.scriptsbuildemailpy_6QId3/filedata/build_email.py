"""
Build the newsletter email HTML from a small content JSON and the shared
brand tokens. KPI tiles and bar charts are HTML table cells (bgcolor +
percentage widths) - no images in the body, so they render in classic Outlook,
Gmail (web/app), Apple Mail and dark mode, and the body stays small.

Usage:
    python build_email.py email_content.json email.html [--pdf report.pdf] [--tokens style-tokens.json]

email_content.json (see assets/email-content-example.json):
    subject, title, headline                     (required)
    preheader, subtitle, eyebrow                 (optional; preheader defaults to the headline)
    kpis:        [{value, label, delta, direction: up|down|flat, good_when_down}]   max 4
    bar_charts:  [{title, subtitle, unit: money|pct|pp|count, currency, mode: bars|variance,
                   highlight, items: [{label, value, display?}]}]                  max 2, <= 8 items each
    findings:    [{heading, bullets: [..]}]      max 3 bullets each
    recommendations: [..]
    data_notes:  {scope, transformations, fx, flags, caveats} or a short string   (required)
    attachment_name: file name used for the attached PDF (optional; defaults to the --pdf file name)

--pdf checks the PDF exists, adds the "PDF report attached" line to the body, and writes
<email.html>.attachment.json = {"Name": ..., "Path": <absolute sandbox path>, "SizeKB": ...}.
The Draft an email tool attaches the PDF by referencing that sandbox file path - no base64 is
produced or passed through the conversation.

Requires: Python standard library only.
"""
from __future__ import annotations

import argparse
import html
import json
import os
import re
import sys
from pathlib import Path

SKILL_FOLDER = "spreadsheet-data-analysis-reporting"
TOKENS_ENV = "SALES_STYLE_TOKENS"
GMAIL_CLIP_BYTES = 102 * 1024
LARGE_PDF_BYTES = 3 * 1024 * 1024
CURRENCY_SYMBOLS = {"GBP": "\u00a3", "EUR": "\u20ac", "USD": "$", "JPY": "\u00a5"}


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


def _load_json(path, label):
    if not path or not os.path.isfile(path):
        print(f"ERROR: {label} not found: {path}")
        sys.exit(1)
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except json.JSONDecodeError as exc:
        print(f"ERROR: {label} is not valid JSON: {exc}")
        sys.exit(1)


def _blocks(template):
    blocks = dict(re.findall(r"<!--BLOCK (\w+)-->\n(.*?)<!--/BLOCK-->", template, re.S))
    main = re.sub(r"<!--BLOCK \w+-->.*?<!--/BLOCK-->\s*", "", template, flags=re.S)
    main = re.sub(r"<!--\nNewsletter email template.*?-->\n", "", main, flags=re.S)
    return main, blocks


def _fill(fragment, ctx):
    def sub(m):
        key = m.group(1)
        if key not in ctx:
            raise KeyError(key)
        return str(ctx[key])
    return re.sub(r"\{\{([\w.]+)\}\}", sub, fragment)


def _fmt(value, unit, currency):
    if value is None:
        return "n/a"
    sign = "+" if value > 0 else "\u2212" if value < 0 else ""
    a = abs(value)
    if unit == "pct":
        return f"{sign}{a * 100:.1f}%"
    if unit == "pp":
        return f"{sign}{a:.1f} pp"
    for div, suf in ((1e9, "B"), (1e6, "M"), (1e3, "K")):
        if a >= div:
            num = f"{a / div:.1f}".rstrip("0").rstrip(".") + suf
            break
    else:
        num = f"{a:,.0f}"
    sym = CURRENCY_SYMBOLS.get((currency or "").upper(), (currency + " ") if currency else "") if unit == "money" else ""
    return f"{sign if value < 0 else ''}{sym}{num}"


def build(content, tokens, template):
    c = tokens["colors"]
    text = tokens.get("text", {})
    width = int(tokens.get("email", {}).get("width_px", 600))
    font = tokens["fonts"].get("email_stack", "Arial, sans-serif").replace('"', "'")
    esc = lambda s: html.escape(str(s), quote=True)  # noqa: E731
    base = {f"c.{k}": v for k, v in c.items() if not k.startswith("_")}
    base.update({f"text.{k}": esc(v) for k, v in text.items()})
    base.update({"font": font, "width": width})
    main, blocks = _blocks(template)
    warnings = []

    # KPI tiles
    kpis = content.get("kpis", [])
    if len(kpis) > 4:
        warnings.append(f"{len(kpis)} KPIs given; the email shows the first 4.")
        kpis = kpis[:4]
    kpi_html = ""
    if kpis:
        pct = int((100 - 2 * (len(kpis) - 1)) / len(kpis))
        cells = []
        for i, k in enumerate(kpis):
            d = k.get("direction", "flat")
            good, bad = ("down", "up") if k.get("good_when_down") else ("up", "down")
            tone = c["positive"] if d == good else c["negative"] if d == bad else c["muted"]
            arrow = {"up": "\u25b2 ", "down": "\u25bc "}.get(d, "")
            if i:
                cells.append(_fill(blocks["kpi_gap"], base))
            cells.append(_fill(blocks["kpi_cell"], {**base, "pct": pct, "value": esc(k.get("value", "")),
                                                    "label": esc(k.get("label", "")), "tone": tone,
                                                    "delta": esc(arrow + k["delta"]) if k.get("delta") else "&nbsp;"}))
        kpi_html = _fill(blocks["kpi_row"], {**base, "cells": "".join(cells)})

    # Bar charts made of table cells
    charts_html = []
    for ch in content.get("bar_charts", [])[:2]:
        items = ch.get("items", [])
        if len(items) > 8:
            warnings.append(f"Chart '{ch.get('title')}' has {len(items)} items; showing top 8 by size.")
            items = sorted(items, key=lambda it: abs(it["value"]), reverse=True)[:8]
        if not items:
            continue
        variance = ch.get("mode") == "variance"
        unit, ccy = ch.get("unit", "money"), ch.get("currency")
        biggest = max(abs(it["value"]) for it in items) or 1
        focus = ch.get("highlight")
        focus = set(focus if isinstance(focus, list) else [focus]) if focus else None
        rows, summary = [], []
        for it in items:
            v = it["value"]
            pct = max(1, min(100, round(abs(v) / biggest * 100)))
            if variance:
                color = c["positive"] if v >= 0 else c["negative"]
            elif focus is not None:
                color = c["primary"] if it["label"] in focus else c["context"]
            else:
                color = c["primary"]
            display = it.get("display") or _fmt(v, unit, ccy)
            if variance and v > 0 and not display.startswith("+"):
                display = "+" + display
            bar = (f'<td width="{pct}%" height="16" bgcolor="{color}" style="height:16px; background-color:{color}; '
                   f'font-size:0; line-height:0;">&nbsp;</td>')
            if pct < 100:
                bar += f'<td width="{100 - pct}%" style="font-size:0; line-height:0;">&nbsp;</td>'
            rows.append(_fill(blocks["bar_row"], {**base, "label": esc(it["label"]), "display": esc(display),
                                                  "bar_cells": "            " + bar}))
            summary.append(f"{it['label']} {display}")
        charts_html.append(_fill(blocks["bar_chart"], {**base, "title": esc(ch.get("title", "")),
                                                       "subtitle": esc(ch.get("subtitle", "")),
                                                       "summary": esc("Bar chart: " + "; ".join(summary)),
                                                       "rows": "".join(rows)}))

    # Findings and recommendations
    def items_html(values, numbered=False):
        return "".join(_fill(blocks["list_item"], {**base, "marker": f"{i + 1}." if numbered else "&#8226;",
                                                   "text": esc(v)}) for i, v in enumerate(values))
    findings = []
    for f in content.get("findings", []):
        bullets = f.get("bullets", [])
        if len(bullets) > 3:
            warnings.append(f"Finding '{f.get('heading')}' has {len(bullets)} bullets; keep 3 or fewer.")
        findings.append(_fill(blocks["finding"], {**base, "heading": esc(f.get("heading", "")),
                                                  "items": items_html(bullets[:3])}))
    recs = ""
    if content.get("recommendations"):
        recs = _fill(blocks["finding"], {**base, "heading": "Recommended next steps",
                                         "items": items_html(content["recommendations"][:3], numbered=True)})

    # Attachment line (the full report is the attached PDF)
    att_name = content.get("attachment_name")
    att_line = (f"The full report, with all charts and data notes, is attached as a PDF ({esc(att_name)})."
                if att_name else "")
    attachment_note = _fill(blocks["attachment_note"], {**base, "attachment_line": att_line}) if att_line else ""

    notes = content.get("data_notes")
    if isinstance(notes, dict):
        labels = {"scope": "Scope", "transformations": "Transformations", "fx": "FX", "flags": "Flags",
                  "caveats": "Caveats"}
        parts = []
        for k, lab in labels.items():
            v = notes.get(k)
            if v:
                parts.append(f"{lab}: " + ("; ".join(map(str, v)) if isinstance(v, list) else str(v)))
        notes = " | ".join(parts)
    ctx = {**base, "subject": esc(content["subject"]), "title": esc(content["title"]),
           "subtitle": esc(content.get("subtitle", "")), "headline": esc(content["headline"]),
           "eyebrow": esc(content.get("eyebrow") or text.get("header_eyebrow", "")),
           "preheader": esc(content.get("preheader") or content["headline"]),
           "KPI_ROW": kpi_html, "BAR_CHARTS": "".join(charts_html), "FINDINGS": "".join(findings),
           "RECOMMENDATIONS": recs, "ATTACHMENT_NOTE": attachment_note, "data_notes": esc(notes)}
    out = _fill(main, ctx)
    return out, warnings


def main():
    ap = argparse.ArgumentParser(description="Build the newsletter email HTML (table-cell charts, brand tokens).")
    ap.add_argument("content_json")
    ap.add_argument("output_html")
    ap.add_argument("--pdf", help="PDF to attach (sandbox path) - writes <output>.attachment.json")
    ap.add_argument("--tokens")
    ap.add_argument("--template", default=None)
    a = ap.parse_args()
    content = _load_json(a.content_json, "email content JSON")
    missing = [k for k in ("subject", "title", "headline", "data_notes") if not content.get(k)]
    if missing:
        print(f"ERROR: email content is missing: {', '.join(missing)}")
        sys.exit(1)
    tpath = find_style_tokens(a.tokens)
    if not tpath:
        print(f"ERROR: style-tokens.json not found ({SKILL_FOLDER}/assets/style-tokens.json). Pass --tokens.")
        sys.exit(1)
    tokens = _load_json(str(tpath), "style-tokens.json")
    template_path = a.template or os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "assets",
                                               "newsletter-email-template.html")
    if not os.path.isfile(template_path):
        print(f"ERROR: template not found: {template_path}")
        sys.exit(1)
    with open(template_path, "r", encoding="utf-8") as f:
        template = f.read()
    if a.pdf:
        if not os.path.isfile(a.pdf):
            print(f"ERROR: PDF not found: {a.pdf}")
            sys.exit(1)
        content.setdefault("attachment_name", os.path.basename(a.pdf))
    try:
        out, warnings = build(content, tokens, template)
    except KeyError as exc:
        print(f"ERROR: template placeholder {exc} has no value - check style-tokens.json and the template.")
        sys.exit(1)
    if "data:image" in out or "<img" in out.lower():
        warnings.append("Body contains an <img>/data: URI - many clients block these; use table-cell charts.")
    with open(a.output_html, "w", encoding="utf-8") as f:
        f.write(out)
    size = len(out.encode("utf-8"))
    print(f"Wrote {a.output_html} ({size / 1024:.1f} KB)")
    if size > GMAIL_CLIP_BYTES * 0.9:
        warnings.append(f"Body is {size / 1024:.0f} KB; Gmail clips messages over 102 KB. Cut content.")
    if a.pdf:
        pdf_path = os.path.abspath(a.pdf)
        pdf_size = os.path.getsize(pdf_path)
        att_path = a.output_html + ".attachment.json"
        with open(att_path, "w", encoding="utf-8") as f:
            json.dump({"Name": content["attachment_name"], "Path": pdf_path,
                       "SizeKB": round(pdf_size / 1024)}, f, indent=2)
        print(f"Wrote {att_path} ({content['attachment_name']}, {pdf_size / 1024:.0f} KB, {pdf_path}). "
              "Attach it in the Draft an email tool by referencing this sandbox file path.")
        if pdf_size > LARGE_PDF_BYTES:
            warnings.append(f"PDF is {pdf_size / 1024 / 1024:.1f} MB - large for an email attachment. "
                            "Re-render with fewer or smaller charts before attaching.")
    for w in warnings:
        print(f"WARN: {w}")


if __name__ == "__main__":
    main()
