# Oddly

Big thoughts. Small wonders.

Oddly is a completely custom Copilot Studio chat canvas: warm paper,
mint-green accents, an original lavender monster, and room to actually think.
React renders the entire experience. There is **no WebChat dependency**:
live turns use the native **Microsoft Copilot Studio action connector**
through the Managed Runtime SDK and host.

## What you can do

- Start with three useful conversation starters, or write your own.
- Receive text answers from your published agent, a complete turn at a time.
- Copy an answer, save it to **Little keepers**, or export the conversation as Markdown.
- Keep multiple independent conversations for the current page session.
- Search the current conversation and switch to a quieter, decoration-free view.
- Try a clearly labeled local sample before selecting an agent.

Sample responses are scripted, not AI-generated, and never contact Microsoft.
Live failures never fall back to sample answers.

## Screenshots

The main canvas includes a conversation sidebar, Oddly, three prompt starters,
and a roomy composer. On narrow screens the sidebar collapses into an accessible menu.

## Connect your own agent

Use the [shared managed-app guide](../../docs/managed-apps.md) for native app
creation, connector binding, build, preview, and deployment. Bind the
**Microsoft Copilot Studio** connector (`shared_microsoftcopilotstudio`) in
**action** mode. The expected logical data source is `microsoftcopilotstudio`.
The native CLI accepts the short alias `microsoftcopilotstudio` and generates
`generated/services/MicrosoftCopilotStudioService.ts`.
The source checkout intentionally contains no deployed app or connection IDs,
no hand-written generated client, and no credentials.

This app requires the allowed **Execute Agent and wait**
(`ExecuteCopilotAsyncV2`) operation. There are no tables or list schemas.
Use a published **standard-harness** agent with **Authenticate with Microsoft**,
and a user who has permission to use it. The currently generated Managed Apps
connector does not expose the operation for GitHub Copilot harness agents;
see [microsoft/Copilot-Managed-Runtime#16](https://github.com/microsoft/Copilot-Managed-Runtime/issues/16).
The direct Agents SDK can support both harnesses, but is not this app's transport.

Open the native authenticated **Local Play** or hosted player and complete the
platform's connector sign-in and consent. Bare localhost supports sample mode
only; it does not establish a connector session. This app does not use a custom
MSAL popup, an Entra SPA registration, a redirect bridge, a client secret,
or arbitrary external HTTP requests. Fonts are bundled locally.

Choose **Bring your own agent**, enter the **environment ID** and **agent schema
name**, then choose **Use this agent**. The environment ID is in the Copilot Studio
URL after `/environments/`. Copy the case-sensitive schema name from the agent's
metadata or its Web app connection string, not its display name or bot GUID.
Selecting an agent validates local configuration; the **first message** checks
the actual connection. No test prompt is sent implicitly.

The operation sends the message, browser locale, optional existing conversation
ID, and selected environment through the generated service. It also supplies
the required `notificationUrl` placeholder documented in Microsoft's
[connector invocation example](https://learn.microsoft.com/en-us/power-apps/developer/code-apps/how-to/connect-to-copilot-studio);
the service does not use that URL in synchronous mode. No app-hosted callback is needed.
Current codegen types the result as `void`, so the adapter validates the actual
response shape instead of casting it or modifying generated code.
Follow-up messages reuse the returned conversation ID; a new chat starts without one.

## Privacy and limitations

Chats, saved thoughts, and agent selection stay in page memory, not local storage.
Reloading loses them. The managed player owns authentication and connection
lifecycle; this app never reads or caches access tokens.
Copy and export are explicit user actions. Live prompts and replies are subject
to the configured agent's organizational data handling and retention policies.
An agent's tools may take actions: review its capabilities before sending prompts.
**New chat** does not delete remote history. Switching to sample mode clears local
live chats and their saved answers, but does not sign out of the player or revoke consent.

Only the connector's returned text answers are rendered. Markdown is safely
rendered without raw HTML; links allow only HTTP(S), and remote Markdown images
are not loaded. This connector does not expose token streaming, tool activity,
reasoning, or suggested-action payloads. Adaptive Cards, uploads, interactive
sign-in cards, handoffs, and proactive/background activities are not supported.
If the connector returns no usable text or conversation ID, the app shows an
explicit error instead of inventing an answer or silently starting a new conversation.
It cannot detect cards or activities that the connector itself does not return.

Choose agents whose tasks work through text turns. Slow operations, connector
throttling, tenant policies, and regional availability still apply. Failed or
ambiguous requests are never retried automatically: they may already have reached
the agent. Check the outcome before starting a new chat.

## Customize

Change the starters and sample scripts in `app/src/demo.ts`, the original
monster in `app/src/Monster.tsx`, and the paper/mint/lavender palette in
`app/src/style.css`. No prompts or hidden persona instructions are injected
into live conversations. Reduced-motion preferences are respected, and
**Quiet mode** hides decoration.

Source is MIT licensed. Bundled font packages retain their own OFL licenses.
