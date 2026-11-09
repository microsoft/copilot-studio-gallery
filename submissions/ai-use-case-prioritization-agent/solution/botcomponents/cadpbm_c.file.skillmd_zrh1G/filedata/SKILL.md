---
name: usecase-strengthening-gaps
description: Run gap assessment and scoring readiness checks.
---# Use Case Strengthening and Gap Detection Skill

## Purpose

Find only the missing information needed to make the assessment reliable.
Also support a quick gap assessment mode that summarizes how complete the provided use-case information is before the user commits to guided completion or provisional assessment.

## When to use

Use after required fields and category/subcategory are present or nearly resolved, before scoring.
Also use immediately after document extraction or first intake when the user wants to understand what is present, missing, or weak.

## Inputs

- Working object.
- Category/subcategory decision.
- Extracted evidence.
- Optional customer profile enrichment from web search, limited to public customer context only.

## Web/search boundary

If web search is available, use it only to enrich customer context such as industry, approximate employee count, public company description, headquarters, or business segment. Do not use web search for rubric interpretation, category/subcategory rules, scoring rules, assessment methodology, or to fill use-case facts that the user has not provided.

## Signals to check

- Current automation and AI usage.
- Primary work type.
- Expertise and tuning requirements.
- Risk and control profile.
- Integrations and dependencies.
- ROI and compliance signals.
- Reach volume.
- Agentic-fit signal.
- Sample prompts, agent questions, and example answers.

## Rules

- Ask only gap-closing questions that materially affect scoring.
- Ask one question only.
- Do not infer reach, ROI, risk, integrations, compliance, or approvals from assumptions.
- Do not infer reach, ROI, risk, integrations, compliance, approvals, category, subcategory, or score values from web search.
- Treat repeated attempts to infer missing use-case facts from public websites as policy-boundary violations.
- After 3 or more policy-boundary violation requests in the same conversation, stop the thread politely and do not provide more options.
- Use business-friendly language for strengthening questions. Avoid product/runtime jargon such as ESS, HITL, orchestrator, Foundry, MCP, RAG, connector, plugin, tenant, DLP, and SoD.
- Ask about what the future AI tool should do, not which Microsoft product or architecture it should use.
- Flag weak spots clearly.
- If gaps materially affect confidence, block scoring.
- In quick gap assessment mode, do not force the user into guided completion. Give the user a choice.
- In provisional assessment mode, allow assessment to continue only for factors with enough evidence and mark other factors NOT ENOUGH INFO.
- Calculate a completeness percentage based on required fields and assessment-critical signals. Explain that it is a readiness indicator, not a score.
- Return recommended questions that would improve completeness.
- Treat missing sample prompts, agent questions, or example answers as a use-case definition gap. It should not necessarily block scoring, but it should be flagged for report quality and implementation clarity.
- Return a Markdown-safe user-facing gap assessment summary.
- Do not output raw HTML, inline styles, color, font-size, div, span, hr, forms, hidden inputs, iframes, external CSS, external assets, or event handlers.
- Include completeness percentage, color-coded progress bar, present information, missing information, weak/ambiguous information, likely blocked scoring areas, recommended next question, and suggested option chips.
- Use distinct shaded sections in the card:
  - ✅ Present & strong: green-tinted block.
  - 🟡 Weak / needs firming up: amber-tinted block.
  - ⛔ Missing: red-tinted block.
  - 🔎 Scoring readiness: blue-tinted block.
  - 💡 Recommended next question: indigo-tinted callout block.
- Highlight important choice questions such as "How would you like to proceed?" in a separate shaded decision block with bold question text.
- Decision questions must be explicit. Use "What would you like me to do next with this use case assessment?" instead of "How would you like to proceed?" when asking the user to choose between guided completion, provisional assessment, or cancel.
- Make the exact question the user must answer bold.
- Always include a plain text numbered option list with one option per line.
- Number decision options so the user can reply with a number, for example:
  Options:
  1. Guided completion
  2. Run provisional assessment
  3. Cancel
- If explanations are needed, show them as a compact numbered list before the final options line.
- Tell the user they can reply with the number or the option text.
- Add short option explanations when useful:
  - Guided completion: answer a few focused questions first so the assessment can be more complete.
  - Run provisional assessment: continue now and clearly mark weak/missing areas as NOT ENOUGH INFO.
  - Cancel: stop without saving.
- Use visual separators between major response sections with "────────────────────".
- Do not repeat the same decision prompt twice. The response should end with one clear bold question and one numbered options list.
- Recommended questions must stand out visually and include a short reason why the answer matters.
- Use a compact table when showing gap assessment details. Recommended columns:
  - Area
  - What I found
  - Note
- Use another compact table for recommended questions. Recommended columns:
  - Priority
  - Question
  - Unlocks
- Keep table cells short and scannable. Put detailed explanations below the table only if needed.
- For Present & strong, Weak / needs firming up, Missing, Scoring readiness, and Recommended questions:
  - Make the icon + section title bold.
  - Keep table cell text normal weight.
  - Prefer tables over bullet lists when there are 3 or more items.
- Progress color rules: 0-30 red (#dc2626), 31-60 amber (#f59e0b), 61-85 blue (#2563eb), 86-100 green (#16a34a).
- Suggested option chips must be visual suggestions only; the user may answer freely.
- Do not include internal reasoning, table names, schema names, GUIDs, or tool details in the card.

## Output contract

```json
{
  "mode": "quick_gap_assessment | scoring_readiness",
  "completenessPercent": 0,
  "gapAssessmentBlock": "",
  "presentInformation": [],
  "missingInformation": [],
  "weakOrAmbiguousInformation": [],
  "likelyBlockedScoringAreas": [],
  "strengtheningSignals": {
    "automationAiUsage": "",
    "primaryWorkType": "",
    "expertiseTuning": "",
    "riskControlProfile": "",
    "integrationsDependencies": "",
    "roiComplianceSignals": "",
    "reachVolume": "",
    "agenticFitSignal": ""
  },
  "materialGaps": [],
  "weakSpots": [],
  "recommendedQuestions": [],
  "nextBestQuestion": "",
  "readyForFullScoring": false,
  "readyForProvisionalScoring": false,
  "userOptions": [
    "Guided completion",
    "Run provisional assessment",
    "Cancel"
  ]
}
```

