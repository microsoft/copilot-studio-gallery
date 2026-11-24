# Message Center AI updates to Planner

Keep up with the stream of AI and Copilot changes in the Microsoft 365 Message
Center without reading every post. This solution reads Message Center posts
through Microsoft Graph, keeps only the AI-related ones and turns each into a
Planner task in the right bucket, assigned to the right owner, with a priority
and (where it can find one) a due date.

It replaces the old RSS / Message Center-to-Planner sync with a Copilot Studio
workflow you can read, change and extend. The solution ships the same scenario
twice so you can compare a fully deterministic workflow with one that delegates
the judgment calls to an agent node.

## What you get

| | Message Center AI updates to Planner | Message Center AI updates to Planner (Agent) |
| --- | --- | --- |
| Style | Deterministic: every rule is an expression | Hybrid: deterministic filter and routing, agent node writes the task |
| Area and owner | *Match area* step (AreaOwners table) | Same *Match area* step, passed to the agent |
| Priority | From the post's `severity` and `isMajorChange` | Same rule, in the agent instructions |
| Due date | `actionRequiredByDateTime` when it is in the future | Earliest real deadline read from the whole post, including retirement tables |
| Description | Post fields | Short summary: what is announced, impact, what to do, deadline |
| Copilot Credits | None for the logic | One agent run per matching post |

Both workflows are idempotent: a task whose title contains the post ID (for
example `MC1234567`) is updated instead of created again, so you can re-run them
safely.

The gallery preview shows the **Agent** variant.

## How the workflows work

1. **Set configuration** holds every environment-specific value in one `Config`
   object: tenant ID, app client ID, Key Vault secret name, Microsoft 365 group
   ID and Planner plan ID.
2. **Set area owners** defines the `AreaOwners` table: one row per bucket, with
   the Message Center services and/or a title keyword that route a post there,
   and the owner's email. Rows are checked top-down and the first match wins.
   The last row is the fallback for AI posts that match nothing else. The sample
   ships four areas: *Copilot Cowork*, *Copilot Autopilot*,
   *Power Platform & Copilot Studio* and *Microsoft 365 Copilot*.
3. **Get client secret from Key Vault** reads the app registration's secret with
   secure inputs and outputs.
4. **Get Message Center posts** calls
   `GET https://graph.microsoft.com/v1.0/admin/serviceAnnouncement/messages`
   with client-credentials auth, filtered to posts modified in the last day,
   with paging on.
5. **For each message** keeps AI-related posts in three passes: the post lists
   an AI service, the title contains an AI keyword (Copilot, AI, LLM, GPT,
   agent, ...), or the body contains a strong term (language model, OpenAI,
   subprocessor, ...).
6. **Match area for this message** picks the AreaOwners row (and owner).
7. The task is created or updated:
   - **Deterministic:** finds the bucket by name and creates or updates the task
     with Planner connector actions.
   - **Agent:** an inline agent node (GPT-5.6 Terra) with five Planner tools
     (List buckets, List tasks, Create a task, Update a task, Update task
     details) resolves the bucket, reads deadlines from the post text and writes
     the task and its short description.

Priority, in both variants: **Urgent** if severity is critical; **Important** if
severity is high or it is a major change; otherwise **Medium**. Tasks are titled
`Review <MC id> - <post title>` and the description links back to the post in
the Microsoft 365 admin center.

Every customization point has a yellow **CUSTOMIZE** note on the workflow
canvas. Open the workflow in the designer to read them.

## Prerequisites

- A Dataverse environment with Copilot Studio workflows, plus permission to import
  an unmanaged solution and create connections.
- **An Entra app registration** with Microsoft Graph
  `ServiceMessage.Read.All` (**application** permission, admin consent granted)
  and a client secret.
- **Azure Key Vault** holding that client secret, and an account or app that can
  read secrets from it (for example the *Key Vault Secrets User* role).
- **A Planner plan** in a Microsoft 365 group, with one bucket named exactly like
  each `area` in AreaOwners. Use a separate plan for each variant if you run both,
  so they don't update each other's tasks.
- Owners must be real users in your tenant who are members of the group. Planner
  cannot assign tasks to groups or distribution lists.
- For the Agent variant: Copilot Credits. Each matching post is one agent run.

## Import and setup

1. Import the unmanaged solution through Power Platform **Solutions**. When using
   the exploded source directly, package the contents of `solution/` as a ZIP
   with `solution.xml` and `customizations.xml` at its root. Do not include the
   gallery metadata or this README.
2. Bind the connection references. No connections or credentials are included.

   | Connection reference | Connector | Used by |
   | --- | --- | --- |
   | `new_sharedkeyvault_mcplanner` | Azure Key Vault (point it at your vault) | Both |
   | `new_sharedplanner_7a66dcdc` | Planner | Both |
   | `new_sharedagentnode_50374135` | Agent | Agent variant |

3. In each workflow, open **Set configuration** and replace the placeholders:

   | Field | Value |
   | --- | --- |
   | `tenantId` | `<your-tenant-id>`: your Entra tenant ID |
   | `clientId` | `<your-app-client-id>`: the app registration |
   | `keyVaultSecretName` | `<your-key-vault-secret-name>`: the secret holding its client secret |
   | `plannerGroupId` | `<your-m365-group-id>`: the group that owns the plan |
   | `plannerPlanId` | `<your-planner-plan-id>`: the plan |

4. Open **Set area owners**. Replace the `@contoso.com` owners with real users,
   and adjust the areas, services and title keywords to match your buckets.
5. Run the workflow manually once and check the plan.
6. For production, replace the manual trigger with a **Recurrence** trigger
   (for example daily). Keep the lookback in *Get Message Center posts*
   (`addDays(utcNow(), -1)`) equal to the recurrence interval.

### Keeping the secret step running

By default the Key Vault connection signs in as a user. If that user's sign-in
expires or is blocked (MFA, passkey policy, password reset), runs fail with 401
at the Key Vault step. For production, either:

- replace the step with a Key Vault-backed **secret environment variable**, which
  Power Platform reads with its own identity, or
- use a Key Vault connection with **service principal** authentication, or a
  dedicated service account. Only the connection changes, not the workflow.

The Planner connection also runs as a user, so a service account is a good fit
for it as well.

## Data and actions

- **Reads:** Microsoft 365 Message Center posts for your tenant (Graph), one Key
  Vault secret, and tasks and buckets in the configured plan.
- **Writes:** creates and updates tasks, assignments and task descriptions in
  the configured Planner plan. Nothing else is changed and no data leaves your
  tenant, apart from the post content sent to the model in the Agent variant.

## Limitations

- This is a sample, not a production-ready service. Review the filter keywords,
  area routing and priority rules before relying on them.
- The AI filter is keyword-based. It can include posts that only mention AI in
  passing, and miss posts that never use the keywords.
- The deterministic variant only uses `actionRequiredByDateTime` as a due date.
  Deadlines that appear only in the post text are not read.
- The agent's deadlines and summaries are model output and can be wrong. The
  task always links to the original post. Check it before you act.
- Priority is set when a task is created and is not changed on update, so
  manual changes are kept.
- The sample was built and run in its source environment. No fresh-environment
  import has been verified yet.
