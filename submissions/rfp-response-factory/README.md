# RFP Response Factory

A bid team receives an RFP: a Word file or a PDF, sometimes a scanned one, and often one or more addenda later. This sample
turns that file into the working set a proposal manager needs:

- a **requirements matrix** that keeps the buyer's own requirement IDs and records where each one sits (page, section, table row)
- a **draft response** for each requirement, written only from approved answer-library entries, and carrying the answer ID it came from
- a **compliance matrix** and policy **flags** (contract terms, thresholds, expired certifications, page and word limits)
- **gap cards** in Teams for requirements with no approved answer, routed to the right subject-matter expert
- **clarification questions** for ambiguous or contradictory requirements
- a filled proposal and compliance-matrix package, and **one approval card** at the level the deal needs

The design rule is "deterministic where exactness matters". Word and page counts, date and threshold comparisons, certification
validity, requirement IDs and compliance values are computed by code. Language judgment (is this sentence a requirement, does this
rule really apply, write this response) is done by prompts that return typed JSON.

> **This is a sample, not a production system.** Its output is a draft for qualified people to review. It can miss requirements,
> pick the wrong answer or misjudge a policy rule. Nothing it produces is legal, contractual or pricing advice. A person must
> review every response, flag and clarification before anything goes to a buyer. Test it on the synthetic data first.

## Agents

**RFP Orchestrator** is the conversational entry point (Copilot Studio, Teams channel). It doesn't drive the pipeline. It answers
questions about a run, using only its tools:

| Tool or hook | What it does |
|---|---|
| `RFP - Get Run Status` | The RFP's stage, what it's waiting for now, and the recent run log with credits |
| `RFP - Explain Flag` | The flags on one requirement and why each one fired |
| `RFP - Explain Answer` | A requirement's compliance value, the answer ID it used and the response text |
| `RFP - Rerun Stage` | Reruns from a stage. It asks for confirmation in a separate turn first |
| Pre-tool-use hook | Denies a rerun the tool would refuse (run still going, RFP already filed, stage out of range) |
| Post-tool-use hook | Writes an audit row for every tool call to `hrs_runlog` |

The pipeline itself isn't an agent. Its language steps are **12 AI Builder prompts** (identify requirements, classify, extract RFP
facts, judge relations, interpret an addendum, screen and adjudicate policy rules, shortlist and select answers, draft responses,
sections and clarifications), called from the pipeline flow.

## Workflows

| Workflow | Trigger | What it does |
|---|---|---|
| `RFP - Receive Inbound Document` | A file lands in the SharePoint `Inbound` folder | Matches it to an opportunity, then creates the RFP, revision and document rows, and starts the run. A second file for the same RFP becomes an addendum revision |
| `RFP - Run Pipeline` (hero) | An RFP's status changes to Running | Runs nine stages in order: intake and normalize, extract requirements, reconcile addendum, analyze, select answers, evaluate policy, route gaps and clarifications, assemble, approve. Each stage writes its state and a run-log row, so the run can restart at any stage. It stops at "Awaiting human" for gaps, OCR checks and approval |
| `RFP - Route Gap To SME` | A gap row is created | Posts a Teams card to the SME, with a reminder and then an escalation to the backup SME. Records the answer as a Draft library entry |
| `RFP - Verify OCR Requirement` | A low-confidence OCR flag is created | Posts a card with the page crop so a person can confirm or correct the text |
| `RFP - Request Approval` | An approval row is created | Posts the approval card at the derived level (L1-L4). Approve files the package; reject sends it back with comments |
| `RFP - Get Run Status`, `Explain Flag`, `Explain Answer`, `Rerun Stage` | The agent calls the flow | The Orchestrator's tools |
| `RFP - Hook Pre Tool Use`, `RFP - Hook Post Tool Use` | Agent hook events | The Orchestrator's hooks |

The workflow canvases in this gallery entry were **generated from each flow's definition**: the trigger, then each top-level action,
with edges from `runAfter`. They weren't saved by the workflow designer, because these flows were built from JSON specs. Containers
(If, Scope, loops) show as single steps.

## Prerequisites

