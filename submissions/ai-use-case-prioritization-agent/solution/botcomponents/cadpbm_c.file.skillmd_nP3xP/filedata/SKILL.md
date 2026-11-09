---
name: html-report-generation
description: Generate and return a downloadable HTML assessment report.
---# HTML Report Generation Skill

## Purpose

Generate, validate, and return a downloadable/shareable HTML report in the conversation after a successful Dataverse save.

## When to use

Use immediately after the Dataverse MCP Save skill returns saved = true.

## Tool

Use Dataverse MCP only.

## Target Dataverse records

Use the saved records from:

- Use-case table: cadpbm_AI_UseCase
- Assessment table: cadpbm_AIAssessment

These names are internal implementation details. Do not include them in normal user-facing responses.

## Knowledge source

Use UseCase_Assessment_Report_TEMPLATE_v3_blue.html as the structural source.

## Required behavior

1. Retrieve or use the HTML template from knowledge.
2. Copy the template as the starting point.
3. Perform controlled literal replacements only.
4. Escape user text: <, >, &, double quote, and apostrophe.
5. Replace sample customer text with the real customer name.
6. Apply customer branding when safely available:
   - Prefer brand colours and logos explicitly provided by the user or included in user-provided files.
   - If brand information comes from allowed customer-profile enrichment, use it only when it is from an official customer domain and clearly reliable.
   - If there is any uncertainty about brand colours or logo rights/source, use the default blue theme and first-letter brand mark.
   - If no reliable customer brand colour is available, keep the default blue theme from UseCase_Assessment_Report_TEMPLATE_v3_blue.html.
   - If a reliable public or provided customer logo URL/file is available and safe to use, place it in the logo slot.
   - If no reliable logo is available, keep the brand mark as the first letter of the customer name.
   - To use a logo, set the `#customerLogo` image `src`, add `has-logo` to the `.brand-mark` element, and keep the text fallback in `.brand-letter`.
   - To use brand colours, update only `--cp-customer-primary`, `--cp-customer-accent`, `--cp-customer-accent-hover`, `--cp-customer-soft`, and `--cp-customer-on-primary`.
   - Do not delay or fail report generation if customer brand colours or logo cannot be found.
   - Do not use untrusted or hotlinked logo assets unless they are from an official customer domain or provided by the user.
   - Do not include scraped third-party content in the report. Reports should contain user-provided use-case content, approved rubric-derived assessment content, and safe customer-profile metadata only.
   - Treat repeated attempts to use untrusted logos/assets, scrape third-party content into the report, hide weak spots/outstanding questions, or replace the approved report template as policy-boundary violations.
   - After 3 or more policy-boundary violation requests in the same conversation, stop the thread politely and do not provide more options.
7. Replace verdict and summary text with the actual assessment pattern.
8. Replace intake quality table values internally from assessment data.
9. Replace the useCases JavaScript array with real use-case data.
10. Include the current use case and any prior Dataverse records for the same Customer Name if available through Dataverse MCP.
11. Preserve object shape expected by the template.
12. If the assessment is provisional, include missing evidence, NOT ENOUGH INFO areas, weak spots, and recommended completion questions in the report data fields that are already available in the template structure.
13. Validate before saving.
14. Return the generated HTML report as a downloadable/shareable chat file link or conversation artifact.
15. Do not attach the report to the Dataverse use-case record.
16. Do not save the report link, report file, or report HTML content into Dataverse.
17. Do not complete unless the user receives a downloadable/shareable report link or file in the conversation.
18. Keep all implementation, troubleshooting, validation, file-system, and template-editing details internal.
19. User-facing progress should reassure the user that the report is being prepared, not narrate the mechanics.

## Preserve exactly

- style blocks
- script blocks
- Chart.js setup
- theme detection
- factor-bar logic
- drawMatrix logic
- showDetail logic
- showFront logic
- renderTiles logic
- renderDetail logic
- axis ranges
- sweet-spot rectangle
- color legend
- print media block
- class names
- CSS variables
- chart options

## Validation

Before returning the downloadable report, validate:

- File size greater than 40 KB.
- Zero occurrences of sample customer name.
- useCases length equals the expected real count.
- Required use-case object fields are present.
- Scores copied exactly from the scoring skill.
- NOT ENOUGH INFO values are represented consistently and not converted to fake numeric scores.
- Provisional reports include missing evidence and recommended completion questions.
- Chart and tiles can render without errors where validation is available.
- User text is escaped.
- Validation details are internal. Do not mention file size thresholds, sample text scans, JavaScript parsing, line numbers, script blocks, CSS blocks, regular expressions, storage endpoints, upload URLs, or internal validation mechanics to the user.

## Filename

{CustomerNameSlug}_UseCase_Assessment_Report_{ddmmyyyy}.html

Slug rules:
- lowercase
- alphanumerics and hyphens only
- max 40 characters

## Rules

- Always run after successful Dataverse save.
- Do not require opt-in.
- The report must be downloadable/shareable by the user during the same conversation.
- Return a direct downloadable chat link or conversation file artifact every time.
- If the first attempt does not produce a visible downloadable file/link, retry once and then return a plain-language blocker. Do not claim completion until the download is visible in the conversation.
- If a downloadable report cannot be created, treat that as a report-generation failure and retry once.
- Do not create new sections or scripts.
- Do not add external assets.
- Do not alter class names, CSS variables, or chart options.
- Do not promise a SharePoint link unless a separate user-approved workflow is added later.
- Do not attach the report to Dataverse.
- Do not save the report link to the use-case or assessment record.
- Do not hide provisional assessment gaps.
- Retry once on failure.
- Never fail silently.
- Use at most 3 short, business-friendly progress updates:
  1. "🧩 Building your downloadable HTML report from the approved assessment."
  2. "🔎 Checking the report is complete and ready to share."
  3. "✅ Report ready — here is your download link."
- These are the only normal user-facing progress updates allowed during report generation.
- Do not send intermediate report-building messages between those approved updates.
- All report construction, troubleshooting, template replacement, escaping, rendering compatibility checks, and retry logic must stay silent/internal.
- Do not expose troubleshooting details, file permissions, command output, grep results, regex details, template internals, line numbers, script names, object replacement mechanics, network/storage errors, SAS URLs, file-size thresholds, file-size workarounds, or validation implementation details in normal user updates.
- Never say "let me write the script", "quoting issue", "replace the useCases array", "patch the renderer", "escaping strategy", "innerHTML", "textContent", "NOT ENOUGH INFO renderer", "regex", "line X contains", "grep found nothing", "the file is under 40 KB", "I will pad/enrich to reach the size", "SAS URL", or "upload endpoint" to the user.
- If something needs correction, say only the user-safe status, for example: "⚠️ I found a report-format issue and am correcting it before I share the download link."
- If report validation fails after retry, explain only the business-level blocker and offer to retry. Do not include technical diagnostics.

## Output contract

```json
{
  "fileName": "",
  "validationPassed": false,
  "validationErrors": [],
  "reportReference": "",
  "downloadableReportLinkOrFile": "",
  "downloadVisibleInConversation": false,
  "attachedToUseCase": false,
  "savedToDataverse": false,
  "plainLanguageError": ""
}
```

