---
title: Kusto Analytics Assistant
slug: kusto-analytics-workflow
solution: KustoAnalyticsAssistant
---
Kusto Analytics Assistant turns natural-language analytics questions into
read-only KQL, runs them against Azure Data Explorer, and returns grounded
results with the exact query used. A recurrence trigger can also run a scheduled
query and email a summary of the top rows to the invoking user.

## Agent

- The primary agent retains the selected cluster and database as conversation
  context and asks for either value when it is missing.
- The Kusto Query Interpreter skill translates analytics questions into KQL,
  rejects mutating or administrative requests, and reports tool failures without
  inventing results.
- The Kusto MCP tool executes queries with the invoking user's connection.
- The Outlook Mail MCP tool sends the scheduled summary.

## Automation

The recurrence trigger invokes the agent with a prompt containing the target
cluster, database, and table. The exported solution uses explicit placeholders
for those values so contributors do not publish environment-specific data.

## Import notes

After importing the unmanaged solution:

1. Authorize the Azure Data Explorer, Outlook Mail, and Microsoft Copilot Studio
   connection references.
2. Replace the `<cluster>`, `<region>`, `<database>`, and `<table>` placeholders
   in the recurrence trigger prompt.
3. Configure the recurrence frequency, interval, start time, and time zone.
4. Confirm the importing user has read access to the target Kusto database and
   permission to send mail from the selected mailbox.
5. Review and test the generated KQL before publishing the agent and enabling
   the recurrence trigger.

The solution does not write to Kusto, send to arbitrary recipients, or create a
dashboard.
