# WanDelay Smart Logistics

WanDelay Smart Logistics combines agentic reasoning, connected-agent
delegation, and built-in conversation memory to plan explainable loading
assignments from shipment, facility, dock, queue, weather, priority, and arrival
information.

It retains shipment, plan, driver, and supporting evidence in conversation
context for follow-up decisions without repeating unnecessary data calls or
recalculating the assignment.

## Agents

- **WanDelay Loading Assistant** coordinates the driver's request, gathers
  operating and weather information, invokes planning skills, presents the
  loading assignment, answers context-aware follow-up questions, updates queue
  and ETA information, and generates a one-page driver PDF.
- **Dispatch Assistant** verifies the outbound shipment, pickup facility,
  consignee, destination, readiness, driver, and optional Drive Priority Pass
  tier through its MCP tools.

WanDelay Loading Assistant includes Microsoft Teams and Microsoft 365 Copilot
channels for access by authorized carrier drivers and logistics coordinators.

## How it works

1. **Remember the driver's preference.** An authorized carrier driver asks
   **WanDelay Loading Assistant** to remember their **Drive Priority Pass**, a
   driver priority benefit. The agent verifies the pass and saves it in built-in
   conversation memory.
2. **Request a loading plan.** **In a new session,** the driver provides the
   shipment reference and asks for a loading plan. WanDelay Loading Assistant
   recalls the saved Drive Priority Pass and sends the shipment reference and
   pass information to **Dispatch Assistant**, which verifies the shipment,
   driver, and priority tier. WanDelay Loading Assistant then retrieves current
   facility, loading-bay availability, queue, and weather information.
3. **Create the loading plan.** A planning skill combines deterministic queue
   and ETA calculations with agentic reasoning. It evaluates weather
   suitability, dock availability and characteristics, queue conditions,
   arrival timing, and priority information to select the assignment. The
   explainable plan presents the weather impact, dock assignment, reason for
   the selection, queue status, ETA, and Drive Priority Pass outcome.
4. **Answer follow-up questions from retained evidence.** The driver can ask
   questions such as `Will the dock be ready when I arrive?` WanDelay Loading
   Assistant answers from the retained plan. For queue follow-ups, it calculates
   a real-time estimate of the trucks ahead, remaining wait, and dock-ready time
   from the original queue snapshot and elapsed time. It does not retrieve
   another dock snapshot or rebuild the plan.
5. **Generate the driver PDF.** When requested, WanDelay Loading Assistant
   creates a compact one-page PDF from the accepted plan without recalculating
   the assignment.
6. **Recall the context later.** In a later session, WanDelay Loading Assistant
   can recall the shipment, plan, driver, and Drive Priority Pass context when
   the driver asks to review the earlier assignment.

> **Note:** Cross-session recall requires Copilot Studio Memory to be enabled
> and verified after solution import.

## MCP connectors, actions, and skills

- **Outbound Shipment Pickup MCP** verifies ready outbound shipments and their
  pickup facilities.
- **Drive Priority Pass MCP** verifies the driver and returns the exact priority
  tier.
- **WanDelay Loading Bay Pickup MCP** provides distribution-center,
  loading-bay, availability, and queue information.
- **MSN Weather - Get current weather** and **MSN Weather - Get forecast for
  today** provide current and expected weather conditions.
- **loading-dock-selector** combines agentic reasoning with deterministic queue
  and ETA calculations to select and explain a loading assignment.
- **dock-assignment-pass-pdf** creates the one-page driver PDF from the accepted
  plan without adding facts or recalculating the assignment.

## Suggested demonstration

1. Enter `Remember that my Drive Priority Pass ID is DRIVE-PASS-1024.`

   🧠 **[Context Memory]** The agent verifies the pass and saves the driver's
   **Extra** Priority Pass information in Memory for use in a later session.

2. 💡 Start a new session and enter `I am picking up shipment ORD-10502, and I
   expect to arrive in 20 minutes.`

   🤖 **[Agentic Reasoning]** Dispatch Assistant verifies the shipment and
   driver information. The agent retrieves the facility, weather, available
   loading docks, and queue information. It evaluates weather suitability, dock
   availability and characteristics, queue conditions, arrival timing, and the
   verified Priority Pass outcome to select and display an explainable loading
   plan.

   🧠 **[Context Memory]** The agent recalls the saved pass without asking for
   the ID again and uses it to calculate the Priority Pass queue benefit.

