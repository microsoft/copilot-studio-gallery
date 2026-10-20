# Contract Compliance Reviewer

Contract Compliance Reviewer is a Copilot Studio agent that gives a contract a
first-pass review and returns a **new, annotated copy** for a legal
professional to check. It never changes the original file.

> **AI-assisted review, not legal advice.** The agent can miss issues, misread
> clauses, or rely on law that has since changed. Every finding must be checked
> by a qualified legal professional before anyone relies on it.

## What it does

Upload or paste a contract and choose one or both reviews:

- **Internal Consistency Review** checks the contract against itself:
  conflicting clauses, inconsistent defined terms, broken cross-references, and
  gaps such as unfilled placeholders or missing schedules.
- **Legal Compliance Review** checks the contract against current law, using
  only official sources such as government, legislature, and regulator
  websites. If organisational guidance is connected as knowledge, it also
  checks the contract against your own policies and reports those findings
  separately from the legal ones.

The agent returns a Word document with the affected text highlighted and the
explanation in a Word margin comment, plus a summary table in chat. If you ask
for a PDF, it builds one with the same highlights, numbered markers, and a
**Review Comments** section at the end.

| Finding | Highlight | Comment reviewer | Based on |
| --- | --- | --- | --- |
| `CONSISTENCY ISSUE` | Yellow | Internal Consistency Review | The contract itself |
| `LEGAL CONFLICT` | Red | Legal Compliance Review | Law, cited with an official source link |
| `ORG POLICY CONFLICT` | Green | Org Policy Review | Your organisation's own guidance |

## What's inside

- **Contract Compliance Reviewer agent** with web search enabled and
  instructions that restrict legal research to official sources.
- **`internal-consistency-review` skill** and **`legal-compliance-review`
  skill.** Each bundles a small `scripts/add_comments.py` helper that adds the
  highlights and margin comments, so the agent doesn't write its own Word code.
- **Legal Documents (Test) knowledge source**, a SharePoint placeholder for your
  organisation's legal guidance. Replace its URL after import.

## Tailor it to your organisation

The agent is a starting point. Adapt the sources to your jurisdiction, sector,
and subject area.

### Official legal sources

The agent instructions and step 3 of the `legal-compliance-review` skill list
examples of official sources: EUR-Lex for EU law, legislation.gov.uk for UK law,
congress.gov and govinfo.gov for US federal law, and sector bodies' own sites.
Replace or extend that list with the institutions relevant to your work, for
example:

- your country's official legislation portal or gazette;
- regulators for your subject area, such as data protection, financial
  services, employment, housing, or competition authorities;
- courts or tribunals whose published decisions you want to consider.

Keep the rule that only official sources may be cited. You can also add the
most important official sites as public website knowledge sources so the agent
checks them first.

### Organisational guidance

Point the **Legal Documents (Test)** knowledge source at the SharePoint library
that holds your contracting policies, playbooks, standard positions, or
approved clause libraries, or replace it with your own knowledge source. Any
conflict with that guidance is reported as `ORG POLICY CONFLICT` in green, so
reviewers can see at a glance what comes from internal rules and what comes
from the law or the consistency check.

You can add more knowledge sources, such as other SharePoint sites or uploaded
documents. If you don't have organisational guidance, delete the placeholder
and the agent runs the legal and consistency checks only.

### Review output

The highlight colours and comment reviewer names live in `add_comments.py`
inside each skill. To change them, edit the script in both skills.

## Import notes

1. Download the solution ZIP from this gallery page and import it into your
   Power Platform environment.
2. Open **Contract Compliance Reviewer** in Copilot Studio and update or remove
   the **Legal Documents (Test)** knowledge source. Its URL is a `contoso`
   placeholder.
3. Adjust the official legal sources in the instructions and in the
   `legal-compliance-review` skill for your jurisdiction.
4. Test with a sample contract, then publish and share the agent with your
   legal and compliance reviewers.

The skills run their helper scripts in the agent's code environment, so no
connections are needed for the core review. Before uploading contracts, check
that this fits your organisation's data-handling and confidentiality rules.

## Responsible use

- This is an **AI-assisted review**. It supports qualified reviewers; it does
  not replace them, and it is not legal advice.
- Laws, regulations, and guidance change. Always confirm a cited provision
  against the official source before relying on it.
- A qualified legal professional must review every finding, and anything the
  agent may have missed, before the contract is signed, changed, or relied on.

## Author

Adriana Trujillo.
