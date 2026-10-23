/** Default gallery order: solutions that show off the most components come first. Unlisted solutions follow, newest first. */
export const LAUNCH_ORDER = [
  "agent-coe-front-door",
  "blastbox-omega",
  "invoice-processing",
  "sales-lead-qualifier",
  "hr-new-hire-welcome-packet",
  "rfp-response-manager",
  "inbound-request-triage",
  "email-thread-synthesis",
  "contract-compliance-reviewer",
  "sharepoint-list-update-notifier",
  "kusto-analytics-agent",
  "meeting-coordinator",
  "podcast-generation-agent",
  "outlook-triggered-workflow-agent",
  "calendar-manager-agent",
] as const;

export function launchRank(slug: string): number {
  const index = (LAUNCH_ORDER as readonly string[]).indexOf(slug);
  return index === -1 ? LAUNCH_ORDER.length : index;
}