3. Enter `Why did you choose this dock?`

   🧠 **[Context Memory]** The agent explains how weather, dock characteristics,
   availability, queue length, distance, and the verified Priority Pass affected
   the assignment. It reuses the original plan evidence instead of retrieving
   another dock snapshot.

4. Enter `What is my truck queue status, and will the dock be ready before I
   arrive?`

   🤖 **[Agentic Reasoning]** The agent calculates the current queue from the
   original observation and elapsed time.

5. 💡 Start another new session and enter `What was my last shipment reference?`

   🧠 **[Context Memory]** The agent identifies `ORD-10502` as the shipment
   retained in agentic memory.

6. Enter `I am now picking up shipment ORD-10421.`

   The agent updates the active shipment while retaining the saved Drive
   Priority Pass information.

7. Enter `Create a new loading plan. I expect to arrive in 20 minutes.`

   🤖 **[Agentic Reasoning]** Dispatch Assistant verifies `ORD-10421`. The agent
   retrieves the Anchorage facility, weather, dock availability, and a new queue
   snapshot. It evaluates weather suitability, dock availability and
   characteristics, queue conditions, arrival timing, and the retained
   **Extra** Priority Pass to select and display a new explainable loading plan.

8. Enter `Generate the dock-assignment pass.`

   The agent creates a one-page PDF containing the shipment reference, barcode,
   weather, assignment, explanation, queue, ETA, and Priority Pass outcome
   without recalculating the assignment.

### Test shipments

Users can use the following values for the demo:

| Shipment reference | City, state |
|---|---|
| `ORD-10421`, `ORD-10422` | Anchorage, AK |
| `ORD-10318`, `ORD-10455` | Phoenix, AZ |
| `ORD-10460`, `ORD-10389` | Buffalo, NY |
| `ORD-10478`, `ORD-10502` | Miami, FL |

### Test Drive Priority Passes

Users can use the following values for the demo:

| Pass ID | Driver | Grade |
|---|---|---|
| `DRIVE-PASS-1024` | Jordan Brooks | Extra |
| `DRIVE-PASS-2048` | Sam Carter | Mega |
| `DRIVE-PASS-4096` | Riley Morgan | Plus |
| `DRIVE-PASS-8192` | Casey Patel | Mega |

## Import and configuration

Download the rebuilt solution ZIP from this page and import it through Power
Platform. The package contains the original exploded solution files for
`WanDelayLoadingBayPickup` version `1.0.0.15`.

After import:

1. Open **Dispatch Assistant**.

   - Verify **Order Management MCP**, confirm that its **Connection** is active,
     and under **Tool permissions** confirm that these tools are visible:
     - `Search orders`
     - `Get order`
     - `Get shipment`
   - Verify **Membership MCP v2**, confirm that its **Connection** is active, and
     under **Tool permissions** confirm that this tool is visible:
     - `Get drive priority pass`
   - Verify the `points-reconciliation` and `prorated-refund-calculator` skills
     and their child resources.

2. Save and publish **Dispatch Assistant**.

3. Open **WanDelay Loading Assistant**.

   - Verify **WanDelay Curb Pickup MCP**, confirm that its **Connection** is
     active, and under **Tool permissions** confirm that these tools are visible:
     - `Get store location`
     - `List bays`
   - Verify `Get current weather` and `Get forecast for today`, and confirm that
     their **MSN Weather Connection** is active.
   - Verify the `loading-dock-selector` and `dock-assignment-pass-pdf` skills and
     their child resources.
   - Confirm that **Dispatch Assistant** is configured as the connected agent.

4. In **WanDelay Loading Assistant only**, enable **Memory** and verify that it
   is enabled.

5. Optionally, add the **Microsoft 365 Copilot** and **Microsoft Teams**
   channels.

6. Save and publish **WanDelay Loading Assistant**.

7. Follow the instructions in **Suggested demonstration**.
