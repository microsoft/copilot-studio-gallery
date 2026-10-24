"""
Render a polished PDF report with reportlab from a small content JSON.
No markdown, weasyprint or browser needed. All colours, fonts, logo and the
header/footer/disclaimer text come from style-tokens.json (the single
branding source in spreadsheet-data-analysis-reporting/assets/).

Usage:
    python render_report.py report_content.json report.pdf
    python render_report.py report_content.json report.pdf --tokens path/to/style-tokens.json
    python render_report.py report_content.json report.pdf --no-compress

report_content.json (see assets/report-content-example.json):
    title, subtitle, headline              (required: title, headline)
    kpis:        [{value, label, delta, direction: up|down|flat}]   2-5 items
    sections:    [{heading, chart, caption, bullets: [..], table: {columns, rows, numeric_columns}}]
    recommendations: [..]
    data_notes:  {scope, transformations, fx, flags, caveats}   (strings or lists - all required)
Chart paths are relative to the JSON file. Charts should come from chart_style.py
(apply_theme("report")) so they match the PDF.

Requires: reportlab, Pillow (matplotlib optional - used to find the DejaVu font
so PDF text matches the charts). Exits with a clear message on missing input.
"""
from __future__ import annotations

import argparse
import datetime
import json
import os
import sys
import tempfile
from pathlib import Path

try:
    from reportlab.lib import colors
    from reportlab.lib.enums import TA_RIGHT
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.units import mm
    from reportlab.lib.utils import ImageReader, simpleSplit
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    from reportlab.pdfgen import canvas as rl_canvas
    from reportlab.platypus import (Image, KeepTogether, ListFlowable, ListItem, Paragraph, SimpleDocTemplate,
                                    Spacer, Table, TableStyle)
except ImportError:
    print("ERROR: reportlab is required for render_report.py and is not available in this sandbox.")
    sys.exit(1)

try:
    from PIL import Image as PILImage
except ImportError:
    PILImage = None

SKILL_FOLDER = "spreadsheet-data-analysis-reporting"
TOKENS_ENV = "SALES_STYLE_TOKENS"
PAGE_W, PAGE_H = A4
MARGIN = 18 * mm
BAND_H = 38 * mm
REQUIRED_NOTES = ("scope", "transformations", "fx", "flags", "caveats")


# ---------------------------------------------------------------------------
# Tokens and fonts
# ---------------------------------------------------------------------------

def find_style_tokens(explicit=None):
    here = Path(__file__).resolve().parent
    rel = os.path.join(SKILL_FOLDER, "assets", "style-tokens.json")
    cands = [Path(explicit)] if explicit else []
    if os.environ.get(TOKENS_ENV):
        cands.append(Path(os.environ[TOKENS_ENV]))
    cands += [Path.cwd() / "style-tokens.json", here.parent.parent / rel, here.parent / "assets" / "style-tokens.json"]
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


def load_tokens(explicit=None):
    path = find_style_tokens(explicit)
    if not path:
        print(f"ERROR: style-tokens.json not found ({SKILL_FOLDER}/assets/style-tokens.json). "
              "Copy it next to the content JSON or pass --tokens.")
        sys.exit(1)
    with open(path, "r", encoding="utf-8") as f:
        tokens = json.load(f)
    tokens["_dir"] = str(path.resolve().parent)
    return tokens


def resolve_logo(tokens, content_base=None):
    """brand.logo_path: absolute, or relative to the style-tokens.json folder (assets/), then the content
    JSON folder, then the working folder. Returns '' when empty or not found (PDF renders without a logo)."""
    logo = (tokens.get("brand", {}).get("logo_path") or "").strip()
    if not logo:
        return ""
    if os.path.isabs(logo):
        return logo if os.path.isfile(logo) else ""
    for base in (tokens.get("_dir"), content_base, os.getcwd()):
        if base and os.path.isfile(os.path.join(base, logo)):
            return os.path.join(base, logo)
    return ""


