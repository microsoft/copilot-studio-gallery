---
title: Executive Meeting Briefing Agent
slug: executive-meeting-briefing-agent
solution: executive_meeting_briefing_agent
---
> **Sample Disclaimer:** This solution is an architectural reference sample and template provided for demonstration, evaluation, and community learning. It is **not** a production-ready enterprise calendar ingestion or executive dossier service. The meeting analysis heuristics, attendee profile synthesis, and summary formatting prompts are illustrative examples that require organizational privacy review, data governance policies, and integration with approved Microsoft Graph or Exchange endpoints before production deployment.

An intelligent **Copilot Studio** agent and workflow solution sample that compiles personalized pre-meeting briefing dossiers by analyzing upcoming calendar events, summarizing recent email exchanges and chats with participants, and synthesizing attendee backgrounds and action items.

## Overview

Executives and leaders spend substantial time preparing for daily calendars packed with customer meetings, partner reviews, and internal steering committees. Gathering context from disparate email threads, calendar invites, and past meeting notes is often manual, repetitive, and time-consuming.

The **Executive Meeting Briefing Agent** demonstrates a pattern for automated executive preparation across Microsoft Teams, Microsoft 365 Copilot, and web portals. When queried or triggered ahead of a scheduled meeting, the agent retrieves event details, researches attendee roles, extracts recent interactions from mail threads, highlights critical open action items, and delivers a concise executive briefing dossier directly to the leader.

[Download sample meeting schedules and context catalog (CSV)](/copilot-studio-gallery/bundles/executive-meeting-briefing-agent-7d75eacfc531064115d931830753734619b27eab6d21354b3284c4074c2af52d-sample-meeting-schedules.csv)

## Key Capabilities

- **Automated Calendar Context Ingestion**: Extracts meeting titles, schedules, attendee lists, agendas, and attached briefs from scheduled calendar appointments.
- **Attendee Background & Relationship Synthesis**: Researches participant roles, reporting hierarchies, and past collaboration context to give leaders clear stakeholder awareness.
- **Email Thread & Interaction Summarization**: Synthesizes recent conversation history, outstanding redlines, and pending deliverables leading up to the discussion.
- **Executive Dossier Generation**: Compiles structured one-page briefing summaries with attendee profiles, strategic objectives, anticipated talking points, and risk factors.
- **Adaptive Card Dispatch**: Delivers pre-meeting digests directly inside Microsoft Teams ahead of each scheduled call.

## Agent Skills & Tools

The solution includes dedicated inline skills and tool definitions:
- **`attendee-profile-researcher` (Skill)**: Parses meeting participant rosters and synthesizes professional roles, department affiliations, and stakeholder perspectives.
- **`email-thread-summarizer` (Skill)**: Analyzes recent email exchanges and Teams threads related to the meeting topic to isolate decisions and blockers.
- **`executive-dossier-builder` (Skill)**: Assembles a concise, structured pre-meeting dossier complete with strategic goals, recommended questions, and talking points.
- **`MicrosoftGraphCalendarMCP` (Tool)**: Configured for querying Microsoft 365 calendar and attendee metadata (`shared_office365` / `InvokeMCP`).
- **`TeamsAdaptiveCardDispatcher` (Tool)**: Configured for posting structured adaptive cards with meeting briefings to Microsoft Teams channels or direct chats (`shared_teams` / `PostCard`).

## How It Works

1. **Schedule Discovery**: The agent identifies upcoming calendar commitments requiring briefing context (e.g., meetings occurring in the next 24 hours or user-specified events).
2. **Context Research**: Gathers attendee profiles, organization charts, and past communication threads.
3. **Synthesis & Risk Extraction**: Highlights unaddressed open issues, past agreements, and key goals for each attendee.
4. **Dossier Compilation**: Generates a standardized briefing containing an executive overview, attendee cheat-sheet, discussion points, and targeted outcomes.
5. **Digest Delivery**: Formats the briefing as an actionable Adaptive Card or conversational summary in Teams or web chat.

## Conceptual Workflow Canvas

The solution includes a visual workflow canvas titled **`Compile executive pre-meeting briefing dossiers`** (`executive_meeting_briefing_workflow`).

> **Note on Workflow Implementation (placeholder logic):** `solution/Workflows/workflow.json` contains two parts:
> - **Canvas graph** (`trigger.metadata.associatedData.graph`): a conceptual visual preview of the end-to-end executive briefing pipeline on the Copilot Studio canvas.
> - **Executable `definition`**: a **nonfunctional placeholder** included only so the export is structurally complete. Its HTTP trigger captures the meeting briefing request and a single Response action returns `501 NotImplemented` with `isPlaceholder: true`. It does **not** connect to live Exchange mailboxes, query Microsoft Graph APIs, or post messages to Teams, and it does **not** deliver automated briefing dispatches.
>
> Calendar analysis, attendee research, and dossier synthesis in this sample are produced conversationally by the agent and its skills for human review. To automate briefing delivery, replace the placeholder action with your own Microsoft 365 Graph connector, Power Automate flow, or Azure Logic App.

The canvas illustrates:
- **Intake**: Conceptual entry point for calendar event briefings and queries.
- **Calendar Parsing**: Extracting participant emails, agenda notes, and meeting timing.
- **Graph Lookup**: Querying attendee profile info and organizational context.
- **Thread Analysis**: Summarizing recent email communications and shared attachments.
- **Dossier Builder**: Synthesizing talking points, strategic objectives, and potential blockers.
- **Dispatch**: Delivering the executive briefing card to Teams or the Copilot chat window.

## Prerequisites & Required Connections

- **Environment**: Power Platform environment with Microsoft Copilot Studio enabled.
- **Channels**: Compatible with Microsoft Teams, Microsoft 365 Copilot, and Web Chat.
- **Required Connections & Permissions (if using tool actions):**
  - **Microsoft Graph Calendar Tool (`MicrosoftGraphCalendarMCP`):** Binds to Office 365 Calendar (`shared_office365` / `InvokeMCP`) using `authMode: Invoker`. Invoking users must have permissions to read their own calendar events and view attendee details (`Calendars.Read`, `User.Read.All`).
  - **Teams Adaptive Card Dispatcher (`TeamsAdaptiveCardDispatcher`):** Binds to Microsoft Teams (`shared_teams` / `PostCard`) using `authMode: Invoker`. Invoking users require permission to send messages or cards in the destination Teams chat or channel (`Chat.ReadWrite`, `ChannelMessage.Send`).
- **Running in Chat-Only / Standalone Mode:** If external Office 365 and Teams connectors are not configured in your environment, the agent can be run without these tools enabled. In this mode, the agent operates as a conversational executive advisor, analyzing meeting agendas and participant notes provided by the user in chat and generating comprehensive briefing dossiers directly within the conversation window.
