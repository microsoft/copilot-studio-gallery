---
name: internal-consistency-review
description: Use when the user asks for the Internal Consistency Review of a contract, or asks to check a contract for internal conflicts, inconsistencies between sections, or gaps and unfilled elements. Do NOT use for comparing the contract against external law - that is the separate Legal Compliance Review skill.
---
# Internal Consistency Review

Use this skill to check one contract against itself - never against external law - and produce a copy of the contract annotated with every internal problem found.

## Steps

1. Read the full contract text (pasted text or an uploaded file).
2. Build a working map of the document: every defined term and where it is defined, every section/clause number, every cross-reference, every schedule/exhibit/appendix reference, and every placeholder (brackets, blanks, "TBD", repeated "[party name]", empty signature blocks, and similar).
3. Scan the map for three kinds of problems:
   - Conflict: two or more clauses state different things about the same subject (e.g. a 30-day termination notice in one section and a 60-day notice in another).
   - Inconsistency: a defined term used inconsistently (capitalization/numbering drift, a term defined once but a different word used for the same concept elsewhere, a cross-reference that points at the wrong or nonexistent clause).
   - Gap / unfilled element: a placeholder left unfilled, a clause that references a schedule/exhibit that is missing or empty, a defined term that is never used, an obligation stated without a responsible party or a deadline.
4. For every problem found, note its exact location (section/clause number or heading), a one-sentence description, and which of the three categories it is.
5. Produce the annotated copy of the contract as a Word document with highlights and margin comments: write a JSON list with one entry per issue - {"text": "<exact text from one paragraph of the contract>", "comment": "CONSISTENCY ISSUE - <category>: <description>"} - and run the bundled helper: `python3 scripts/add_comments.py "<original>.docx" issues.json "<new name>.docx"`. Always use this exact "CONSISTENCY ISSUE" prefix (highlighted yellow), so it stays visually distinguishable from any Legal Compliance Review comments ("LEGAL CONFLICT", red) that may be merged into the same document. If it reports unlocated text, retry with a shorter exact quote. If the contract is not a .docx, first create a .docx of the contract text with python-docx.
6. Return the annotated copy to the user as a brand-new file - never overwrite the original. If the user also wants a PDF: there is no Word-to-PDF converter in the sandbox and installs are blocked, so don't look for or install one - build the PDF directly with reportlab from the same issues.json, using the same highlight colours, a numbered marker after each highlighted passage, and a "Review Comments" section at the end listing each numbered comment in full.
7. In chat, present a short table: Location | Category | Description, for every issue found. If no issues are found, say so plainly rather than inventing one to fill the table.

## Example

Clause 4.2 says "payment is due within 30 days of invoice" and clause 9.1 says "payment is due within 45 days of invoice". Flag this as a Conflict at both locations, e.g. "[CONSISTENCY ISSUE - Conflict: payment term stated as 45 days here, but clause 4.2 states 30 days]".
