---
name: loading-dock-selector
description: Reason over weather, one current dock snapshot, optional ETA, and verified Drive Priority Pass to select and explain one loading dock.
---

# Loading Dock Selector and Reasoner

Use this skill after the shipment and pickup facility are verified. Facility
operating status and hours do not affect whether this skill runs.

This skill owns the complete dock decision, queue interpretation, ETA comparison,
same-session arrival-time calculation, and evidence-based recommendation
explanation. Do not reveal private chain-of-thought. Return only evidence
grounded in supplied facts.

## Operations

The calling agent must specify exactly one operation:

- `recommend`: Use after live weather has been attempted and WanDelay Loading Bay Pickup MCP has
  returned exactly one current dock snapshot. Evaluate all candidates before
  selecting one.
- `queue_status`: Use after a recommendation for questions about the queue,
  readiness, remaining time, a new ETA, or an arrival-time adjustment. Keep the
  selected dock unchanged and calculate deterministic queue progress from the
  original `queue_observed_at` at one completed truck every 30 seconds. Do not
  accept weather or other docks, call `list_bays`, or reselect a dock.

Use `recommend` only for the initial decision or after a no-available-dock
result. Once a dock is assigned, it is final for the conversation and must
never be discarded, replaced, or reselected. Questions about whether another
dock is better are explanation requests, not selection requests, and are
handled by the calling agent from retained recommendation evidence without
invoking this skill. Queue, ETA, and retained-weather follow-ups also keep the
assigned dock unchanged.

## Inputs

Use only:

- verified shipment reference, consignee name, delivery destination, canonical
  pickup facility name, and pickup facility timezone
- optional verified driver first name
- exact `pass_verified` boolean supplied by the calling agent
- operation
- fresh timezone-aware `facility_local_time`
- either a new optional driver ETA in minutes or the existing absolute
  `target_local_time`, never both
- optional `target_adjustment_minutes` only when the driver explicitly says
  they will arrive earlier or later than the existing target
- optional exact verified `tier_code`
- for `recommend` only: available MSN Weather values and exactly one `list_bays`
  snapshot
- for `queue_status` only: selected `dock_id`, retained `queue_observed_at`,
  retained adjusted `initial_trucks_ahead`, optional `previous_queue_update_time` copied
  from `latest_queue_status.current_local_time`, and no other dock data

Treat a missing or invalid `tier_code` as `standard`. Never infer Drive Priority
Pass from a pass ID, displayed tier, driver statement, shipment, or identity.
Treat `pass_verified` as authoritative and never infer or change it.

Never retrieve new data or call another tool or agent. For `recommend`, never
call `list_bays` again. Shipment and consignee values are output context only; they
never influence which dock is selected.

## Canonical same-session state

Every successful `recommend` or `queue_status` result must include a
`canonical_state` object containing the complete current state:

- `assigned_dock_id`
- `queue_observed_at`
- `initial_trucks_ahead`
- `target_local_time`, which may be null
- `latest_queue_status`, which may be null after the initial recommendation

The complete successful `recommend` result is not a field inside
`canonical_state`. The calling agent retains it separately as
`recommendation_evidence`. A later `queue_status` result updates canonical queue
state but never replaces `recommendation_evidence`.

Initialize this state only from a successful `recommend` result. Preserve values
exactly as returned, including identifier type, timestamp, timezone offset,
numeric type, and null. Never initialize or update state from driver wording,
assistant prose, examples, failed calls, partial results, or another
conversation.

For the active assignment, `assigned_dock_id`, `queue_observed_at`, and
`initial_trucks_ahead` are immutable. The successful `recommend` result sets
`initial_trucks_ahead` to the selected dock's adjusted queue, after any verified
Priority Pass reduction has been applied exactly once. A successful `queue_status` result may
replace only `target_local_time` and `latest_queue_status`. Failed, cancelled,
malformed, or permission-denied calls change no state.

For `queue_status`, copy the three immutable fields from the supplied canonical
state. Never replace `queue_observed_at` with the current time, replace
`initial_trucks_ahead` with another count, apply a Priority Pass reduction
again, or infer a missing value. The
calling agent must not invoke `queue_status` when required state is missing,
ambiguous, or conflicting. If it is invoked with invalid state despite that
guard, return `status: state_unavailable` without running Python or fabricating
state, with only this `customer_message`:
`> **⚠️ QUEUE UPDATE UNAVAILABLE**
> &nbsp;
> I can't safely update the pickup queue because the current assignment state is unavailable.
> &nbsp;
> **🔄 Next step:** Start a new shipment pickup request.`

