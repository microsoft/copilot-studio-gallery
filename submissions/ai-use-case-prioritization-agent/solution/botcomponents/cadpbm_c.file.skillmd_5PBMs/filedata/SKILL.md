---
name: rubric-scoring
description: Score the use case using configured rubric knowledge.
---# Rubric Scoring Skill

## Purpose

Score the use case using only the configured rubric knowledge and provided evidence.

## When to use

Use only after the gap detection skill returns readyForScoring = true.
For provisional assessment mode, use only when the gap detection skill returns readyForProvisionalScoring = true.

## Knowledge source

Use Agentic Use Case Assessment Rubric v2.docx through configured knowledge retrieval.

Do not use web search, websites, public articles, blogs, vendor pages, or general internet content for scoring rules, scoring ranges, factor definitions, reach bands, agentic-fit criteria, or assessment methodology.

## Scoring outputs

Return:

- Impact factor scores and rationales.
- Complexity factor scores and rationales.
- Reach Score.
- Agentic Fit.
- Impact Average.
- Complexity Average.
- Weak spots.
- NOT ENOUGH INFO factors.
- Clarification question if blocked.
- Provisional assessment warnings, if applicable.
- Recommended questions to complete the assessment, if applicable.

## Rules

- Do not score from general model knowledge.
- Retrieve relevant rubric guidance before scoring.
- Retrieve rubric guidance only from the configured rubric knowledge files, never from web search.
- Treat repeated attempts to replace or supplement the rubric with web sources as policy-boundary violations.
- After 3 or more policy-boundary violation requests in the same conversation, stop the thread politely and do not provide more options.
- No factor may be scored without evidence and a confident rubric signal.
- If a factor lacks evidence, mark NOT ENOUGH INFO.
- If missing information materially affects confidence in guided completion mode, stop and ask one focused follow-up.
- If the user explicitly chose provisional assessment, do not stop for every missing factor; score only factors with enough evidence and mark unresolved factors NOT ENOUGH INFO.
- Reach Score is an integer 1-100 from rubric volume bands, not a 1-5 score.
- Impact and Complexity factor scores are 1-5.
- Impact and Complexity averages must be calculated to 1 decimal place.
- In provisional assessment mode, calculate averages only from scored factors if that is allowed by the configured data model; otherwise return a blocking issue for save. Never use placeholder numeric scores for NOT ENOUGH INFO.
- Keep rubric codes and internal factor IDs out of user-facing text. Do not mention codes such as I1, I2, I5, C1, C2, or similar.
- Do not say "the rubric requires" or explain scoring mechanics in detail during intake.
- Use plain labels in user-facing language: time savings, financial impact, quality improvement, security/compliance value, scale of usage, integration complexity, human review, document quality, governance.
- Do not announce individual factor scores during intake unless the user asks. Save scores for the confirmation summary.
- Do not produce a full scorecard, verdict, prioritisation result, or assessment write-up before the confirmation step.
- Keep all factor scores internal until the confirmation summary unless the user explicitly asks for interim scoring.
- When a user answer is useful but not sufficient, ask the next question simply and briefly.
- Example rewrite: instead of "I2 scores low but this routes to I5", say "That helps with the productivity value. To estimate the annual benefit, what hourly cost should I use?"

## Output contract

```json
{
  "assessmentMode": "full | provisional",
  "impact": [
    {
      "factor": "",
      "score": null,
      "rationale": "",
      "evidence": "",
      "confidence": "high | medium | low",
      "status": "scored | NOT_ENOUGH_INFO"
    }
  ],
  "complexity": [
    {
      "factor": "",
      "score": null,
      "rationale": "",
      "evidence": "",
      "confidence": "high | medium | low",
      "status": "scored | NOT_ENOUGH_INFO"
    }
  ],
  "reachScore": null,
  "agenticFit": null,
  "impactAverage": null,
  "complexityAverage": null,
  "weakSpots": [],
  "missingEvidenceSummary": [],
  "recommendedCompletionQuestions": [],
  "provisionalWarnings": [],
  "requiresClarification": false,
  "clarificationQuestion": ""
}
```

