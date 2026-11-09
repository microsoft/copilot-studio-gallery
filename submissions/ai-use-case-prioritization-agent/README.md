# AI Use Case Prioritization Agent

A **Copilot Studio** agent that helps makers and reviewers **capture, assess, prioritize and route** AI agent use cases using approved guidance and rubrics. Assessments are recorded in Dataverse and returned as a downloadable HTML report.

Built by Microsoft (Customer Acceleration Team) and approved through the Microsoft IT (MSIT) security and Responsible AI review.

![Reference architecture](https://raw.githubusercontent.com/alicja-gilderdale/ai-use-case-prioritization-agent/main/docs/architecture.png)

## What it does

- Guides intake of a candidate AI use case: business objective, users, data, outcomes and constraints.
- Grounds scoring in approved rubrics: **impact, delivery complexity, risk and agentic fit**.
- Resolves category and subcategory from approved guidance, and asks rather than guesses when unsure.
- Records the use case and assessment in Dataverse **only after explicit user confirmation**.
- Produces a downloadable HTML assessment report in the conversation.

**Contents of this solution:** 1 agent, 8 skills, 4 knowledge sources, a Dataverse MCP tool and 2 Dataverse tables (`cadpbm_ai_usecase`, `cadpbm_aiassessment`). This gallery download is the **no-app, unmanaged** edition.

## Choose your version

The same solution ships in four versions, all version **1.0.0.2**. The gallery download is version 1; the others are in the [GitHub repository](https://github.com/alicja-gilderdale/ai-use-case-prioritization-agent/tree/main/solution) and its releases.

| # | Edition | Package | Choose when |
|---|---|---|---|
| 1 | No-app, unmanaged | **This gallery download**, or `AIUseCaseSolutionv3_1_0_0_2.zip` | Development, customisation, or no Power Apps licence. |
| 2 | No-app, managed | [`AIUseCaseSolutionv3_1_0_0_2_managed.zip`](https://github.com/alicja-gilderdale/ai-use-case-prioritization-agent/raw/main/solution/AIUseCaseSolutionv3_1_0_0_2_managed.zip) | Target or production environments. |
| 3 | App-included, unmanaged | [`AIUseCaseSolutioninclapp_1_0_0_2.zip`](https://github.com/alicja-gilderdale/ai-use-case-prioritization-agent/raw/main/solution/AIUseCaseSolutioninclapp_1_0_0_2.zip) | Development with the Power Apps reviewer catalog. |
| 4 | App-included, managed | [`AIUseCaseSolutioninclapp_1_0_0_2_managed.zip`](https://github.com/alicja-gilderdale/ai-use-case-prioritization-agent/raw/main/solution/AIUseCaseSolutioninclapp_1_0_0_2_managed.zip) | Production with the reviewer catalog. |

The app-included editions add a Power Apps code app. They need the **Power Apps Code Apps** environment feature enabled and a Power Apps licence for every user who opens the app. See [Dependencies](https://github.com/alicja-gilderdale/ai-use-case-prioritization-agent/blob/main/deploy/DEPENDENCIES.md).

## The reviewer app (app-included editions)

The app turns recorded assessments into a browsable, filterable and comparable portfolio.

| | |
|---|---|
| ![Use Case Catalog](https://raw.githubusercontent.com/alicja-gilderdale/ai-use-case-prioritization-agent/main/docs/app-catalog.png)<br>**Use Case Catalog**: browse and filter every recorded use case by impact, complexity, reach and agentic fit. | ![Compare Use Cases](https://raw.githubusercontent.com/alicja-gilderdale/ai-use-case-prioritization-agent/main/docs/app-compare.png)<br>**Compare**: plot use cases on an Impact vs Complexity matrix to spot quick wins. |
| ![Use Case detail](https://raw.githubusercontent.com/alicja-gilderdale/ai-use-case-prioritization-agent/main/docs/app-usecase-detail.png)<br>**Use Case detail**: problem, solution, benefits, risks, personas and data sources. | ![Assessment detail](https://raw.githubusercontent.com/alicja-gilderdale/ai-use-case-prioritization-agent/main/docs/app-assessment-detail.png)<br>**Assessment detail**: scorecards, positioning matrix and per-factor breakdowns. |
| ![Analytics dashboard](https://raw.githubusercontent.com/alicja-gilderdale/ai-use-case-prioritization-agent/main/docs/app-analytics.png)<br>**Analytics**: agents per customer, category spectrum, top submitters, agent-type mix and industry coverage. | |

## Prerequisites

- A Power Platform environment with Copilot Studio and Dataverse.
- Approved guidance and rubric documents as knowledge. They are included in the solution.
- The Dataverse MCP server enabled for the environment.

Full steps: [Deployment](https://github.com/alicja-gilderdale/ai-use-case-prioritization-agent/blob/main/deploy/DEPLOYMENT.md) and [Dependencies](https://github.com/alicja-gilderdale/ai-use-case-prioritization-agent/blob/main/deploy/DEPENDENCIES.md).

After import: assign the security roles (Users: own records; Admin/Intake: all records), set content moderation to **High**, disable the code interpreter, and run the smoke tests.

## Security and Responsible AI

This solution went through the Microsoft IT (MSIT) approval process. The documentation is published with the source:

| Document | Content |
|---|---|
| [Security, Governance and Responsible AI](https://github.com/alicja-gilderdale/ai-use-case-prioritization-agent/blob/main/docs/03_security_governance_and_responsible_ai.md) | Security-review evidence matrix (10 observations, each with a release answer and proof), governance controls, release settings, Responsible AI notes. |
| [Release Readiness Checklist](https://github.com/alicja-gilderdale/ai-use-case-prioritization-agent/blob/main/docs/04_release_readiness_checklist.md) | Security, governance and Responsible AI review gates and sign-off. |
| [Architecture and Detailed Design](https://github.com/alicja-gilderdale/ai-use-case-prioritization-agent/blob/main/docs/02_architecture_and_detailed_design.md) | Components, data flow, data model, operations. |
| [Use Case Definition and Discovery](https://github.com/alicja-gilderdale/ai-use-case-prioritization-agent/blob/main/docs/01_use_case_definition_and_discovery.md) | Business justification, users, outcomes, scope. |

Key controls:

- **Human oversight:** nothing is written to Dataverse without explicit confirmation; delete operations are disabled.
- **Grounding:** scoring uses approved rubrics. Missing evidence is marked *NOT ENOUGH INFO* and the agent asks a targeted question instead of guessing.
- **Prompt-injection resistance:** instructions inside uploaded documents are treated as content, not behaviour.
- **Least privilege:** Microsoft Entra ID group access and Dataverse roles; connections run under the invoker's context.
- **Content moderation** set to High, **code interpreter** disabled.
- **Data minimisation:** the customer or context name is captured only to tell use cases apart.

## Source, release notes and support

Source, documentation and all four packages: [https://github.com/alicja-gilderdale/ai-use-case-prioritization-agent](https://github.com/alicja-gilderdale/ai-use-case-prioritization-agent). Raise issues in that repository's issue tracker.
