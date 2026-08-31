# Sales Lead Qualifier

Reads inbound sales enquiries from a shared mailbox, qualifies each one using
BANT (Budget, Authority, Need, Timing), logs it by tier, and notifies the sales
team only when the lead is Hot.

## Workflow

The **Sales Lead Qualifier** cloud flow:

1. Starts when an email arrives in a shared sales mailbox.
2. Sends the email to an AI agent that first checks whether it is a genuine
   sales enquiry, ignoring newsletters, recruitment, vendor pitches, invoices,
   support requests, and out-of-office/auto-reply messages.
3. Scores qualifying enquiries against BANT and assigns a tier:
   - **Hot** — Budget and Authority are both Strong, and Need or Timing is Strong.
   - **Warm** — at least one Strong signal but short of the Hot bar.
   - **Cold** — mostly Weak or Absent signals with no clear buying intent.
4. Logs every qualifying enquiry as a row in the matching Excel table
   (`HotLeads`, `WarmLeads`, or `ColdLeads`) via the agent's Excel Online
   Business tool.
5. For Hot leads only, sends a notification email via the agent's Outlook tool
   summarizing the company, contact, need, and the Strong signals that
   justified the tier.

## Import notes

- Configure the Microsoft 365 Outlook connection used by the shared-mailbox
  trigger, and set the trigger's mailbox address and folder to your own shared
  sales mailbox.
- Configure the Agent connection used by the qualification agent.
- In the **Configuration** action, replace `sales-lead-notify@example.com`
  (the `NotifyEmail` variable) with the address that should receive Hot lead
  notifications.
- The agent's **Add a row into a table** and **Send an email** tools have
  connection IDs hardcoded from the original authoring environment. Solution
  import does not remap these values, so open the Agent node after import and
  re-select both tool connections — including pointing the Excel tool at your
  own workbook with `HotLeads`, `WarmLeads`, and `ColdLeads` tables — before
  enabling the flow.

The solution is exported as unmanaged and includes a saved modern-designer
canvas for its workflow preview.