Clear all state only for a new conversation or a new shipment. Never clear or
replace an active assignment because the driver asks for another, different,
closer, faster, or better dock. Treat that wording as a request to explain the
retained decision. Do not clear state for queue questions, time-left questions,
ETA changes, tool failures, or ordinary follow-ups. `canonical_state` is
internal structured output and must never be included in `customer_message`.

## Weather-policy step

Run the bundled `loading_dock_reasoning.py` script before evaluating docks. Python owns
weather policy, deterministic arrival-time arithmetic, and elapsed queue
arithmetic. Never pass it shipment, pickup facility name, Drive Priority Pass, ETA-derived dock
assumptions, occupancy, candidate docks, or a selected dock.

For available or partial weather, pass every available Metric weather value and
omit unavailable flags:

```bash
python3 loading_dock_reasoning.py assess \
  --weather-available true \
  --eta-minutes 20 \
  --current-cap "Cloudy" \
  --temp 30 --feels 33 --visibility 8 \
  --wind-dir 45 --wind-speed 25 --wind-gust 50 \
  --day-cap "Rain showers" --day-precip 70 \
  --day-summary "Periods of rain are expected." \
  --night-cap "Mostly clear" --night-precip 10 \
  --night-summary "Mostly clear overnight." \
  --now 2026-09-02T18:50:00-05:00 \
  --store-timezone America/Anchorage \
  --sunrise 2026-09-02T06:20:00-08:00 \
  --sunset 2026-09-02T19:20:00-08:00
```

Use only these weather fields:

- current weather: condition caption, temperature, feels-like temperature,
  visibility, wind direction, wind speed, and wind gust
- today's forecast: day condition, precipitation chance, and summary; night
  condition, precipitation chance, and summary
- almanac: sunrise and sunset only

Do not pass UV, humidity, pressure, dewpoint, sky code, METAR weather code,
provider icons, symbols, daily high or low, moon data, or coordinates.

Python determines `selected_period` from `target_local_time` when an arrival
target exists, otherwise from fresh facility-local current time:

- `day` when `sunrise <= reference time < sunset`
- `night` otherwise
- unknown only when the reference time, sunrise, or sunset is unavailable

When the period is unknown but forecast values exist, Python retains the
more precipitation-exposed day or night forecast instead of discarding both.

Sunrise and sunset are internal classification evidence. Never include them in
driver text.

Python sets `effective_temperature` to feels-like temperature when available,
otherwise current temperature. Use it for both heat and cold evaluation. In
driver text, mention feels-like only when both values exist and differ by at
least 3 degrees.

Omit `--eta-minutes` when the driver provides no ETA. When no live weather
value is available, run the same applicable ETA or target-time flags with:

```bash
python3 loading_dock_reasoning.py assess --weather-available false
```

For a retry after no dock was available, preserve the original absolute
arrival target instead of restarting the original relative ETA:

```bash
python3 loading_dock_reasoning.py assess \
  --weather-available true \
  --target-local-time 2026-09-02T19:10:00-05:00 \
  --now 2026-09-02T19:00:00-05:00 \
  --store-timezone America/Anchorage
```

When the driver explicitly changes an existing target by a relative amount,
also pass `--target-adjustment-minutes`. A positive value means later and a
negative value means earlier. When the driver supplies a completely new ETA,
pass only `--eta-minutes`; it replaces the previous target.

For a plain `queue_status` request, run:

```bash
python3 loading_dock_reasoning.py queue \
  --queue-observed-at 2026-09-02T19:00:00-05:00 \
  --initial-trucks-ahead 3 \
  --target-local-time 2026-09-02T19:10:00-05:00 \
  --now 2026-09-02T19:00:30-05:00 \
  --store-timezone America/Chicago
```

For a completely new relative ETA, omit `--target-local-time` and run the same
queue command with only the replacement ETA:

```bash
python3 loading_dock_reasoning.py queue \
  --queue-observed-at 2026-09-02T19:00:00-05:00 \
  --initial-trucks-ahead 3 \
  --eta-minutes 30 \
  --now 2026-09-02T19:00:30-05:00 \
  --store-timezone America/Chicago
```

For an explicit delay or earlier-arrival adjustment, pass the retained target
and the adjustment together:

```bash
python3 loading_dock_reasoning.py queue \
  --queue-observed-at 2026-09-02T19:00:00-05:00 \
  --initial-trucks-ahead 3 \
  --target-local-time 2026-09-02T19:10:00-05:00 \
  --target-adjustment-minutes 10 \
  --now 2026-09-02T19:00:30-05:00 \
  --store-timezone America/Chicago
```

