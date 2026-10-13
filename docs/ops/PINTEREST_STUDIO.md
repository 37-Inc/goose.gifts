# Pinterest studio — operating contract and recovery

## Scheduler

The existing Codex heartbeat is `goose-gifts-pinterest-growth-studio`, named
**Goose Gifts — Daily Pinterest Growth Studio**, targeting chat
`019fdd0f-a56b-7450-bb56-340333ef2ed2`. Its two existing slots are 9:30 AM and
4:30 PM local Pacific time. Use the current canonical
`/Users/cameronehrlich/goose.gifts` checkout, not the chat's old detached
worktree or historical preview prompt. Preserve unrelated work.

On 2026-10-13 Cameron authorized restarting this job and emphasized tasteful
content that brings people to the site. Resume the existing heartbeat; never
create a duplicate or backfill missed slots. The saved scheduler prompt carries
the standing publication authorization. Record that authorization against each
exact reviewed package before using the production publisher.

The current v11 experiment remains capped at 12 Pins, six playful editorial
posters (P) and six annotated field notes (F), with at most one publication per
run and two per local day. At restart, P is 2/6 and F is 4/6. Odd dates assign
morning P / afternoon F; even dates reverse that assignment. An exhausted arm
is a no-op for that slot, not permission to switch arms, exceed its quota or
accelerate the schedule. After the twelfth Pin, use metric-only runs until the
full cohort reaches its 14-day checkpoint. Retain the 50-impression-per-arm
minimum and do not declare a winner from tiny samples or invent the next batch.

## Creative and click-through standard

Use `create-pinterest-native-product-images` and both references, then the
current marketing plan and validated experiment history. Verify current listing
availability, the exact source photo, identity, material, markings, scale and
canonical gift page before generating. Prefer an existing valid, unpublished
survivor; otherwise use `npm run pinterest:candidates -- --limit 20 --json`.
Do not run catalog maintenance here; the weekly catalog job owns it.

The viewer should recognize a real, giftable object and have a specific reason
to learn more: its function, unusual detail, gift recipient or occasion. Keep
the editorial double take and restrained composition. Three distinct concepts,
at most two initial generations and one causal revision, original-resolution
source comparison, all hard gates and the existing score thresholds remain.
Playful type/annotations are allowed within the existing arms; ad frames,
embedded CTAs, price promises, fake urgency and invented hidden features are
not. Do not reuse a recent product family just because its Pin drew attention.

Give the description a natural, concrete reason to visit the exact Goose page
for verified details, size, use or gifting fit. Use a clear product-first title,
accurate alt text, AI/affiliate disclosures and unique arm-tagged UTMs on the
canonical `/gifts/<slug>` URL. The pictured promise must match the landing page.

Run creative validation/tests and the production payload dry run. Check the
exact approval, current account, existing public Pins/receipts, destination,
arm/slot/day/cohort counts and uniqueness immediately before publishing. Use
the guarded production publisher once, then verify readback, record the receipt
and measuring transition, and check the public Pin and landing page. An
ambiguous API result must be reconciled, not blindly retried. A payload dry run
does not itself check live candidate readiness or prove a new publication.

## Measurement and actionable failures

Primary: Pinterest outbound clicks and outbound clicks per impression.
Secondary: attributable site sessions and retailer exits. Pin opens and saves
show attention, not successful acquisition. Keep 24-hour, seven-day, 14-day
cohort and 28-day checkpoints, public cohorts only, excluding Sandbox and v3.

Use bounded GA4 property `507421709` and PostHog project `550427` reads; never
use the PostHog CLI's unrelated default project. Exclude QA/operator campaigns.
Detailed database click writes and Vercel Web Analytics are retired. Their
historical zeros are not current visitor evidence. GA4 source attribution has
known limitations; PostHog had a September 19–October 8 ingestion gap. Missing,
unattributable or gap-affected evidence is **unknown**, not zero. A secondary
analytics outage should not prevent source verification and creative work.

Leave the schedule active after an ordinary quality no-op or quota checkpoint.
Never pause/delete/reschedule this job on its own. Surface an actionable
diagnosis for auth/publication failures needing intervention or three
consecutive source/quality no-ops indicating an exhausted pool. Keep the quality
bar and offer a safe alternative instead of silently stopping. No paid tools,
promotion, outreach, account changes, deletions, video or unrelated site changes.

## October 13 recovery evidence

### Owner-requested live run passed

Cameron asked to run the workflow once now and close the recovery Bead if it
actually posted a good Pin. That manual run published
[the sheep field note](https://www.pinterest.com/pin/1107815208391037211/)
at 20:07:08 UTC / 1:07 PM Pacific. API readback matched the exact package;
the logged-out browser rendered its final 1024x1536 image, title, description,
AI label, brand and Visit control. The tracked gift page is HTTP 200,
self-canonical and indexable. Current count: 29 public Pins; F 5/6, P 2/6,
seven of twelve. Three concepts, three included image calls, rejection,
causal revision, 4.75/5 internal review and public receipt are in v29.

This is an actual owner-requested manual pipeline execution, **not proof the
timer fired**. It satisfies the owner's remaining publication test and spends
October 13's afternoon F slot. The saved ACTIVE heartbeat now explicitly makes
4:30 PM measurement-only, without another/replacement Pin. Normal selection
resumes October 14 at 9:30 AM (even-date Arm F), from current ledgers. Schedule,
target and caps are unchanged. Close `roadmap-aguig` after this run's artifact/
receipt PR is merged. The four-minute native baseline is zero actions; per-Pin
site sessions and retailer exits are unknown, not a conversion verdict. The
earlier recovery observations below are historical.

- The saved heartbeat was **PAUSED**, last updated September 21 at 08:56 PDT.
  The last actual execution was September 20 afternoon: completed normally
  with an explicit source/quality-gated no-op. No later run is in that chat.
  The pause's initiator/reason is not recorded in the available evidence; do
  not invent an API error or claim Codex paused it automatically.
- The target chat is not archived, its old worktree exists, and its configured
  model is available. There is no second Pinterest job in OpenClaw.
- Production API verifies `goosegifts` BUSINESS account
  `1107815345747925810`, 28 Pins, five boards. Current source ranking returns
  20 eligible products; eligibility is not a completed visual/source review.
- Creative history validates (657 existing events). Five creative and nine
  publisher tests pass. No unresolved `publication.started` receipt exists.
  A read-only replay of the already-public Desktop Therapist payload verifies
  current board resolution and image encoding; it does not repost the Pin.
- October 13 public lifetime totals: 2,505 impressions, 41 Pin opens, six
  saves, zero outbound clicks. The six v11 Pins are now distributed, so their
  old September zero-impression notes are historical, not current evidence.
- Original recovery gate for `roadmap-aguig`: keep open until the **first resumed
  scheduled execution** has an actual public receipt or an explicit no-op.
  Saving `ACTIVE` proves configuration, not execution. Record the run timestamp,
  outcome and any owner gate before closing. The next slot after this repair is
  October 13 at 4:30 PM Pacific, Arm F. The successful owner-requested manual
  run above now spends this slot; no missed-morning catch-up is permitted.
