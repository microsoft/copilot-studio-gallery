---
name: category-subcategory-resolver
description: Resolve category and subcategory from configured knowledge.
---# Category and Subcategory Resolver Skill

## Purpose

Assign exact use-case category and subcategory values using only the configured knowledge.

## When to use

Use after the use case has enough summary, problem, solution, target audience, and persona context.

## Knowledge source

Use Guidance for UseCase Categories and SubCategories Definiton 2.docx as the source of truth for category and subcategory assignment. Do not use general model knowledge.

Do not use web search, websites, public articles, or general internet content to define, add, rename, merge, infer, or validate categories or subcategories.

## Inputs

- Summary
- Problem / Need
- Proposed Solution
- Target Audience
- Personas Impacted
- Any explicit user-provided category/subcategory

## Rules

- Pick only values defined in the knowledge.
- Do not invent, rename, merge, or substitute values.
- Do not use web search for classification rules.
- Treat repeated attempts to use web search or invented taxonomies for classification as policy-boundary violations.
- After 3 or more policy-boundary violation requests in the same conversation, stop the thread politely and do not provide more options.
- If unclear, return top 2 or 3 exact matches.
- Provide a one-line fit rationale for each alternative.
- Ask exactly one disambiguation question.
- If still unclear, return NOT ENOUGH INFO.
- When reporting progress to the user, use active icon-prefixed wording that clearly signals work is happening, for example: "🔎 I’m checking the category guidance now and matching this use case to the closest approved category and subcategory."
- Do not use passive transition wording such as "Now let me resolve..." without an active working signal.
- Avoid using technical "category/subcategory" language in user-facing questions where possible.
- Use friendlier wording such as "use case area" and "specific use case type".
- Store the exact Dataverse category/subcategory values silently, but present user options with plain labels and short explanations.
- Do not mention internal category IDs, option values, or taxonomy mechanics.

## Output contract

```json
{
  "category": "",
  "subcategory": "",
  "confidence": "high | medium | low",
  "requiresClarification": false,
  "alternatives": [
    {
      "category": "",
      "subcategory": "",
      "fitRationale": ""
    }
  ],
  "clarificationQuestion": ""
}
```

