---
title: 401(k) Loan & Withdrawal Assistant
slug: 401k-loan-withdrawal-assistant
solution: RetirementLoanWithdrawalAssistant
---
Employees who need cash often go straight to their 401(k) without knowing the
difference between a loan and a withdrawal, or what either really costs. This
agent answers those questions in plain language and runs the numbers with the
employee's own figures through a built-in calculator MCP server, so every
payment and tax estimate is exact and repeatable. Plan-specific rules live in
one editable skill that ships with a fictional **SAMPLE** plan (Contoso), so HR
replaces it with their own Summary Plan Description terms.

**Status:** this solution was authored directly in the Power Platform export
format and verified by importing it into a fresh environment, where the
custom connector code compiled and all components were created. The
conversation behavior described below is the designed behavior; it has not yet
been run end to end in a tenant with the new Copilot Studio experience. Tax
rules were last reviewed for tax year 2026.

## What you can try

Each row is intended as a test case. Run it in the **Preview** tab after
import, or add it to a Copilot Studio evaluation test set.

| Prompt | Expected behavior |
| --- | --- |
| `I have $64,000 vested and no loans. How much can I borrow, and what would $10,000 over 5 years cost per paycheck?` | Calls `calculate_max_loan` and `calculate_loan_payment`. Maximum loan $32,000. Borrows $10,075 to cover the $75 fee. $95.26 per biweekly paycheck, about $2,308.80 total interest. Notes sample plan settings |
| `I need $8,000 for an eviction notice. Should I take a loan or a hardship withdrawal?` | Confirms eviction is a safe-harbor reason and that other available withdrawals come first. Calls `estimate_withdrawal_taxes` to gross up the withdrawal and compares it with a loan |
| `I'm 56 and leaving next month. Can I avoid the 10% penalty?` | Explains the Rule of 55, 20% withholding, and why rolling to an IRA first loses the exception |
| `What happens to my loan if I quit?` | Cure period, loan offset, and the extended rollover deadline for an offset caused by leaving |
| `Can I use my 401(k) penalty-free to buy my first home?` | Explains that the first-time homebuyer exception applies only to IRAs, then offers a principal-residence loan or a hardship withdrawal |
| `What would a 7-year loan for a car cost?` | Explains that general-purpose loans must be repaid within 5 years (the calculator rejects longer terms) and offers a 5-year estimate |
| `Ask benefits whether I can keep repaying my loan after I leave.` | Drafts a short email with no sensitive data. With SAMPLE settings, it gives the draft to copy instead of sending |

## Agent

**401(k) Loan & Withdrawal Assistant** is built on the Microsoft Copilot
harness (formerly the GitHub Copilot harness) in Copilot Studio, with six
skills, one MCP server (MCP servers on this harness are in preview), and one
tool. Skills load only when a request matches their description.

| Skill | Purpose |
| --- | --- |
| `plan-rules` | The employer's plan settings: which loans and withdrawals are offered, limits, rate, fees, the cure period, separation rules, and contacts. Ships as a **SAMPLE** fictional plan. |
| `loan-estimator` | Applies the IRS loan limits ($50,000 lookback and 50% of the vested balance), sizes the loan for the fee, and amortizes payments per paycheck |
| `hardship-withdrawal-guide` | The seven IRS safe-harbor reasons, the other-withdrawals-first rule, self-certification, sizing, and taxes |
| `early-withdrawal-exceptions` | SECURE 2.0 distributions (emergency, domestic abuse, birth or adoption, disaster, long-term care) and exceptions to the 10% additional tax such as the Rule of 55, terminal illness, and disability |
| `withdrawal-tax-estimator` | Withholding rules, a gross-up for a needed net amount, the tax to set aside, and an illustrative long-term cost |
| `benefits-request-handoff` | Drafts a request summary for the benefits team and sends it only after the user approves it |

### 401k Calculator MCP

A Model Context Protocol server that runs entirely inside a custom connector's
code: no hosting, no Azure resource, no outbound calls, and no stored data.
It exposes three read-only tools that return structured results with their
calculation steps:

| Tool | Returns |
| --- | --- |
| `calculate_max_loan` | IRS limits A and B, the maximum new loan, and eligibility against the plan's minimum and loan count |
| `calculate_loan_payment` | Payment per paycheck, number of payments, total interest, and cash received after the fee |
| `estimate_withdrawal_taxes` | Gross-up for a net amount, federal and state withholding, cash received, total tax, the amount to set aside, and an illustrative future value |

