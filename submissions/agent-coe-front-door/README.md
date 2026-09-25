# Agent CoE Front Door

Agent CoE Front Door gives an organization a governed entry point for agent discovery, guidance, and intake. It checks the existing catalogue before recommending new development, grounds licensing and governance answers in organization-owned knowledge, and creates an intake record only after the requester confirms the collected details.

## Agent

The primary Copilot Studio agent:

- searches the Dataverse agent catalogue for reusable options;
- answers licensing and capacity questions from KB-01;
- applies governance and routing guidance from KB-02;
- applies naming, ownership, and catalogue guidance from KB-03;
- collects only missing intake information;
- presents a confirmation summary before writing data;
- creates and reads back Dataverse intake records; and
- can notify an approved Teams destination after target configuration.

The solution includes agent-advisor and agent-intake skills, Dataverse MCP and Teams tool definitions, two Dataverse tables, and a model-driven triage app with an intake dashboard.

## Workflows

This solution does not include cloud-flow workflow definitions. Agent orchestration uses Copilot Studio skills and tools:

1. Search the internal catalogue and prioritize a verified reusable match.
2. Use the mapped knowledge source for licensing, governance, or naming questions.
3. If intake is required, collect missing facts and show a confirmation summary.
4. Create the intake record only after explicit confirmation.
5. Read the created record back and use the configured notification path only when appropriate.

## Import notes

Import the solution into a non-production Power Platform environment with Dataverse.

After import:

1. Upload approved KB-01, KB-02, and KB-03 content and test each source independently.
2. Configure an approved `shared_commondataserviceforapps` connection.
3. If the imported Dataverse MCP tool returns HTTP 403, remove it and add a target-native Microsoft Dataverse MCP Server.
4. Configure the Teams connection and approved destination; no fixed recipient is packaged.
5. Assign licensing, Copilot capacity, DLP policies, app access, and least-privilege Dataverse roles.
6. Save and publish the model-driven app once before launching it.
7. Publish and test the approved end-user channel.

The packaged knowledge files contain `[ORGANIZATION INPUT]` placeholders and must be completed with approved local policy. UX Agent Project support can vary by tenant.