def register_fonts(tokens):
    """Brand TTFs if given, else DejaVu Sans from matplotlib, else Helvetica."""
    fonts = tokens.get("fonts", {})
    reg = list(fonts.get("pdf_regular_ttf") or [])
    bold = list(fonts.get("pdf_bold_ttf") or [])
    try:
        import matplotlib
        ttf_dir = os.path.join(matplotlib.get_data_path(), "fonts", "ttf")
        reg.append(os.path.join(ttf_dir, "DejaVuSans.ttf"))
        bold.append(os.path.join(ttf_dir, "DejaVuSans-Bold.ttf"))
    except ImportError:
        pass
    r = next((p for p in reg if p and os.path.isfile(p)), None)
    b = next((p for p in bold if p and os.path.isfile(p)), None)
    if r and b:
        try:
            pdfmetrics.registerFont(TTFont("Brand", r))
            pdfmetrics.registerFont(TTFont("Brand-Bold", b))
            pdfmetrics.registerFontFamily("Brand", normal="Brand", bold="Brand-Bold", italic="Brand",
                                          boldItalic="Brand-Bold")
            return "Brand", "Brand-Bold", True
        except Exception as exc:  # noqa: BLE001
            print(f"NOTE: could not register TTF fonts ({exc}); using Helvetica.")
    else:
        print("NOTE: no TTF font found; using Helvetica.")
    return "Helvetica", "Helvetica-Bold", False


# ---------------------------------------------------------------------------
# Content validation
# ---------------------------------------------------------------------------

def load_content(path):
    if not os.path.isfile(path):
        print(f"ERROR: content JSON not found: {path}")
        sys.exit(1)
    try:
        with open(path, "r", encoding="utf-8") as f:
            content = json.load(f)
    except json.JSONDecodeError as exc:
        print(f"ERROR: {path} is not valid JSON: {exc}")
        sys.exit(1)
    problems = [f"missing '{k}'" for k in ("title", "headline") if not content.get(k)]
    notes = content.get("data_notes") or {}
    problems += [f"data_notes.{k} is empty (write 'none' if there is nothing)" for k in REQUIRED_NOTES
                 if not notes.get(k)]
    base = os.path.dirname(os.path.abspath(path))
    for i, sec in enumerate(content.get("sections", [])):
        if sec.get("chart") and not os.path.isfile(os.path.join(base, sec["chart"])):
            problems.append(f"sections[{i}].chart not found: {sec['chart']}")
    if problems:
        print("ERROR: report content is incomplete:\n  - " + "\n  - ".join(problems))
        sys.exit(1)
    content["_base"] = base
    return content


# ---------------------------------------------------------------------------
# Rendering
# ---------------------------------------------------------------------------

def _esc(text):
    return (str(text).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"))


def _styles(c, font, bold):
    col = lambda k: colors.HexColor(c[k])  # noqa: E731
    return {
        "headline": ParagraphStyle("headline", fontName=bold, fontSize=13, leading=18, textColor=col("heading")),
        "h2": ParagraphStyle("h2", fontName=bold, fontSize=13.5, leading=17, textColor=col("heading"),
                             spaceBefore=14, spaceAfter=6),
        "body": ParagraphStyle("body", fontName=font, fontSize=10, leading=14.5, textColor=col("text")),
        "caption": ParagraphStyle("caption", fontName=font, fontSize=8.5, leading=11.5, textColor=col("muted"),
                                  spaceBefore=3, spaceAfter=6),
        "kpi_value": ParagraphStyle("kpi_value", fontName=bold, fontSize=19, leading=22, textColor=col("heading")),
        "kpi_label": ParagraphStyle("kpi_label", fontName=font, fontSize=8.5, leading=11, textColor=col("muted")),
        "kpi_delta": ParagraphStyle("kpi_delta", fontName=bold, fontSize=9, leading=12, textColor=col("text")),
        "cell": ParagraphStyle("cell", fontName=font, fontSize=9, leading=12, textColor=col("text")),
        "cell_r": ParagraphStyle("cell_r", fontName=font, fontSize=9, leading=12, textColor=col("text"),
                                 alignment=TA_RIGHT),
        "th": ParagraphStyle("th", fontName=bold, fontSize=9, leading=12, textColor=col("heading")),
        "th_r": ParagraphStyle("th_r", fontName=bold, fontSize=9, leading=12, textColor=col("heading"),
                               alignment=TA_RIGHT),
        "note": ParagraphStyle("note", fontName=font, fontSize=8.5, leading=12, textColor=col("text"),
                               spaceAfter=2),
    }


def _headline(content, st, c, width):
    t = Table([[Paragraph(_esc(content["headline"]), st["headline"])]], colWidths=[width])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor(c["surface"])),
        ("LINEBEFORE", (0, 0), (0, -1), 4, colors.HexColor(c["primary"])),
        ("LEFTPADDING", (0, 0), (-1, -1), 14), ("RIGHTPADDING", (0, 0), (-1, -1), 12),
        ("TOPPADDING", (0, 0), (-1, -1), 11), ("BOTTOMPADDING", (0, 0), (-1, -1), 12),
    ]))
    return t