Never pass `--eta-minutes` with `--target-local-time`. Never pass
`--target-adjustment-minutes` without `--target-local-time`.

The `queue` command rejects weather and candidate-dock inputs and returns:

```json
{
  "operation": "queue_status",
  "current_local_time": "2026-09-02T19:00:30-05:00",
  "queue_observed_at": "2026-09-02T19:00:00-05:00",
  "queue_seconds_per_truck": 30,
  "initial_trucks_ahead": 3,
  "completed_trucks": 1,
  "trucks_ahead": 2,
  "expected_wait_seconds": 60,
  "estimated_dock_ready_time": "2026-09-02T19:01:30-05:00",
  "queue_status": "in_progress",
  "target_local_time": "2026-09-02T19:10:00-05:00",
  "remaining_eta_seconds": 600,
  "remaining_eta_minutes": 10,
  "target_status": "future",
  "eta_margin_seconds": 540,
  "eta_status": "before_arrival"
}
```

For `queue_status`, start the card with:

```text
> **🚛 QUEUE UPDATE**
> &nbsp;
```

Then choose exactly one mutually exclusive Status row in this priority order:

- `queue_status: ready`, including an initial queue of zero:
  `> **✅ Status:** The queue ahead of your assigned dock has cleared.`
- no completed truck yet and one order remains:
  `> **⏱️ Status:** There is still one truck ahead. About 30 seconds remains.`
- no completed truck yet and more than one order remains:
  `> **⏱️ Status:** There are still [initial_trucks_ahead] trucks ahead. About [formatted expected_wait_seconds] remains.`
- progress with more than one order remaining:
  `> **⏱️ Status:** There are now [trucks_ahead] trucks ahead, down from [initial_trucks_ahead]. About [formatted expected_wait_seconds] remains.`
- progress with one order remaining:
  `> **⏱️ Status:** There is now one truck ahead, down from [initial_trucks_ahead]. About 30 seconds remains.`

When `previous_queue_update_time` is present, add
`Since your last update at [formatted previous_queue_update_time], ` immediately
after the Status label. This timestamp comes only from the retained
`latest_queue_status.current_local_time`; never infer it from conversation text.
For every non-ready result, add
`> **🕒 Estimated ready:** [formatted estimated_dock_ready_time].` using the
canonical raw-string boundary. Use the exact Python field and do not calculate
the timestamp in the selector.

When a new ETA or adjustment was supplied, add an `> **📍 Arrival:**` row using
the canonical raw-string boundary, followed by one short sentence confirming
the updated remaining arrival time. For a plain queue or time-left question,
do not state the obvious ETA countdown; report queue progress only. Return
`status: queue_status`, the retained dock ID, Python queue/timing fields,
the complete `canonical_state`, and `customer_message`. Set
`canonical_state.latest_queue_status` to the complete current Python queue result,
including `current_local_time` for use as the next follow-up's remembered update.
Use Python's `eta_margin_seconds` and `eta_status`; never reconstruct them from
rounded minutes.
Return no weather assessment or new recommendation.

For `recommend`, preserve Python's driver-safe weather evidence inside
`weather_assessment`: `assessment_basis`, the recommendation
`evidence_target_local_time`, `current_conditions`, `selected_forecast`,
`selected_period`, `active_conditions`, and effective temperature. Keep
limitations and unevaluated fields internal.

Python returns:

```json
{
  "weather_available": true,
  "weather_status": "complete",
  "assessment_basis": "expected_arrival",
  "target_local_time": "2026-09-02T19:10:00-05:00",
  "remaining_eta_seconds": 1200,
  "remaining_eta_minutes": 20,
  "target_status": "future",
  "selected_period": "day",
  "current_conditions": {
    "condition": "Cloudy",
    "temperature": 30,
    "feels_like": 33,
    "visibility": 8,
    "wind_direction": 45,
    "wind_speed": 25,
    "wind_gust": 50
  },
  "selected_forecast": {
    "condition": "Rain showers",
    "precipitation_chance": 70,
    "summary": "Periods of rain are expected."
  },
  "effective_temperature": 33,
  "temperature_source": "feels",
  "primary_band": "WET",
  "active_conditions": ["WET", "WINDY"],
  "preferred_dock_attributes": {
    "covered": true,
    "lit": null,
    "good_drainage": true,
    "high_wind_protection": true,
    "facing_away_from_wind_degrees": 225.0,
    "shorter_distance_to_yard_gate": true
  },
  "reason_codes": [
    "PRECIPITATION_PROTECTION",
    "WIND_PROTECTION"
  ],
  "unevaluated_conditions": []
}
```

