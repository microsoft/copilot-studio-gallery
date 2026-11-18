export const EVALUATION_WAIVER_LABEL = "allow-evaluation-waiver";

export function evaluationWaiver(labels: string[], body: string): { approved: boolean; errors: string[] } {
  if (!labels.includes(EVALUATION_WAIVER_LABEL)) return { approved: false, errors: [] };
  const sections = body.replace(/\r\n/g, "\n").split(/^(?=#{1,2}[ \t]+)/m)
    .filter((section) => /^##[ \t]+Evaluation waiver[ \t]*(?:\n|$)/.test(section));
  if (sections.length !== 1) {
    return { approved: false, errors: [`${EVALUATION_WAIVER_LABEL} requires exactly one "## Evaluation waiver" section in the PR body.`] };
  }
  const section = sections[0];
  const errors: string[] = [];
  for (const field of ["Reason", "Alternative evidence"]) {
    const values = [...section.matchAll(new RegExp(`^${field}:[ \\t]*(.*)$`, "gm"))];
    if (values.length !== 1 || !values[0][1].trim()) {
      errors.push(`${EVALUATION_WAIVER_LABEL} requires a nonempty "${field}:" line in the Evaluation waiver section.`);
    }
  }
  return { approved: errors.length === 0, errors };
}
