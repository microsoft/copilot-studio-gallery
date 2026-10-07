# RFP Response Manager

Creates grounded Word proposal drafts from incoming RFP documents, requests a single human approval, and copies approved documents to a final SharePoint folder.

## How it works

1. Watches a SharePoint folder for newly created RFP files and retrieves the file content.
2. Passes the document attachment to an Extract node that returns its verbatim readable text as `rfp_text`.
3. Uses a drafting agent to write a grounded 600-900 word proposal, create a genuine `.docx` with Word Online (Business), and copy it into an RFP-specific SharePoint draft folder. The agent returns the destination's direct document link, identifiers, path, and ETag.
4. Requests a single Yes/No approval in Microsoft Teams, linking to the draft Word document. There is no feedback field, review agent, redrafting, or review loop.
5. On approval, the finalization agent is instructed to verify the reviewed draft's identity, nonzero size, and ETag, then copy that same document to the final folder without rewriting it or overwriting an existing file. After verifying the final copy, it emails the reviewer and process owner.
6. On rejection, the finalization agent is instructed to leave the draft unchanged, create no final folder or file, and email the owner with the draft link for manual follow-up.

The agent instructions require an explicit failure if source text is unreadable, required document metadata cannot be verified, or a tool fails. A missing or malformed approval is not treated as rejection. These safeguards are implemented in agent instructions, not explicit workflow condition branches; validate them in the target environment before production use.

## Prerequisites

- Power Automate connections for SharePoint, Agent, Human review, Word Online (Business), and Office 365 Outlook
- A SharePoint document library for incoming RFPs, proposal drafts, and final proposals
- Grounding knowledge containing the services, rates, capabilities, and case studies that the drafting agent may use
- Microsoft Teams access for the reviewer receiving the human review request
- Existing SharePoint access for the reviewer and notification recipients; the agents are instructed not to create sharing links or change permissions
- Permission to create Word documents and copy them from the Word tool's source location into the configured SharePoint library
- Source documents with a sensitivity label of General or Non-Business; the workflow cannot read content protected by a higher sensitivity label

## Import notes

After import, rebind all connector connections and update these values before enabling the flow:

- Replace the example SharePoint site address (`https://contoso.sharepoint.com/sites/rfp-response-manager`), select the document library, and confirm the incoming RFP folder on the trigger
- `approverAlias` for the reviewer
- `Notify Owner Alias` for completion and rejection notifications
- `SharePoint Folder Path Draft` for proposal drafts
- `SharePoint Folder Path Final` for approved proposals

### Drafting agent grounding

No grounding knowledge sources or placeholder document URLs are configured in this solution. Grounding documents are not included.

Before enabling the flow, add your own accessible grounding sources to the drafting agent, covering capabilities, case studies, rates, and services. Configuring the trigger's SharePoint site does not configure agent knowledge sources.

The drafting instructions still prohibit inventing capabilities, references, or pricing and require unknowns to be marked `[TBD - confirm with delivery lead]`. RFP and grounding contents are treated as source material, not instructions or notification recipients.

The flow polls SharePoint every minute. Confirm that cadence is appropriate for the target environment and verify that the selected agent models and grounding knowledge are available before running it.

## Troubleshooting

If an agent reports `404 tool not found`, remove and add the affected tools again:

- Drafting agent: Word Online (Business) Create a Microsoft Word document with the given content; SharePoint Create new folder, Copy file, Get file metadata using path, Get file properties, Get all lists and libraries, and Get files (properties only)
- Finalization agent: SharePoint Create new folder, Copy file, Get file metadata using path, Get file properties, and Get all lists and libraries; Office 365 Outlook Send an email

If document creation or link resolution fails, verify the Word source library and cross-site copy permissions. The approval link must be the copied destination document's `Link to item`, not the Word tool's temporary download URL.

If the draft changes after it is submitted for approval, its ETag check is intended to stop finalization for manual follow-up. Rejection also requires manual follow-up; there is no automatic revision cycle.