`primary_band` follows
`WET > HOT > COLD > WINDY > DARK > LOW_VISIBILITY > BENIGN` for concise
summarization only. Never let precedence suppress another active condition or
applicable dock preference.

For `weather_status: partial`, use every known active condition and attribute.
Never treat an unevaluated condition as false and never discard confirmed
weather facts because another field is missing. A partial assessment with
confirmed non-hazardous conditions may still use `primary_band: BENIGN`. For
`weather_status: unavailable`, apply no weather preference and reason from
availability and queue only. Missing and unevaluated fields always remain
internal.

## Dock reasoning

Apply these rules in order:

1. Exclude every dock where `occupied` is true.
2. If no dock remains, return `status: no_available_dock`. Do not select a dock.
3. Start with all unoccupied docks as the candidate set.
4. Process active weather conditions in Python's returned order.
5. For `WET`, `HOT`, or `COLD`, prefer `covered: true`. Apply the covered filter
   once even when several of these conditions are active, but preserve every
   active condition in the explanation.
6. For `WET`, rank `drainage` as `good > fair > poor` and retain candidates with
   the best available drainage value.
7. For `WINDY`, rank `wind_protection` as `high > medium > low` and retain
   candidates with the best available protection value. Then, when
   `facing_away_from_wind_degrees` exists, calculate each retained candidate's
   smallest circular angular difference and retain the closest candidate or tied
   closest candidates.
8. For `DARK` or `LOW_VISIBILITY`, prefer `lit: true`.
9. When any active condition exists, retain candidates with the shortest
   `distance_to_yard_gate_m` after applying the other weather preferences.
10. Apply a weather filter only when at least one current candidate has a valid
   value that satisfies it.
   If none does, retain the current candidates and record that exact preference
   in `weather_degradations`.
11. Never discard all known weather reasoning because one condition is
   unevaluated. Record each unevaluated condition as a limitation without
   inventing a result.
12. After occupancy and weather suitability have produced the retained candidate
    set, determine the verified Drive Priority Pass tier reduction:
    - `standard`: 0 trucks
    - `plus`: 1 truck
    - `extra`: 3 trucks
    - `mega`: 5 trucks
    Use 0 when `pass_verified` is false. Never apply a reduction based only on a
    supplied or claimed tier.
13. For each retained candidate where `priority: true`, calculate
    `adjusted_trucks_ahead = max(0, trucks_ahead - tier_reduction)`, then calculate
    `adjusted_expected_wait_seconds = adjusted_trucks_ahead *
    queue_seconds_per_truck` and derive adjusted expected-wait minutes from those
    seconds. For `priority: false`, keep the dock's original queue values. Do not
    apply this calculation to occupied docks or candidates removed by weather
    suitability.
14. Treat each candidate's adjusted queue as its actual queue for this loading
    plan. Retain candidates with the lowest resulting `expected_wait_seconds`.
    Track `queue_narrowed_candidates` from this adjusted-wait comparison.
15. Drive Priority Pass never overrides occupancy or weather suitability and
    never makes an occupied or weather-inferior dock eligible.
16. If candidates remain tied, retain the shortest `distance_to_yard_gate_m`.
17. If candidates still remain tied, select the lowest `dock_id`.

For `recommend`, apply the Priority Pass queue calculation exactly once during
the initial recommendation. In `selected_dock`, replace `trucks_ahead`,
`expected_wait_seconds`, and `expected_wait_minutes` with the adjusted values
used for ranking, while preserving `queue_seconds_per_truck` and
`queue_observed_at`. Use those same adjusted values for the customer-visible
queue and wait, ETA comparison, top-level `initial_trucks_ahead`,
`canonical_state.initial_trucks_ahead`, retained recommendation evidence, and
PDF inputs. Preserve the selected dock's pre-adjustment queue and the actual
reduction in `decision_evidence`. For `queue_status`, pass the retained adjusted
queue anchors to Python and use its returned elapsed queue values unchanged;
never subtract the Priority Pass reduction again.

Treat `wind_protection`, `drainage`, and `distance_to_yard_gate_m` as comparison
data only. Never ask Python to evaluate docks.

## Queue and ETA reasoning

Generate exact queue wording:

- zero: `There are no trucks ahead.`
- one: `There is one truck ahead.`
- more than one: `There are [n] trucks ahead.`

When ETA is present, use `remaining_eta_seconds`, not the original relative ETA
or rounded minutes, for every queue comparison:

- wait seconds less than or equal to ETA seconds: `eta_status: before_arrival`
- wait seconds greater than ETA seconds: `eta_status: may_extend_beyond_arrival`

When ETA is absent, return `eta_status: not_provided` and never invent an arrival
time, clock time, or availability time. When `target_status` is `due_or_passed`,
use zero as the remaining ETA and state that any positive wait may extend beyond
the expected arrival.

## Decision explanation

The explanation must be composed from the actual decision evidence. It must not
be a fixed sentence.

Include:

- why the selected dock remained available
- every active weather condition that affected its preferred attributes
- every weather preference that could not be satisfied
- how drainage, wind protection, lighting, or yard-gate distance affected the
  comparison when applicable
- why it won the adjusted queue comparison
- the complete verified Drive Priority Pass outcome and normalized display
  grade, and whether lowest dock ID resolved a final tie

Keep pass and weather claims in `recommendation_reason` consistent with
`decision_evidence`. Never expose the pass ID, raw `tier_code`, unevaluated
conditions, or missing weather fields in `recommendation_reason`. For every
verified pass outcome, show the normalized display grade exactly as `Standard`,
`Plus`, `Extra`, or `Mega` in the required Priority Pass row. If no pass is
verified, do not invent `Standard`.

## Driver message

For `recommend`, compose one complete `customer_message` for the calling agent
to present unchanged. It is the only driver-facing recommendation text.
Structured fields support orchestration, retained evidence, diagnostics, and
PDF rendering; never restate them outside `customer_message`.

Every `customer_message` returned by this skill, including `recommend`,
`queue_status`, `no_available_dock`, and `state_unavailable`, must be exactly
one Markdown blockquote card with no text before or after it, built as one raw
message string. Start every content row with `> `. For every multi-row card,
place the exact literal sequence `\n> &nbsp;\n` between every adjacent content
row so that each `>` begins its own physical line. Never use a line containing
only `>`, a bare newline, or any alternative spacing method between content
rows. Single-row cards need no spacer. All later references to adding a row or
spacer use only this canonical rule. Keep the current simple visual hierarchy:
bold card title and row labels, and no bullets, tables, horizontal dividers,
nested cards, or additional decorative spacer rows. The raw-string pattern is:

```text
> [first content row]
> &nbsp;
> [second content row]
```

Return a `weather_icon` selected only from confirmed weather evidence:

- `WET`: `🌧️`
- `HOT`: `🌡️`
- `COLD`: `❄️`
- `WINDY`: `💨`
- `DARK`: `🌙`
- `LOW_VISIBILITY`: `🌫️`
- `BENIGN` with a confirmed current or selected-forecast condition: `🌤️`
- no confirmed current or selected-forecast condition: an empty string

When several conditions are active, use the icon for `primary_band`; describe
every confirmed condition that affected selection in the prose.

Return two free-text fields composed only after deterministic comparison:

- `weather_summary`: a concise natural summary using every useful confirmed
  fact that is relevant to the expected pickup. Lead with useful current
  conditions. Include selected-forecast facts only when they materially affect
  dock selection, driver guidance, or conditions expected around the retained
  arrival target. When included, connect them explicitly to the pickup with
  wording such as `Around your expected arrival`; do not append a general daily
  or overnight weather report. Include actual temperature, feels-like only when
  it differs by at least 3 degrees, visibility when relevant, and current wind.
  For `HOT`, use natural wording such as `Hot conditions are expected around
  your arrival, feeling like [X]°C` when feels-like is available, otherwise
  `Hot conditions are expected around your arrival, with a temperature around
  [X]°C`. Always include `°C`. Never say `humid high near`, `high near`, or use
  a forecast high as though it were the retained feels-like value. Do not
  produce a raw field list or repeat equivalent facts.
- `driver_guidance`: concise practical guidance grounded in the selected
  dock's cover, drainage, wind protection, facing, lighting, and yard-gate
  distance. Mention only attributes that are relevant to confirmed conditions.
  Do not state the dock number in this field.

Free text never changes the selected dock. Never enumerate unavailable
readings, unevaluated conditions, omitted field names, API behavior, or internal
limitations. When no confirmed weather evidence exists, use only the defined
Weather-block fallback.

Use `available` only for an unoccupied dock. Use `covered` and `uncovered` only
for overhead weather protection. Never use `open` as a synonym for either
available or uncovered.

