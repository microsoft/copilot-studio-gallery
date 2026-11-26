# Roadmap Watcher

Keeping up with the [Microsoft 365 roadmap](https://www.microsoft.com/microsoft-365/roadmap)
and [Azure Updates](https://azure.microsoft.com/updates) is a chore for IT admins and
product owners. Roadmap Watcher is a Teams agent that does it for them. Each user picks
the products or product packs they care about, and the agent sends a ranked digest card
on the schedule they choose. Each item reaches a user only once.

Every digest is grouped into three sections:

| Section | What goes in it |
| --- | --- |
| **Critical** | Security issues, items that need admin action, and retirements within the user's critical window |
| **Deprecation** | Retirements later than the critical window |
| **New feature** | Everything else |

Roadmap data comes from Microsoft's public Release Communications MCP endpoint
(`https://www.microsoft.com/releasecommunications/mcp`). It needs no sign-in and receives
no customer data. All user preferences and the roadmap cache are stored in Dataverse.

> This is a sample, not a supported product. The classification is keyword- and
> AI-based and can be wrong. Always check the linked roadmap item before acting on it.

## Agents

**Roadmap Watcher** is a Copilot Studio agent published to Teams
and Microsoft 365 Copilot. Generative orchestration is off. A **Command Router** topic
catches every message, parses the slash command with Power Fx, and redirects to the
matching topic, so commands behave the same way every time. Each command topic calls one
workflow. Users don't need any Dataverse access: the workflows run under one service
connection and identify the user by their Entra object ID.

| Command | Example | What it does |
| --- | --- | --- |
| `/mysettings` | `/mysettings` | Opens a settings card: packs, products, schedule, look-ahead, critical window, pause |
| `/help` | `/help` | Lists the commands |
| `/products [text]` | `/products teams` | Lists catalog products, filtered by text |
| `/packs` | `/packs` | Lists product packs and their codes |
| `/add <names>` | `/add teams, security` | Follows products or packs |
| `/remove <names \| all>` | `/remove purview` | Stops following products or packs |
| `/mysubs` | `/mysubs` | Shows what you follow |
| `/lookahead <1-24>` | `/lookahead 6` | How many months ahead the digest looks |
| `/critical <1-24>` | `/critical 3` | Retirements within this many months count as Critical |
| `/frequency daily \| weekly <day> \| monthly` | `/frequency weekly fri` | Sets the digest schedule |
| `/pause`, `/resume` | `/pause` | Stops or restarts digests without losing subscriptions |
| `/digest` | `/digest` | Sends the digest now |
| `/details <id>` | `/details 570439` | Fetches the full roadmap item or Azure update live |

The slash is optional (`help` works too). Teams reserves `/settings`, so use `/mysettings`.

## Workflows

All 19 are Copilot Studio workflows built in the workflow designer.

| Workflow | Trigger | What it does |
| --- | --- | --- |
| **AIT Roadmap Watch - Harvest** | Daily, 06:00 UTC | Pages through Microsoft 365 roadmap items modified since the last watermark and upserts them into Dataverse. Keyword rules set the Security, Action required, and Retirement flags. Hits on Action required and Retirement go through an AI Builder prompt (`ait_VerifyRetirement`) that confirms or clears them. The watermark only moves forward after a successful run. |
| **AIT Roadmap Watch - Harvest Azure** | Daily, 06:00 UTC | Does the same for Azure Updates. Turned off by `ait_HarvestAzure = no`. |
| **AIT Roadmap Watch - Catalog Refresh** | Weekly, Monday 05:00 UTC | Reads product facets from the roadmap and adds new product names to the catalog. |
| **AIT Roadmap Watch - Digest** | Daily, 07:00 UTC | Finds every active subscriber whose digest is due and calls Send Digest for each. Shown in the gallery preview. |
| **AIT Roadmap Watch - Send Digest** | Child workflow, called by Digest | Expands packs into products and selects unsent items within the look-ahead window. Ranks them Critical, then Deprecation, then New feature, and posts an Adaptive Card as the agent in the user's Teams chat. Records each sent item so it is never sent twice. |
| **Command workflows** (Welcome, Subscribe, Unsubscribe, Products, Packs, My Subscriptions, Settings, Save Preferences, Set Frequency, Set Look-ahead, Set Critical Window, Pause Resume, Digest Now, Details) | Called by the agent | One workflow per command topic. Each reads or writes Dataverse and returns text or card JSON to the topic. |

## What's in the solution

| Component | Name |
| --- | --- |
| Agent | Roadmap Watcher |
| Model-driven app | Roadmap Watcher Admin (packs, products, rules, subscribers, run logs) |
| Tables | Product, Pack, Subscriber, Subscription, Roadmap item, Notification, Classification rule, Run log |
| Security roles | AIT Roadmap Watch Admin, AIT Roadmap Watch Service |
| AI prompt | `ait_VerifyRetirement` |
| Connection references | `ait_Dataverse` (Microsoft Dataverse), `ait_Teams` (Microsoft Teams) |
| Environment variables | 12, listed under Import notes |

## Import notes

**Prerequisites**

- An environment with a Dataverse database, in the same tenant as your Teams users. You need System Administrator in it.
- Copilot Studio capacity (Copilot Credits) for the environment. Every workflow run uses it, the scheduled harvests and digests included, and so do agent replies and the AI check. When the environment has no credits left, new workflow runs are blocked. See **Cost** below.
- A service account with a licence that includes Microsoft Teams. It owns the Dataverse and Teams connections that every workflow runs under. The workflows themselves are billed in Copilot Credits, not through a Power Automate licence.
- AI prompts enabled in the environment. If they aren't, set `ait_AiVerification` to `false` after import.
- No data policy that blocks **HTTP** together with **Microsoft Dataverse** and **Microsoft Teams**, and outbound HTTPS to `www.microsoft.com` allowed.
- Commercial cloud only. GCC, GCC High, DoD, and China clouds aren't supported. The agent speaks English only.

**After importing the unmanaged solution**

1. **Connections.** Bind `ait_Dataverse` and `ait_Teams` to connections owned by the service account.
2. **Roles.** Give admins **AIT Roadmap Watch Admin**. If the service account isn't System Administrator, give it **AIT Roadmap Watch Service**. End users need no role.
3. **Seed data.** Dataverse rows don't travel inside a solution, so the packs and classification rules start empty. Use the supporting files as reference data and add them in **Roadmap Watcher Admin**: [packs](supporting/seed-packs.json), [products](supporting/seed-products.json), [classification rules](supporting/seed-rules.json). Without classification rules no item is flagged Critical. Catalog Refresh adds product names on its own.
4. **Environment variables.** Review them and set **Current value**, not Default value:

   | Variable | Default | Meaning |
   | --- | --- | --- |
   | `ait_MaxProductsPerUser` | 0 | Most products one user may follow; 0 = no limit |
   | `ait_DeliveryHourUtc` | 7 | Delivery hour shown to users. Keep it equal to the Digest workflow's trigger hour |
   | `ait_DefaultLookaheadMonths` | 3 | Look-ahead for new users |
   | `ait_DefaultCriticalWindowMonths` | 6 | Critical window for new users |
   | `ait_MaxItemsPerDigest` | 25 | Items per digest card |
   | `ait_BackfillDays` | 30 | History a new subscription receives |
   | `ait_SendEmptyDigest` | no | Default for new users: send a card when nothing is new |
   | `ait_HarvestAzure` | yes | Harvest Azure Updates too |
   | `ait_AiVerification` | yes | AI check before an item is flagged Critical or Deprecation |
   | `ait_MaxAiChecksPerRun` | 50 | Most AI checks per harvest run; a cost guard |
   | `ait_CloudInstance` | Worldwide (Standard Multi-Tenant) | Roadmap cloud filter |
   | `ait_McpServerUrl` | `https://www.microsoft.com/releasecommunications/mcp` | Data source |

5. **Turn on the workflows in this order:** Catalog Refresh, Harvest, Harvest Azure. Wait until **Roadmap Watcher Admin → Run logs** shows a succeeded row for each harvest. Then turn on Send Digest, then Digest. Check that every command workflow is on. If you open and publish a workflow in the designer, check its connections afterwards: they must stay on the `ait_Dataverse` and `ait_Teams` connection references, not on end-user credentials, or every Teams user is asked to sign in to Dataverse.
6. **Publish the agent** in Copilot Studio, keeping **Authenticate with Microsoft**. Add the **Teams and Microsoft 365 Copilot** channel and submit it for admin approval.
7. **Teams admin.** Allow the app in the Teams admin center. Optionally pre-install it for target users with a setup policy: a digest can only be posted to a user who has the app installed.
8. **Smoke test** in Teams: open the agent (welcome message), then `help`, `/packs`, `/add security`, `/digest`.

**Cost.** Every workflow step costs 0.13 Copilot Credits, and AI prompt checks are charged on top. The credits come from the environment, whichever account runs the workflow. Rough figures from the test environment:

| Activity | Approximate Copilot Credits |
| --- | --- |
| Harvest and Harvest Azure | 150–200 a day together; more on days with many roadmap changes |
| Catalog Refresh | 150 a week |
| One 25-item digest | 34 per user per digest |
| A command in Teams | The agent's reply plus the workflow it calls; `/digest` costs about as much as a scheduled digest |

Watch consumption in **Power Platform admin center → Licensing → Copilot Studio**. Per-agent limits don't stop workflow runs, so cap spending through the environment's credit allocation.
