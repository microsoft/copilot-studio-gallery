# Agent DLP & Security Guard

An enterprise **Copilot Studio** governance agent and workflow solution that audits maker-built agents, topic YAML instructions, and prompt flows for Data Loss Prevention (DLP) compliance, sensitive data leakage (PII, credentials, payment card data), unapproved external HTTP connectors, and prompt injection vulnerabilities prior to production deployment.

## Overview

As generative AI and Copilot Studio adoption expands across organizations, security and Center of Excellence (CoE) teams require automated safeguards to verify that custom agents adhere to corporate security policies. 

The **Agent DLP & Security Guard** acts as an autonomous pre-publication auditor. It inspects agent definitions, validates connector configurations against tenant DLP policies, tests prompt boundaries against known adversarial jailbreak patterns, and generates an auditable compliance scorecard in Dataverse before an agent can be published to end-users.

[Download sample DLP rule catalog (CSV)](supporting/sample-dlp-rules.csv)

## Key Capabilities

- **Automated DLP Policy Verification**: Validates agent connection references and custom actions against organization Power Platform DLP policy groups (Business vs. Non-Business vs. Blocked).
- **Sensitive Data & Credential Scanning**: Inspects static agent instructions, knowledge definitions, and prompt templates for accidentally exposed credentials, bearer tokens, connection strings, and PII.
- **Prompt Injection & Adversarial Boundary Testing**: Evaluates agent system prompts against common jailbreak and indirect prompt injection signatures (instruction overriding, delimiter tampering, unauthorized system disclosure).
- **Auditable Governance Scorecards**: Produces structured compliance summaries with remediation guidance for makers and approval records for CoE administrators.

## Agent Skills & Tools

The solution includes dedicated inline skills and tools:
- **`dlp-policy-evaluator` (Skill)**: Evaluates connector actions and data flows against organization DLP policies to identify blocked or cross-boundary transfers.
- **`prompt-injection-scanner` (Skill)**: Tests system prompts and user input handlers against prompt injection patterns and unauthorized system disclosure attempts.
- **`compliance-scorecard-generator` (Skill)**: Generates a clear, actionable audit report highlighting critical, high, and medium policy findings with remediation steps.
- **`DataverseAuditLogMCP` (Tool)**: Persists audit findings, maker attestations, and compliance clearance timestamps in Dataverse.
- **`AdminPolicyChecker` (Tool)**: Connects to tenant administration policies to retrieve active environment DLP boundary definitions.

## How It Works

1. **Intake & Trigger**: Triggered automatically when an agent is queued for publication or manually by an agent maker seeking security clearance.
2. **DLP & Connector Analysis**: Scans the agent's connectors and data sources to verify all endpoints are permitted within the target environment's DLP policy.
3. **Instruction & Prompt Security Scan**: Inspects prompt text and fallback topics for sensitive pattern signatures (SSNs, credit card numbers, secret keys).
4. **Adversarial Resilience Check**: Validates that system instructions enforce grounding and reject instruction-override attempts.
5. **Scorecard & Governance Gate**: If all checks pass, generates a compliance certificate and logs the clearance in Dataverse; if issues are found, provides specific remediation steps to the maker.

## Workflows

The solution includes the **`Audit agent DLP and security compliance`** workflow (`agent-dlp-audit-workflow`), which orchestrates:
- **Intake**: Detects agent queued for governance review.
- **Policy Scan**: Evaluates connectors against active DLP policy groups.
- **Content Inspection**: Scans instructions and topics for sensitive pattern leakage.
- **Risk Decision**: Evaluates whether security thresholds are met.
- **Scorecard Dispatch**: Logs audit verdict and remediation recommendations in Dataverse.
- **Notification**: Delivers compliance results and certificate back to the maker.

## Import Notes & Prerequisites

- **Environment**: Power Platform environment with Microsoft Copilot Studio enabled.
- **Channels**: Ready for Microsoft Teams, Microsoft 365 Copilot, and Web Chat.
- **Optional Connectors**:
  - Microsoft Dataverse (for audit log storage and compliance tracking).
  - Power Platform for Admins (for environment DLP policy synchronization).
