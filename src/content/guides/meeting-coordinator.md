---
title: Meeting Coordinator
slug: meeting-coordinator
solution: MeetingCoordinatorWorkflow
---
Meeting Coordinator is a Copilot Studio workflow sample for coordinating
meetings from Microsoft To Do tasks. It identifies attendees, proposes meeting
times based on calendar availability, collects preferences in Microsoft Teams,
and creates a Teams meeting when a time is selected.

The solution includes the workflow and two Dataverse tables,
**Coordination Run** and **Vote**, which store proposed times and attendee
responses. It demonstrates how inline agents, connectors, and human input can
support a multi-step scheduling process.

## Inline agents

- **Meeting Task Builder** interprets the task, resolves the relevant team in
  Microsoft Teams, identifies attendees, and drafts an agenda. It requests human
  clarification when the team cannot be confidently identified.
- **Meeting Coordinator** uses Outlook to find candidate times and Dataverse
  MCP to manage coordination records. It evaluates attendee rankings and
  recommends a meeting time, another voting round, or an unsuccessful outcome.

## How it works

Creating a task such as **"Arrange a kickoff for Contoso Project"** in the
configured To Do list starts the workflow. For scheduling requests, attendees
receive an Adaptive Card in Teams to rank five proposed times. Required
attendees' preferences carry more weight in the selection.

When a time is selected, the workflow creates a Teams meeting with the attendees
and agenda. Tasks unrelated to meeting scheduling do not proceed through the
coordination process.

## Customization

- **Meeting types and durations:** the sample uses examples such as Kickstarter
  and Handover, with assigned durations that can be adapted to your requirements.
- **Attendee selection:** Teams membership determines required and optional
  attendees; adapt these rules to your organization's scheduling practices.
- **Scheduling preferences:** configure the scheduling window, time zone, and
  ranking rules to suit your requirements.

Canvas notes in the workflow designer highlight configuration and customization
points.

## Import

Download the solution ZIP from this gallery page and import it through Power
Platform into a development environment with Dataverse and access to modern
workflows, inline agents, and Dataverse MCP.

Configure the connection references for Microsoft To Do, Teams, Outlook,
Dataverse, Human review, and agent execution, along with the inline agents'
tool connections. Replace the setup placeholders with your environment's
connections, To Do list, reviewer, and notification mailbox. Review the target
calendar, scheduling settings, and model availability before enabling the
workflow.

**Before deployment:** address the sample's abort and timeout handling and
reconcile the agent instructions with their output descriptions before
unattended use. Evaluate the workflow with a small test group, as execution
sends messages and meeting invitations.
