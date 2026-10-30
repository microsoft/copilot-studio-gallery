# Clinical Support Agent

[!IMPORTANT] This agent is intended for ideation, demonstration, and experimentation. It has not been clinically validated or assessed for healthcare compliance. It is not intended for patient care, clinical decision-making, emergencies, or processing patient-identifiable information. Any healthcare use requires appropriate clinical, privacy, security, and regulatory review.

Retrieve general clinical guidelines, internal protocols, structured medical reference information, and public medical literature from approved Dataverse sources.

The agent provides general, role-appropriate clinical information for nurses, clinicians, and administrative staff. It does not handle PHI or provide patient-specific recommendations.

## Agent

The agent supports:

- **Nurses:** simplified protocols and actionable information
- **Clinicians:** detailed clinical guidance and reference information
- **Admin Staff:** procedural and compliance-focused information

## Capabilities

| Capability | Example request | Data source |
|---|---|---|
| Internal protocols and SOPs | "Show me the pain management protocol" | `Internal Clinical SOPs` |
| Clinical reference guidance | "Give me guidance on infection control" | `Medical Reference Quick Q&A` |
| Disease and medication information | "Explain medication safety" | `Medical Reference Quick Q&A` |
| Public literature summaries | "Summarize CDC guidance on infection prevention" | `CDC/NIH Guidelines, Journal Articles` |
| Research and article summaries | "Find research about hypertension" | `CDC/NIH Guidelines, Journal Articles` |
| Email delivery | "Email me this guidance" | Email tool |

## Tools and knowledge

| Component | Type | Purpose |
|---|---|---|
| `Internal Clinical SOPs` | Dataverse table | Internal protocols, SOPs, procedures, and workflows |
| `Medical Reference Quick Q&A` | Dataverse table | Structured clinical guidance and medical reference information |
| `CDC/NIH Guidelines, Journal Articles` | Dataverse table | Public medical literature and authoritative guidance |
| Dataverse MCP | Tool | Retrieves approved clinical information from Dataverse |
| Email tool | Tool | Sends information when explicitly requested by the user |

## Key guardrails

- The agent does not handle PHI or patient-specific data.
- It provides general clinical information and does not replace professional clinical judgment.
- Clinical information is retrieved from the configured Dataverse sources.
- Detailed routing, response formatting, disclaimers, email behavior, and error handling are defined in the agent instructions.

## Import notes

- Configure the Dataverse MCP connection.
- Confirm access to all three Dataverse tables.
- Configure the email connection.
- Verify that `Requestor Email` is available.
- Review the agent instructions and connections before publishing.
- Test the three primary retrieval scenarios before deployment.

## Example prompts

```text
Show me the pain management protocol.

Give me clinical guidance for infection control.

Explain medication safety.

Summarize CDC guidance related to infection prevention.

Find research about hypertension.

Email me this guidance.
```

## Responsible use

The Clinical Support Agent provides general clinical information and does not replace professional clinical judgment, organizational procedures, or individualized patient care.

It must not process PHI or provide recommendations tied to individual patients.

## Availability
The Clinical Support Agent is published and available through:

Microsoft Teams
Microsoft 365 Copilot Chat
