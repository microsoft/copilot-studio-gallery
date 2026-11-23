---
title: Presentation Deck Generator
slug: presentation-deck-generator
solution: presentation_deck_generator
---
> **Sample Disclaimer:** This solution is an architectural reference sample and template provided for demonstration, evaluation, and community learning. It is **not** a production-ready enterprise presentation rendering service. The slide storyboarding heuristics, template selection rules, and presenter note prompts are illustrative examples that require organizational brand review, template validation, and integration with approved enterprise endpoints before production deployment.

An intelligent **Copilot Studio** agent and workflow solution sample that transforms raw text, meeting notes, project briefs, and business data into structured slide outlines, selects on-brand corporate PowerPoint template layouts, and drafts contextual presenter notes.

## Overview

Knowledge workers spend substantial time manually formatting text into PowerPoint slides, often struggling to align content with corporate branding, font standards, and layout guidelines.

The **Presentation Deck Generator** demonstrates a pattern for conversational presentation creation across Microsoft Teams, Microsoft 365 Copilot, and web portals. When a user provides a brief or narrative, the agent deconstructs the content into a structured slide sequence, selects appropriate slide layouts, generates bullet points and presenter talking points, and prepares a presentation payload.

[Download sample presentation briefs catalog (CSV)](/copilot-studio-gallery/bundles/presentation-deck-generator-57ea701759bfb84064fea691c29215d3d06cfd3153d097710c6c405da220c45b-sample-deck-briefs.csv)

## Key Capabilities

- **Intelligent Storyboarding & Slide Structuring**: Deconstructs raw text into logical presentation sequences (Title, Executive Summary, Strategic Pillars, Key Metrics, Timeline, and Next Steps).
- **Template Layout Selection**: Identifies appropriate slide layouts for content types (e.g., Metrics Callout for KPIs, 3-Column for strategic pillars, Milestone Timeline for project roadmaps).
- **Presenter Notes Generation**: Automatically generates contextual talking points and background details for speaker notes beneath each slide.
- **Brand Consistency Guidance**: Enforces corporate palette guidelines and typography rules in generated slide summaries.

## Agent Skills & Tools

The solution includes dedicated inline skills and tool definitions:
- **`slide-outline-synthesizer` (Skill)**: Parses unstructured briefs and synthesizes concise, presenter-ready slide titles and bullet points.
- **`template-layout-selector` (Skill)**: Matches slide topics to standardized corporate presentation layouts (KPI grid, multi-column comparison, roadmap).
- **`presenter-notes-generator` (Skill)**: Produces comprehensive speaker notes with background context and talking points.
- **`SharePointTemplateMCP` (Tool)**: Configured for querying corporate `.potx` presentation templates from SharePoint (`shared_sharepointonline` / `InvokeMCP`).
- **`PowerPointGeneratorConnector` (Tool)**: Configured for dispatching slide payloads to presentation rendering services (`shared_powerpoint` / `CreatePresentation`).

## How It Works

1. **Intake & Trigger**: The user submits a project brief, meeting summary, or bulleted notes via Teams or web chat.
2. **Deconstruction & Outline**: The agent analyzes key themes and proposes a structured multi-slide outline.
3. **Layout Mapping**: Recommends appropriate visual layouts from the corporate slide catalog for each slide.
4. **Drafting Notes**: Assembles presenter speaking notes for each topic to aid delivery.
5. **Payload Formatting**: Formats the presentation structure for review in chat or dispatch to connected rendering tools.

## Conceptual Workflow Canvas

The solution includes a visual workflow canvas titled **`Generate on-brand presentation decks`** (`presentation_deck_generator_workflow`).

> **Note on Workflow Implementation (placeholder logic):** `solution/Workflows/workflow.json` contains two parts:
> - **Canvas graph** (`trigger.metadata.associatedData.graph`): a conceptual visual preview of the end-to-end presentation generation pipeline on the Copilot Studio canvas.
> - **Executable `definition`**: a **nonfunctional placeholder** included only so the export is structurally complete. Its HTTP trigger captures the brief submission and a single Response action returns `501 NotImplemented` with `isPlaceholder: true`. It does **not** generate `.pptx` files, format live PowerPoint presentations, or write to SharePoint, and it does **not** deliver automated file exports.
>
> Slide storyboarding, outline synthesis, and presenter notes in this sample are produced conversationally by the agent and its skills for human review. To automate file generation, replace the placeholder action with your own PowerPoint connector, Power Automate flow, or Office Script logic.

The canvas illustrates:
- **Intake**: Conceptual entry point for presentation brief submissions.
- **Agent Analysis**: Audience analysis and theme extraction.
- **Template Lookup**: Querying corporate master template definitions.
- **Slide Composition**: Assembling slide titles, body copy, and layout markers.
- **Presenter Notes**: Generating contextual speaker notes.
- **Handoff**: Delivering presentation summary and download link back to the user.

## Prerequisites & Required Connections

- **Environment**: Power Platform environment with Microsoft Copilot Studio enabled.
- **Channels**: Compatible with Microsoft Teams, Microsoft 365 Copilot, and Web Chat.
- **Required Connections & Permissions (if using tool actions):**
  - **SharePoint Template Tool (`SharePointTemplateMCP`):** Binds to SharePoint Online (`shared_sharepointonline` / `InvokeMCP`) using `authMode: Invoker`. Invoking users must have read access to the organization's corporate asset library or template document library.
  - **PowerPoint Generator Connector (`PowerPointGeneratorConnector`):** Binds to the PowerPoint connector (`shared_powerpoint` / `CreatePresentation`) using `authMode: Invoker`. Invoking users require write access to their OneDrive for Business or designated SharePoint site to save rendered presentations.
- **Running in Chat-Only / Standalone Mode:** If external SharePoint and PowerPoint connectors are not configured in your environment, the agent can be run without these tools enabled. In this mode, the agent operates as a conversational presentation coach, delivering slide-by-slide outlines, layout recommendations, and speaker notes directly in the chat session for copy-pasting into local presentations.