Invalid inputs, such as a 7-year general-purpose loan or less than 20%
withholding on a payment that could have been rolled over, come back as
recoverable tool errors (`isError: true`) the agent can explain. Contradictory
inputs, such as applying the 10% additional tax to a SECURE 2.0 distribution,
are rejected too. The commented C# code in `Connector/` is a compact starting
point for your own MCP servers.

### Send request to benefits team

**Send request to benefits team** is the Office 365 Outlook
**Send an email (V2)** connector tool. It runs as the signed-in user, can only send
(not read or delete) mail, and is configured to ask the user for approval
before every call. Only `benefits-request-handoff` uses it. The skill limits
the recipient to the benefits mailbox. Because the model fills in the
recipient, the approval prompt is the control that enforces it.

### Guardrails in the instructions

- US federal education and estimates only, not tax, legal, or investment
  advice. The SPD and recordkeeper are the authority.
- The agent never sees balances. It uses only figures the user provides and
  labels every result an estimate.
- It never asks for Social Security numbers, account numbers, dates of birth,
  or medical details.
- It handles sensitive situations briefly and points to support contacts.
- It never submits or promises a transaction.

## Prerequisites and import

- A Dataverse environment where the new Copilot Studio experience (Microsoft
  Copilot harness) is available, Copilot Credits through prepaid capacity or
  pay-as-you-go billing, and permission to import an unmanaged solution.
- Permission to create custom connectors with custom code.
- The agent uses **Claude Opus 5**, so Anthropic models must be allowed for
  the tenant and environment, or choose another model after import.
- The solution and agent language is English (United States, 1033).
- An **Office 365 Outlook** connection for the user who tests the agent. The
  401k Calculator MCP connection needs no credentials.

1. Import the solution through **Power Platform → Solutions → Import solution**
   and create the Office 365 Outlook and 401k Calculator MCP connections
   when prompted.
2. Open the agent in Copilot Studio, then open the **plan-rules** skill.
3. Replace the sample values with your plan's SPD terms, including the
   benefits mailbox, rate, fees, spousal consent, loan-first rule, and offered
   withdrawal types. Change **Configuration status: SAMPLE** to
   **CONFIGURED**. Until you do, the agent labels plan figures as illustrative
   and won't send email. Consider also adding the SPD itself as a knowledge
   source so the agent can cite it.
4. On the **Build** tab, open **Send request to benefits team** and confirm it
   asks the user before running. Turn approval on if it isn't.
5. Test with the prompts above and check the activity trace for the calculator
   calls, then publish to Microsoft Teams and Microsoft 365 Copilot.
6. Each January, update the inflation-indexed figures in
   `early-withdrawal-exceptions`, such as the domestic abuse and long-term care
   limits.

Web search is on so the agent can confirm current-year IRS figures. Turn it off
in the agent settings if your organization prefers answers only from the
skills.

## Limitations

- US federal rules for 401(k) plans only. State tax treatment is included only
  as a rate the user provides, plus a note that some states add their own tax.
  403(b), 457(b), and IRA questions are referred elsewhere.
- Dollar limits reflect IRS rules for 2026: the domestic abuse distribution
  limit is $10,500, and the qualified long-term care cap is indexed from a
  $2,500 base, so confirm the current-year figure before relying on it.
- If the calculator connection is unavailable, the agent falls back to the
  same formulas and labels the result "calculated manually".
- The calculator estimates hardship, SECURE 2.0, and rollover-eligible
  withdrawals. Loan offsets and deemed distributions are explained in
  conversation but have no dedicated calculator type.
- State early-distribution taxes, such as California's 2.5%, have no separate
  input; include them in the state rate when asking for an estimate.
- Loan refinancing, required minimum distribution calculations, and Roth
  basis splits are referred to the recordkeeper.
- The calculator returns estimates from the inputs the user provides. It
  doesn't know actual income, so bracket changes from a large withdrawal are
  flagged in conversation rather than calculated.
- Custom connector scripts run on .NET Standard 2.0 with a limited set of
  namespaces and must finish within 2 minutes. These calculations take
  milliseconds.
