// @ts-nocheck -- This source is compiled by the Power Apps runtime, not the gallery build.
import React, { useEffect, useState, useMemo } from "react";
import {
  Button,
  Dialog,
  DialogSurface,
  DialogBody,
  TabList,
  Tab,
  Text,
  Input,
  Dropdown,
  Option,
  makeStyles,
  mergeClasses,
  tokens,
} from "@fluentui/react-components";
import { SearchRegular } from "@fluentui/react-icons";
import type {
  GeneratedComponentProps,
  ReadableTableRow,
  QueryTableOptions,
  cat_agentintakerequest,
} from "./RuntimeTypes";

// Localization setup
const langMap: Record<number, { code: string; name: string; isRtl: boolean }> = {
  1033: { code: "en-US", name: "English (United States)", isRtl: false },
};
const translations: Record<string, Record<string, string>> = {
  "en-US": {
    dashboardTitle: "Agent CoE Dashboard",
    dashboardSubtitle: "Intake triage console",
    awaitingTriage: "Awaiting Triage",
    totalTrackedAgents: "Total Tracked Agents",
    awaitingTriageTile: "Awaiting Triage",
    inCoETriage: "In CoE Triage",
    trackedSelfBuild: "Tracked, self-build",
    zone: "Zone",
    status: "Status",
    supportRoute: "Support Route",
    buildRate: "Build Rate",
    searchPlaceholder: "Search by agent name or requester...",
    filterStatus: "Status",
    filterZone: "Zone",
    requestsSection: "Requests",
    openFullRecord: "Open full record",
    backToRequests: "Back to requests",
    approvalStatus: "Approval status",
    buildStatusLabel: "Build status",
    saveStatusChanges: "Save status changes",
    approvalHelper: "Approval records the CoE decision. Leave Build status as Not started until an actual build begins.",
    summaryTab: "Summary",
    decisionTab: "Decision and delivery",
    evidenceTab: "Evidence and context",
    requestId: "Request ID",
    agentName: "Agent name",
    problemStatement: "Problem statement",
    requestedOutcome: "Requested outcome",
    requester: "Requester",
    businessArea: "Business area",
    sponsorRole: "Sponsor role",
    targetUsers: "Target users",
    expectedUsers: "Expected users",
    timeline: "Timeline",
    requestType: "Request type",
    governanceZone: "Governance zone",
    supportRouteLabel: "Support route",
    selfBuildOfferedLabel: "Self build offered",
    proposedNextActions: "Proposed next actions",
    agentsOffered: "Agents offered",
    dataSources: "Data sources",
    description: "Description",
    triageNotes: "Triage notes",
    yes: "Yes",
    no: "No",
    notStarted: "Not started",
    close: "Close",
    // Pills
    zoneGreen: "Green 🟢",
    zoneYellow: "Yellow 🟡",
    zoneRed: "Red 🔴",
    statusNew: "New",
    statusInReview: "In Review",
    statusApproved: "Approved",
    statusRejected: "Rejected",
    statusTracked: "Tracked",
    supportrouteSelfBuild: "Self-build",
    supportrouteCoE: "CoE support",
    buildDiscovery: "Discovery",
    buildBuild: "Build",
    buildTest: "Test",
    buildDeploy: "Deploy",
    loading: "Loading...",
    noRequests: "No requests found.",
  },
};

