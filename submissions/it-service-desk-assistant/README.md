# IT Service Desk Assistant

> **Sample Disclaimer:** This solution is an architectural reference sample and template provided for demonstration, evaluation, and community learning. It is **not** a production-ready IT service desk service. The diagnostic playbooks, identity recovery procedures, and escalation templates are illustrative examples that require organizational security review, policy validation, and integration with approved enterprise endpoints before any production deployment.

An intelligent **Copilot Studio** agent and workflow solution sample that demonstrates front-line IT helpdesk triage patterns, interactive diagnostic playbooks, routine employee self-service guidance (identity, password resets, VPN, software licensing), and structured incident escalation formatting.

## Overview

Frontline IT support teams spend over 40% of their time collecting basic diagnostics and addressing repetitive requests such as password resets, VPN connection failures, and software entitlement requests. 

The **IT Service Desk Assistant** demonstrates a pattern for 24/7 first-contact support across Microsoft Teams, Microsoft 365 Copilot, and web portals. When an employee reports an issue, the agent classifies the request using standard ITIL categories, guides the user through common self-service troubleshooting steps, and—if the issue requires human escalation—packages a structured incident hand-off with urgency ratings and diagnostic logs.

[Download sample IT incident catalog (CSV)](supporting/sample-it-incidents.csv)

## Key Capabilities

- **Conversational Classification & Intent Detection**: The agent identifies category and urgency across *Access & Identity*, *Network & Connectivity*, *Software & Licensing*, and *Hardware & Endpoints*.
- **Guided Self-Service Troubleshooting (conversational)**:
  - **Account & Identity**: Step-by-step guidance for Entra ID / Active Directory self-service password reset (SSPR) portals, MFA re-registration, and account lockout verification.
  - **VPN & Network**: Step-by-step connectivity troubleshooting (DNS flushing, certificate validation, split tunneling checks).
  - **Software Provisioning**: Guided software catalog lookups, entitlement criteria validation, and self-service portal links.
- **Structured Incident Escalation**:
  - Gathers reproduction steps, error codes, device OS, and impact severity (P1 Critical through P4 Low).
  - Formats an engineer-ready escalation payload for Dataverse, ServiceNow, Jira Service Management, or Zendesk.
- **Instruction-Level Credential Guidance**: Prompts users not to share plain-text passwords or secret tokens during troubleshooting sessions. Note that automatic programmatic text/chat redaction of chat history or incident payloads is **not** provided by this template; organizations requiring automatic redaction should configure Microsoft Purview Sensitive Information Types (SIT) or tenant-level Data Loss Prevention (DLP) rules.

## Agent Skills & Tools

The agent includes dedicated inline skills and tool definitions:
- **`identity-access-resolver` (Skill)**: Guided playbooks for account lockout recovery, password resets, and MFA re-registration.
- **`vpn-network-diagnostics` (Skill)**: Step-by-step guidance for VPN tunnel drops, gateway checks, and DNS resolution issues.
- **`incident-escalation-formatter` (Skill)**: Structures troubleshooting history and system errors into prioritized P1–P4 escalation records.
- **`ITKnowledgeBaseMCP` (Tool)**: Configured for Dataverse-backed knowledge base search (`shared_commondataserviceforapps` / `InvokeMCP`).
- **`DispatchITSMTicket` (Tool)**: Configured for incident dispatch to ITSM queues (`shared_itsm` / `CreateIncident`).

## How It Works

1. **Intake & Trigger**: The employee describes an IT problem in natural language via Teams or web chat.
2. **Triage & Classification**: The agent parses the request, determines the domain, and evaluates whether a known self-service resolution path exists.
3. **Knowledge Guidance**: References common IT operating procedures and troubleshooting steps.
4. **Interactive Troubleshooting**: If self-service is possible, walks the user through diagnostic steps with clear confirmation gates.
5. **Human Escalation**: If self-service fails or high urgency is detected, formats a prioritized IT ticket payload for manual submission or for a ticketing tool you bind in your tenant.

## Conceptual Workflow Canvas

The solution includes a visual workflow canvas titled **`Triage and resolve IT support incidents`** (`it-service-desk-triage-workflow`).

> **Note on Workflow Implementation (placeholder logic):** `solution/Workflows/workflow.json` contains two parts:
> - **Canvas graph** (`trigger.metadata.associatedData.graph`): a conceptual visual preview of the triage and escalation flow.
> - **Executable `definition`**: a **nonfunctional placeholder** included only so the export is structurally complete. Its HTTP trigger captures the request and a single Response action returns `501 NotImplemented` with `isPlaceholder: true`. It does **not** classify requests, search knowledge, create ITSM tickets, return ticket IDs, deliver playbooks, or send notifications.
>
> To make the workflow functional, replace the placeholder Response with your own actions (for example, an ITSM `CreateIncident` connector call and a Dataverse knowledge search) or a Power Automate flow in your tenant. Classification and guided troubleshooting in this sample are performed conversationally by the agent and its skills, not by this workflow.

The canvas illustrates:
- **Intake**: Conceptual entry point for employee requests.
- **Agent Analysis**: Problem domain, impact, and urgency classification.
- **Knowledge Search**: Querying resolution documentation.
- **Decision Branch**: Evaluating self-service feasibility versus engineering escalation.
- **Dispatch**: Packaging structured incident ticket records.
- **Notification**: Providing ticket tracking references back to the employee.

## Prerequisites & Required Connections

- **Environment**: Power Platform environment with Microsoft Copilot Studio enabled.
- **Channels**: Compatible with Microsoft Teams, Microsoft 365 Copilot, and Web Chat.
- **Required Connections & Permissions (if using tool actions):**
  - **ITSM Ticket Dispatch (`DispatchITSMTicket`):** Binds to the ITSM connector (`shared_itsm` / `CreateIncident`) using `authMode: Invoker`. Invoking users must have an active connection to your ITSM endpoint (e.g., ServiceNow, Jira Service Management) with permissions to create incident tickets in target queues.
  - **Knowledge Base MCP Tool (`ITKnowledgeBaseMCP`):** Binds to Microsoft Dataverse (`shared_commondataserviceforapps` / `InvokeMCP`) using `authMode: Invoker`. Invoking users require Dataverse read permissions on knowledge tables and access to the corresponding MCP endpoint.
- **Running in Chat-Only / Standalone Mode:** If external ITSM and Dataverse connections are not configured in your environment, the agent can be run without these tools enabled. In this mode, the agent operates as an interactive conversational troubleshooter, guiding users through diagnostic steps and presenting formatted incident summaries directly in the chat session for manual submission.