Track `weather_narrowed_candidates` as true only when an applied weather filter
reduced the candidate count. Track `queue_narrowed_candidates` as true only when
the adjusted shortest-wait step reduced the candidate count. Return
`priority_pass_queue_benefit_applied` as true only when the selected dock is
priority-enabled and its adjusted queue is lower than its pre-adjustment queue.
Also return the selected dock's pre-adjustment trucks ahead, adjusted trucks
ahead, and actual reduction count. A tier allowance larger than the available
queue reduces only to zero and records only the positions actually removed.

Return one deterministic `decision_driver` using this precedence:

1. `priority_pass_queue_benefit` when a nonzero verified Priority Pass queue
   reduction was applied to the selected dock.
2. `lowest_dock_id_tie_break` when the lowest dock ID resolved the final tie.
3. `weather_and_queue` when both narrowing flags are true.
4. `weather` when only `weather_narrowed_candidates` is true.
5. `queue` when only `queue_narrowed_candidates` is true, including when a
   retained weather preference matched every candidate and therefore did not
   narrow the set.
6. `distance_tie_break` when yard-gate distance was the final candidate-reducing
   step.
7. `availability` when occupancy left only one candidate before weather and
   queue reasoning, so neither narrowing flag is true.

When ETA is present, return signed `eta_margin_seconds` as
`remaining_eta_seconds` minus `expected_wait_seconds`. A positive value is the
remaining buffer, zero matches the expected arrival, and a negative value is
seconds beyond it. When ETA is absent, return `eta_margin_seconds: null`.

Compose the initial recommendation card in this content order: plan and
facility, weather, queue, optional ETA, dock planning and assigned dock, why,
then Priority Pass. Use the canonical raw-string boundary between adjacent
content rows. Natural wording is allowed inside each required initial-plan row.

1. Start with a grouped title-and-facility row identifying the loading-dock
   plan and canonical pickup facility.
2. Weather row: when `weather_icon` is nonempty, identify the row as Weather
   and address the driver by verified first name
   when available, followed by `weather_summary`. When no confirmed weather
   evidence is available, use exactly
   `> **🌦️ Weather:** Current weather details are unavailable, so the assignment uses the available dock and queue evidence.`
   Missing optional weather evidence never suppresses a recommendation.
3. Queue row: identify the row as Queue. State trucks ahead and
   expected wait, then give only the supported comparison fact, such as the
   retained wait range or whether this is the unique shortest wait. When weather
   affected suitability, identify the relevant group only as the suitable
   available docks. Reserve all explanation of why the dock was assigned for
   the Assignment block. Do not use phrases such as `narrowed the comparison`
   or `resolved the selection`. Do not state the dock number or repeat queue
   values elsewhere.
4. When ETA exists, add an ETA row. State the
   arrival estimate and use `eta_margin_seconds` to explain the exact buffer,
   match, or overrun. Format minutes and seconds naturally. Do not repeat the
   wait value. Omit the row when ETA is absent.
5. Add a dock-planning and assigned-dock row. This is the only
   place before the Why row that may state the dock number and begins the final
   section. Every successful recommendation must finish with a plain-English
   explanation of why this dock was assigned.
6. Add a Why row with concise natural prose.
     Explain the observed condition, why it matters operationally, the dock
     feature that addresses it, and the final fact that made this dock the best
     fit. Say, for example, that hot conditions make shade useful or that rain
     makes cover and drainage useful. Never use internal comparison language
     such as `narrowed the comparison`, `resolved the selection`,
     `candidate-reducing`, or `tie-resolving` in driver-facing text. Mention
     queue causality only when `queue_narrowed_candidates` is true or the final
     `decision_driver` is queue-based. When `decision_driver` is
     `priority_pass_queue_benefit`, explain the actual before-and-after queue
     benefit. Mention lowest dock ID only when it
     resolved the final tie. Use `uncovered docks`, never `open docks`, as the
     opposite of covered docks.
   - When a relevant non-decisive benefit remains, add it naturally
     in the Why prose. Every included benefit must state why it helps under a
     confirmed active condition and must not repeat a cause already explained
     in Why. Never list attributes by themselves.
   Apply these condition-to-benefit rules:
   - For `HOT`, cover matters because it provides shade and reduces heat
     exposure.
   - For `COLD`, cover matters because it provides shelter and reduces cold
     exposure.
   - For `WET`, cover helps keep loading dry and good drainage helps reduce
     standing water.
   - For `WINDY`, wind protection and a suitable facing help reduce wind
     exposure around the truck and loading area.
   - For `DARK` or `LOW_VISIBILITY`, lighting helps the driver see the dock and
     approach more clearly.
   - A shorter yard-gate route may be mentioned only when it decided the
     assignment or when its reduced exposure to a confirmed active condition is
     explained.
   Omit drainage without `WET`; wind protection without `WINDY`; lighting
   without `DARK` or `LOW_VISIBILITY`; and shade or heat protection without
   `HOT`. Do not repeat queue or ETA values. Describe an unoccupied dock as
   `available`, never `open`.