// Styling
const useStyles = makeStyles({
  root: {
    height: "100%",
    overflowY: "auto",
    overflowX: "hidden",
    width: "100%",
    background: "linear-gradient(90deg, #F6F7F9 0%, #E9F0FA 100%)",
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    alignItems: "stretch",
    fontFamily: tokens.fontFamilyBase,
  },
  headerBand: {
    width: "100%",
    background: "linear-gradient(90deg, #E9F0FA 0%, #F6F7F9 100%)",
    padding: "32px 0 24px 0",
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    borderBottom: `1px solid ${tokens.colorNeutralStroke3}`,
    position: "relative",
  },
  headerContent: {
    width: "100%",
    maxWidth: "1200px",
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0 32px",
    boxSizing: "border-box",
  },
  headerTitleBlock: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
  },
  headerTitle: {
    fontSize: "22px",
    fontWeight: 700,
    color: tokens.colorNeutralForeground1,
    marginBottom: "2px",
    letterSpacing: "0.01em",
  },
  headerSubtitle: {
    fontSize: "14px",
    fontWeight: 500,
    color: tokens.colorNeutralForeground3,
    marginTop: "0",
    marginBottom: "0",
    letterSpacing: "0.01em",
  },
  headerPill: {
    fontSize: "13px",
    fontWeight: 600,
    background: "#E1E7EF",
    color: "#0F6CBD",
    borderRadius: "18px",
    padding: "6px 18px",
    minWidth: "0",
    border: "none",
    boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
    display: "inline-block",
    textAlign: "center",
    marginLeft: "auto",
    marginRight: "0",
    cursor: "default",
  },
  kpiRow: {
    width: "100%",
    maxWidth: "1200px",
    display: "flex",
    flexDirection: "row",
    gap: "24px",
    margin: "0 auto",
    marginTop: "18px",
    marginBottom: "18px",
    padding: "0 32px",
    boxSizing: "border-box",
    justifyContent: "flex-start",
    flexWrap: "wrap",
  },
  kpiTile: {
    flex: "1 1 0",
    minWidth: "180px",
    background: "#fff",
    borderRadius: "14px",
    boxShadow: "0 2px 8px 0 rgba(0,0,0,0.07)",
    padding: "18px 22px",
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    cursor: "pointer",
    transition: "box-shadow 0.15s, border 0.15s",
    border: `2px solid transparent`,
    outline: "none",
    fontSize: "13px",
    fontWeight: 600,
    color: tokens.colorNeutralForeground1,
    marginBottom: "0",
    marginTop: "0",
    ":hover": {
      boxShadow: "0 4px 16px 0 rgba(0,0,0,0.10)",
      border: `2px solid #0F6CBD`,
    },
    ":focus-visible": {
      border: `2px solid #0F6CBD`,
      boxShadow: "0 4px 16px 0 rgba(0,0,0,0.12)",
    },
  },
  kpiTileSelected: {
    border: `2px solid #0F6CBD`,
    boxShadow: "0 4px 16px 0 rgba(0,0,0,0.12)",
    background: "#F6F7F9",
  },
  kpiTileLabel: {
    fontSize: "13px",
    fontWeight: 600,
    color: tokens.colorNeutralForeground2,
    marginBottom: "6px",
    letterSpacing: "0.01em",
  },
  kpiTileValue: {
    fontSize: "22px",
    fontWeight: 700,
    color: tokens.colorBrandForeground1,
    marginTop: "0",
    marginBottom: "0",
    letterSpacing: "0.01em",
  },
  analyticsSection: {
    width: "100%",
    maxWidth: "1200px",
    margin: "0 auto",
    marginBottom: "28px",
    padding: "0 32px",
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "row",
    gap: "24px",
    flexWrap: "wrap",
  },
  analyticsCard: {
    flex: "1 1 0",
    minWidth: "220px",
    background: "#fff",
    borderRadius: "14px",
    boxShadow: "0 2px 8px 0 rgba(0,0,0,0.07)",
    padding: "18px 18px 14px 18px",
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    fontSize: "13px",
    fontWeight: 500,
    color: tokens.colorNeutralForeground1,
    minHeight: "140px",
    boxSizing: "border-box",
  },
  analyticsTitle: {
    fontSize: "13px",
    fontWeight: 700,
    color: tokens.colorNeutralForeground2,
    marginBottom: "8px",
    letterSpacing: "0.01em",
  },
  analyticsChartRow: {
    width: "100%",
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    gap: "16px",
    marginBottom: "8px",
  },
  analyticsLegend: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    marginTop: "8px",
    fontSize: "12px",
    color: tokens.colorNeutralForeground3,
  },
  analyticsLegendRow: {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    gap: "8px",
    fontSize: "12px",
    color: tokens.colorNeutralForeground3,
  },
  analyticsLegendSwatch: {
    width: "14px",
    height: "14px",
    borderRadius: "7px",
    marginRight: "6px",
    display: "inline-block",
    background: "#0F6CBD",
    border: "1px solid #E1E7EF",
  },
  analyticsBarChart: {
    width: "100%",
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    marginTop: "0",
  },
  analyticsBarLabelRow: {
    display: "flex",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    fontSize: "12px",
    fontWeight: 600,
    color: tokens.colorNeutralForeground2,
    marginBottom: "2px",
    minWidth: 0,
    width: "100%",
  },
  analyticsBarLabel: {
    flex: 1,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontWeight: 600,
    color: tokens.colorNeutralForeground2,
    fontSize: "12px",
  },
  analyticsBarValue: {
    fontWeight: 700,
    color: tokens.colorNeutralForeground2,
    fontSize: "12px",
    marginLeft: "8px",
    marginRight: "0",
    textAlign: "right",
    minWidth: "28px",
  },
  analyticsBar: {
    width: "100%",
    height: "12px",
    borderRadius: "6px",
    background: "#E1E7EF",
    position: "relative",
    overflow: "hidden",
    marginBottom: "0",
  },
  analyticsBarFill: {
    height: "12px",
    borderRadius: "6px",
    position: "absolute",
    left: 0,
    top: 0,
    transition: "width 0.3s",
  },
  requestsSection: {
    width: "100%",
    maxWidth: "1200px",
    margin: "0 auto",
    marginBottom: "0",
    padding: "0 32px",
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    alignItems: "stretch",
  },
  requestsHeader: {
    fontSize: "16px",
    fontWeight: 700,
    color: tokens.colorNeutralForeground1,
    marginBottom: "12px",
    marginTop: "28px",
    letterSpacing: "0.01em",
  },
  filterToolbar: {
    display: "flex",
    flexDirection: "row",
    gap: "16px",
    marginBottom: "18px",
    alignItems: "center",
    flexWrap: "wrap",
  },
  searchBox: {
    minWidth: "220px",
    fontSize: "13px",
    borderRadius: "8px",
    background: "#fff",
    border: `1px solid ${tokens.colorNeutralStroke3}`,
    padding: "6px 12px",
    boxSizing: "border-box",
    color: tokens.colorNeutralForeground1,
    fontWeight: 500,
  },
  dropdown: {
    minWidth: "140px",
    fontSize: "13px",
    borderRadius: "8px",
    background: "#fff",
    border: `1px solid ${tokens.colorNeutralStroke3}`,
    padding: "6px 12px",
    boxSizing: "border-box",
    color: tokens.colorNeutralForeground1,
    fontWeight: 500,
  },
  cardGallery: {
    display: "flex",
    flexWrap: "wrap",
    gap: "24px",
    width: "100%",
    minHeight: "120px",
    marginBottom: "32px",
  },
  requestCard: {
    flex: "1 1 0",
    minWidth: "320px",
    maxWidth: "380px",
    background: "#fff",
    borderRadius: "14px",
    boxShadow: "0 2px 8px 0 rgba(0,0,0,0.07)",
    padding: "18px 18px 14px 18px",
    display: "flex",
    flexDirection: "column",
    alignItems: "stretch",
    fontSize: "13px",
    fontWeight: 500,
    color: tokens.colorNeutralForeground1,
    marginBottom: "0",
    cursor: "pointer",
    transition: "box-shadow 0.15s, border 0.15s",
    border: `2px solid transparent`,
    outline: "none",
    ":hover": {
      boxShadow: "0 4px 16px 0 rgba(0,0,0,0.10)",
      border: `2px solid #0F6CBD`,
    },
    ":focus-visible": {
      border: `2px solid #0F6CBD`,
      boxShadow: "0 4px 16px 0 rgba(0,0,0,0.12)",
    },
  },
  cardId: {
    fontSize: "12px",
    fontWeight: 600,
    color: "#0F6CBD",
    marginBottom: "6px",
    letterSpacing: "0.01em",
  },
  cardTitle: {
    fontSize: "15px",
    fontWeight: 700,
    color: tokens.colorNeutralForeground1,
    marginBottom: "6px",
    letterSpacing: "0.01em",
    overflowWrap: "anywhere",
  },
  cardSubtitle: {
    fontSize: "12px",
    fontWeight: 500,
    color: tokens.colorNeutralForeground3,
    marginBottom: "10px",
    letterSpacing: "0.01em",
    overflowWrap: "anywhere",
  },
  cardPillsRow: {
    display: "flex",
    flexDirection: "row",
    gap: "8px",
    marginTop: "0",
    marginBottom: "0",
  },
  pill: {
    fontSize: "12px",
    fontWeight: 600,
    borderRadius: "18px",
    padding: "4px 12px",
    minWidth: "0",
    border: "none",
    boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
    display: "inline-block",
    textAlign: "center",
    background: "#E1E7EF",
    color: "#0F6CBD",
    letterSpacing: "0.01em",
    verticalAlign: "middle",
    position: "relative",
  },
  pillZoneGreen: { background: "#DFF6E3", color: "#2E7D32" },
  pillZoneYellow: { background: "#FFF9E1", color: "#F2B01E" },
  pillZoneRed: { background: "#FDE4E4", color: "#D13438" },
  pillDot: {
    display: "inline-block",
    width: "8px",
    height: "8px",
    borderRadius: "4px",
    marginRight: "6px",
    verticalAlign: "middle",
    background: "#0F6CBD",
  },
  pillDotGreen: { background: "#2E7D32" },
  pillDotYellow: { background: "#F2B01E" },
  pillDotRed: { background: "#D13438" },
  pillStatusNew: { background: "#E1E7EF", color: "#0F6CBD" },
  pillStatusInReview: { background: "#E1E7EF", color: "#7B2FF2" },
  pillStatusApproved: { background: "#E1E7EF", color: "#43A047" },
  pillStatusRejected: { background: "#E1E7EF", color: "#D13438" },
  pillStatusTracked: { background: "#E1E7EF", color: "#009688" },
  pillSupportSelfBuild: { background: "#E1E7EF", color: "#0F6CBD" },
  pillSupportCoE: { background: "#E1E7EF", color: "#43A047" },
  dialogSurface: {
    width: "min(700px, calc(100vw - 48px))",
    maxWidth: "calc(100vw - 48px)",
    maxHeight: "90vh",
    padding: "0",
    boxSizing: "border-box",
    position: "relative",
    background: "#fff",
    borderRadius: "14px",
    overflow: "visible",
    fontSize: "13px",
  },
  dialogBody: {
    display: "flex",
    flexDirection: "column",
    gap: "0",
    minHeight: 0,
    maxHeight: "calc(90vh - 48px)",
    padding: "0",
    fontSize: "13px",
    background: "#fff",
    borderRadius: "14px",
    boxSizing: "border-box",
    position: "relative",
  },
  detailsHeader: {
    display: "flex",
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    margin: "0 0 8px 0",
    padding: "24px 24px 0 24px",
    gap: "8px",
    minWidth: 0,
  },
  detailsHeaderTitleBlock: {
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
    flex: 1,
  },
  detailsHeaderTitle: {
    fontSize: "17px",
    fontWeight: 700,
    color: tokens.colorNeutralForeground1,
    marginBottom: "2px",
    lineHeight: 1.2,
    overflowWrap: "anywhere",
    minWidth: 0,
  },
  detailsHeaderMuted: {
    fontSize: "12px",
    color: tokens.colorNeutralForeground3,
    fontWeight: 500,
    marginTop: "0",
    marginBottom: "0",
    letterSpacing: "0.01em",
    lineHeight: 1.2,
    minWidth: 0,
    overflowWrap: "anywhere",
  },
  detailsCloseBtn: {
    fontSize: "13px",
    color: "#616161",
    background: "transparent",
    padding: "4px 10px",
    border: "none",
    borderRadius: "6px",
    cursor: "pointer",
    transition: "background 0.15s",
    minWidth: 0,
    minHeight: 0,
    alignSelf: "flex-start",
    ":hover": { background: "#F3F4F8" },
    ":focus-visible": { outline: "2px solid #0F6CBD", outlineOffset: "2px" },
  },
  detailsStatusPanel: {
    background: "#F3F4F8",
    border: `1px solid #E1E7EF`,
    borderRadius: "10px",
    padding: "14px 16px 10px 16px",
    margin: "12px 24px 0 24px",
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    gap: "12px",
    minWidth: 0,
    flexWrap: "wrap",
  },
  detailsStatusDropdown: {
    minWidth: "180px",
    fontSize: "13px",
  },
  detailsStatusSaveBtn: {
    minWidth: "140px",
    height: "32px",
    fontSize: "13px",
    borderRadius: "7px",
    marginLeft: "20px",
    fontWeight: 600,
    background: "#0F6CBD",
    color: "#fff",
    border: "none",
    boxShadow: "none",
    transition: "background 0.15s",
    cursor: "pointer",
    textTransform: "none",
    letterSpacing: "0.01em",
    textAlign: "center",
    lineHeight: "1.2",
    userSelect: "none",
    display: "inline-block",
    verticalAlign: "middle",
    whiteSpace: "nowrap",
    textDecoration: "none",
    boxSizing: "border-box",
    minHeight: "0",
    minWidth: "0",
    maxWidth: "100%",
    maxHeight: "100%",
    overflow: "hidden",
    textOverflow: "ellipsis",
    ":disabled": {
      background: "#E1E7EF",
      color: "#A0A4B8",
      cursor: "not-allowed",
    },
    ":hover:not(:disabled)": { background: "#115EA3" },
    ":active:not(:disabled)": { background: "#0B4B7C" },
    ":focus-visible": { outline: "2px solid #0F6CBD", outlineOffset: "2px" },
  },
  detailsStatusHelper: {
    fontSize: "11px",
    color: "#A0A4B8",
    margin: "7px 24px 0 24px",
    fontWeight: 500,
    letterSpacing: "0.01em",
  },
  detailsTabList: {
    background: "#F6F7F9",
    borderRadius: "8px",
    margin: "18px 0 0 0",
    padding: "0 24px",
    display: "flex",
    flexDirection: "row",
    gap: "2px",
    minHeight: "32px",
    fontSize: "13px",
    fontWeight: 600,
    border: "none",
  },
  detailsTabPanel: {
    padding: "18px 24px 24px 24px",
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    minHeight: 0,
    fontSize: "13px",
  },
  detailsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: "18px",
    minWidth: 0,
    width: "100%",
    "@media (max-width: 600px)": { gridTemplateColumns: "minmax(0, 1fr)" },
  },
  detailsGridLabel: {
    fontSize: "11px",
    color: "#A0A4B8",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    marginBottom: "2px",
    marginTop: "0",
    lineHeight: 1.2,
  },
  detailsGridValue: {
    fontSize: "13px",
    color: tokens.colorNeutralForeground1,
    fontWeight: 500,
    marginBottom: "6px",
    marginTop: "0",
    lineHeight: "1.35",
    whiteSpace: "pre-line",
    overflowWrap: "anywhere",
  },
  detailsFooter: {
    position: "sticky",
    bottom: 0,
    right: 0,
    background: "transparent",
    display: "flex",
    flexDirection: "row",
    gap: "12px",
    justifyContent: "flex-end",
    alignItems: "center",
    padding: "16px 24px 16px 24px",
    zIndex: 2,
    borderTop: `1px solid #E1E7EF`,
    marginTop: "0",
    minWidth: 0,
  },
});

