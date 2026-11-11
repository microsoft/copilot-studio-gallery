# Agent DLP & Security Guard

> **Sample Disclaimer:** This solution is a governance reference sample and architectural template provided for demonstration, educational, and community evaluation purposes. It is **not** a certified production security assurance tool. Evaluator findings and scorecards are generated via LLM-assisted analysis and pattern matching and may produce false positives or false negatives. Qualified security and compliance administrator review is required before publishing or clearing any agent for production use.

An enterprise **Copilot Studio** governance agent and workflow solution sample that demonstrates patterns for auditing maker-built agents, topic instructions, and prompt flows for Data Loss Prevention (DLP) compliance, sensitive data leakage (credentials, connection strings, PII), and prompt injection vulnerabilities.

## Overview

As generative AI and Copilot Studio adoption expands across organizations, security and Center of Excellence (CoE) teams require automated safeguards to verify that custom agents adhere to corporate security policies. 

The **Agent DLP & Security Guard** demonstrates a pattern for interactive pre-publication audits. It inspects agent definitions, evaluates connector configurations against tenant DLP policies, tests prompt boundaries against known adversarial jailbreak patterns, and generates an auditable compliance scorecard.

[Download sample DLP rule catalog (CSV)](supporting/sample-dlp-rules.csv)

## Key Capabilities

- **Automated DLP Policy Verification**: Validates agent connection references and custom actions against organization Power Platform DLP policy groups (Business vs. Non-Business vs. Blocked).
- **Sensitive Data & Credential Scanning**: Inspects static agent instructions, knowledge definitions, and prompt templates for exposed credentials, bearer tokens, connection strings, and unredacted PII.
- **Prompt Injection & Adversarial Boundary Testing**: Evaluates agent system prompts against common jailbreak and indirect prompt injection signatures (instruction overriding, delimiter tampering, unauthorized system disclosure).
- **Auditable Governance Scorecards**: Produces structured compliance summaries with remediation guidance for makers and approval records for CoE administrators.

## Agent Skills & Tools

The solution includes dedicated inline skills and tool definitions:
- **`dlp-policy-evaluator` (Skill)**: Evaluates connector actions and data flows against organization DLP policies to identify blocked or cross-boundary transfers.
- **`prompt-injection-scanner` (Skill)**: Tests system prompts and user input handlers against prompt injection patterns and unauthorized system disclosure attempts.
- **`compliance-scorecard-generator` (Skill)**: Generates a clear, actionable audit report highlighting critical, high, and medium policy findings with remediation steps. Requires security administrator sign-off for High findings; maker self-exceptions are prohibited from overriding Critical or policy-blocking findings.
- **`DataverseAuditLogMCP` (Tool)**: Configured for persisting audit findings and clearance records in Dataverse (`shared_commondataserviceforapps` / `InvokeMCP`).
- **`AdminPolicyChecker` (Tool)**: Configured for querying tenant administration policies (`shared_powerplatformforadmins` / `GetEnvironmentDlpPolicies`).

## How It Works

1. **Intake & Trigger**: The maker or administrator initiates an interactive review by providing agent instructions and connector definitions.
2. **DLP & Connector Analysis**: Evaluates connectors and data sources to verify all endpoints are permitted within the target environment's DLP policy.
3. **Instruction & Prompt Security Scan**: Inspects prompt text and fallback topics for sensitive pattern signatures (SSNs, credit card numbers, secret keys).
4. **Adversarial Resilience Check**: Validates that system instructions enforce grounding and reject instruction-override attempts.
5. **Scorecard & Governance Gate**: If all checks pass, generates a compliance summary; if issues are found, provides specific remediation steps and clearance prerequisites.

## Conceptual Workflow Canvas

The solution includes a visual workflow canvas titled **`Audit agent DLP and security compliance`** (`agent-dlp-audit-workflow`).

> **Note on Workflow Implementation:** This workflow (`solution/Workflows/workflow.json`) provides a **conceptual visual preview** of the end-to-end agent audit and scorecard process on the Copilot Studio canvas (`trigger.metadata.associatedData.graph`). It does not contain an executable backend flow definition outside of its saved canvas metadata, and does **not** provide an automated pre-publication blocking gate into Copilot Studio's publishing engine. Center of Excellence (CoE) teams can implement automated publication blocking using Power Platform Application Lifecycle Management (ALM) pipelines or Center of Excellence Starter Kit audit flows.

The canvas illustrates:
- **Intake**: Conceptual entry point for agent governance review.
- **Policy Scan**: Evaluating connectors against active DLP policy groups.
- **Content Inspection**: Scanning instructions and topics for sensitive pattern leakage.
- **Risk Decision**: Evaluating whether security thresholds are met.
- **Scorecard Dispatch**: Formatting audit verdict and remediation recommendations.
- **Notification**: Providing compliance reports back to the maker.

## Prerequisites & Required Permissions

- **Environment**: Power Platform environment with Microsoft Copilot Studio enabled.
- **Channels**: Compatible with Microsoft Teams, Microsoft 365 Copilot, and Web Chat.
- **Required Connections & Administrative Permissions (if using tool actions):**
  - **Admin Policy Checker (`AdminPolicyChecker`):** Binds to the Power Platform for Admins connector (`shared_powerplatformforadmins` / `GetEnvironmentDlpPolicies`) using `authMode: Invoker`. Invoking users must hold **Power Platform Administrator** or **System Administrator** privileges in the tenant/environment to query active DLP policy groups. Ordinary makers without admin roles cannot inspect environment DLP policies via this tool.
  - **Dataverse Audit Log Tool (`DataverseAuditLogMCP`):** Binds to Microsoft Dataverse (`shared_commondataserviceforapps` / `InvokeMCP`) using `authMode: Invoker`. Invoking users require write and create privileges on the target Dataverse audit entity.
- **Running in Self-Service Maker Mode:** If admin connections or Dataverse are not configured, the agent can be used in self-service conversational review mode, where makers paste their agent instructions and connector lists into the chat session for heuristic review and receive the generated scorecard directly in the conversation without automated Dataverse persistence.
