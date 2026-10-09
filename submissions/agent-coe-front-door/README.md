# Agent CoE Front Door

Agent CoE Front Door provides a governed **agent intake and triage process** for agent discovery, guidance, and delivery support. It checks the existing catalogue before recommending new development, grounds licensing and governance answers in organization-owned knowledge, and creates an intake record only after the requester confirms the collected details.

## Agent

The primary Copilot Studio agent:

- searches the Dataverse agent catalogue for reusable options;
- answers licensing and capacity questions from KB-01;
- applies governance and routing guidance from KB-02;
- applies naming, ownership, and catalogue guidance from KB-03;
- collects only missing intake information;
- presents a confirmation summary before writing data; and
- creates and reads back Dataverse intake records.

The solution includes agent-advisor and agent-intake skills, a Dataverse MCP tool, three Dataverse tables (Agent Catalogue, Agent Intake Request, and Tenant Agent Inventory), a model-driven triage app with an intake dashboard, and an optional disabled daily Power Platform Inventory API flow with its custom connector.

### Agent Catalogue vs Tenant Agent Inventory

These two tables are different on purpose. **Agent Catalogue** is the curated, human-approved list the agent recommends to employees. **Tenant Agent Inventory** is a technical discovery cache populated by the optional daily flow — it records that an agent *exists*, not that it is approved. An inventory match is discovery evidence only and must never be presented as a CoE-approved recommendation.

## Workflows

The solution includes one **disabled** daily cloud flow, **Refresh Power Platform Agent Inventory Daily**, with a custom connector for the Power Platform Inventory API. When an authorized owner configures the delegated connection and enables it, the flow discovers Copilot Studio and Microsoft 365 Copilot Agent Builder agents into the Tenant Agent Inventory table.

The query targets only the `microsoft.copilotstudio/agents` resource type. It does **not** discover custom-engine or pro-code agents (for example, agents built with the Microsoft 365 Agents Toolkit / Agents SDK), declarative agents that live only in Microsoft 365 Copilot, or other Power Platform resource types.

Agent orchestration otherwise uses Copilot Studio skills and tools:

1. Search the internal catalogue and prioritize a verified reusable match.
2. Use the mapped knowledge source for licensing, governance, or naming questions.
3. If intake is required, collect missing facts and show a confirmation summary.
4. Create the intake record only after explicit confirmation.
5. Read the created record back.

## Import notes

Import the solution into a non-production Power Platform environment with Dataverse.

After import:

1. Upload approved KB-01, KB-02, and KB-03 content and test each source independently. The packaged knowledge files contain `[ORGANIZATION INPUT]` placeholders and must be completed with approved local policy.
2. Configure an approved `shared_commondataserviceforapps` connection and bind the connection reference.
3. If the imported Dataverse MCP tool returns HTTP 403, remove it and add a target-native Microsoft Dataverse MCP Server.
4. If parent agent instructions appear empty after import, restore them in the designer, save, reopen, and verify persistence.
5. Leave the daily Power Platform Inventory API flow **off** until an authorized Entra application owner configures the custom connector and an administrator grants delegated consent, then test it before enabling the schedule.
6. Assign licensing, Copilot capacity, DLP policies, app access, and least-privilege Dataverse roles.
7. Save and publish the model-driven app once before launching it.
8. Publish and test the approved end-user channel.

No Teams notification action is packaged. If notifications are needed, add a target-native **Post message in a chat or channel** action after import, with an explicitly approved destination. UX Agent Project support can vary by tenant.
