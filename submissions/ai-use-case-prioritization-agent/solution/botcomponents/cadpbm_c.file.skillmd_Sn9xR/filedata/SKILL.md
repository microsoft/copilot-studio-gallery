---
name: dataverse-mcp-save
description: Save use case and assessment records with Dataverse MCP.
---# Dataverse MCP Save Skill

## Purpose

Use Dataverse MCP to perform duplicate checks and save the use-case and assessment records.

## When to use

Use only after the user explicitly chooses Submit and the Confirmation and Final QA skill returns readyToSubmit = true.

## Tool

Use Dataverse MCP only.

## Target Dataverse solution and tables

Target solution:

- AI Use Case Solution

Target tables:

- Use-case table display name: AI_UseCase
- Use-case table logical name: cadpbm_AI_UseCase
- Use-case primary ID: cadpbm_AI_UseCaseId
- Assessment table display name: AI Assessment
- Assessment table logical name: cadpbm_AIAssessment
- Assessment primary ID: cadpbm_AIAssessmentId
- Agent App Catalog URL environment variable schema name: cadpbm_CodeAppURL

These names are internal implementation details. Do not include them in normal user-facing responses.

## Inputs

- Confirmed use-case data.
- Confirmed assessment data.
- Submit confirmation.

## Required behavior

1. Retrieve target table metadata/schema silently.
2. Retrieve category and subcategory choice values silently.
3. Check for duplicate Title or Summary in the last 60 days.
4. If duplicate found, return a user-safe match and request Proceed, Update existing, or Cancel.
5. If no duplicate, proceed silently.
6. Create or update the use-case record.
7. Retrieve the internal record reference silently.
8. Create or update the assessment record.
9. Associate the assessment with the use-case record.
10. Retrieve the environment variable value for cadpbm_CodeAppURL.
11. Return human-readable IDs and the Agent App Catalog URL.

## ID formats

- Use-case human-readable ID: UC-{ddmmyyhhmm}
- Assessment human-readable ID: ASMNT-{ddmmyyhhmm}

## Fields to save

Use-case record:
- Customer Name
- Idea Title
- Category
- Subcategory
- Summary
- Problem / Need
- Proposed Solution
- Expected Benefits
- Target Audience
- Personas Impacted
- Potential Risks
- Sample Prompts, Agent Questions, and Example Answers

Assessment record:
- Every impact factor score and rationale
- Every complexity factor score and rationale
- Automation and AI Usage
- Primary Work Type
- Expertise and Tuning
- Risk and Control Profile
- Reach Score
- Agentic Fit
- Impact Average
- Complexity Average
- CAD Intake Quality
- Weak spots or validation notes

## Rules

- Do not save unless Submit is confirmed.
- Do not expose table names, schemas, columns, choice internals, or GUIDs to the user.
- Do not ask the user to provide or paste a Dataverse GUID.
- For existing-record lookup, ask for the human-readable use-case ID, assessment ID, title, or customer name.
- Map category and subcategory through Dataverse choice values.
- Retry once on save failure.
- Never fail silently.
- When reporting progress to the user, use short icon-prefixed updates such as "🔎 Checking for similar recent records", "🛠️ Saving the use case", and "✅ Use case saved".
- Do not expose raw duplicate-check logic, schema details, choice option internals, internal record references, or GUIDs in progress updates.
- If choice mapping is ambiguous, explain it as a user-safe decision point rather than exposing raw option values.
- Retrieve the Agent App Catalog link from cadpbm_CodeAppURL after successful save.
- Do not hardcode the app catalog URL.
- Do not save the app catalog URL or generated link back into Dataverse.
- If cadpbm_CodeAppURL is missing or empty, return a plain-language warning that the App Catalog link is not configured for this environment.

## Output contract

```json
{
  "duplicateFound": false,
  "duplicateMatchUserSafe": "",
  "requiresDuplicateDecision": false,
  "useCaseId": "",
  "assessmentId": "",
  "agentAppCatalogUrl": "",
  "saved": false,
  "plainLanguageError": ""
}
```

