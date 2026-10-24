#!/usr/bin/env python3
"""Render a truck-driver loading-dock assignment as a one-page PDF."""

import argparse
from pathlib import Path
import sys


ACCENT = "#6b2fb5"
LIGHT_ACCENT = "#f3eefb"


def _escape(value):
    return (
        str(value)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )


def _required_text(value, flag):
    cleaned = value.strip()
    if not cleaned:
        raise ValueError(f"{flag} must not be empty")
    return cleaned


def _optional_text(value):
    if value is None:
        return None
    cleaned = value.strip()
    return cleaned or None


def _validate_driver_facing_text(details):
    for field, value in details.items():
        if field == "shipment_reference" or value is None:
            continue
        if "ready_for_pickup" in value:
            raise ValueError(
                f"--{field.replace('_', '-')} must not contain "
                "ready_for_pickup"
            )


def build_pdf(details, output):
    from reportlab.lib import colors
    from reportlab.lib.enums import TA_CENTER
    from reportlab.lib.pagesizes import LETTER
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.lib.units import inch
    from reportlab.graphics.barcode import code128
    from reportlab.platypus import (
        HRFlowable,
        KeepInFrame,
        Paragraph,
        SimpleDocTemplate,
        Spacer,
        Table,
        TableStyle,
    )

    styles = getSampleStyleSheet()
    title = ParagraphStyle(
        "DockTitle",
        parent=styles["Title"],
        fontSize=16,
        leading=18,
        textColor=colors.HexColor(ACCENT),
        spaceAfter=2,
    )
    subtitle = ParagraphStyle(
        "DockSubtitle",
        parent=styles["BodyText"],
        fontSize=8,
        leading=9,
        textColor=colors.HexColor("#555555"),
        spaceAfter=5,
    )
    heading = ParagraphStyle(
        "Section",
        parent=styles["Heading2"],
        fontName="Helvetica-Bold",
        fontSize=9,
        leading=10,
        textColor=colors.HexColor(ACCENT),
        spaceBefore=4,
        spaceAfter=1,
    )
    body = ParagraphStyle(
        "DockBody",
        parent=styles["BodyText"],
        fontSize=8,
        leading=9.5,
    )
    barcode_text = ParagraphStyle(
        "BarcodeText",
        parent=body,
        fontName="Helvetica",
        fontSize=8,
        leading=9,
        alignment=TA_CENTER,
    )
    doc = SimpleDocTemplate(
        output,
        pagesize=LETTER,
        leftMargin=0.45 * inch,
        rightMargin=0.45 * inch,
        topMargin=0.4 * inch,
        bottomMargin=0.4 * inch,
    )
    flow = [
        Paragraph("WanDelay Loading Bay Pickup", title),
        Paragraph("Truck loading-dock assignment pass", subtitle),
        HRFlowable(width="100%", color=colors.HexColor(ACCENT)),
        Spacer(1, 4),
    ]

    shipment_barcode = code128.Code128(
        details["shipment_reference"],
        barHeight=0.28 * inch,
        barWidth=0.01 * inch,
        humanReadable=False,
    )
    shipment_barcode.hAlign = "CENTER"
    barcode_block = Table(
        [
            [shipment_barcode],
            [Paragraph(_escape(details["shipment_reference"]), barcode_text)],
        ],
        colWidths=[3.85 * inch],
        rowHeights=[0.3 * inch, 0.14 * inch],
    )
    barcode_block.setStyle(
        TableStyle(
            [
                ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                ("TOPPADDING", (0, 0), (-1, -1), 0),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
            ]
        )
    )

    header = Table(
        [
            [
                Paragraph(
                    f"<b>Shipment reference</b><br/>"
                    f"{_escape(details['shipment_reference'])}",
                    body,
                ),
                barcode_block,
            ]
        ],
        colWidths=[3.0 * inch, 4.0 * inch],
        rowHeights=[0.58 * inch],
    )
    header.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor(LIGHT_ACCENT)),
                ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor(ACCENT)),
                ("INNERGRID", (0, 0), (-1, -1), 0.25, colors.white),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ]
        )
    )
    flow.extend([header, Spacer(1, 4)])

    section_labels = (
        ("plan", "Plan"),
        ("weather", "Weather"),
        ("assignment", "Assignment"),
        ("why", "Why"),
        ("queue", "Queue"),
        ("eta", "ETA"),
        ("priority_pass", "Priority Pass"),
    )
    sections = []
    for field, label in section_labels:
        value = details.get(field)
        if value:
            sections.extend(
                [
                    Paragraph(f"<b>{label}</b>", heading),
                    Paragraph(_escape(value), body),
                ]
            )

    sections.extend(
        [
            Spacer(1, 5),
            HRFlowable(width="100%", color=colors.HexColor(ACCENT)),
            Spacer(1, 3),
            Paragraph(
                "<b>Current assignment:</b> This is not a reservation or "
                "guarantee. Follow yard instructions and have your shipment "
                "reference ready.",
                body,
            ),
        ]
    )
    flow.append(
        KeepInFrame(
            7.55 * inch,
            8.65 * inch,
            sections,
            mode="shrink",
            mergeSpace=True,
        )
    )
    doc.build(flow)


def main(argv):
    parser = argparse.ArgumentParser(
        description="Render a WanDelay loading-dock assignment pass PDF."
    )
    parser.add_argument("--shipment-reference", required=True)
    parser.add_argument("--plan", required=True)
    parser.add_argument("--weather", required=True)
    parser.add_argument("--assignment", required=True)
    parser.add_argument("--why", required=True)
    parser.add_argument("--queue", required=True)
    parser.add_argument("--eta")
    parser.add_argument("--priority-pass")
    parser.add_argument("--out", required=True)
    args = parser.parse_args(argv[1:])

    try:
        details = {
            "shipment_reference": _required_text(
                args.shipment_reference, "--shipment-reference"
            ),
            "plan": _required_text(args.plan, "--plan"),
            "weather": _required_text(args.weather, "--weather"),
            "assignment": _required_text(
                args.assignment, "--assignment"
            ),
            "why": _required_text(args.why, "--why"),
            "queue": _required_text(args.queue, "--queue"),
            "eta": _optional_text(args.eta),
            "priority_pass": _optional_text(args.priority_pass),
        }
        _validate_driver_facing_text(details)
        output = _required_text(args.out, "--out")
    except ValueError as exc:
        parser.error(str(exc))

    try:
        build_pdf(details, output)
    except ImportError:
        print("Error: reportlab is required to render the dock-assignment PDF.")
        return 1
    except OSError as exc:
        print(f"Error: could not write PDF ({exc}).")
        return 1

    if not Path(output).is_file():
        print("Error: PDF output was not created.")
        return 1
    print(f"WROTE {output}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
