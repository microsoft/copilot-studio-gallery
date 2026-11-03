# App submissions

Apps created through Cowork or Copilot Studio's Copilot Managed Runtime can use
**platform-managed Git repositories**. Share portable application source, not
the contributor's deployed app, repository identity, or connection configuration.
These app sources are **not Power Platform solution packages**. Existing gallery
agent/workflow submissions continue to use exploded solutions.

The standard first-party CLI flow does not require making your own Entra app
registration, service principal, client secret, or access token. Tenant policies,
licensing, app creation rights, connector consent, and data permissions still
apply. Play access alone does not grant source export/edit access.

## Contribute an app

Install the prerequisites in Microsoft's
[Managed Apps developer guide](https://learn.microsoft.com/en-us/microsoft-365/managed-apps/developer/):
Node >=24.11, npm, Git >=2.27 with a TLS-1.3-capable transport, and Git Credential
Manager. Use the supported Git/GCM installation for your OS. Some Apple Git
builds cannot negotiate the CLI's required TLS version; use a compatible Git
installation, not certificate/TLS bypasses. The gallery itself still uses Node 22.

```sh
npx --yes --package=@microsoft/managed-apps-cli -- ms auth login
npx --yes --package=@microsoft/managed-apps-cli -- ms auth status
npx --yes --package=@microsoft/managed-apps-cli -- ms app list
npx --yes --package=@microsoft/managed-apps-cli -- ms app clone ./my-app --app YOUR_APP_GUID
```

Use the native clone command for your app into a new local directory, following
its help. Clone supports platform-managed repositories; do not extract browser
tokens or substitute custom authentication. In the gallery checkout:

```sh
npm run prepare:app -- /path/to/your-clone my-app --dry-run
npm run prepare:app -- /path/to/your-clone my-app
```

The helper never modifies the clone, overwrites an existing submission, installs
dependencies, signs in, or calls cloud services. It excludes Git history, local
caches/build output, deployment/builder configuration, environment files, and
common credential files. It reports original connections that need documentation.
**It is not a secret scanner or a guarantee of portability.** Review every file,
including generated clients, embedded URLs, sample data, screenshots, and lockfiles,
for private information. Do not copy private or unlicensed source into the gallery.

Layout:

```text
submissions/my-app/
  metadata.json
  README.md
  app/
    package.json
    package-lock.json
    LICENSE
    src/
    ...portable source and, when safe, native generated clients
  screenshots/                  # optional PNGs
```

V1 supports npm-based web apps with a build script producing `dist/index.html`.
Provide an npm v2+ lockfile and a source license. Other build layouts/package
managers need an explicitly supported gallery contract; do not assume the
gallery's validation can infer them.

Complete the shared author/category/tag metadata and app setup:

```json
{
  "submissionType": "managed-app",
  "name": "My app",
  "description": "What this app helps people do.",
  "tags": ["managed-app", "sharepoint"],
  "author": "Your name",
  "app": {
    "prerequisites": ["An existing Team Ideas list with the documented columns."],
    "connectors": [{
      "connector": "shared_sharepointonline",
      "mode": "table",
      "dataSource": "teamideas",
      "table": "Team Ideas",
      "instructions": "Choose your connection and SharePoint site in the native CLI.",
      "columns": [{
        "name": "Title",
        "type": "Single line of text",
        "description": "Required built-in column."
      }]
    }]
  }
}
```

List **every** required connector binding. Use `mode: "action"` for action-mode
connectors and omit `table`/`columns`. `dataSource` records the generated logical
source the app expects; `table` documents the expected table/list name.
For SharePoint, use the native table picker: it resolves the chosen list to its
site-specific ID, which is not the display name. For other connectors, pass
their documented table identifier when required. Choosing a differently
named table can generate a different source/service name and break app imports.
Do not silently rewrite generated code or pretend arbitrary tables are compatible.

For Dataverse fixed tables, use `shared_commondataserviceforapps`, `mode: "table"`,
and the **logical** table name (for example `contoso_idea`), not its display label.
There is no SharePoint-style dataset. The CLI defaults to the app's environment;
manual setup can pass `--dataverse-environment-id` when required. Custom Dataverse
tables/columns must already exist; an independently documented companion Power
Platform solution can supply schema. Gallery app creation does not provision it.

Never put site URLs, connection/reference IDs, environment/app/repository IDs,
`sharedConnectionId`, or credentials in setup metadata. The recipient binds
their own resources. Unknown setup keys fail validation.

**Screenshots are strongly recommended in every app README.** Show the main
screen and, when useful, a key interaction so visitors can understand the app
without installing it. Use synthetic/redacted data and descriptive alt text.
For example:

```markdown
## Screenshots

![Ideas grouped into New, Exploring, and Planned](screenshots/board.png)
```

Also declare the primary image in gallery metadata:
`{"screenshot":{"path":"screenshots/board.png","alt":"Meaningful description"}}`.
Only PNG, at most 2 MiB and 4096 x 4096, is accepted. No remote screenshot URLs
or active SVG content. Use synthetic data, and label illustrative images clearly.
Inline Markdown references to local `screenshots/<lowercase-hyphenated-name>.png`
images are also published and rewritten to generated public image URLs for the
gallery; the original README stays GitHub-readable. Up to five images, including
the primary screenshot, are supported. Each must meet the same PNG size and
dimension limits; symlinks are rejected. Only the image declared in metadata
becomes the primary preview. README images stay outside the app source ZIP.

The README is required and becomes the detail-page guide. Focus on the app's
purpose, screenshots, usage, app-specific data requirements and permissions,
limitations, and customization. Include the exact list/table schema and how to
create it, but keep installation, authentication, CLI, build, and deployment
instructions in this shared guide rather than repeating them in each README.
Omit `previewWorkflow`
for apps. App version comes from `app/package.json`; no fake solution identity
or empty agent/workflow graphs are necessary.

Optional CSV, JSON, and plain-text [supporting files](../submissions/README.md#supporting-files)
can provide synthetic data or reference material. Declare them in metadata;
they are separate downloads, never part of the app source ZIP or automatically
imported automatically.

Validate submission structure with `npm run check:submissions`, then the gallery's
documented checks. Ingestion never executes app code, installs its dependencies,
or runs cloud operations. Separately test the app's source in a fresh managed
app with only its documented prerequisites, then complete the app PR attestation.

## Testing before publication

The page's setup command reads the submission's `app/` folder from the
gallery repository's published `main` branch. Editing a local submission does
not make that template available on GitHub. Do not claim a fresh GitHub-template
installation passed until that source is accessible.

Before publication, review the source ZIP or a separate copy of `app/`, and use
the native CLI's existing-project flow in that new directory:

```sh
npx --yes --package=@microsoft/managed-apps-cli -- ms app init --display-name "Local test app" --repo native
```

This is a local-source test, not a test of the public
GitHub-template command. Prepare the real list/table first and complete the
native connection, pack, and preview steps below. Unlike `app create`, an
initialized local project may not share the new repository's initial history.
If the initial push is rejected, fetch and inspect that history before
integrating it without overwriting remote work; do not force-push.
Do not create a temporary
installer backend, extract credentials, or bypass TLS.

## Install an app

The detail page shows a **Download and install manually** source ZIP link below
the support paragraph, followed by **Automated install** with two command boxes:
**macOS · Bash** and **Windows · PowerShell**. Check the trust acknowledgement
to enable the download and commands. For automated setup, review the appropriate
command and choose its **Copy** control or copy it manually. Unchecking the
acknowledgement disables the download and clears and disables the commands again.
Linux is not supported.

Paste the command into a terminal in the folder where you want the new app.
Node is not required to start: Bash/curl or Windows PowerShell 5.1+ downloads
the shared installer. Its URL is visible in the command. There are exactly two
installers under `public/installers/`, not generated installers per app.
The only submission-specific inputs are its slug and validated connector bindings;
the GitHub template path is derived from the slug.

Before any sign-in or cloud creation, installers check the
[Microsoft prerequisites](https://learn.microsoft.com/en-us/microsoft-365/managed-apps/developer/#prerequisites):
Node.js >=24.11, npm, Git >=2.27, and Git Credential Manager.
Compatible existing tools are reused. Missing tools are installed only after
confirmation, using Homebrew on macOS and WinGet on Windows. The macOS installer
can run Homebrew's official installer, with separate confirmation, if Homebrew
is missing. Apple Git is replaced **for this setup process** by Homebrew Git
to support the managed repository's TLS 1.3 requirement; the Apple installation
is not removed. Windows uses Git for Windows, which normally includes GCM,
and offers the official GCM package separately only if GCM is missing.

Package-manager installation, administrator approval, and corporate restrictions
remain OS-owned. WinGet must already be available; if it is unavailable or
installation is blocked, follow Microsoft's prerequisite links and retry.
Cancelling stops setup. No execution-policy changes, TLS bypasses, forced
installation, or removal of existing tool installations are performed.
Installers update their process PATH, not the user's persistent PATH directly.
Official package installers can make their normal system/user changes.
If GCM is not configured, its native `configure` command requires separate
confirmation because it updates Git credential-helper settings.

After preflight, the installer only sequences ordinary native CLI, npm, and Git
commands. There is no custom authentication, connector API, environment picker,
source overlay, or archive installer. Native prompts retain terminal input/output.

The sequence is: native sign-in and account status, native app creation from the
GitHub template, each declared connection's native prompts, `npm install`,
native pack, Git commit/push to the new managed repository, hosted build, then
preview. It skips an unnecessary commit when there are no staged changes.
The user handles sign-in and the CLI's account/environment/connection/site/list
choices; the runner supplies only declared connector modes and fixed Dataverse
logical table names. SharePoint always uses the native table picker.

`npx --yes --package=@microsoft/managed-apps-cli -- ms` makes the first-party CLI
available through npm's project installation/cache, downloading it when needed,
without sudo or a global installation. The CLI creates the app and
platform-managed repository and scaffolds from the submission's GitHub folder.
Follow its prompts and check the displayed target account and environment.
A branch/tag template reference is used, not an arbitrary commit SHA.
Creation explicitly passes `--repo native` for a standalone platform-managed
repository. Run outside existing managed projects; the native CLI rejects that
combination rather than letting subsequent Git commands affect a shared project.

The template reads current published source from `main`. The separately
downloadable, content-addressed source ZIP is a snapshot from the gallery build;
it is not a checksum lock on future template downloads. Neither is a security
audit or a promise that executable source is safe. Review community source and
your organization's policies.

Setup executes dependency/build scripts and saves the connected source to the
new platform-managed repository. It does not provision lists/tables, create an
app registration, publish live, or share access. Prepare the documented data
first. Git needs a configured commit identity and functioning Credential Manager.
Setup does not change your Git author identity. GCM configuration changes are
made only after the explicit confirmation described above.

The equivalent manual steps are below, also useful for resuming after an error.
Use your installed `ms`, or prefix each command with
`npx --yes --package=@microsoft/managed-apps-cli --`.

1. Prepare Node, Git/GCM, and the sample's actual list/table/schema. Review its
   instructions and trust notice. Authenticate and inspect the active account:
   ```sh
   ms auth login
   ms auth status
   ```
2. From outside any existing managed project, create from the native template:
   The installed-CLI equivalent for Team Ideas is:
   ```sh
   ms app create ./team-ideas-board --repo native --template github:microsoft/copilot-studio-gallery/submissions/team-ideas-board/app#main
   ```
   Optionally pass `--environment-id YOUR_ELIGIBLE_ENVIRONMENT_GUID`.
   Omission uses the platform's native default behavior; not every arbitrary
   environment is necessarily eligible. Check the CLI's displayed target.
3. Enter the new directory and add each declared data source. For Team Ideas:
   ```sh
   cd team-ideas-board
   ms app add data-source --connector shared_sharepointonline --as table
   ```
   Select or create a connection, select the site where you created the list,
   and select the list itself. A list saved under **My lists** belongs to your
   personal site, not the team SharePoint site. The native picker supplies the
   actual list ID; do not pass its display name as `--table`. The native CLI
   handles sign-in/consent. Other samples can use table or action mode as documented.
   For a fixed Dataverse table:
   ```sh
   ms app add data-source --connector shared_commondataserviceforapps --as table --table contoso_idea
   ```
4. Install/build and validate through native pack:
   ```sh
   npm install
   ms app pack
   ```
   Native creation/initialization can add the CLI to `package.json` without
   updating its lockfile. `npm install` reconciles that native change; `npm ci`
   would fail on a mismatched lockfile. Save the updated lockfile with the source.
   This executes app dependency/build scripts and native validation. Resolve
   schema, generated client, policy, and shared-connection errors explicitly;
   never bypass them to obtain a successful-looking preview.
5. Optionally test locally with `ms app dev` and its authenticated **Local Play**
   link. Bare localhost alone does not establish a real connector session.
6. Save source and review hosted preview:
   ```sh
   git add --all
   git commit -m "Install gallery sample"
   git push --set-upstream origin HEAD
   ms app build
   ms app play --mode preview
   ```
   On first launch, the native player may ask **Allow this app to access your
   data?** Review the app and displayed connector account before choosing
   **Allow**. This is a separate user consent step, not an app registration;
   the setup runner does not grant it automatically. Until consent is given,
   the app cannot finish loading connector data.
7. Only after reviewing preview, explicitly publish live if desired:
   ```sh
   ms app deploy
   ms app play --mode live
   ```
   Live publication and sharing are different operations; the gallery never
   silently grants access. Use native sharing separately when appropriate.

## Connections and permissions

Native `ms app add data-source` selects/reuses connections or creates them
inline; SSO/browser behavior depends on the connector and authentication mode.
Users do not need a separate portal-based connection-creation step.

App binding is different from hosted-user authentication. Opening the player
does not infer a site/table/schema or create missing data structures. Do not
assume all connection setup can wait until first launch. Policies, gateways,
custom connectors, shared credentials, consent, and licensing can impose
additional prerequisites. Support means declared native flows, not a promise
that every possible connector can deploy without configuration.

Shareable authentication may make the CLI write a `sharedConnectionId`.
Native pack/deploy requires a least-privilege `allowedActions` policy on shared
references: per-table `get`/`post`/`patch`/`delete`, or exact operation IDs for
action connectors. Follow Microsoft's
[shared-connection policy reference](https://github.com/microsoft/Managed-Apps/blob/main/plugins/microsoft-managed-apps/shared/allowed-actions.md).
The gallery deliberately does not invent a policy or grant every action.
For Team Ideas the intended operations are read/create/update, never delete.

## Recovery

Failures stop at the current stage with native error output. Cloud resources
may already exist even if local setup fails; inspect the native creation output
and your account's app list before retrying. Do not blindly create another app.
The gallery does not automatically retry creation or delete partial resources.

Keep the new app directory and `ms.config.json`; from there use `ms app info`
and the matching native step above. Resolve connection/schema errors with native
add/refresh commands, then rerun pack. For a failed Git push, inspect Git's
message and existing history—do not force-push. For failed builds, fix the
reported dependency/type/policy error, save/push the fix, and rerun native build.
If preview cannot open automatically, use `ms app play --mode preview` again.
The browser must use the same account and tenant as the CLI. If its default
profile uses another account, the player can report **App not found** despite a
successful build. Open the printed preview URL in the matching browser profile;
do not change app permissions or extract credentials to work around it.

For account/tenant errors, use native `ms auth status`, `ms auth switch`, or
interactive login. Never inject tokens or disable TLS/certificate verification.
Browser consent and administrator-controlled policy cannot be bypassed.

## Updates

Prepare newer source into a separate directory and review the diff. Apply code
and schema changes intentionally to the recipient's existing app, regenerate
clients when needed, and retain its identity, connections, and Git history.
There is no automatic upstream synchronization or schema migration framework.