def _kpis(kpis, st, c, width, unicode_ok):
    if not kpis:
        return None
    kpis = kpis[:5]
    arrows = {"up": "\u25b2 " if unicode_ok else "+ ", "down": "\u25bc " if unicode_ok else "- ", "flat": ""}
    gap = 6
    col_w = (width - gap * (len(kpis) - 1)) / len(kpis)
    font = st["kpi_value"].fontName
    longest = max((str(k.get("value", "")) for k in kpis), key=lambda v: pdfmetrics.stringWidth(v, font, 19))
    size = 19.0
    while size > 11 and pdfmetrics.stringWidth(longest, font, size) > col_w - 20:
        size -= 0.5
    value_style = ParagraphStyle("kpi_value_fit", parent=st["kpi_value"], fontSize=size, leading=size + 3)
    cells = []
    for k in kpis:
        direction = k.get("direction", "flat")
        good, bad = ("down", "up") if k.get("good_when_down") else ("up", "down")
        tone = c["positive"] if direction == good else c["negative"] if direction == bad else c["muted"]
        block = [Paragraph(_esc(k.get("value", "")), value_style),
                 Paragraph(_esc(k.get("label", "")), st["kpi_label"])]
        if k.get("delta"):
            block.append(Spacer(1, 3))
            block.append(Paragraph(f'<font color="{tone}">{arrows.get(direction, "")}{_esc(k["delta"])}</font>',
                                   st["kpi_delta"]))
        cells.append(block)
    t = Table([cells], colWidths=[col_w] * len(kpis))
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor(c["surface"])),
        ("LINEAFTER", (0, 0), (-2, -1), gap, colors.HexColor(c["background"])),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 11), ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 10), ("BOTTOMPADDING", (0, 0), (-1, -1), 11),
        ("LINEABOVE", (0, 0), (-1, 0), 2.5, colors.HexColor(c["primary"])),
    ]))
    return t


def _image(path, width, compress, tmpdir):
    if PILImage is None:
        print("NOTE: Pillow missing - embedding chart without size check or compression.")
        return Image(path, width=width, height=width * 0.55)
    with PILImage.open(path) as im:
        w, h = im.size
        src = path
        if compress and im.mode in ("RGB", "RGBA", "P"):
            q = im.convert("RGB").quantize(colors=128, method=PILImage.Quantize.MEDIANCUT)
            src = os.path.join(tmpdir, os.path.basename(path))
            q.save(src, format="PNG", optimize=True)
    return Image(src, width=width, height=width * h / w)