// Utility: Map zone label with emoji to plain text (for charts only)
function mapZoneLabelToPlain(zone: string): string {
  if (zone.startsWith("Green")) return "Green";
  if (zone.startsWith("Yellow")) return "Yellow";
  if (zone.startsWith("Red")) return "Red";
  return zone.replace(/[^\p{L}\p{N}\s]/gu, "").trim();
}

// Donut chart palettes
const zoneDonutPalette: Record<string, string> = {
  Green: "#2E7D32",
  Yellow: "#F2B01E",
  Red: "#D13438",
};
const supportRouteDonutPalette: Record<string, string> = {
  "Self-build": "#0F6CBD",
  "CoE support": "#43A047",
};
const statusBarPalette = [
  "#0F6CBD", // New
  "#7B2FF2", // In Review
  "#43A047", // Approved
  "#D13438", // Rejected
  "#009688", // Tracked
];
const statusBarPaletteByCategory: Record<string, string> = {
  "New": "#0F6CBD",
  "In Review": "#B77900",
  "Approved": "#2E7D32",
  "Rejected": "#C62828",
  "Tracked": "#008577",
};
const buildBarPaletteByCategory: Record<string, string> = {
  "Not started": "#7A8190",
  "Discovery": "#0F6CBD",
  "Build": "#7B2FF2",
  "Test": "#B77900",
  "Deploy": "#2E7D32",
};