7. Finish the card with exactly one Priority Pass outcome selected from these
   mutually exclusive outcomes, using exactly one supported reason:
   - Not verified:
     `> 🎫 **Priority Pass:** Not verified for this assignment.`
   - A nonzero verified reduction was applied:
     `> 🎫 **Priority Pass ([Grade]):** Applied. Your queue was reduced by [reduction] position[s], from [before] truck[s] ahead to [after] truck[s] ahead.`
   - Verified `Standard`:
     `> 🎫 **Priority Pass (Standard):** Verified. Standard provides no queue reduction.`
   - Verified `Plus`, `Extra`, or `Mega` with a selected non-priority dock:
     `> 🎫 **Priority Pass ([Grade]):** Verified, but no queue reduction was applied because Dock [dock_id] is not priority-enabled.`
   - A selected priority-enabled dock already had zero trucks ahead:
     `> 🎫 **Priority Pass ([Grade]):** Verified, but no queue reduction was needed because there were no trucks ahead.`
   Use natural singular/plural grammar for `position[s]` and `truck[s]`. The
   applied explanation may state that the adjusted queue helped selection. Do
   not use equal-wait language. Use only the existing verified grade, selected
   dock priority flag, pre-adjustment queue, adjusted queue, and actual
   reduction; add no conditions or calculations. Never expose the pass ID or
   raw `tier_code`. Follow-ups must reuse the retained pass outcome and grade
   without recalculating either.

Return no preface, progress update, tool narration, duplicate summary,
disclaimer, closing sentence, text outside the card, or PDF offer. Never expose raw field names,
facility operating status, operating hours, local store time, missing readings,
unevaluated conditions, or internal limitations. Before returning, ensure the
message follows the canonical raw-line boundary rule, preserves the required
initial recommendation content order, states the dock number only in the
dock-planning row and Why prose, and ends with the single Priority Pass outcome.
These formatting checks must never suppress an otherwise successful
recommendation.

## Output

Return this structure:

