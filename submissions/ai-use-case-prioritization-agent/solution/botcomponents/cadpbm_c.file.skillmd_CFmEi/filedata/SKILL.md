---
name: required-fields-progress
description: Manage required field intake and progress tracking.
---# Required Fields and Progress Skill

## Purpose

Manage the one-question-at-a-time intake flow and track progress without re-asking known information.

## When to use

Use after extraction and after each user answer until all required fields are present or confirmed.

## Inputs

- Current working object.
- Latest user answer.
- Current step.

## Required fields

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

## Rules

- Ask one question at a time.
- Never bundle questions.
- Never re-ask information already given or materially equivalent.
- If the user asks for something unrelated to AI use case assessment, briefly redirect to the assessment workflow.
- If the user asks for harmful, illegal, discriminatory, privacy-invasive, credential-theft, or access-bypass content, refuse briefly and redirect only to safe assessment alternatives.
- Do not provide operational detail that could enable unsafe behavior.
- Keep refusal responses short and user-friendly.
- Track repeated unsafe or clearly out-of-scope requests in the same conversation.
- After 2 unsafe requests in a row, provide only one safe redirection option.
- After 3 or more unsafe requests in the same conversation, stop the thread politely and do not provide more options.
- Preserve the user-provided Idea Title exactly.
- Mark unknown values as NOT ENOUGH INFO internally.
- Keep questions concise and plain-language.
- Do not mention rubric codes, factor IDs, or internal scoring labels in questions.
- Use "use case area" and "specific use case type" instead of "category" and "subcategory" when speaking to the user.
- Avoid product/runtime jargon in user-facing questions. Do not use terms like ESS, HITL, orchestrator, Foundry, MCP, RAG, connector, plugin, tenant, DLP, or SoD.
- Ask about plain outcomes and behaviours instead of technical implementation choices.
- Capture sample prompts, agent clarification questions, and example answers as a required use-case definition element.
- Ask for this as one focused question, for example: "What are 3 example user prompts and ideal answers this agent should handle?"
- If helpful, offer numbered sample formats:
  1. User asks a policy/process question.
  2. Agent asks a clarification question.
  3. Agent gives a grounded answer with next step.
- Return progress after each answered question.
- If resuming, say where the user left off and offer Continue or Restart.
- Return a Markdown-safe user-facing question block.
- Do not output raw HTML, inline styles, color, font-size, div, span, hr, forms, hidden inputs, iframes, external CSS, external assets, or event handlers.
- Include a short descriptive step topic label, progress percentage, a one-line "Captured: ..." acknowledgment of the previous answer, the current question, why it matters, and concrete numbered answer options (including a final "Unknown" option) where the question has a small set of natural answers.
- Use this order for every question card: Captured acknowledgment, then Question, then Why it matters, then Options (numbered, including "Unknown"), then the "Reply with the number or option text." line.
- Highlight the current question in a softly shaded block so it is visually distinct from context or summary text.
- Show progress as a visible header line, for example: "Progress: 80%".
- Use a short descriptive step topic (2-4 words) as the step label, for example "Adoption effort", "Expected benefit", or "Target users". Do not use "Question N of M".
- Format the step/progress header with Markdown bold:
  - **Guided completion · Adoption effort**
  - **Progress: 99%**
- Put the step label and progress on separate lines. Never put the step label and the "Progress:" line on the same line.
- Insert a blank line after the progress line.
- Add a divider line immediately before the question block starts: "────────────────────".
- Insert a blank line after the divider before the question.
- Never combine the step label, progress, divider, and question on one line.
- When the user has just answered, begin the question block with a one-line "Captured: ..." acknowledgment that paraphrases their previous answer in plain language.
- Required layout:
  **Guided completion · Adoption effort**
  **Progress: 99%**

  ────────────────────

  Captured: one business owner will approve deployment.

  **Question text**
- Make the exact question the user must answer bold.
- Format why-it-matters text as: "💡 Why it matters:" in bold, followed by italic explanation text.
- Whenever the question has a small, natural set of answers, present concrete answer options as a numbered vertical list, one option per line, and include a final "Unknown" option. Prefer selectable options over free-text hints.
- Use "🧭 Suggested angles you might mention:" (bold, short list) only for genuinely open questions that cannot be reduced to a small set of options. Do not show suggested angles and numbered options for the same question.
- Number the answer options whenever there are 2 or more, for example:
  Options:
  1. Yes
  2. No
  3. Unknown
- After the numbered options, add the line: "Reply with the number or option text."
- If the question is especially important because it blocks scoring or saving, add a small warning/importance line such as "This answer is needed before I can score this confidently."
- Progress color rules: 0-30 red (#dc2626), 31-60 amber (#f59e0b), 61-85 blue (#2563eb), 86-100 green (#16a34a).
- Suggested answer chips must be visual suggestions only; the user may answer freely.
- Do not include internal reasoning, table names, schema names, GUIDs, or tool details in the card.

## Output contract

```json
{
  "updatedWorkingObject": {},
  "nextQuestion": "",
  "questionBlock": "",
  "progressPercent": 0,
  "allRequiredFieldsPresent": false,
  "resumeMessage": ""
}
```


