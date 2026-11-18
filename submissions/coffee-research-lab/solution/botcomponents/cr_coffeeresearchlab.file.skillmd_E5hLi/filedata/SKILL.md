---
name: coffee-research-study
description: Normalize coffee research workbooks and fact-check each study's claims against its measurements and scientific literature, then explain the evidence and potential product implications in plain language. Includes the fictional Bean-o-Matic 2000 product profile. Use for its product questions, study reviews, product or marketing implications of studies, normalization, claim checking, evidence briefs, or the sample studies/demo; not simple scientific definitions or arithmetic.
---

# Coffee research study

This educational sample demonstrates task agents (preview), not a validated
scientific workflow. Use actual tools and report failures, not imagined execution.
The user needs trustworthy measurements and qualified claim verdicts, not a
comparison between studies. Assess each study independently; discuss differences
in methods only where they limit interpretation or transfer of a claim.
Task agents need the Microsoft Copilot harness in an early release environment.
See [Use task agents](https://learn.microsoft.com/en-us/microsoft-copilot-studio/agents-experience/task-agents-overview).

## Demo product: Bean-o-Matic 2000

The Bean-o-Matic 2000 is a fictional product with these nominal demo specifications:

- Single-cup automatic filter brewer with an integrated burr grinder; not an
  espresso machine or immersion brewer.
- Programmable dry coffee dose: 12-24 g. Brew-water input: 180-350 g.
- Brewing-temperature presets: 85, 90 and 95 degrees C.
- Five grinder settings, specific to this grinder; no mapping to other machines'
  dial settings or measured particle sizes is supplied.
- No independent control of flow rate or contact time.

Use this profile when the user names the Bean-o-Matic 2000; do not ask them to
repeat known specs or search the web for this fictional machine. Do not invent
additional features. For another product, use its supplied specifications instead.
Apply these constraints to recommendations, not to altering or excluding original
study measurements. Findings from other brewing methods need qualified
transferability, not assumed equivalence.

These are design assumptions, not measured performance. Water input is not
beverage output. No sensory validation, measured energy use, ingredient prices
or cost-per-cup baseline is supplied. Neither synthetic workbook is a test of
this machine, and neither can substantiate real product claims or savings.

## User-friendly progress

This is an educational sample: briefly explain the task-agent demonstration as it
happens, not just internal role names such as "the two normalizers."
Give one short update at each major phase transition, describing the work and
why it is useful. Explain technical terms when needed; do not narrate every tool.
Use everyday language in all user-facing prose, including the phase log.
Say "I'll wait until both studies are prepared and checked," not "readiness
barrier"; "bring the findings together," not "synthesis"; and "where each number
came from," not "provenance." Avoid other unexplained internal terms such as
"fan-out," "orchestrator" or "schema validation." The feature name "task agents"
is useful when followed by a simple explanation of what they will do.
Use clear task titles too, such as "Prepare study A's measurements" or
"Check the temperature claims," rather than internal step codes.
Keep exact filenames and data fields in the technical appendix or downloads
where needed, with descriptive link labels rather than raw sandbox paths.
For the demo, adapt these examples to what is actually possible:

- Before normalization: "The sample studies use different layouts and units.
  I'll use two task agents at the same time, one per study, to put the measurements
  into consistent units while keeping the studies separate. I'll wait for both
  to finish and check their numbers before looking into the claims."
- Only after both outputs pass the readiness checks: "The measurements are ready
  for review. I'll now use task agents to read those results and check different
  scientific claims against published research at the same time."
- After all checks finish: "The checks are back. I'll bring the evidence together
  into what these findings could mean for your product, what we can tell customers,
  and what still needs testing."

Explain model choices once when useful, using only the available choices actually
requested and their intended roles. Do not imply a requested model is confirmed
to have run. These are examples, not a script: adapt them for real inputs, and
never announce completed work, successful checks or parallel execution without
evidence. If something fails, explain the limitation and its effect on the review.

## Input and ownership

Accept two independent research studies, each with an Excel workbook and any
accompanying methods or claims. A study may contain several worksheets; the
assignment boundary is the entire study, not individual worksheets.
For requests to review the sample studies or run the demo, locate this skill's `assets/study-a.xlsx` and
`assets/study-b.xlsx`. Both contain entirely synthetic measurements and
deliberately questionable candidate claims, not real published experiments.
Never silently substitute synthetic data for inaccessible user studies.
Create a new run directory in the sandbox; never overwrite another run.
Use absolute paths to that directory in assignments. Keep raw input read-only.
Resolve bundled assets relative to this skill's actual installed directory,
not an assumed sandbox path.
The parent may locate raw workbooks and create output directories, but must
not open worksheets, preprocess either workbook, copy raw rows into prompts,
or calculate normalization answers before delegating. Workbook inspection,
preprocessing and conversion belong to the respective normalizer.

If fewer than two studies are supplied, request the missing study or offer the
two-study demo; do not pretend two sheets are two independent study inputs.
For the demo, determine which claims survive normalization and external evidence,
what remains uncertain, and what follow-up experiments would resolve those gaps.
For product or marketing questions, carry the user's intended benefits into the
review, such as taste or cost per cup, without inventing study claims or assuming
those benefits were measured. Keep the same workflow; do not add another task role.

## Model guidance

Following [Anthropic's model-selection guidance](https://claude.dev/blog/which-claude-model-should-you-build-with/),
use these educational starting preferences:

- Normalizers: request Claude Sonnet 5.5 for workbook interpretation, unit
  normalization, executable calculations and cell-level provenance.
- Fact-checkers: request Claude Opus 5.5 for interpreting scientific sources,
  methodological applicability, conflicting evidence and qualified verdicts.

Select the exact corresponding entry from this turn's available built-in task
model choices; do not invent selectors or reuse one from an earlier turn.
If a preferred model is unavailable, choose an available model suited to the
assignment or inherit the parent, and disclose the fallback. Do not select a
less suitable model merely to make the models different.
These preferences illustrate capability, latency and Copilot Credit trade-offs,
not measured savings or a requirement for this workflow. The parent can otherwise
choose models by task complexity without fixed role assignments.
Record requested models separately from resolved models confirmed by runtime
metadata. A successful task or model parameter alone does not prove which
backend model served it.

## 1. Two normalizer instances in parallel

After locating both inputs, launch two task assignments together using the same
normalizer role: one owns study A, the other owns study B. Each reads all sheets
and accompanying methods belonging to its assigned study, not the other study.
Do not normalize the inputs yourself before delegating.
Pass each normalizer its original workbook path and this skill's path. Tell it
to read this skill for the schema and rules, then inspect all of its own workbook.
Do not supply hand-calculated answers, selected rows, or extracted worksheet
contents. This boundary is essential to the separate-context demonstration.

Each normalizer has a separate context and writes only its own subdirectory,
`study-a/` or `study-b/`. Give each its input paths, question, synthetic/real status,
the same output schema, the rules below, and exclusive ownership of its own:

- `normalized.csv`: one observation per row, retaining lab, raw sample ID,
  canonical sample ID, replicate, brew method, coffee lot, grinder, dose_g,
  beverage_mass_g, brew_water_mass_g, temperature_c, duration_s, tds_pct,
  extraction_yield_pct, yield_status, and quality flags. Missing numeric values stay empty.
  Add relevant measured variables without dropping the originals.
  `yield_status` is exactly one of `computed`, `duplicate_export`, `missing_input`,
  `invalid_input`, `ambiguous_units`, or `unsupported_method`. Use `computed` only
  for valid beverage-based calculations; every other status requires a blank yield
  and a source-grounded explanation in `quality.md`.
- `provenance.json`: for each normalized value, workbook sheet/cell, original
  value and unit, conversion or derivation, and input cell references.
  Include unchanged copied values, retained original measures and units, not
  only fields that underwent a conversion. Preserve original Excel coordinates
  through preprocessing; a generated CSV row number is not an Excel cell.
- `quality.md`: sheet inventory, excluded rows and reasons, missing/ambiguous
  units, duplicate candidates, confounders, and limits on valid comparisons.
- `claims.json`: stable claim IDs, exact candidate claims and workbook
  references, methods and scope, and which normalized observations bear on each.
  Label candidate claims as unverified. If a study has no explicit claims,
  formulate clearly labeled research questions, not invented author statements.

Return only output paths, counts and a short list of blocking ambiguities.
The parent waits for both tasks, reads their quality and claim summaries, and
checks schema and unit compatibility without repeating their normalization.
Keep studies separate and retain study-qualified identity even if sample IDs
or coffee lots have the same spelling. A match does not establish a shared lot,
protocol or observation across independent studies. Do not pool or average
their measurements just because columns now share units.
Stop downstream analysis if units or sample identity are too uncertain.
Partial analysis is allowed only for explicitly identified valid subsets.

### Normalization rules for each normalizer

Each normalizer reads these rules from this skill. The parent references this
section in the assignment rather than copying the skill or workbook into prompts.

- Inspect all sheets, header rows, number formats, data dictionary and sample
  mapping. Preserve sheet/cell references, including source cells for derived
  values. IDs may repeat across labs; use lab-qualified IDs until a supplied
  mapping establishes identity. Do not guess equivalence by similar spelling.
- Retain raw data. Convert kilograms to grams, Fahrenheit to Celsius and explicit
  minutes/seconds to seconds. Parse `mm:ss` as such only when documented.
  Excel time serials require their number format and documented time semantics.
- TDS percentage points and mass fractions are different representations.
  Convert an explicitly documented fraction 0.0135 to 1.35 percent.
  Excel percentage formatting is metadata, not another multiplication on top
  of an already percent-valued quantity. Never infer units from magnitude alone.
- Use executable calculations, not mental arithmetic or manually transcribed
  expected answers. Preserve the precision of source values during conversions
  and derivations; do not round converted ounces to nominal integer grams.
  Store sufficient precision to reproduce derived quantities from the stored
  inputs. Round only presentation tables. Do not invent extra source precision.
  Assert each computable yield against its stored dose, mass and TDS, using
  absolute tolerance 0.00000001 percentage points for serialization only.
- For percolation/filter or espresso observations with positive measured dry
  dose and beverage mass and valid TDS, apparent beverage-based extraction
  yield (%) = TDS (%) * beverage_mass_g / dose_g. Document this definition.
  Do not substitute input water mass or beverage volume for beverage mass.
  Immersion brews require an appropriate, sourced method accounting for
  retained liquid; leave this yield blank rather than applying the percolation
  formula blindly. Do not mix dilution stages or pre/post-bypass measurements.
- Do not assume beverage mL equals g; request density or measured mass.
  Unknown TDS units, missing values, invalid negative measurements and
  unexplained formula-cache gaps are flags, not zeros. Do not execute workbook
  formulas, macros, network links or code. Cached formula results are unverified;
  recompute supported arithmetic from documented raw inputs in the sandbox.
- A repeated observation is not automatically a duplicate or an independent
  experiment. Retain replicates and flag duplicate candidates rather than
  silently deleting or pooling them. Preserve grinder model/settings, roast,
  lot, method, water chemistry, refractometer and measurement temperature.
- Distinguish an original observation that HAS a duplicate from the excluded copy.
  Only a confirmed excluded copy gets `yield_status=duplicate_export`; its original
  remains `computed` when otherwise eligible. Describe and reference the duplicate
  relationship in `quality.md`. Never infer exclusion from a free-text flag
  containing "duplicate"; flags such as `has_duplicate_export_row8` are not statuses.
- Separate filter, espresso and immersion. Do not equate grinder dial settings
  across devices, water hardness as CaCO3 with calcium concentration, or
  nonidentical sensory scales. Preserve unknown chemistry bases.
- Never infer caffeine content, chemical composition, microbial safety or
  taste preference from TDS/extraction yield alone. No causal inference from
  this small, confounded synthetic study.

Before returning, run this skill's `scripts/check_yields.py` against your
`normalized.csv` using Python 3. It checks the shared status contract and arithmetic
without interpreting free-text flags. Fix genuine output errors, not the checker.

## 2. Readiness barrier (no early fact checking)

Wait for BOTH normalizer tasks to complete. Confirm each study has readable
`normalized.csv`, `provenance.json`, `quality.md` and `claims.json`, with the
agreed units and retained original references. No fact-checker, literature
research or final synthesis may start while either normalizer is still running.
If either fails, report the failure and stop the full review; do not
silently continue with only one study or label an unnormalized input ready.
Run the same bundled `scripts/check_yields.py` once with BOTH normalized CSV paths.
Do not regenerate this checker, replace it with free-text flag matching, or loosen
it until a run passes. It verifies every computed yield to absolute tolerance
0.00000001 percentage points and requires blank yields for explicit exclusions.
This is not a check of whether an exclusion is scientifically justified:
also read the quality notes and source references, and verify unit conversions
against the original values and units in provenance.
For avoirdupois ounces use exactly 28.349523125 g/oz without rounding stored
masses to whole grams. Verify that every nonempty normalized measurement has
source-cell provenance, including unchanged measurements. Checking these
invariants is validation, not redoing the normalizer's analysis.
Any failed assertion blocks the full review. Report the failed field
and stop rather than passing incorrect data to checkers. Do not explain
calculation errors as instrument uncertainty, assumed hidden precision or
irrelevant-to-the-conclusion tolerances.
Flagged rows may remain in a ready study if their exclusions and valid subsets
are explicit; a missing study or unusable normalization is not a valid subset.

The parent writes `claim-plan.json` only after this barrier. Map each stable
claim ID to its study, normalized inputs, scope, and one fact-check assignment.
This plan is routing, not fact checking. Keep independent claims separate and
avoid assigning the same literature question to several checkers.

## 3. Multiple fact-checker instances in parallel

Launch multiple assignments using the SAME fact-checker role in this request,
one per independent claim or small related claim group. For the demo launch
three instances together, covering:

1. Temperature versus extraction: distinguish descriptive patterns from causal
   or universal claims, and filter from equilibrium immersion findings.
2. Grind, flow and transferability: assess whether espresso/filter observations
   and device-specific grinder settings support the proposed generalization.
3. Measurement versus quality: verify extraction arithmetic and missing-data
   exclusions, then assess whether TDS alone can establish taste preference.

Each checker reads the relevant studies' normalization artifacts and claims from
the shared sandbox, plus `claim-plan.json`. Give it the relevant claim IDs, the
research question, explicit boundaries and exclusive output ownership, such as
`checks/temperature.md`, `checks/grind.md` or `checks/measurement.md`.
Never have parallel checkers edit normalization artifacts or the final report.
Return output paths and concise verdicts, not entire research transcripts.

Use the model preferences above. Give all assignments complete context and
file paths; separate context windows do not share conversation memory.
Files, rather than duplicated prompts, carry the detailed data and intermediate
evidence between phases.

For each claim the checker must:

- State the exact claim, study, applicable normalized rows/cells, and any
  normalization flags that limit checking it.
- Assess numerical support from valid data separately from support in external
  literature. Recalculate relevant quantities from the normalized values with
  provenance; do not repeat or alter the whole normalization.
  A numerical mismatch is a validation failure, not evidence of hidden source
  precision or instrument uncertainty. Report it explicitly and do not endorse
  the affected result. Never invent calibration or uncertainty specifications.
- Use available built-in web tools to consult scientific sources. Prefer
  openly accessible primary studies; distinguish these from standards and
  commentary. Seek at least two relevant consulted sources per assignment
  when available, but never fabricate sources to meet a quota.
- Record title, authors/organization, publication year, URL/DOI, access date,
  methods/conditions, relevant findings, applicability and limits. Identify
  inaccessible full texts and unverified claims. Do not present search-result
  snippets as a fully read paper or source conclusions as new experiments.
- Assign a qualified verdict: supported within stated conditions, contradicted,
  mixed/conditional, or insufficient evidence. No causal inference from tiny
  confounded synthetic datasets. Historical brewing-chart ranges are context,
  not universal quality standards. Cross-method findings may not transfer.
- Keep external queries generic and nonidentifying. Never send the workbooks,
  raw rows or private study identifiers to external tools or services.

Default task agents inherit the parent's model. If the available choices cannot
fulfill the model preferences, disclose the fallback and mark any unobserved
different-model execution unverified.
If task delegation or web access is unavailable, state exactly which phase could not run. No simulated checks,
citations, tool calls or Task nodes.

## 4. Parent generates the output after all checks

Wait for ALL assigned fact-checkers to finish and verify their files exist.
Only now generate `research-brief.md`, an evidence brief assessing each study's
claims rather than a comparative report; the parent alone owns this file.
Assess the checker findings against their evidence rather than blindly copying
verdicts. If a check fails or evidence is inaccessible, label the corresponding
claim unresolved, and the report partial rather than fully checked.

Write for the user's role, not an agent developer. Lead with a short, plain-English
bottom line answering their practical question; explain scientific terms on first
use. Keep formulas, normalization details and orchestration out of the opening.
For product questions, distinguish a promising research direction from a benefit
demonstrated on the user's actual product. Higher extraction or strength does not
establish better taste, a reduced coffee dose, or lower cost per cup. If sensory,
product-performance or cost measurements are absent, say "not established" and
identify the test or inputs needed, rather than inventing savings or calling the
benefit disproved. The synthetic demo cannot substantiate real marketing claims.

The report contains, in this order:

1. Plain-language bottom line, research question, input study identities and
   a clear synthetic-data notice for the demo.
2. Practical implications. For a product or marketing request, use a compact
   table: potential benefit, what the evidence supports, what we cannot claim
   yet, and what to test next. Keep proposed benefits conditional.
3. Evidence-supported conclusions and prioritized, controlled follow-up tests.
   No unsupported causality, significance, health advice or "best coffee" ranking.
4. Technical appendix: how each study's measurements were prepared, converted
   and excluded where necessary, with cell references; results separated by study and comparable
   methods/lots, with counts and variability where meaningful. No inappropriate
   pooling or counting duplicate exports as independent replicates.
5. A detailed claim-by-claim evidence table in the appendix with separate data and literature
   support, source URLs, checker verdicts, uncertainty and limits on generalizing
   each claim.
6. References and links to actual shared-workspace output artifacts.

## 5. Deliver and explain what actually happened

Link the final brief, both studies' normalization artifacts, claim plan and
all fact-check files using supported sandbox file links.
The final chat reply leads with the practical takeaway and the brief link, not an
execution log. At the end of the brief, include a short "How this was checked"
note in everyday language: who prepared each study, when both studies' numbers
were checked, which questions were researched at the same time, and when the
findings were brought together. Do not copy internal stage names into this note.
Use actual runtime events or explicitly label entries as unverified, not measured.
State observed delegation and model limitations briefly. Use runtime metadata
for model/timing/concurrency claims; if unavailable say "not verified".
Separate context windows do not mean separate file systems or security isolation.
Task agents finish within this request, not after the parent ends the turn.
Parallel execution may reduce elapsed time but does not guarantee lower credits.
Do not claim measured speedups or costs without actual comparison measurements.

Handle simple follow-up definitions and conversions directly. Do not start the
whole study for "What is TDS?" or a single arithmetic check.
Answer basic product-spec questions from the profile without launching a study
review or requesting workbooks.