```json
{
  "status": "recommended",
  "shipment_reference": "ORD-10502",
  "consignee_name": "Caribbean Market Logistics",
  "delivery_destination": "Caribbean Market Tampa Hub, 6705 East Adamo Drive, Tampa, FL 33619",
  "pickup_facility_name": "WanDelay Miami Distribution Center",
  "selected_dock": {
    "dock_id": 2,
    "priority": true,
    "covered": true,
    "lit": true,
    "facing": 180,
    "wind_protection": "high",
    "drainage": "good",
    "distance_to_yard_gate_m": 20,
    "trucks_ahead": 2,
    "queue_seconds_per_truck": 30,
    "expected_wait_seconds": 60,
    "expected_wait_minutes": 1.0
  },
  "weather_assessment": {
    "weather_status": "complete",
    "assessment_basis": "expected_arrival",
    "evidence_target_local_time": "2026-09-02T19:10:00-05:00",
    "primary_band": "WET",
    "selected_period": "day",
    "effective_temperature": 33,
    "current_conditions": {
      "condition": "Cloudy",
      "temperature": 30,
      "feels_like": 33,
      "visibility": 8,
      "wind_direction": 45,
      "wind_speed": 25,
      "wind_gust": 50
    },
    "selected_forecast": {
      "condition": "Rain showers",
      "precipitation_chance": 70,
      "summary": "Periods of rain are expected."
    },
    "active_conditions": ["WET", "WINDY"],
    "reason_codes": [
      "PRECIPITATION_PROTECTION",
      "WIND_PROTECTION"
    ],
    "unevaluated_conditions": []
  },
  "decision_evidence": {
    "weather_matches": [
      "Covered for expected precipitation",
      "Good drainage for expected precipitation",
      "High wind protection and closest available facing for strong wind",
      "Shortest weather-exposed yard route among the suitable docks"
    ],
    "weather_degradations": [],
    "weather_limitations": [],
    "queue_comparison": "Adjusted current wait for the dock meeting the retained weather preferences",
    "weather_narrowed_candidates": true,
    "queue_narrowed_candidates": false,
    "priority_pass_queue_benefit_applied": true,
    "priority_pass_original_trucks_ahead": 5,
    "priority_pass_adjusted_trucks_ahead": 2,
    "priority_pass_queue_reduction": 3,
    "lowest_dock_id_resolved_tie": false
  },
  "weather_icon": "🌧️",
  "decision_driver": "priority_pass_queue_benefit",
  "queue_observed_at": "2026-09-02T18:50:00-05:00",
  "initial_trucks_ahead": 2,
  "canonical_state": {
    "assigned_dock_id": 2,
    "queue_observed_at": "2026-09-02T18:50:00-05:00",
    "initial_trucks_ahead": 2,
    "target_local_time": "2026-09-02T19:10:00-05:00",
    "latest_queue_status": null
  },
  "eta_margin_seconds": 1140,
  "target_local_time": "2026-09-02T19:10:00-05:00",
  "remaining_eta_seconds": 1200,
  "remaining_eta_minutes": 20,
  "target_status": "future",
  "weather_summary": "It is currently cloudy and 30°, feeling like 33°, with winds of 25 km/h and gusts up to 50 km/h. The daytime forecast calls for rain showers with a 70% chance of precipitation.",
  "driver_guidance": "Covered loading and good drainage help keep the loading area dry, while high wind protection and a suitable facing reduce wind exposure around the truck.",
  "customer_message": "> **🚛 LOADING-DOCK PLAN** · **📍 Facility:** WanDelay Miami Distribution Center\n> &nbsp;\n> 🌧️ **Weather:** Jordan, it is currently cloudy and 30°, feeling like 33°, with winds of 25 km/h and gusts up to 50 km/h. Around your expected arrival, rain showers are forecast with a 70% chance of precipitation.\n> &nbsp;\n> 🚛 **Queue:** There are two trucks ahead, with an expected wait of one minute, at the suitable available dock with the current wait shown in this plan.\n> &nbsp;\n> ⏱️ **ETA:** You expect to arrive in 20 minutes. That leaves a 19-minute buffer before your expected arrival.\n> &nbsp;\n> **💡 DOCK PLANNING** · **Assigned Dock is 2**\n> &nbsp;\n> 🧠 **Why:** Rain is expected near your arrival, so a covered dock with good drainage helps keep loading dry and reduces standing water. Strong winds also make wind protection important around the truck and loading area. Dock 2 was assigned because its facing provides the best available protection from the current wind. Its shorter yard-gate route reduces the time you may spend exposed to the rain. Your verified Priority Pass also reduced the queue used for this plan from five trucks ahead to two.\n> &nbsp;\n> 🎫 **Priority Pass (Extra):** Applied. Your queue was reduced by 3 positions, from 5 trucks ahead to 2 trucks ahead.",
  "eta_status": "before_arrival",
  "recommendation_reason": "Rain makes covered loading and good drainage useful for keeping the loading area dry, while strong winds make wind protection important. The assigned dock has the best available facing away from the current wind, and the verified Priority Pass reduced its queue from five trucks ahead to two."
}
```

For no available dock, return:

```json
{
  "status": "no_available_dock",
  "selected_dock": null,
  "canonical_state": {
    "assigned_dock_id": null,
    "queue_observed_at": null,
    "initial_trucks_ahead": null,
    "target_local_time": "2026-09-02T19:10:00-05:00",
    "latest_queue_status": null
  },
  "target_local_time": "2026-09-02T19:10:00-05:00",
  "remaining_eta_minutes": 20,
  "target_status": "future",
  "weather_icon": "",
  "decision_driver": null,
  "eta_margin_seconds": null,
  "customer_message": "> **⛔ NO LOADING DOCK AVAILABLE**\n> &nbsp;\n> No loading dock is currently available.\n> &nbsp;\n> **🔄 Next step:** Please try again shortly.",
  "recommendation_reason": "No loading dock is currently available."
}
```

Return the timing fields even when no dock is available so the calling agent can
retain an arrival target created or adjusted during that decision run. Use null
timing values when the driver has no ETA.

For invalid or unavailable canonical state, return:

```json
{
  "status": "state_unavailable",
  "customer_message": "> **⚠️ QUEUE UPDATE UNAVAILABLE**\n> &nbsp;\n> I can't safely update the pickup queue because the current assignment state is unavailable.\n> &nbsp;\n> **🔄 Next step:** Start a new shipment pickup request."
}
```

Never return or expose a Drive Priority Pass ID, raw `tier_code`, `occupied_by`,
other driver details, cargo, raw tool output, or private reasoning. For every
verified pass outcome, the required Priority Pass row shows exactly one
normalized grade: `Standard`, `Plus`, `Extra`, or `Mega`. If no pass is
verified, use `Not verified for this assignment` and do not invent a grade.
