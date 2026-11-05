# IT Service Desk Assistant

An intelligent **Copilot Studio** agent and workflow solution that automates front-line IT helpdesk triage, executes interactive diagnostic playbooks, resolves routine employee issues (identity, password resets, VPN, software licensing), and escalates complex incidents with structured troubleshooting telemetry directly to engineering queues.

## Overview

Frontline IT support teams spend over 40% of their time collecting basic diagnostics and addressing repetitive requests such as password resets, VPN connection failures, and software entitlement requests. 

The **IT Service Desk Assistant** provides 24/7 autonomous first-contact support across Microsoft Teams, Microsoft 365 Copilot, and web portals. When an employee reports an issue, the agent classifies the request using standard ITIL categories, searches enterprise knowledge bases, executes guided troubleshooting steps, and—if the issue requires human escalation—packages a complete, structured incident hand-off with urgency ratings and diagnostic logs.

[Download sample IT incident catalog (CSV)](supporting/sample-it-incidents.csv)

## Key Capabilities

- **Intelligent Classification & Intent Detection**: Automatically identifies category and urgency across *Access & Identity*, *Network & Connectivity*, *Software & Licensing*, and *Hardware & Endpoints*.
- **Self-Service Diagnostic Playbooks**:
  - **Account & Identity**: Self-service Entra ID / Active Directory password reset guidance, MFA authentication verification, and account unlock procedures.
  - **VPN & Network**: Step-by-step connectivity troubleshooting (DNS flushing, certificate checks, split tunneling verification).
  - **Software Provisioning**: Guided software catalog lookups, license entitlement validation, and installation links.
- **Structured Incident Escalation**:
  - Gathers reproduction steps, error codes, device OS, and impact severity (P1 Critical through P4 Low).
  - Formats an engineer-ready escalation payload for Dataverse, ServiceNow, Jira Service Management, or Zendesk.
- **Enterprise Safety & Privacy**: Redacts personal passwords, tokens, and credentials from chat history and incident summaries.

## Agent Skills & Tools

The agent includes dedicated inline skills and tools:
- **`identity-access-resolver` (Skill)**: Automated playbooks for account lockout recovery, password resets, and MFA re-registration.
- **`vpn-network-diagnostics` (Skill)**: Step-by-step guidance for VPN tunnel drops, gateway checks, and DNS resolution issues.
- **`incident-escalation-formatter` (Skill)**: Structures troubleshooting history and system errors into prioritized P1–P4 escalation records.
- **`ITKnowledgeBaseMCP` (Tool)**: Connects to enterprise knowledge bases and standard operating procedures (SOPs).
- **`DispatchITSMTicket` (Tool)**: Dispatches verified incident records directly into ITSM service queues.

## How It Works

1. **Intake & Trigger**: The employee describes an IT problem in natural language via Teams or web chat.
2. **Triage & Classification**: The agent parses the request, determines the domain, and evaluates whether a known self-service resolution path exists.
3. **Knowledge Retrieval**: Searches connected IT SOPs and knowledge base articles for authoritative resolutions.
4. **Interactive Troubleshooting**: If self-service is possible, walks the user through diagnostic steps with clear confirmation gates.
5. **Human Escalation**: If self-service fails or high urgency is detected, creates a prioritized IT ticket and routes it to the on-call engineer queue.

## Workflows

The solution includes the **`Triage and resolve IT support incidents`** workflow (`it-service-desk-triage-workflow`), which orchestrates:
- **Intake**: Detects submitted employee request.
- **Agent Analysis**: Classifies problem domain, impact, and urgency.
- **Knowledge Search**: Retrieves matching IT resolution articles.
- **Decision Branch**: Validates if the issue is resolvable via automated self-service or requires escalation.
- **Dispatch**: Generates structured incident ticket in Dataverse / ITSM queue.
- **Notification**: Delivers resolution summary or ticket tracking ID back to the employee.

## Import Notes & Prerequisites

- **Environment**: Power Platform environment with Microsoft Copilot Studio enabled.
- **Channels**: Ready for Microsoft Teams, Microsoft 365 Copilot, and Web Chat.
- **Optional Connectors**: 
  - Microsoft Dataverse (for ticket records and knowledge storage).
  - Office 365 Outlook / Teams (for status notifications and escalation alerts).