// Donut Chart Rendering
function DonutChart({
  data,
  palette,
  size = 54,
  strokeWidth = 11,
  legendRows,
  ariaLabel,
  styles,
}: {
  data: { category: string; value: number }[];
  palette: Record<string, string>;
  size?: number;
  strokeWidth?: number;
  legendRows?: { label: string; value: number; color: string }[];
  ariaLabel?: string;
  styles: Record<string, string>;
}) {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  const radius = size / 2;
  const innerRadius = radius - strokeWidth;
  let acc = 0;
  const arcs = data.map((d, i) => {
    const startAngle = (acc / total) * 2 * Math.PI;
    acc += d.value;
    const endAngle = (acc / total) * 2 * Math.PI;
    return {
      ...d,
      startAngle,
      endAngle,
      color: palette[d.category] || statusBarPalette[i % statusBarPalette.length],
    };
  });

  function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
    const start = polarToCartesian(cx, cy, r, endAngle);
    const end = polarToCartesian(cx, cy, r, startAngle);
    const largeArcFlag = endAngle - startAngle > Math.PI ? 1 : 0;
    return [
      "M", start.x, start.y,
      "A", r, r, 0, largeArcFlag, 0, end.x, end.y
    ].join(" ");
  }
  function polarToCartesian(cx: number, cy: number, r: number, angle: number) {
    return {
      x: cx + r * Math.cos(angle - Math.PI / 2),
      y: cy + r * Math.sin(angle - Math.PI / 2),
    };
  }

  return (
    <div>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        aria-label={ariaLabel}
        role="img"
      >
        <circle
          cx={radius}
          cy={radius}
          r={innerRadius + strokeWidth / 2}
          fill="none"
          stroke="#F3F4F8"
          strokeWidth={strokeWidth}
        />
        {arcs.map((arc, i) => {
          const path = describeArc(
            radius,
            radius,
            innerRadius + strokeWidth / 2,
            arc.startAngle,
            arc.endAngle
          );
          return (
            <path
              key={arc.category}
              d={path}
              fill="none"
              stroke={arc.color}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              aria-label={`${arc.category}: ${arc.value}`}
            />
          );
        })}
        <text
          x={radius}
          y={radius}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize="13"
          fontWeight="bold"
          fill="#22223B"
        >
          {total}
        </text>
      </svg>
      <div>
        {(legendRows || arcs).map((row, i) => (
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "12px", marginTop: 2 }} key={row.category || row.label}>
            <span
              style={{
                width: 14,
                height: 14,
                borderRadius: 7,
                background: row.color || palette[row.category] || statusBarPalette[i % statusBarPalette.length],
                display: "inline-block",
                marginRight: 6,
                border: "1px solid #E1E7EF",
              }}
              aria-label={`${row.category || row.label} color`}
            />
            <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {row.category || row.label}
            </span>
            <span style={{ color: "#616161", fontWeight: 600, marginLeft: 4 }}>{row.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Main Component
const GeneratedComponent = ({ dataApi }: GeneratedComponentProps) => {
  // Localization
  const language = useMemo(() => {
    const uiLanguageId =
      (typeof Xrm !== "undefined" &&
        Xrm.Utility?.getGlobalContext()?.userSettings?.languageId) ||
      1033;
    return langMap[uiLanguageId]?.code || "en-US";
  }, []);
  const t = (key: string) =>
    translations[language]?.[key] || translations["en-US"]?.[key] || key;
  const isRTL = useMemo(() => {
    const uiLanguageId =
      (typeof Xrm !== "undefined" &&
        Xrm.Utility?.getGlobalContext()?.userSettings?.languageId) ||
      1033;
    return langMap[uiLanguageId]?.isRtl || false;
  }, []);

  // State
  const styles = useStyles();
  const [requests, setRequests] = useState<ReadableTableRow<cat_agentintakerequest>[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [requestDetailTab, setRequestDetailTab] = useState("summary");
  useEffect(() => { setRequestDetailTab("summary"); }, [selectedCardId]);
  const [searchText, setSearchText] = useState("");
  const [filterStatus, setFilterStatus] = useState<string | null>(null);
  const [filterZone, setFilterZone] = useState<string | null>(null);
  const [statusUpdateLoading, setStatusUpdateLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [statusError, setStatusError] = useState("");
  const approvalOptions = [
    { value: 100000000, label: "New" },
    { value: 100000002, label: "In Review" },
    { value: 100000003, label: "Approved" },
    { value: 100000004, label: "Rejected" },
    { value: 100000001, label: "Tracked" },
  ];
  const buildOptions = [
    { value: null, label: t("notStarted") },
    { value: 100000000, label: "Discovery" },
    { value: 100000001, label: "Build" },
    { value: 100000002, label: "Test" },
    { value: 100000003, label: "Deploy" },
  ];
  const [activeKpiFilter, setActiveKpiFilter] = useState<
    "total" | "awaitingTriage" | "inCoETriage" | "trackedSelfBuild"
  >("total");

  // Restore selectedRequest
  const selectedRequest = useMemo(() => {
    if (!selectedCardId) return null;
    return requests.find(r => r.cat_agentintakerequestid === selectedCardId) || null;
  }, [selectedCardId, requests]);

  // Status Panel State
  const [approvalStatus, setApprovalStatus] = useState<number | null>(null);
  const [buildStatus, setBuildStatus] = useState<number | null>(null);
  const [originalApprovalStatus, setOriginalApprovalStatus] = useState<number | null>(null);
  const [originalBuildStatus, setOriginalBuildStatus] = useState<number | null>(null);

  // When selectedRequest changes, reset dropdowns to current values
  useEffect(() => {
    if (selectedRequest) {
      setApprovalStatus(selectedRequest.cat_status ?? null);
      setBuildStatus(selectedRequest.cat_buildstatus ?? null);
      setOriginalApprovalStatus(selectedRequest.cat_status ?? null);
      setOriginalBuildStatus(selectedRequest.cat_buildstatus ?? null);
      setStatusMessage("");
      setStatusError("");
    }
  }, [selectedRequest]);

  // Save Status Changes
  const statusChanged =
    (approvalStatus !== originalApprovalStatus) ||
    (buildStatus !== originalBuildStatus);

  const handleSaveStatus = async () => {
    if (!selectedRequest) return;
    setStatusUpdateLoading(true);
    setStatusMessage("");
    setStatusError("");
    try {
      if (typeof Xrm !== "undefined" && Xrm.WebApi && Xrm.WebApi.updateRecord) {
        await Xrm.WebApi.updateRecord("cat_agentintakerequest", selectedRequest.cat_agentintakerequestid, {
          cat_status: approvalStatus,
          cat_buildstatus: buildStatus,
        });
      } else {
        await dataApi.updateRow("cat_agentintakerequest", selectedRequest.cat_agentintakerequestid, {
          cat_status: approvalStatus,
          cat_buildstatus: buildStatus,
        });
      }
      setOriginalApprovalStatus(approvalStatus);
      setOriginalBuildStatus(buildStatus);
      setStatusMessage("Status updated.");
      // Refresh the requests list to reflect changes
      const query: QueryTableOptions<cat_agentintakerequest> = {
        select: [
          "cat_agentintakerequestid",
          "cat_requestid",
          "cat_agentname",
          "cat_businessproblem",
          "cat_requestedoutcome",
          "cat_proposedsolution",
          "cat_description",
          "cat_requestername",
          "cat_department",
          "cat_sponsorrole",
          "cat_targetusers",
          "cat_expectedusers",
          "cat_timeline",
          "cat_datasources",
          "cat_governancezone",
          "cat_supportroute",
          "cat_requesttype",
          "cat_deflectionreason",
          "cat_agentsoffered",
          "cat_selfbuildoffered",
          "cat_sourceconversation",
          "cat_status",
          "cat_buildstatus",
          "cat_proposednextactions",
          "cat_submittedon",
        ],
        pageSize: 100,
        orderBy: "cat_submittedon desc",
      };
      const result = await dataApi.queryTable("cat_agentintakerequest", query);
      setRequests(result.rows);
    } catch (err) {
      setStatusError("Failed to update status. Please try again.");
    }
    setStatusUpdateLoading(false);
  };

  // Fetch requests
  useEffect(() => {
    setLoading(true);
    const fetchRequests = async () => {
      const query: QueryTableOptions<cat_agentintakerequest> = {
        select: [
          "cat_agentintakerequestid",
          "cat_requestid",
          "cat_agentname",
          "cat_businessproblem",
          "cat_requestedoutcome",
          "cat_proposedsolution",
          "cat_description",
          "cat_requestername",
          "cat_department",
          "cat_sponsorrole",
          "cat_targetusers",
          "cat_expectedusers",
          "cat_timeline",
          "cat_datasources",
          "cat_governancezone",
          "cat_supportroute",
          "cat_requesttype",
          "cat_deflectionreason",
          "cat_agentsoffered",
          "cat_selfbuildoffered",
          "cat_sourceconversation",
          "cat_status",
          "cat_buildstatus",
          "cat_proposednextactions",
          "cat_submittedon",
        ],
        pageSize: 100,
        orderBy: "cat_submittedon desc",
      };
      const result = await dataApi.queryTable("cat_agentintakerequest", query);
      setRequests(result.rows);
      setLoading(false);
    };
    fetchRequests();
  }, [dataApi]);

  // KPI Calculations (FIXED LOGIC)
  const kpiTotal = requests.length;
  const kpiAwaitingTriage = requests.filter(
    (r) => r.cat_status === 100000000
  ).length;
  const kpiTrackedSelfBuild = requests.filter(
    (r) => r.cat_status === 100000001
  ).length;
  const kpiInCoETriage = kpiTotal - kpiAwaitingTriage - kpiTrackedSelfBuild;

  // KPI Filter Logic (FIXED for trackedSelfBuild)
  const applyKpiFilter = (rows: ReadableTableRow<cat_agentintakerequest>[]) => {
    switch (activeKpiFilter) {
      case "awaitingTriage":
        return rows.filter(
          (r) => r["cat_status@OData.Community.Display.V1.FormattedValue"] === "New"
        );
      case "inCoETriage":
        return rows.filter(
          (r) => r.cat_status !== 100000000 && r.cat_status !== 100000001
        );
      case "trackedSelfBuild":
        // FIX: Filter by raw value, matching the KPI count logic
        return rows.filter(
          (r) => r.cat_status === 100000001
        );
      case "total":
      default:
        return rows;
    }
  };

  // Filtering
  const filteredRequests = useMemo(() => {
    let filtered = applyKpiFilter(requests);
    if (searchText.trim()) {
      const s = searchText.trim().toLowerCase();
      filtered = filtered.filter(
        (r) =>
          (r.cat_agentname || "").toLowerCase().includes(s) ||
          (r.cat_requestername || "").toLowerCase().includes(s)
      );
    }
    if (filterStatus) {
      filtered = filtered.filter(
        (r) =>
          r["cat_status@OData.Community.Display.V1.FormattedValue"] === filterStatus
      );
    }
    if (filterZone) {
      filtered = filtered.filter(
        (r) =>
          r["cat_governancezone@OData.Community.Display.V1.FormattedValue"] === filterZone
      );
    }
    return filtered;
  }, [requests, searchText, filterStatus, filterZone, activeKpiFilter]);

  // Chart Data
  const chartZoneData = useMemo(() => {
    const zoneOrder = ["Green", "Yellow", "Red"];
    const zoneCounts: Record<string, number> = {};
    filteredRequests.forEach((r) => {
      const zoneRaw = r["cat_governancezone@OData.Community.Display.V1.FormattedValue"] || "Unknown";
      const zone = mapZoneLabelToPlain(zoneRaw);
      zoneCounts[zone] = (zoneCounts[zone] || 0) + 1;
    });
    return zoneOrder
      .map((zone) => ({
        category: zone,
        value: zoneCounts[zone] || 0,
      }))
      .filter((d) => d.value > 0);
  }, [filteredRequests]);

  const chartStatusData = useMemo(() => {
    const statusOrder = ["New", "In Review", "Approved", "Rejected", "Tracked"];
    const statusCounts: Record<string, number> = {};
    filteredRequests.forEach((r) => {
      const category = r.cat_status === 100000001
        ? "Tracked"
        : r["cat_status@OData.Community.Display.V1.FormattedValue"] || "Unknown";
      statusCounts[category] = (statusCounts[category] || 0) + 1;
    });
    return statusOrder.map((category) => ({
      category,
      value: statusCounts[category] || 0,
    }));
  }, [filteredRequests]);

  const chartSupportrouteData = useMemo(() => {
    const routeOrder = ["Self-build", "CoE support"];
    const routeCounts: Record<string, number> = {};
    filteredRequests.forEach((r) => {
      const route = r["cat_supportroute@OData.Community.Display.V1.FormattedValue"] || "Unknown";
      routeCounts[route] = (routeCounts[route] || 0) + 1;
    });
    return routeOrder
      .map((route) => ({
        category: route,
        value: routeCounts[route] || 0,
      }))
      .filter((d) => d.value > 0);
  }, [filteredRequests]);

  const chartBuildStatusData = useMemo(() => {
    const buildOrder = [
      t("notStarted"),
      "Discovery",
      "Build",
      "Test",
      "Deploy",
    ];
    const buildCounts: Record<string, number> = {};
    filteredRequests.forEach((r) => {
      const build = r["cat_buildstatus@OData.Community.Display.V1.FormattedValue"];
      const key = build || t("notStarted");
      buildCounts[key] = (buildCounts[key] || 0) + 1;
    });
    return buildOrder
      .map((build) => ({
        category: build,
        value: buildCounts[build] || 0,
      }))
      .filter((d) => d.value > 0);
  }, [filteredRequests, t]);

  // Bar Chart Rendering
  function renderBarChart(
    data: { category: string; value: number }[],
    paletteByCategory: Record<string, string>
  ) {
    const max = Math.max(...data.map((d) => d.value), 1);
    return (
      <div className={styles.analyticsBarChart} style={{ width: "100%", minWidth: 0 }}>
        {data.map((d) => (
          <div key={d.category} style={{ width: "100%", minWidth: 0 }}>
            <div className={styles.analyticsBarLabelRow}>
              <span className={styles.analyticsBarLabel}>{d.category}</span>
              <span className={styles.analyticsBarValue}>{d.value}</span>
            </div>
            <div className={styles.analyticsBar}>
              <div
                className={styles.analyticsBarFill}
                style={{
                  width: `${(d.value / max) * 100}%`,
                  background: paletteByCategory[d.category] || "#0F6CBD",
                }}
                aria-label={`${d.category}: ${d.value}`}
              />
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Pill badge rendering
  function renderZonePill(zone: string) {
    let pillClass = styles.pill;
    let dotClass = styles.pillDot;
    if (zone.startsWith("Green")) {
      pillClass = mergeClasses(styles.pill, styles.pillZoneGreen);
      dotClass = mergeClasses(styles.pillDot, styles.pillDotGreen);
    } else if (zone.startsWith("Yellow")) {
      pillClass = mergeClasses(styles.pill, styles.pillZoneYellow);
      dotClass = mergeClasses(styles.pillDot, styles.pillDotYellow);
    } else if (zone.startsWith("Red")) {
      pillClass = mergeClasses(styles.pill, styles.pillZoneRed);
      dotClass = mergeClasses(styles.pillDot, styles.pillDotRed);
    }
    return (
      <span className={pillClass}>
        <span className={dotClass} />
        {zone}
      </span>
    );
  }
  function renderStatusPill(status: string) {
    let pillClass = styles.pill;
    if (status === "New") pillClass = mergeClasses(styles.pill, styles.pillStatusNew);
    else if (status === "In Review") pillClass = mergeClasses(styles.pill, styles.pillStatusInReview);
    else if (status === "Approved") pillClass = mergeClasses(styles.pill, styles.pillStatusApproved);
    else if (status === "Rejected") pillClass = mergeClasses(styles.pill, styles.pillStatusRejected);
    else if (status === "Tracked") pillClass = mergeClasses(styles.pill, styles.pillStatusTracked);
    return <span className={pillClass}>{status}</span>;
  }
  function renderSupportRoutePill(route: string) {
    let pillClass = styles.pill;
    if (route === "Self-build") pillClass = mergeClasses(styles.pill, styles.pillSupportSelfBuild);
    else if (route === "CoE support") pillClass = mergeClasses(styles.pill, styles.pillSupportCoE);
    return <span className={pillClass}>{route}</span>;
  }

  // Header pill button
  const headerPill = (
    <span className={styles.headerPill}>
      {kpiAwaitingTriage} {t("awaitingTriage")}
    </span>
  );

  // Render
  return (
    <div
      dir={isRTL ? "rtl" : "ltr"}
      className={styles.root}
      style={{ direction: isRTL ? "rtl" : "ltr" }}
    >
      {/* Header */}
      <div className={styles.headerBand}>
        <div className={styles.headerContent}>
          <div className={styles.headerTitleBlock}>
            <span className={styles.headerTitle}>{t("dashboardTitle")}</span>
            <span className={styles.headerSubtitle}>{t("dashboardSubtitle")}</span>
          </div>
          {headerPill}
        </div>
      </div>
      {/* KPI Tiles */}
      <div className={styles.kpiRow}>
        <div
          className={mergeClasses(styles.kpiTile, activeKpiFilter === "total" && styles.kpiTileSelected)}
          tabIndex={0}
          role="button"
          aria-label={t("totalTrackedAgents")}
          onClick={() => setActiveKpiFilter("total")}
          onKeyDown={e => { if (e.key === "Enter" || e.key === " ") setActiveKpiFilter("total"); }}
        >
          <span className={styles.kpiTileLabel}>{t("totalTrackedAgents")}</span>
          <span className={styles.kpiTileValue}>{kpiTotal}</span>
        </div>
        <div
          className={mergeClasses(styles.kpiTile, activeKpiFilter === "awaitingTriage" && styles.kpiTileSelected)}
          tabIndex={0}
          role="button"
          aria-label={t("awaitingTriageTile")}
          onClick={() => setActiveKpiFilter("awaitingTriage")}
          onKeyDown={e => { if (e.key === "Enter" || e.key === " ") setActiveKpiFilter("awaitingTriage"); }}
        >
          <span className={styles.kpiTileLabel}>{t("awaitingTriageTile")}</span>
          <span className={styles.kpiTileValue}>{kpiAwaitingTriage}</span>
        </div>
        <div
          className={mergeClasses(styles.kpiTile, activeKpiFilter === "inCoETriage" && styles.kpiTileSelected)}
          tabIndex={0}
          role="button"
          aria-label={t("inCoETriage")}
          onClick={() => setActiveKpiFilter("inCoETriage")}
          onKeyDown={e => { if (e.key === "Enter" || e.key === " ") setActiveKpiFilter("inCoETriage"); }}
        >
          <span className={styles.kpiTileLabel}>{t("inCoETriage")}</span>
          <span className={styles.kpiTileValue}>{kpiInCoETriage}</span>
        </div>
        <div
          className={mergeClasses(styles.kpiTile, activeKpiFilter === "trackedSelfBuild" && styles.kpiTileSelected)}
          tabIndex={0}
          role="button"
          aria-label={t("trackedSelfBuild")}
          onClick={() => setActiveKpiFilter("trackedSelfBuild")}
          onKeyDown={e => { if (e.key === "Enter" || e.key === " ") setActiveKpiFilter("trackedSelfBuild"); }}
        >
          <span className={styles.kpiTileLabel}>{t("trackedSelfBuild")}</span>
          <span className={styles.kpiTileValue}>{kpiTrackedSelfBuild}</span>
        </div>
      </div>
      {/* Agent Analytics Section */}
      <div className={styles.analyticsSection}>
        <div className={styles.analyticsCard}>
          <div className={styles.analyticsTitle}>{t("zone")}</div>
          <div className={styles.analyticsChartRow}>
            <DonutChart
              data={chartZoneData}
              palette={zoneDonutPalette}
              ariaLabel={t("zone")}
              styles={styles}
            />
          </div>
        </div>
        <div className={styles.analyticsCard}>
          <div className={styles.analyticsTitle}>{t("status")}</div>
          <div className={styles.analyticsChartRow}>
            {renderBarChart(chartStatusData, statusBarPaletteByCategory)}
          </div>
        </div>
        <div className={styles.analyticsCard}>
          <div className={styles.analyticsTitle}>{t("supportRoute")}</div>
          <div className={styles.analyticsChartRow}>
            <DonutChart
              data={chartSupportrouteData}
              palette={supportRouteDonutPalette}
              ariaLabel={t("supportRoute")}
              styles={styles}
            />
          </div>
        </div>
        <div className={styles.analyticsCard}>
          <div className={styles.analyticsTitle}>{t("buildRate")}</div>
          <div className={styles.analyticsChartRow}>
            {renderBarChart(chartBuildStatusData, buildBarPaletteByCategory)}
          </div>
        </div>
      </div>
      {/* Requests Section */}
      <div className={styles.requestsSection}>
        <div className={styles.requestsHeader}>{t("requestsSection")}</div>
        <div className={styles.filterToolbar}>
          <Input
            className={styles.searchBox}
            placeholder={t("searchPlaceholder")}
            value={searchText}
            onChange={(_, d) => setSearchText(d.value)}
            contentBefore={<SearchRegular />}
            aria-label={t("searchPlaceholder")}
          />
          <Dropdown
            className={styles.dropdown}
            placeholder={t("filterStatus")}
            value={filterStatus || ""}
            selectedOptions={filterStatus ? [filterStatus] : []}
            onOptionSelect={(_, d) => setFilterStatus(d.optionText || null)}
            aria-label={t("filterStatus")}
          >
            <Option value="">{t("filterStatus")}</Option>
            <Option value="New">New</Option>
            <Option value="In Review">In Review</Option>
            <Option value="Approved">Approved</Option>
            <Option value="Rejected">Rejected</Option>
            <Option value="Tracked">Tracked</Option>
          </Dropdown>
          <Dropdown
            className={styles.dropdown}
            placeholder={t("filterZone")}
            value={filterZone || ""}
            selectedOptions={filterZone ? [filterZone] : []}
            onOptionSelect={(_, d) => setFilterZone(d.optionText || null)}
            aria-label={t("filterZone")}
          >
            <Option value="">{t("filterZone")}</Option>
            <Option value="Green 🟢">Green 🟢</Option>
            <Option value="Yellow 🟡">Yellow 🟡</Option>
            <Option value="Red 🔴">Red 🔴</Option>
          </Dropdown>
        </div>
        <div className={styles.cardGallery}>
          {loading ? (
            <span style={{ fontSize: "13px", color: tokens.colorNeutralForeground3 }}>{t("loading")}</span>
          ) : filteredRequests.length === 0 ? (
            <span style={{ fontSize: "13px", color: tokens.colorNeutralForeground3 }}>{t("noRequests")}</span>
          ) : (
            filteredRequests.map((r) => (
              <div
                key={r.cat_agentintakerequestid}
                className={styles.requestCard}
                tabIndex={0}
                role="button"
                aria-label={`Request ${r.cat_requestid}`}
                onClick={() => setSelectedCardId(r.cat_agentintakerequestid)}
                onKeyDown={e => { if (e.key === "Enter" || e.key === " ") setSelectedCardId(r.cat_agentintakerequestid); }}
              >
                <div className={styles.cardId}>Request ID: REQ-{r.cat_requestid || "-"}</div>
                <div className={styles.cardTitle}>{r.cat_agentname || "-"}</div>
                <div className={styles.cardSubtitle}>
                  {r.cat_requestername || "-"} &middot; {r["cat_department@OData.Community.Display.V1.FormattedValue"] || "-"}
                </div>
                <div className={styles.cardPillsRow}>
                  {renderZonePill(r["cat_governancezone@OData.Community.Display.V1.FormattedValue"] || "-")}
                  {renderStatusPill(r["cat_status@OData.Community.Display.V1.FormattedValue"] || "-")}
                  {renderSupportRoutePill(r["cat_supportroute@OData.Community.Display.V1.FormattedValue"] || "-")}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
      {/* Request Details Dialog */}
      <Dialog open={selectedRequest !== null} onOpenChange={(_, data) => { if (!data.open && !statusUpdateLoading) setSelectedCardId(null); }}>
        <DialogSurface className={styles.dialogSurface}>
          {selectedRequest && (
            <DialogBody className={styles.dialogBody}>
              {/* Header */}
              <div className={styles.detailsHeader}>
                <div className={styles.detailsHeaderTitleBlock}>
                  <span className={styles.detailsHeaderTitle}>
                    {selectedRequest.cat_agentname || t("agentName")}
                  </span>
                  <span className={styles.detailsHeaderMuted}>
                    REQ-{selectedRequest.cat_requestid} &middot; {selectedRequest["cat_governancezone@OData.Community.Display.V1.FormattedValue"] || "-"} &middot; {selectedRequest["cat_status@OData.Community.Display.V1.FormattedValue"] || "-"}
                  </span>
                </div>
                <button
                  className={styles.detailsCloseBtn}
                  aria-label={t("close")}
                  disabled={statusUpdateLoading}
                  onClick={() => setSelectedCardId(null)}
                  type="button"
                >
                  {t("close")}
                </button>
              </div>
              {/* Status Panel */}
              <div className={styles.detailsStatusPanel}>
                <div>
                  <div className={styles.detailsGridLabel}>{t("approvalStatus")}</div>
                  <Dropdown
                    className={styles.detailsStatusDropdown}
                    value={
                      approvalOptions.find((o) => o.value === approvalStatus)?.label || ""
                    }
                    selectedOptions={
                      approvalStatus !== null
                        ? [approvalOptions.find((o) => o.value === approvalStatus)?.label || ""]
                        : []
                    }
                    onOptionSelect={(_, d) => {
                      const opt = approvalOptions.find((o) => o.label === d.optionText);
                      setApprovalStatus(opt ? opt.value : null);
                    }}
                    style={{ minWidth: "180px" }}
                    aria-label={t("approvalStatus")}
                  >
                    {approvalOptions.map((opt) => (
                      <Option key={opt.value} value={opt.label}>
                        {opt.label}
                      </Option>
                    ))}
                  </Dropdown>
                </div>
                <div>
                  <div className={styles.detailsGridLabel}>{t("buildStatusLabel")}</div>
                  <Dropdown
                    className={styles.detailsStatusDropdown}
                    value={
                      buildOptions.find((o) => o.value === buildStatus)?.label || ""
                    }
                    selectedOptions={
                      buildStatus !== null
                        ? [buildOptions.find((o) => o.value === buildStatus)?.label || ""]
                        : [t("notStarted")]
                    }
                    onOptionSelect={(_, d) => {
                      const opt = buildOptions.find((o) => o.label === d.optionText);
                      setBuildStatus(opt ? opt.value : null);
                    }}
                    style={{ minWidth: "180px" }}
                    aria-label={t("buildStatusLabel")}
                  >
                    {buildOptions.map((opt) => (
                      <Option key={String(opt.value)} value={opt.label}>
                        {opt.label}
                      </Option>
                    ))}
                  </Dropdown>
                </div>
                <Button
                  appearance="primary"
                  className={styles.detailsStatusSaveBtn}
                  style={{ marginLeft: "20px" }}
                  disabled={!statusChanged || statusUpdateLoading}
                  onClick={handleSaveStatus}
                  aria-label={t("saveStatusChanges")}
                >
                  {t("saveStatusChanges")}
                </Button>
              </div>
              <div className={styles.detailsStatusHelper}>
                {t("approvalHelper")}
              </div>
              {/* Tabs */}
              <TabList
                selectedValue={requestDetailTab}
                onTabSelect={(_, data) => setRequestDetailTab(data.value as string)}
                className={styles.detailsTabList}
                size="small"
              >
                <Tab value="summary">{t("summaryTab")}</Tab>
                <Tab value="decision">{t("decisionTab")}</Tab>
                <Tab value="evidence">{t("evidenceTab")}</Tab>
              </TabList>
              {/* Tab Panels */}
              {requestDetailTab === "summary" && (
                <div className={styles.detailsTabPanel}>
                  <div className={styles.detailsGrid}>
                    <div>
                      <div className={styles.detailsGridLabel}>{t("requestId")}</div>
                      <div className={styles.detailsGridValue}>{selectedRequest.cat_requestid || "-"}</div>
                    </div>
                    <div>
                      <div className={styles.detailsGridLabel}>{t("agentName")}</div>
                      <div className={styles.detailsGridValue}>{selectedRequest.cat_agentname || "-"}</div>
                    </div>
                    <div>
                      <div className={styles.detailsGridLabel}>{t("problemStatement")}</div>
                      <div className={styles.detailsGridValue}>{selectedRequest.cat_businessproblem || "-"}</div>
                    </div>
                    <div>
                      <div className={styles.detailsGridLabel}>{t("requestedOutcome")}</div>
                      <div className={styles.detailsGridValue}>{selectedRequest.cat_requestedoutcome || "-"}</div>
                    </div>
                    <div>
                      <div className={styles.detailsGridLabel}>{t("requester")}</div>
                      <div className={styles.detailsGridValue}>{selectedRequest.cat_requestername || "-"}</div>
                    </div>
                    <div>
                      <div className={styles.detailsGridLabel}>{t("businessArea")}</div>
                      <div className={styles.detailsGridValue}>{selectedRequest["cat_department@OData.Community.Display.V1.FormattedValue"] || "-"}</div>
                    </div>
                    <div>
                      <div className={styles.detailsGridLabel}>{t("sponsorRole")}</div>
                      <div className={styles.detailsGridValue}>{selectedRequest.cat_sponsorrole || "-"}</div>
                    </div>
                    <div>
                      <div className={styles.detailsGridLabel}>{t("targetUsers")}</div>
                      <div className={styles.detailsGridValue}>{selectedRequest.cat_targetusers || "-"}</div>
                    </div>
                    <div>
                      <div className={styles.detailsGridLabel}>{t("expectedUsers")}</div>
                      <div className={styles.detailsGridValue}>{selectedRequest.cat_expectedusers ?? "-"}</div>
                    </div>
                    <div>
                      <div className={styles.detailsGridLabel}>{t("timeline")}</div>
                      <div className={styles.detailsGridValue}>{selectedRequest["cat_timeline@OData.Community.Display.V1.FormattedValue"] || "-"}</div>
                    </div>
                  </div>
                </div>
              )}
              {requestDetailTab === "decision" && (
                <div className={styles.detailsTabPanel}>
                  <div className={styles.detailsGrid}>
                    <div>
                      <div className={styles.detailsGridLabel}>{t("requestType")}</div>
                      <div className={styles.detailsGridValue}>{selectedRequest["cat_requesttype@OData.Community.Display.V1.FormattedValue"] || "-"}</div>
                    </div>
                    <div>
                      <div className={styles.detailsGridLabel}>{t("governanceZone")}</div>
                      <div className={styles.detailsGridValue}>{selectedRequest["cat_governancezone@OData.Community.Display.V1.FormattedValue"] || "-"}</div>
                    </div>
                    <div>
                      <div className={styles.detailsGridLabel}>{t("supportRouteLabel")}</div>
                      <div className={styles.detailsGridValue}>{selectedRequest["cat_supportroute@OData.Community.Display.V1.FormattedValue"] || "-"}</div>
                    </div>
                    <div>
                      <div className={styles.detailsGridLabel}>{t("selfBuildOfferedLabel")}</div>
                      <div className={styles.detailsGridValue}>
                        {selectedRequest.cat_selfbuildoffered === 1 ? t("yes") : t("no")}
                      </div>
                    </div>
                    <div>
                      <div className={styles.detailsGridLabel}>{t("proposedNextActions")}</div>
                      <div className={styles.detailsGridValue}>{selectedRequest.cat_proposednextactions || "-"}</div>
                    </div>
                    <div>
                      <div className={styles.detailsGridLabel}>{t("agentsOffered")}</div>
                      <div className={styles.detailsGridValue}>{selectedRequest.cat_agentsoffered || "-"}</div>
                    </div>
                  </div>
                </div>
              )}
              {requestDetailTab === "evidence" && (
                <div className={styles.detailsTabPanel}>
                  <div className={styles.detailsGrid}>
                    <div>
                      <div className={styles.detailsGridLabel}>{t("dataSources")}</div>
                      <div className={styles.detailsGridValue}>{selectedRequest.cat_datasources || "-"}</div>
                    </div>
                    <div>
                      <div className={styles.detailsGridLabel}>{t("description")}</div>
                      <div className={styles.detailsGridValue}>{selectedRequest.cat_description || "-"}</div>
                    </div>
                    <div>
                      <div className={styles.detailsGridLabel}>{t("triageNotes")}</div>
                      <div className={styles.detailsGridValue}>{selectedRequest.cat_sourceconversation || "-"}</div>
                    </div>
                  </div>
                </div>
              )}
              {/* Footer */}
              <div className={styles.detailsFooter}>
                <Button
                  appearance="primary"
                  onClick={() => {
                    if (selectedRequest) {
                      window.top.location.href =
                        "/main.aspx?appid=31ae1363-a2af-f111-aaac-000d3a367627&pagetype=entityrecord&etn=cat_agentintakerequest&id=" +
                        selectedRequest.cat_agentintakerequestid;
                    }
                  }}
                  aria-label={t("openFullRecord")}
                  disabled={statusUpdateLoading}
                >
                  {t("openFullRecord")}
                </Button>
                <Button
                  appearance="secondary"
                  onClick={() => setSelectedCardId(null)}
                  aria-label={t("backToRequests")}
                  disabled={statusUpdateLoading}
                >
                  {t("backToRequests")}
                </Button>
              </div>
            </DialogBody>
          )}
        </DialogSurface>
      </Dialog>
    </div>
  );
};

export default GeneratedComponent;