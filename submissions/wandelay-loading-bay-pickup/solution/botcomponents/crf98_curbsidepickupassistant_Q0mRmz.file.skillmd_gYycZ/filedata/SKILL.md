---
name: dock-assignment-pass-pdf
description: Render the completed truck loading-dock assignment as a driver-facing one-page PDF.
---

# Loading-Dock Assignment Pass PDF

Use this skill only after the agent has presented the completed loading-dock
recommendation and the driver has explicitly asked for a PDF copy. The skill
renders that completed assignment. It does not inspect other docks, classify
weather, calculate queues, apply Drive Priority Pass priority, or select,
reserve, confirm, or guarantee a dock.

Always run the bundled `dock_assignment_pass.py` script. Never hand-draw the PDF or
replace the script with generated rendering code.

## Inputs

Pass the shipment reference and every nonempty driver-facing loading-plan
attribute exactly once:

- `--shipment-reference` for the PDF header and Code 128 barcode
- `customer_message.plan` as `--plan`
- `customer_message.weather` as `--weather`
- `customer_message.assignment` as `--assignment`
- `customer_message.why` as `--why`
- `customer_message.queue` as `--queue`
- optional nonempty `customer_message.eta` as `--eta`
- optional nonempty `customer_message.priority_pass` as `--priority-pass`
- `--out wandelay_dock_assignment_pass.pdf`

Use the accepted driver-facing content retained for the active loading plan.
Preserve every verified fact and causal relationship. When required to keep the
PDF on one page, summarize only the wording; do not remove or change verified
facts, causal relationships, the assignment, queue, ETA, or Priority Pass
outcome. Do not supplement, reinterpret, or recalculate any section. The PDF
renders the nonempty sections in this order: Plan, Weather, Assignment, Why,
Queue, ETA, Priority Pass.

The PDF contains the shipment reference as a scannable Code 128 barcode and
uses a compact one-page layout with the existing bold title, labels, and
section-heading treatment.

Never pass or display `ready_for_pickup`, a Drive Priority Pass ID,
`tier_code`, pass display name, email, `occupied_by`, other docks, raw tool
output, canonical state, decision-evidence JSON, cargo, or invented weather.

## Example

```bash
python3 dock_assignment_pass.py \
  --shipment-reference ORD-10502 \
  --plan "Your loading plan for WanDelay Miami Distribution Center is ready for shipment ORD-10502." \
  --weather "Rain and strong winds are expected around arrival." \
  --assignment "Proceed to Dock 2." \
  --why "Dock 2 provides the best available weather protection and queue." \
  --queue "There are two trucks ahead, with an expected wait of one minute." \
  --eta "You expect to arrive in 20 minutes, leaving a 19-minute buffer." \
  --priority-pass "No queue reduction was applied." \
  --out wandelay_dock_assignment_pass.pdf
```

The script prints:

```text
WROTE wandelay_dock_assignment_pass.pdf
```

Return only the generated PDF file to the driver. Do not add a separate
recommendation paragraph on a successful flow.
