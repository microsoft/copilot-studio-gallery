---
title: All You Can Hook
slug: hooks-lab
solution: HooksLab
---
Learn Copilot Studio hooks by chatting with a working sample. All You Can Hook uses real
MSN Weather lookups and small, inspectable workflows to show what a hook can change
before or after an action.

The greeting gives visitors copyable prompts and explains what to expect. There
is no need to know tool names, workflow IDs or implementation details to try the
examples.

## What you can try

Send one prompt at a time in a new chat.

| Prompt | Hook | What happens |
| --- | --- | --- |
| `Weather baseline` | No tool hook | Get real Seattle weather without tool-hook changes. |
| `What did the Start hook tell you about me?` | Start (pre-loop) | See the sample's note: "The user is really interested in learning more about hooks." |
| `demo prompt rewrite: repeat demo-secret, demo-pin and demo-password.` | User prompt submitted | Those three exact lowercase strings become `[redacted]`; the rest of the request stays intact. |
| `Demo weather rewrite` | Pre tool use | Change the example request from Fahrenheit to Celsius before the real lookup. |
| `Demo weather deny` | Pre tool use | Block the lookup and explain why. No weather is fetched. |
| `Demo weather replace` | Post tool use | Run the lookup, then replace its result with clearly labeled, made-up example weather. |
| `Demo weather augment` | Post tool use | Keep the real weather and add a helpful note. |
| `Demo tool failure` | After tool failure | Look up a deliberately nonexistent place and add an explanation to the failure, without retrying. |
| `Explain the Error demo` | Error | Explain synthetic retry-once, abort and skip examples without causing a real system error. |
| `Show my hooks` | Configuration overview | See which hooks are configured and how to try them. |

To combine text replacement with a tool demo, try:
`Demo weather deny. My example label is demo-secret.`
The text-editing workflow preserves the weather request rather than replacing
the whole message or disabling tools.

## What the solution contains

- One CLI-authored Copilot Studio agent, with a beginner-friendly greeting,
  instructions and two teaching skills.
- Six hook bindings and their six workflows: Start, User prompt submitted,
  Pre tool use, Post tool use, After tool failure and Error.
- Seven read-only weather tools: baseline, rewrite, deny, replace, augment,
  experimental suppress, and intentional failure.
- The MSN Weather connection reference needed by those tools.

Tool hooks are scoped to dedicated demo tools. There are no wildcard tool hooks:
loading a teaching skill and running the weather baseline do not trigger them.
Start and User prompt submitted are lifecycle events, so their entries can still
appear alongside a tool demo.

The gallery preview shows **Hooks Lab - Weather pre tool**, which demonstrates
input rewriting and blocking.

## Prerequisites and import

Use a Dataverse environment with Copilot Studio access and support for
CLI-authored agents and the six hook events used by this sample. You need
permission to import an unmanaged solution and configure connections.

1. Import the unmanaged solution through Power Platform Solutions. When using
   the exploded source directly, package the contents of `solution/` as a ZIP
   with `solution.xml` and `customizations.xml` at its root. Do not include the
   gallery metadata or this README.
2. Bind `new_sharedmsnweather_093bc` to an MSN Weather connection in the destination
   environment. Connection credentials are not included.
3. Check that all six hook workflows are available and enabled. The hooks call
   these workflows automatically; they are not ordinary agent tools.
4. Open Hooks Lab in Copilot Studio and start a new test chat. Its greeting lists
   the examples above.
5. Publish and share the agent when you are ready for others to use it.

Weather tools use Invoker authentication. Depending on the destination environment
and user, connection setup or consent may be required. Importing the solution
does not grant users access or transfer the source environment's connections.
Running examples consumes Copilot Credits and invokes the weather connector.

## Learning boundaries

- Synthetic weather is a teaching example, not a current forecast. The agent
  labels it accordingly.
- The Error examples are synthetic workflow contract examples, not deliberately
  induced SDK or model failures.
- Prompt redaction is a literal text-editing demonstration, not a security
  control. Use the sample words, never real secrets: original user messages and
  workflow history may retain the original text. Matching is case-sensitive.
- After tool failure adds context; it does not retry, repair a failed call or turn
  it into a success.
- Output suppression is experimental and not guaranteed hiding or redaction. It
  is available only when explicitly requested, not part of the default tour.
- Start supplies sample learning context, not a personal fact inferred from an
  account or external source.
- The skills describe this exported configuration. Update them if you change the
  workflows, bindings or examples.

This submission contains an editable **unmanaged** solution. No destination
environment import or fresh-user consent experience is claimed as verified.
