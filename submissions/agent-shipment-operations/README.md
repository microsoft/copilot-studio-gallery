# Shipment Orchestrator Agent

The main orchestrator agent for the shipment solution. It reads each incoming request, works out what the user wants, and hands the request to **exactly one** specialized skill. It does not retrieve data, call tools, or carry out shipment, order, event, or customer communication actions itself.

---

## Table of Contents

1. [Overview](#overview)
2. [Responsibilities](#responsibilities)
3. [Architecture](#architecture)
4. [Skills Catalog](#skills-catalog)
5. [Routing Logic](#routing-logic)
6. [Routing Rules](#routing-rules)
7. [Clarification Behavior](#clarification-behavior)
8. [Example Routing Scenarios](#example-routing-scenarios)
9. [Guardrails and Constraints](#guardrails-and-constraints)
10. [Inputs and Outputs](#inputs-and-outputs)
11. [Extending the Orchestrator](#extending-the-orchestrator)
12. [Troubleshooting](#troubleshooting)

---

## Overview

| Attribute | Description |
|---|---|
| **Role** | Intent identification and request routing |
| **Input** | User message or trigger body content |
| **Output** | The selected skill's response, returned unchanged |
| **Skills managed** | 4 |
| **Skills invoked per request** | Exactly 1 |
| **Direct actions** | None. All work is delegated. |

---

## Responsibilities

1. **Analyze intent.** Read the user's message or trigger body content to work out the intent and the requested action.
2. **Route to one skill.** Send the request to the single skill that matches the primary intent.
3. **Delegate all work.** Don't retrieve data, invoke tools, or perform shipment, order, event, or customer communication actions directly.
4. **Pass full context.** Give the selected skill the relevant user request and all available trigger content.
5. **Clarify when needed.** If the intent is unclear, ask one short clarifying question before routing.

---

## Architecture

```
                 ┌──────────────────────────────┐
  User message ─▶│                              │
       or        │     Orchestrator Agent       │
  Trigger body ─▶│  (intent analysis & routing) │
                 └──────────────┬───────────────┘
                                │  exactly one
        ┌───────────────┬───────┴───────┬────────────────────┐
        ▼               ▼               ▼                    ▼
┌───────────────┐ ┌───────────────┐ ┌───────────────┐ ┌─────────────────┐
│  shipment-    │ │  shipment-    │ │  package-     │ │  shipment-      │
│  visibility-  │ │  event-       │ │  shipment-    │ │  customer-      │
│  reporting    │ │  visibility-  │ │  management   │ │  communications │
│               │ │  and-logging  │ │               │ │                 │
└───────────────┘ └───────────────┘ └───────────────┘ └─────────────────┘
        │               │               │                    │
        └───────────────┴───────┬───────┴────────────────────┘
                                ▼
                  Skill response returned to user
                       (unchanged, not invented)
```

---

## Skills Catalog

| Skill | Primary Purpose | Typical Intents |
|---|---|---|
| `shipment-visibility-reporting` | Shipment tracking and visibility | Tracking, current status, location, ETA, delivery progress, single- or multi-shipment visibility |
| `shipment-event-visibility-and-logging` | Shipment event management | Event logging, creating or updating events, delay events, disruptions, exception recording or analysis |
| `package-shipment-management` | Orders and shipment records | Order-related requests, shipment creation, updates to existing shipment records |
| `shipment-customer-communications` | Customer-facing messages | Drafting or sending customer emails about delays, delivery updates, exceptions, and resolutions |

### 1. shipment-visibility-reporting
Use when the user wants to **see** where a shipment is or how it's progressing.
- "Where is shipment SHP-10234?"
- "What's the ETA for my order's delivery?"
- "Show the status of all shipments heading to Chicago."

### 2. shipment-event-visibility-and-logging
Use when the user wants to **record, update, or analyze events** on a shipment.
- "Log a weather delay for shipment SHP-10234."
- "Update the exception event on SHP-55012 to resolved."
- "What disruptions happened on our shipments last week?"

### 3. package-shipment-management
Use when the user wants to **create or change orders or shipment records**.
- "Create a new shipment for order ORD-7781."
- "Change the delivery address on shipment SHP-10234."
- "What's the status of order ORD-7781?"

### 4. shipment-customer-communications
Use when the user wants to **communicate with a customer** about a shipment.
- "Draft an email to the customer about the delay on SHP-10234."
- "Send a delivery confirmation to the customer for order ORD-7781."
- "Write a resolution notice for the damaged-package exception."

---

## Routing Logic

```
START
  │
  ├─ Is the intent clear?
  │     └─ No ──▶ Ask one short clarifying question ──▶ wait for reply
  │
  ├─ Does the request combine several distinct operations?
  │     └─ Yes ─▶ Ask the user which operation to do first ──▶ wait for reply
  │
  ├─ Pick the primary intent:
  │     ├─ Tracking / status / location / ETA / progress
  │     │        ──▶ shipment-visibility-reporting
  │     ├─ Log / create / update events, delays, disruptions, exceptions
  │     │        ──▶ shipment-event-visibility-and-logging
  │     ├─ Orders / create shipment / update shipment record
  │     │        ──▶ package-shipment-management
  │     └─ Draft / send customer emails about shipments
  │              ──▶ shipment-customer-communications
  │
  ├─ Pass the full user request + trigger content to the selected skill
  │
  └─ Return the skill's response to the user without changes
END
```

### Intent keyword cues (guidance only)

| Cue words | Likely skill |
|---|---|
| track, where, status, location, ETA, arriving, in transit, delivered | `shipment-visibility-reporting` |
| log, record, event, delay event, disruption, exception, incident | `shipment-event-visibility-and-logging` |
| order, create shipment, new shipment, update shipment, modify record | `package-shipment-management` |
| email, notify, draft, send, inform customer, message the customer | `shipment-customer-communications` |

> Keywords are hints, not rules. Always route on the **primary intent** of the whole request.

---

## Routing Rules

| # | Rule |
|---|---|
| 1 | Select the skill that best matches the **primary intent**. |
| 2 | Invoke **only one** skill per request. |
| 3 | Don't execute actions or retrieve information directly. |
| 4 | Don't assume authorization to send customer communications or modify records. |
| 5 | Make sure the selected skill receives **all relevant information** it needs to process the request. |
| 6 | Return the selected skill's response to the user **without inventing results**. |
| 7 | If a request combines **multiple distinct operations**, ask the user which operation to perform first. |

---

## Clarification Behavior

The orchestrator asks one short clarifying question **before** routing when:

- **The intent is ambiguous.** Example: "Help with SHP-10234." It isn't clear whether the user wants status, an event logged, a record changed, or a customer email.
- **The request has several operations.** Example: "Log a delay for SHP-10234 and email the customer." That is two distinct operations, event logging and customer communication.

**Example clarifying questions**

- "Would you like to check the status of SHP-10234, log an event for it, update its record, or notify the customer?"
- "Your request includes logging a delay and emailing the customer. Which should I do first?"

---

## Example Routing Scenarios

| User request | Routed to | Reason |
|---|---|---|
| "What's the ETA for SHP-10234?" | `shipment-visibility-reporting` | ETA lookup |
| "Show me all shipments in transit to Dallas." | `shipment-visibility-reporting` | Multi-shipment visibility |
| "Record a port congestion delay on SHP-88120." | `shipment-event-visibility-and-logging` | Delay event logging |
| "Analyze exceptions across last month's shipments." | `shipment-event-visibility-and-logging` | Exception analysis |
| "Create a shipment for order ORD-4410." | `package-shipment-management` | Shipment creation |
| "Update the carrier on SHP-10234 to FedEx." | `package-shipment-management` | Shipment record update |
| "Draft an apology email for the delayed delivery." | `shipment-customer-communications` | Customer email draft |
| "Log a delay and notify the customer." | *Clarify first* | Two distinct operations |
| "Can you help with this shipment?" | *Clarify first* | Intent unclear |

---

## Guardrails and Constraints

- **No direct execution.** The orchestrator never calls tools, queries systems, or changes data.
- **No assumed authorization.** Sending customer communications and modifying records are never assumed to be approved. The downstream skill handles any authorization or confirmation.
- **No fabricated results.** Responses come only from the selected skill. The orchestrator doesn't add to, summarize into new facts, or invent shipment details.
- **One skill per request.** Multi-operation requests are clarified, not split or chained automatically.
- **Full context passthrough.** Shipment IDs, order numbers, customer details, dates, and trigger payload fields are forwarded to the skill as they were received.

---

## Inputs and Outputs

### Inputs
| Source | Description |
|---|---|
| User message | Natural-language request from a user |
| Trigger body content | Payload from an automated trigger (for example, an email, event, or system notification) |

### Output to the selected skill
- The original user request, verbatim
- All available trigger content (IDs, references, timestamps, customer details, and so on)

### Output to the user
- The selected skill's response, returned unchanged
- **or** one short clarifying question, if routing can't be decided yet

---

## Extending the Orchestrator

To add a new skill:

1. Define the skill's **scope**, meaning the intents it owns, and make sure it doesn't overlap with existing skills.
2. Add an entry to the **Skills Routing** section of the orchestrator instructions.
3. Update the [Skills Catalog](#skills-catalog), [Routing Logic](#routing-logic), and [Example Routing Scenarios](#example-routing-scenarios) in this README.
4. Test with sample prompts, including ambiguous and multi-operation cases, to confirm routing is accurate.

---

## Troubleshooting

| Symptom | Likely cause | Resolution |
|---|---|---|
| Request routed to the wrong skill | Overlapping intent cues | Narrow the skill descriptions; add examples that separate the intents |
| Orchestrator asks too many questions | Skill scopes are too vague | Make the routing descriptions more specific |
| Skill lacks the data it needs | Trigger content not forwarded | Confirm the full payload is passed through |
| Customer email sent without approval | Authorization handled incorrectly downstream | Check the confirmation step in `shipment-customer-communications` |
| Response includes invented details | Orchestrator rewrote the skill output | Return the skill response unchanged |

---

*Maintained by the Shipment Solutions team. Update this README whenever routing rules or skills change.*
