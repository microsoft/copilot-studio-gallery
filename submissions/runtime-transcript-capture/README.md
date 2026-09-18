# Runtime Transcript Capture

Runtime Transcript Capture captures near-runtime conversation transcripts for Copilot Studio agents powered by the GitHub Copilot harness. It uses conversation telemetry exported to Azure Application Insights, making the captured history available for review, handoff, archiving, or downstream processing.

The solution includes a primary agent, an internal correlation helper, and a workflow. When the user finishes an exchange, these components identify the corresponding telemetry, reconstruct the ordered conversation, and hold the result in the workflow activity for the maker to review.

## Activate the solution

> [!WARNING]
> The workflow is packaged inactive with nonfunctional Azure placeholders. Complete the following configuration before enabling it.

### 1. Import the solution

Import the solution into a managed Power Platform environment. During import, bind the **Azure Monitor Logs** connection reference to an approved connection owned by the maker or workflow owner. Keep the workflow inactive until configuration is complete.

### 2. Enable Azure Application Insights telemetry

Follow Microsoft's [Environment-level telemetry with Application Insights](https://learn.microsoft.com/microsoft-copilot-studio/advanced-environment-level-agent-telemetry) guidance. In the Power Platform admin center, go to **Manage** > **Data export** > **App Insights** and create a data export with **Copilot Studio** as the data type. Select the target Power Platform environment and the Azure subscription, resource group, and Application Insights resource that will receive the telemetry.

Ensure local authentication is enabled on the Application Insights resource. Confirm that Copilot Studio events appear in its `dependencies` table before testing transcript capture.

### 3. Configure the workflow

Open **Workflows** > **Start Asynchronous Transcript Capture**. In both **Find Root Conversation ID** and **Query Root Conversation Transcript**, keep the resource type set to **Application Insights** and replace:

- `00000000-0000-0000-0000-000000000000` with the Azure subscription.
- `REPLACE_WITH_RESOURCE_GROUP` with the resource group.
- `REPLACE_WITH_APPLICATION_INSIGHTS_RESOURCE` with the Application Insights resource.

Save the workflow after both actions are configured.

### 4. Configure run-only access

> [!IMPORTANT]
> Configure run-only users to use the flow owner's least-privilege connection, then publish and test the workflow and agents.

Replace the placeholders in this URL with the target environment ID and the imported workflow's runtime ID:

```text
https://make.powerautomate.com/environments/[Your_Env_Id]/flows/[Your_Flow_ID]/details
```

On the workflow details page, edit **Run-only users** and add the approved users or security groups. Under **Connections Used**, set **Azure Monitor Logs** to **Use this connection** and select the maker or flow owner's approved credentials. Do not select **Provided by run-only user**. Save the permissions.

### 5. Publish and test

Enable and publish **Start Asynchronous Transcript Capture**, publish both agents, and republish **Runtime Transcript Capture** after configuring permissions. Test the complete capture path in Preview Copilot Studio chat before granting access to end users.

### 6. Share the agent

As the final deployment step, open **Runtime Transcript Capture**, select **Share** next to **Publish**, add the intended users or security groups under **People who can use the agent**, and select **Share**.

## Find a captured transcript

Open **Workflows** > **Start Asynchronous Transcript Capture** > **Activity**, select a successful run, and open **Store Transcript Results** to inspect the `TranscriptResults` value.

The transcript is stored only in this run-scoped variable. Production deployments should add a governed durable destination.

## Scope and limitations

This solution supports only Copilot Studio agents powered by the GitHub Copilot harness; standard-harness agents aren't supported. It has been validated in Preview Copilot Studio chat and Microsoft 365 Copilot. The Microsoft Teams channel is unsupported.