You need all of these before you import. The **[companion repository](https://github.com/samkhawajask-collab/RFPInbound)** has the
code, the scripts and step-by-step setup.

1. **The data solution `RFPFactoryData`**, imported first. It holds the 22 Dataverse tables and 22 choices. They're too large for a
   gallery entry, so they ship as a release asset in the companion repository. This solution won't import without them.
2. **The `rfp-tools` service**: a Python Azure Function (Flex Consumption) that does the deterministic work. Deploy it from the
   companion repository. The custom connector in this solution calls it.
3. **Azure AI Document Intelligence** (Layout model) for PDF and scanned-PDF intake, called by `rfp-tools` with its managed identity.
4. **A SharePoint site** with the folders `Inbound`, `Content/Company`, `Content/Templates`, `Output/Draft` and `Output/Filed`. The
   setup script creates it and uploads the templates.
5. **Reference data** in the tables: answer library, SMEs, policy rules, approvers, certifications, opportunities. A synthetic data
   set and a seed script are in the companion repository.
6. **Licensing**: Copilot Studio capacity (Copilot Credits) for the agent, the agent flows and the prompts, and Power Automate for
   the three Teams card flows. The Workflows app must be allowed in the Teams admin center for card actions.

## Import notes

Bind these **connection references** at import:

| Connection reference | Connector |
|---|---|
| `hrs_dataverseconnection` | Microsoft Dataverse |
| `hrs_sharepointconnection` | SharePoint |
| `hrs_teamsconnection` | Microsoft Teams |
| `hrs_wordonlineconnection` | Word Online (Business) |
| `hrs_rfptoolsconnection` | RFP Factory Tools (custom connector in this solution; the connection asks for the Azure Functions key) |

Set these **environment variables**. Give `hrs_RfpToolsBaseUrl` its value **during** import, in the import dialog or a `pac solution
import --settings-file`, because the custom connector can't import without a host. The others can be set during or after import:

| Variable | Value |
|---|---|
| `hrs_RfpToolsBaseUrl` | Host of your `rfp-tools` Function App |
| `hrs_SharePointSiteUrl` | Your SharePoint site URL |
| `hrs_InboundLibraryUrl`, `hrs_ContentLibraryUrl`, `hrs_OutputLibraryUrl` | The site's folders |
| `hrs_DocumentLibraryId`, `hrs_DocumentDriveId` | The library's SharePoint list ID (for the file trigger) and its Graph drive ID (for PDF conversion) |
| `hrs_CompanyName` | The respondent's legal name, used in proposal headers |
| `hrs_PilotRecipientUpn` | The one user who receives every card during a pilot |
| `hrs_ReminderAfter`, `hrs_EscalateAfter` | ISO 8601 durations, default `PT24H` |

Then turn on the flows. Importing with bound references hasn't turned them on in our tests; the companion repo's
`activate-flows.ps1` does it. Publish the Orchestrator and add it to the Teams channel.

## Where data goes and what it does

- RFP text and document layout go to **your** `rfp-tools` Function App and **your** Document Intelligence resource.
- Requirement text goes to the AI Builder prompts and the Orchestrator's model in your environment.
- The flows **post Teams cards** (to `hrs_PilotRecipientUpn` in the pilot setup), **write files** to your SharePoint site, and
  **write and delete Dataverse rows** for the run. A rerun deletes the rows that the rerun stage and every later stage created
  for that RFP, then runs those stages again.
- Nothing is sent to a buyer. Submitting the proposal is left to people.

## Limitations

- Excel questionnaires aren't supported. Only Word, native PDF and scanned PDF.
- It was built and evaluated against one synthetic data set (one fictional vendor and three RFPs). Expect to tune the prompts and the
  policy rules for your own documents.
- The agent can still word things in ways its tools didn't say. Check the run log before acting on an unexpected claim.
- Cost grows with document size. The project's estimate for one full run of a 60-requirement RFP is about 480 Copilot Credits
  (about 400 for prompts, about 80 for agent-flow actions). An RFP with an addendum runs most stages twice. Document Intelligence
  pages are billed separately in Azure.
