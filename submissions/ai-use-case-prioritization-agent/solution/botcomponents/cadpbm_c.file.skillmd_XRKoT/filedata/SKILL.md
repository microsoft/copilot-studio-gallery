---
name: confirmation-final-qa
description: Create confirmation summary and final quality checks.
---# Confirmation and Final QA Skill

## Purpose

Create the user-facing confirmation summary and block unsafe or incomplete submission.

## When to use

Use after scoring is complete and before any Dataverse write.

## Inputs

- Working object.
- Assessment output.
- User intent: Submit, Edit, Cancel, or unknown.

## Confirmation summary must include

- Customer Name
- Idea Title
- Use Case Category
- Use Case Subcategory
- Summary
- Problem / Need
- Proposed Solution
- Expected Benefits
- Target Audience
- Personas Impacted
- Potential Risks
- Sample Prompts, Agent Questions, and Example Answers
- Impact Assessment table: Factor | Score | Rationale
- Complexity Assessment table: Factor | Score | Rationale
- Reach Score
- Agentic Fit
- Impact Average
- Complexity Average
- Weak spots / validation notes
- Missing or NOT ENOUGH INFO areas
- Recommended questions to complete the assessment

## Rules

- Ask: Ready to record the findings?
- Suggested replies:
  1. Submit
  2. Edit
  3. Cancel
- Tell the user they can reply with the number or the option text.
- If Edit, ask only which fields to change and re-confirm after edits.
- If Cancel, end politely without saving.
- If Submit, validate before save.
- Do not expose table names, columns, schemas, GUIDs, or duplicate-check logic.
- Do not reveal CAD Intake Quality.
- Do not expose internal rubric codes or factor IDs such as I1, I2, I5, C1, or similar.
- Use plain factor names only in confirmation tables.
- Use "Use case area" and "Specific use case type" as the user-facing labels for category and subcategory.
- If this is a provisional assessment, clearly label it as provisional and show the unresolved gaps before asking for Submit.
- Use compact tables for confirmation summaries where helpful.
- Required field confirmation can use columns: Field | Value | Confidence / note.
- Include sample prompts, agent questions, and example answers in the confirmation summary. If missing in provisional mode, show it as a gap and recommended follow-up.
- Impact and Complexity assessments must use columns: Factor | Score | Rationale.
- Provisional gaps can use columns: Area | Status | What is missing | Recommended follow-up.

## Blocking validation

Block submission if:

- Any required field is missing.
- Category/subcategory is NOT ENOUGH INFO.
- Any factor is NOT ENOUGH INFO in Guided Completion or Full Assessment mode.
- Reach Score is missing or outside the allowed range.
- Averages are missing or inconsistent.
- User did not explicitly choose Submit.
- Dataverse save requirements cannot represent NOT ENOUGH INFO values in provisional mode.

Allow submission in Provisional Assessment mode only if:

- The user explicitly chose Run provisional assessment.
- All missing values are clearly marked NOT ENOUGH INFO.
- The report will include the missing evidence summary and recommended questions.
- Dataverse can store unresolved fields without invalid placeholder scores.

## Output contract

```json
{
  "confirmationSummary": "",
  "readyToSubmit": false,
  "blockingIssues": [],
  "editPrompt": "",
  "cancelMessage": ""
}
```

