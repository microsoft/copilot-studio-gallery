# Gallery analytics

The production gallery uses Microsoft Clarity project `z2dufgqwq5`.
`src/lib/analytics.ts` defines the API event contract; the shared layout tracks
page views and navigation, and `SolutionDownload.astro` tracks gated actions.
Development builds do not emit these events. Visitors who block Clarity remain
able to use the gallery.

## Smart events

These names are sent with `window.clarity("event", name)` and appear automatically
as API smart events after Clarity receives production traffic. They cannot be
selected in Clarity's editor before the deployed site emits them.

| API event | Meaning |
| --- | --- |
| `gallery_view` | Gallery home loaded, including filtered gallery URLs. |
| `solution_view` | An app or solution detail page loaded, including direct arrivals. |
| `contributors_view` | Contributor directory loaded. |
| `contributor_profile_view` | A contributor profile loaded. |
| `solution_click` | An internal submission link was activated. |
| `contributors_click` | A link to the contributor directory was activated, from any page. |
| `contributor_profile_click` | A link to a contributor profile was activated, including author credits. |
| `contributor_github_click` | A contributor's GitHub link in the directory or profile was activated. |
| `contributor_filter_click` | A profile's "Filter in gallery" link was activated. |
| `contribution_guide_clicked` | The gallery's contribution guide link ("Share a sample") was activated. |
| `trust_acknowledged` | A visitor explicitly checked a download/install trust acknowledgement. |
| `download_requested` | An enabled ZIP download link was activated without cancellation. |
| `install_script_copy_clicked` | An enabled install-command copy button was activated. |
| `install_script_copied` | The clipboard API successfully copied an install command. |
| `install_script_copy_failed` | Clipboard copying failed and the manual-copy fallback was shown. |

Disabled actions do not emit download or copy events. Initializing the page or
restoring a checkbox does not count as an explicit trust acknowledgement.
Compact and sidebar panels use the same contract.

Tags provide public submission and UI context: `page_type`, `solution_slug`,
`submission_type` (`solution` or `managed-app`), `download_surface`, and
`install_platform` (`macos` or `windows`). No search terms, clipboard contents,
install commands, contributor names/handles, or visitor identifiers are added
to these tags.

Clarity tags are **session-level** filters: a session may contain multiple
submission slugs or platforms. A slug filter means the session touched that
submission, not that every event in it belongs to that submission. Do not use
tag intersections as exact per-submission download counts.

## Funnels

Create these in **Settings > Funnels > New funnel**, selecting the API smart
events in the order below. Saving definitions in this repository does not create
them in the hosted Clarity project.

| Funnel name | Ordered steps | Question answered |
| --- | --- | --- |
| Detail to download | `solution_view` > `download_requested` | What fraction of detail-viewing sessions request a ZIP? |
| Detail to install command | `solution_view` > `install_script_copied` | What fraction copy an install command successfully? |
| Install copy reliability | `install_script_copy_clicked` > `install_script_copied` | How often does the copy interaction succeed? |
| Contributor discovery | `contributors_view` > `contributor_profile_view` > `solution_view` | Does the directory lead to profiles and samples? |
| Contribution interest | `gallery_view` > `contribution_guide_clicked` | Do gallery visitors investigate contributing? |
| Contributor-inspired interest | `contributors_view` > `contribution_guide_clicked` | Does exploring contributors lead to contribution interest? |

Use `submission_type` to segment solution downloads and managed-app install
intent. The two detail funnels deliberately start at `solution_view`, not the
home page, so direct and shared-link arrivals are included. A separate
`gallery_view` > `solution_view` > `download_requested` funnel can isolate the
home-page discovery journey.

For trust-gate friction, use `solution_view` > `trust_acknowledged` >
`download_requested` (or `install_script_copied`). Keep this separate from the
primary conversion funnel: checkbox restoration can enable an action without
a new acknowledgement event.

Clarity reports **sessions**, not total event occurrences, in funnel conversion
metrics. Conversion rate is the percentage of sessions entering the first step
that complete the ordered flow. Compare funnels over the same date range;
inspect drop-off recordings and segment by device, referrer, and new/returning
visitors. Repeated clicks or copies in one session do not represent additional
converted sessions.

## Interpretation and rollout

A download request is not proof of a completed transfer, import, or installation.
A copied script is install intent, not proof that someone ran it successfully.
A contribution-guide click is contribution interest, not a submitted pull
request. The guide is hosted on GitHub, outside the gallery's Clarity project;
actual contribution outcomes must come from repository pull requests, not a
fabricated browser completion event.