def _table(spec, st, c, width):
    cols = spec.get("columns", [])
    rows = spec.get("rows", [])
    if not cols:
        return None
    numeric = set(spec.get("numeric_columns", []))
    numeric |= {i for i, name in enumerate(cols) if name in numeric}
    head = [Paragraph(_esc(h), st["th_r"] if i in numeric else st["th"]) for i, h in enumerate(cols)]
    body = [[Paragraph(_esc(v), st["cell_r"] if i in numeric else st["cell"]) for i, v in enumerate(r)] for r in rows]
    first = width * 0.34 if len(cols) > 2 else width * 0.5
    rest = (width - first) / max(1, len(cols) - 1)
    t = Table([head] + body, colWidths=[first] + [rest] * (len(cols) - 1), repeatRows=1)
    style = [
        ("LINEBELOW", (0, 0), (-1, 0), 1.2, colors.HexColor(c["primary"])),
        ("LINEBELOW", (0, 1), (-1, -1), 0.5, colors.HexColor(c["border"])),
        ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING", (0, 0), (-1, -1), 4), ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]
    if spec.get("total_row"):
        style += [("BACKGROUND", (0, len(rows)), (-1, len(rows)), colors.HexColor(c["surface"]))]
    t.setStyle(TableStyle(style))
    return t


def _bullets(items, st, c, numbered=False):
    if not items:
        return None
    flow = [ListItem(Paragraph(_esc(b), st["body"]), leftIndent=14) for b in items]
    kw = {"bulletType": "1", "bulletFormat": "%s."} if numbered else {"bulletType": "bullet", "start": "\u2022"}
    return ListFlowable(flow, leftIndent=14, bulletFontName=st["body"].fontName, bulletFontSize=9,
                        bulletColor=colors.HexColor(c["primary"]), spaceBefore=2, **kw)


def _data_notes(notes, st):
    labels = [("scope", "Scope"), ("transformations", "Transformations"), ("fx", "FX"), ("flags", "Flags and outliers"),
              ("caveats", "Caveats")]
    out = [Paragraph("Data notes", st["h2"])]
    for key, label in labels:
        val = notes.get(key)
        text = "; ".join(map(str, val)) if isinstance(val, list) else str(val)
        out.append(Paragraph(f"<b>{label}:</b> {_esc(text)}", st["note"]))
    return out


def build(content_path, out_path, tokens_path=None, compress=True):
    tokens = load_tokens(tokens_path)
    content = load_content(content_path)
    c = tokens["colors"]
    font, bold, unicode_ok = register_fonts(tokens)
    st = _styles(c, font, bold)
    text = tokens.get("text", {})
    brand = tokens.get("brand", {})
    width = PAGE_W - 2 * MARGIN
    generated = datetime.date.today().strftime("%d %b %Y")
    logo = resolve_logo(tokens, content["_base"])
    if brand.get("logo_path") and not logo:
        print(f"NOTE: logo not found ({brand.get('logo_path')}); rendering without it.")
    elif logo:
        print(f"Logo: {logo}")

    def first_page(cv, doc):
        cv.saveState()
        cv.setFillColor(colors.HexColor(c["primary"]))
        cv.rect(0, PAGE_H - BAND_H, PAGE_W, BAND_H, stroke=0, fill=1)
        cv.setFillColor(colors.HexColor(c["on_primary"]))
        cv.setFont(bold, 8.5)
        eyebrow = " \u00b7 ".join(x for x in (text.get("header_eyebrow", ""), content.get("eyebrow", "")) if x)
        cv.drawString(MARGIN, PAGE_H - 13 * mm, eyebrow.upper() if unicode_ok else eyebrow.upper().replace("\u00b7", "-"))
        title_w = width - (40 * mm if logo else 0)
        lines = simpleSplit(content["title"], bold, 20, title_w)[:2]
        y = PAGE_H - 21 * mm
        cv.setFont(bold, 20)
        for ln in lines:
            cv.drawString(MARGIN, y, ln)
            y -= 23
        if content.get("subtitle"):
            cv.setFont(font, 10)
            cv.drawString(MARGIN, PAGE_H - BAND_H + 6 * mm, content["subtitle"])
        if logo:
            h = float(brand.get("logo_height_pt", 22))
            try:
                iw, ih = ImageReader(logo).getSize()
                lw = h * iw / ih
                cv.drawImage(logo, PAGE_W - MARGIN - lw, PAGE_H - 12 * mm - h, width=lw, height=h, mask="auto")
            except Exception as exc:  # noqa: BLE001
                print(f"NOTE: could not draw logo: {exc}")
        cv.restoreState()

    def later_page(cv, doc):
        cv.saveState()
        cv.setStrokeColor(colors.HexColor(c["primary"]))
        cv.setLineWidth(2)
        cv.line(MARGIN, PAGE_H - 12 * mm, PAGE_W - MARGIN, PAGE_H - 12 * mm)
        cv.setFont(font, 8)
        cv.setFillColor(colors.HexColor(c["muted"]))
        cv.drawString(MARGIN, PAGE_H - 10 * mm, content["title"][:110])
        cv.restoreState()

    class NumberedCanvas(rl_canvas.Canvas):
        def __init__(self, *a, **kw):
            super().__init__(*a, **kw)
            self._saved = []

        def showPage(self):
            self._saved.append(dict(self.__dict__))
            self._startPage()

        def save(self):
            total = len(self._saved)
            for state in self._saved:
                self.__dict__.update(state)
                self._footer(total)
                super().showPage()
            NumberedCanvas.total_pages = total
            super().save()

        def _footer(self, total):
            self.saveState()
            self.setStrokeColor(colors.HexColor(c["border"]))
            self.setLineWidth(0.6)
            self.line(MARGIN, 14 * mm, PAGE_W - MARGIN, 14 * mm)
            self.setFont(font, 7.5)
            self.setFillColor(colors.HexColor(c["muted"]))
            disclaimer = text.get("footer_disclaimer", "")
            for i, ln in enumerate(simpleSplit(disclaimer, font, 7.5, width - 40 * mm)[:2]):
                self.drawString(MARGIN, 10 * mm - i * 9, ln)
            self.drawRightString(PAGE_W - MARGIN, 10 * mm, f"Page {self._pageNumber} of {total}")
            note = " \u00b7 ".join(x for x in (text.get("footer_note", ""), f"Generated {generated}") if x)
            self.drawRightString(PAGE_W - MARGIN, 10 * mm - 9, note if unicode_ok else note.replace("\u00b7", "-"))
            self.restoreState()

    story = [Spacer(1, BAND_H - MARGIN + 6 * mm), _headline(content, st, c, width), Spacer(1, 10)]
    k = _kpis(content.get("kpis"), st, c, width, unicode_ok)
    if k:
        story += [k, Spacer(1, 4)]
    with tempfile.TemporaryDirectory() as tmpdir:
        for sec in content.get("sections", []):
            block = [Paragraph(_esc(sec.get("heading", "")), st["h2"])]
            if sec.get("chart"):
                block.append(_image(os.path.join(content["_base"], sec["chart"]), width, compress, tmpdir))
                if sec.get("caption"):
                    block.append(Paragraph(_esc(sec["caption"]), st["caption"]))
            story.append(KeepTogether(block))
            b = _bullets(sec.get("bullets"), st, c)
            if b:
                story.append(b)
            if sec.get("table"):
                tb = _table(sec["table"], st, c, width)
                if tb:
                    story += [Spacer(1, 6), tb]
        if content.get("recommendations"):
            story.append(KeepTogether([Paragraph("Recommendations", st["h2"]),
                                       _bullets(content["recommendations"], st, c, numbered=True)]))
        story.append(KeepTogether(_data_notes(content["data_notes"], st)))

        doc = SimpleDocTemplate(out_path, pagesize=A4, leftMargin=MARGIN, rightMargin=MARGIN,
                                topMargin=MARGIN, bottomMargin=20 * mm, title=content["title"],
                                author=brand.get("name", ""), subject=content.get("subtitle", ""),
                                creator=brand.get("name", ""))
        doc.build(story, onFirstPage=first_page, onLaterPages=later_page, canvasmaker=NumberedCanvas)
    pages = getattr(NumberedCanvas, "total_pages", None)
    size_kb = os.path.getsize(out_path) / 1024
    print(f"Wrote {out_path} ({pages} page(s), {size_kb:.0f} KB, font: {font})")
    return {"path": out_path, "pages": pages, "size_kb": round(size_kb, 1)}


def main():
    ap = argparse.ArgumentParser(description="Render the report content JSON to a branded PDF (reportlab).")
    ap.add_argument("content_json")
    ap.add_argument("output_pdf")
    ap.add_argument("--tokens", help="Path to style-tokens.json (auto-located if omitted).")
    ap.add_argument("--no-compress", action="store_true", help="Embed chart PNGs as-is (bigger PDF).")
    a = ap.parse_args()
    result = build(a.content_json, a.output_pdf, a.tokens, compress=not a.no_compress)
    with open(os.path.splitext(a.output_pdf)[0] + ".render.json", "w", encoding="utf-8") as f:
        json.dump(result, f)


if __name__ == "__main__":
    main()
