# RFP Response Manager

Creates grounded proposal drafts from incoming RFP documents, coordinates iterative human review, and publishes approved responses to SharePoint.

## How it works

1. Watches a SharePoint folder for newly created RFP files and retrieves the file content.
2. Uses an extraction agent to preserve the source document text for downstream processing.
3. Uses a drafting agent to create a grounded proposal, save it in an RFP-specific draft folder, and return a sharing link.
4. Requests structured feedback and approval in Microsoft Teams.
5. Uses a review agent to revise the existing draft when changes are requested, repeating until it is approved or the iteration limit is reached.
6. Uses a finalization agent to publish the approved proposal and notify the reviewer and process owner, or notify the owner when review is exhausted without approval.

## Prerequisites

- Power Automate connections for SharePoint, Agent, Human review, and Office 365 Outlook
- A SharePoint document library for incoming RFPs, proposal drafts, and final proposals
- Grounding knowledge containing the services, rates, capabilities, and case studies that the drafting and review agents may use
- Microsoft Teams access for the reviewer receiving the human review request

## Import notes

After import, rebind all connector connections and update these values before enabling the flow:

- SharePoint site address, document library, and incoming RFP folder on the trigger
- `approverAlias` for the reviewer
- `Notify Owner Alias` for completion and escalation notifications
- `SharePoint Folder Path Draft` for proposal drafts
- `SharePoint Folder Path Final` for approved proposals
- `maxIterations` for the maximum number of review rounds

The flow polls SharePoint every minute. Confirm that cadence is appropriate for the target environment and verify that the selected agent models and grounding knowledge are available before running it.