Deploy the code, allow genuine production traffic to register the API events,
then create the funnels above. Do not inject synthetic events into the live
project merely to populate the event picker. Clarity's existing auto `Download`
event is a separate heuristic signal; do not add it to `download_requested` to
derive a total, since both may describe the same interaction.

Before deployment, run `npm run import:submissions`, `npm test`, `npm run check`,
and `npm run build`. Tests exercise the actual download script's trust gate,
clipboard success/failure behavior, production-only emission, route matching,
and the Clarity event/tag API contract.

This instrumentation does not change Clarity's existing consent or masking
configuration. The trust checkbox is **not analytics consent**. Analytics
consent review and public download totals/ranking remain separate roadmap work.

## Data export coverage

The [documented Data Export API](https://learn.microsoft.com/en-us/clarity/setup-and-installation/clarity-data-export-api)
exports aggregated dashboard insights, not a documented raw event stream.
Its listed metrics cover traffic, popular pages, engagement time, scroll depth,
referrers, devices/browsers/OS/countries, and interaction problems such as rage
clicks and script errors. Its listed dimensions are Browser, Device,
Country/Region, OS, Source, Medium, Campaign, Channel, and URL.

**Smart-event names/counts, custom tags, and funnel conversion metrics are not
listed in the API contract.** The documentation allows additional response
fields, so their absence from the documentation is not proof they can never
appear. Do not assume this API exports every gallery event. Confirm coverage
against an actual response after deployment and event ingestion before
designing an external conversion dashboard.

The endpoint is `GET https://www.clarity.ms/export-data/api/v1/project-live-insights`.
It supports the previous 1, 2, or 3 days (rolling 24/48/72 hours), up to three
dimensions, ten requests per project per day, and a maximum of 1,000 rows with
no pagination. Responses use UTC. A project-admin-generated API token is
required; the gallery runtime does not create or store tokens.

### Authenticated export checks

On 2026-11-07, an administrator-approved research token was generated for this
project. Three requests to the documented endpoint succeeded using an
`Authorization` header with the `Bearer` scheme. The credential was used only
in memory, never included in command literals, logs, or repository files.
Only metric names, field names, and row counts were inspected in the output;
raw visitor URLs and their query strings were not logged.

| Query parameters | Result | Coverage |
| --- | --- | --- |
| `numOfDays=1` | HTTP 200 | 16 metric groups; no download or smart-event metric. |
| `numOfDays=1&dimension1=URL` | HTTP 200 | 9 metric groups; 131 Traffic URL rows; no download or smart-event metric. |
| `numOfDays=3&dimension1=URL` | HTTP 200 | The same 9 metric groups; 290 Traffic URL rows; no download or smart-event metric. |

The unsegmented response contained `DeadClickCount`, `ExcessiveScroll`,
`RageClickCount`, `QuickbackClick`, `ScriptErrorCount`, `ErrorClickCount`,
`ScrollDepth`, `Traffic`, `EngagementTime`, `Browser`, `Device`, `OS`,
`Country`, `PageTitle`, `ReferrerUrl`, and `PopularPages`. URL segmentation
returned the first nine groups, not all sixteen.

The actual Traffic fields were `totalSessionCount`, `totalBotSessionCount`,
`distinctUserCount`, and `pagesPerSessionPercentage`, plus `Url` when segmented.
These differ in spelling/capitalization from the documentation's illustrative
sample. The problem-click groups exposed `subTotal`, `sessionsCount`,
`sessionsWithMetricPercentage`, `sessionsWithoutMetricPercentage`, and
`pagesViews`; their counts are **not download counts**.

No response exposed the existing auto `Download` smart event, named API events,
custom-tag attribution, or funnel conversion metrics. Some segmented URLs
contained the word "download" only outside their page path; that is URL text,
not evidence of a download event or a ZIP request. The new gallery API events
were not deployed during this check, so their post-ingestion export behavior
remains untested. Nevertheless, the existing auto Download event was already
visible in the dashboard and absent from these exports.

Dashboard CSV and funnel exports remain separately unverified. An API coverage
check does not establish what those manual export surfaces contain.

### Implications for a scheduled GitHub workflow

**Do not build a download-count collector on the tested Clarity API.** It can
collect traffic and engagement snapshots, but none of these successful
responses supplied a download numerator. Missing metrics must be recorded as
unavailable, not zero; page views cannot substitute for download requests.
Clarity remains useful for the in-product smart events and funnels above.

For a future traffic collector, store its token in an Actions secret, retain
the query parameters and UTC collection timestamp with each snapshot, validate
the response schema, and stay within the ten-request daily quota. Rolling
24/48/72-hour snapshots overlap: do not sum them as disjoint daily totals.
Account for the 1,000-row cap and lack of pagination before claiming complete
URL coverage. URL query strings can contain visitor input and should not be
published in workflow logs or artifacts.

## Release-backed ZIP counts

The gallery collects ZIP counts through the
[GitHub release-asset API](https://docs.github.com/en/rest/releases/assets#get-a-release-asset),
not the Clarity export API. Counts are displayed **only on submission detail
pages**, for both solutions and managed apps, with an as-of date. Gallery cards
and default ordering are unchanged. `solutions.json` includes the same optional
`download` metadata (`url`, `count`, `asOf`, `trackedSince`, and `source`).

`count` sums cumulative `download_count` across all registered ZIP versions for
that submission. It includes direct links, repeats, and automation. Tracking
starts with release publication; old GitHub Pages downloads cannot be recovered.
It is not a count of unique people, completed transfers, imports, or installs.
Do not divide this all-source total by Clarity sessions to invent a conversion
rate. Use Clarity's own session funnels separately.

### Publication and refresh

The main Pages workflow regenerates and validates submissions, then runs
`scripts/release-downloads.ts publish`. Only public, non-demo submission ZIPs
are published. Their release filenames include the SHA-256 of the exact
deterministic ZIP bytes; unchanged versions reuse their asset IDs. New versions
go into draft release batches (up to 1,000 assets each), are verified, then
published without becoming the repository's latest release. Published batches
are never extended or clobbered, so immutable-release enforcement is compatible.
The publisher can resume an interrupted draft or reconcile an already published
batch. It repairs only a known zero-byte `starter` asset inside a draft.

The bot-owned `download-stats` branch stores `downloads.json`: a versioned asset
registry and the last complete count snapshot. Older versions remain registered
even when local bundle cleanup removes them. Collection paginates asset lists
and checks IDs, names, URLs, size, digests when present, and nondecreasing counts.
Missing/changed assets and API failures fail the job; they do not become zero.
The previous snapshot and deployed site remain unchanged.

`.github/workflows/download-stats.yml` refreshes the snapshot daily or on manual
dispatch, then explicitly dispatches the Pages workflow. This explicit dispatch
is necessary because bot pushes with `GITHUB_TOKEN` do not trigger ordinary
push workflows. Data writes are serialized across workflows and use
non-force updates to avoid losing concurrent edits. Main's reviewed-PR rules
are not changed.

Use the existing workflow token: trusted publication/collection jobs need
`contents: write`, and the refresh dispatcher also needs `actions: write`.
No new secret, Clarity token, backend, or custom authentication is required.
Repository/organization policies must permit those workflow permissions and
the creation/update of `download-stats`; failures require maintainer resolution,
not bypassing protection or silently using different credentials.

### Build-time metadata and offline development

The importer emits `bundleSha256` alongside each local bundle path.
`getPublishedSolutions()` enriches records from the validated file identified
by `GALLERY_DOWNLOAD_DATA`; counters are never authored in submission
`metadata.json` or hand-edited in generated content. Production builds set
`GALLERY_REQUIRE_RELEASES=true` and require an exact release match for every
public current ZIP hash. A missing snapshot or asset fails the build rather
than silently switching production controls to uncounted static downloads.

Local and PR builds need no API, token, or stats branch. With no snapshot path,
they retain local ZIP links and omit unmeasured counts. To inspect a known
snapshot locally, supply its file path:

```sh
GALLERY_DOWNLOAD_DATA=/path/to/downloads.json GALLERY_REQUIRE_RELEASES=true npm run build
```

Measured zero is displayed as zero. Every count carries its original snapshot
date; collection failures never mark old data fresh. Shared installer scripts,
supporting files, and screenshots stay on Pages. Managed-app creation still
uses the native GitHub-subfolder template on `main`, not the release ZIP, so
install-script copies and native app creations are not included in these totals.

Existing static ZIP URLs remain compatibility links and are not counted.
The production trust-gated buttons point to canonical GitHub release download
URLs; GitHub's redirect/attachment response handles cross-origin downloading.
The trust acknowledgement and existing Clarity intent events remain intact.

### Operations and rollout

GitHub allows 1,000 assets per release, each under 2 GiB, with no aggregate
release-size/bandwidth limit. API collection cost grows with retained release
batches, not site traffic. Watch the actual rate-limit headers; the conservative
workflow-token budget is 1,000 requests/hour/repository, with higher limits for
some enterprise resources. Reads have bounded retries; writes are reconciled
on the next run instead of blindly repeated after uncertain failure.

The first trusted main deployment bootstraps the data branch and release assets.
The collector deliberately fails before this registry exists. After merge,
verify publication, the actual browser attachment download, the data-branch
snapshot, and a manually dispatched refresh. No live gallery releases or
production download totals were created during local implementation.
