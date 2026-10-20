---
name: legal-compliance-review
description: Use when the user asks for the Legal Compliance Review of a contract, or asks to check a contract against current law, regulations, or legal requirements. Do NOT use for checking the contract against itself for internal conflicts or gaps - that is the separate Internal Consistency Review skill.
---
# Legal Compliance Review

Use this skill to check one contract against current law - using only official sources - and produce a copy of the contract annotated with every legal conflict found.

## Steps

1. Read the full contract (pasted text or an uploaded file).
2. Determine the governing law and jurisdiction. Look first for an explicit "Governing Law" clause. If none is stated, ask the user which country, region, or regulatory area to check the contract against (e.g. a specific EU member state, the UK, a US state or federal law, or a sector regulator).
3. Identify the official source(s) for that jurisdiction before searching the web - use only the government, legislative, or regulatory body's own site, never a secondary source. Examples:
   - EU law: eur-lex.europa.eu or europa.eu.
   - UK law: legislation.gov.uk or gov.uk.
   - US federal law: congress.gov, govinfo.gov, or the specific federal agency's own .gov site.
   - Other countries: that country's official government, parliament, or legislature domain.
   - Sector-specific bodies: the body's own official site (e.g. opec.org for an oil-sector agreement, imo.org for a maritime agreement).
   If you cannot find the applicable rule on an official source, say so plainly rather than citing an unofficial one (a law firm blog, a news article, a forum, or a general wiki).
4. Go clause by clause through the contract and compare each substantive obligation, right, or term against the current text of the applicable law or regulation found in step 3.
5. Flag any clause that contradicts, is rendered unenforceable by, or falls short of a requirement in the current law. For each, note its exact location (section/clause number or heading), a one-sentence description of the conflict, the specific law/regulation and section it conflicts with, and the official source URL.
6. If organisational knowledge on legal or policy specifics is available (e.g. a SharePoint library of contracting policies, playbooks, or standard positions), also review the contract against it. Report these as "ORG POLICY CONFLICT - <policy document + section>: <description> (source: <document link>)", never as LEGAL CONFLICT, so the user can see which conflicts come from internal specifics and which from the law. If no such knowledge is available, skip this step.
7. Produce the annotated copy of the contract as a Word document with highlights and margin comments: write a JSON list with one entry per issue - {"text": "<exact text from one paragraph of the contract>", "comment": "LEGAL CONFLICT - <law/regulation + section>: <description> (source: <official URL>)"} (or the ORG POLICY CONFLICT form from step 6) - and run the bundled helper: `python3 scripts/add_comments.py "<original>.docx" issues.json "<new name>.docx"`. It highlights LEGAL CONFLICT in red and ORG POLICY CONFLICT in green, keeping them visually distinct from Internal Consistency Review comments (yellow) that may be merged into the same document. If it reports unlocated text, retry with a shorter exact quote. If the contract is not a .docx, first create a .docx of the contract text with python-docx.
8. Return the annotated copy to the user as a brand-new file - never overwrite the original. If the user also wants a PDF: there is no Word-to-PDF converter in the sandbox and installs are blocked, so don't look for or install one - build the PDF directly with reportlab from the same issues.json, using the same highlight colours, a numbered marker after each highlighted passage, and a "Review Comments" section at the end listing each numbered comment in full.
9. In chat, present a short table: Location | Basis (Law or Org Policy) | Law/Regulation/Policy and Section | Description | Source, for every conflict found. If no conflicts are found, say so plainly. Always close by reminding the user this is an AI-assisted review and that a qualified legal professional should confirm any conclusion before it is relied on.

## Example

A contract clause gives an EU consumer a 7-day notice period where EU consumer-protection law requires a minimum 14-day right of withdrawal. Flag this as "[LEGAL CONFLICT - EU Consumer Rights Directive 2011/83/EU, Art. 9: notice period of 7 days is shorter than the 14-day minimum withdrawal period (source: eur-lex.europa.eu)]".
