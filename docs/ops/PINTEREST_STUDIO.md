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

### Completed cohort and exact review gate — October 17

The final eligible P slot published/readback-verified birthday-hat Pin
[1107815208391368990](https://www.pinterest.com/pin/1107815208391368990/)
at **2026-10-17T16:44:52.279Z**, durable receipt
`receipt-1792255492279-editorial-birthday-hat-formal-attire-poster-20261017-am-publication-succeeded`.
V11 is **P 6/6, F 6/6, total 12/12**. No more generation or publication,
including after the review deadline, until Cameron explicitly authorizes a new
experiment. The existing schedule stays ACTIVE and unchanged for metrics only.

**October 19 legacy cleanup:** Cameron separately authorized deletion of the
six pre-v11 Pins using `/random-gift?gift=...`. All six are API-verified deleted;
the other 28 Pins, including all twelve v11 members, are preserved. Do not
repost or fetch metrics for the deleted Pins. Historical metrics/creative
events remain intact; the production deletion receipt excludes these IDs from
future public metrics. See
[retirement receipt](pinterest-creative-lab/legacy-share-retirement-2026-10-19.json).
This does not authorize a new experiment or any further deletion.

The maximum of all twelve unique durable, readback-verified successful receipt
timestamps is **2026-10-17T16:44:52.279Z**. Adding fourteen full 24-hour days
sets the exact full-cohort evaluation deadline to **2026-10-31T16:44:52.279Z**
(October31, 9:44:52.279 AM Pacific). The first regular eligible scheduled slot
is October31 at **4:30 PM Pacific / 23:30 UTC**; the morning9:30 slot precedes
the deadline. These are receipt-derived, not guessed from the scheduled slot.
Final review delivered: **false**, timestamp **null**. Record delivery once;
do not repeatedly present it as new or create another review automation.

[Machine-readable operating ledger](pinterest-creative-lab/v34-concepts/verification/full-cohort-operating-ledger.json)
contains every successful receipt ID, timestamp, public Pin, arm and final-review
contract. All twelve packages were independently matched to production readbacks:

| Arm | Product | Public Pin | Durable success UTC |
|---|---|---|---|
| F | Red Crab | [1107815208388715714](https://www.pinterest.com/pin/1107815208388715714/) | 2026-09-15T23:40:50.765Z |
| F | Moon Ring | [1107815208388765155](https://www.pinterest.com/pin/1107815208388765155/) | 2026-09-16T16:42:19.922Z |
| P | Chia Gnome | [1107815208388788830](https://www.pinterest.com/pin/1107815208388788830/) | 2026-09-16T23:41:47.926Z |
| P | Mini Bowling | [1107815208389000013](https://www.pinterest.com/pin/1107815208389000013/) | 2026-09-19T16:45:23.812Z |
| F | Birthday Toast | [1107815208389027583](https://www.pinterest.com/pin/1107815208389027583/) | 2026-09-19T23:40:34.916Z |
| F | Desktop Therapist | [1107815208389087383](https://www.pinterest.com/pin/1107815208389087383/) | 2026-09-20T16:40:59.150Z |
| F | Sheep Roll Holder | [1107815208391037211](https://www.pinterest.com/pin/1107815208391037211/) | 2026-10-13T20:07:09.336Z |
| F | Spider Box | [1107815208391104701](https://www.pinterest.com/pin/1107815208391104701/) | 2026-10-14T16:42:53.716Z |
| P | Belly Bag | [1107815208391132026](https://www.pinterest.com/pin/1107815208391132026/) | 2026-10-14T23:40:30.593Z |
| P | Grumpy Frog | [1107815208391186516](https://www.pinterest.com/pin/1107815208391186516/) | 2026-10-15T16:44:52.032Z |
| P | Opossum Portrait | [1107815208391305222](https://www.pinterest.com/pin/1107815208391305222/) | 2026-10-16T23:36:45.613Z |
| P | Birthday Trucker Hat | [1107815208391368990](https://www.pinterest.com/pin/1107815208391368990/) | 2026-10-17T16:44:52.279Z |

Experiment technical authorization is now generation=false, publicPosting=false,
paidSpend=false; experiment remains active for measurement. A narrowly tested
validator correction allows public metrics only for prior public lifecycle
states even when new publication is disabled. It does not reopen either guard.
An initial rejected28day append wrote no event; the eligible bowling checkpoint
then recorded successfully after the fix. Bowling's lifecycle is archived,
not its public Pin or cohort membership.

At cohort completion this morning:34 verified Pins,3,169 impressions,45 opens,seven saves,
zero native outbound. P845/11/2 and F256/4/1 (impressions/opens/saves) both have
zero outbound; bowling supplies97.04%of P exposure, toast83.59%of F. No format/
acquisition winner. GA4property507421709 October11–17 partial:8direct sessions,
zero engaged, no Pinterest/retailer row. PostHog550427:onepage/onelistview,
no attributed row. Per-Pin downstream remains unknown, not zero.

The formal-dinner hat survived at4.625/5, all gates/min4, two included calls and
no revision; breakfast4.375 was rejected comparatively, office takeover before
generation. Exact cap/source print, mesh, curved brim and adult-language
suitability verified; Goose gives snapback/reuse/recipient-fit payoff. Tests,
build/lint/dry run, live guards, exact API readback twice, public HTML, platform
image and canonical index/follow destination verify. All evidence is in v34.

Bowling's first eligible28day observation at16:46:27.809 UTC,63.997seconds after
its exact gate, is820impressions/nineopens/twosaves/zerooutbound; no exact-age
history invented. Toast28day due October17T23:40:34.916Z and opossum24h due
October17T23:36:45.613Z are not closed early. New hat24h is
October18T16:44:52.279Z,7day October24T16:44:52.279Z,28day
November14T16:44:52.279Z. Capture each at its first eligible run.

### Owner-confirmed completion and final review — October 15

Cameron explicitly accepted finishing the last two P posters and evaluating
the complete cohort after its planned window. At confirmation the ledger was
P 4/6, F 6/6, ten of twelve. October16 afternoon published the opossum poster;
October17 morning published the final birthday-hat poster. Current P6/F6,
twelve of twelve, and the exact measurement-only contract are recorded above.
A skipped slot never creates catch-up credit or permission to switch arms.

The existing ACTIVE heartbeat now explicitly requires the twelfth publication
to record all twelve public Pin IDs/arms and the exact evaluation deadline:
the latest of their durable successful publication timestamps plus fourteen
full days. Record that receipt-derived UTC deadline in the operating/experiment
ledger. Do not substitute the scheduled slot or an estimated date; if the last
Pin is delayed, the review moves with it.

After twelve, scheduled runs are measurement-only with no new generation or
publication, including after the deadline, until Cameron authorizes a new
experiment. The first scheduled run at/after the deadline delivers and records
the full six-versus-six review. Compare outbound clicks per impression first,
then attributable Goose sessions/retailer actions; opens/impression and saves
are secondary. Include Pin ages, product differences and exposure concentration
in a single dominant Pin. Missing equal-age history/downstream attribution
stays unknown. Fifty impressions per arm is a minimum gate, not sufficient
proof of a winner; zero outbound in both arms means no demonstrated acquisition
winner. Propose the next bounded test without starting it. Record delivery so
later metric-only runs do not repeatedly report the same review as new.

This is a prompt clarification in the existing job, not a new automation or
schedule change. Its name, target thread, two daily slots, ACTIVE status,
publication guards and no-spend boundary were preserved and read back.

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

PostHog's explicit client allowlist intentionally omits host/current-URL/
referrer properties. Do not filter project550427 by `$host`, `$current_url`
or `page_location`: those absent fields can falsely discard every event.
Production-host eligibility is enforced by `isClientAnalyticsAllowed` in
`lib/client-analytics.ts`; read this explicit project with bounded dates and
QA/operator campaign exclusions. Project activity still does not prove
Pinterest/arm-level attribution or qualified customer actions.

Leave the schedule active after an ordinary quality no-op or quota checkpoint.
Never pause/delete/reschedule this job on its own. Surface an actionable
diagnosis for auth/publication failures needing intervention or three
consecutive source/quality no-ops indicating an exhausted pool. Keep the quality
bar and offer a safe alternative instead of silently stopping. No paid tools,
promotion, outreach, account changes, deletions, video or unrelated site changes.

## October 13 recovery evidence

### October 20 afternoon — sheep seven-day observation; no new outbound

AssignedP, completedP6/F6,total12 cap frozen. No shortlist/concepts/generation,
approval,create dryrun or publication. Production goosegifts BUSINESS account,
all12 complete packages/durable receipt boards verify; no unresolved receipt
or successful publication today.28 retained public Pins,26listed+two known
exact-ID omissions. Six separately owner-authorized retired legacy IDs excluded
before fetch, not reposted/deleted here. Generation/publicPosting/paidSpend false.

At2026-10-20T23:34:02.495Z P1322impressions/21opens/3saves/2outbound,
F302/5/1/0outbound. Profile3516/53/7/2. Bowling1294/19/3/2 supplies97.88%P
exposure and all two outbound; toast257/3/1/0 supplies85.10%F. Excluding those
dominant Pins P28/2/0/0,F45/2/0/0. No additional outbound sinceAM or demonstrated
format winner. Preserve unequal ages/product/category differences and actual
current observations; do not invent equal-age history or qualified conversion.

Sheep7day gate2026-10-20T20:07:09.336Z, first eligible regular PM observation
23:34:02.495Z, actual age617213159ms, late12413159ms(3h26m53.159s). Native
impressions/opens/saves/outbound all zero; per-Pin site/retailer/revenue unknown.
Exact Pin/package/receipt board and public HTML200 verify; canonical tracked
destination200/UTM intact/retailer CTA. Distribution-limited, not creative/arm
failure. Keep measuring, public and original F/quota membership. No revision,
replacement or repost. [Seven-day receipt](pinterest-creative-lab/v34-concepts/verification/sheep-7day-20261020-pm.json).
Its28day exact gate is2026-11-10T20:07:09.336Z; no early closure.

Bounded GA4property507421709 Oct14–20Pacific/currentdaypartial509direct+
1not-set sessions,two engaged direct,no attributed Pinterest/retailer row.
PostHog explicit5504275page/7list/1search,no attributed row. Both respond,
missing attribution remains unknown. No absent-host filter, Sandbox/v3,
QA/operator campaigns or retired DB/Vercel zeros used as conversion evidence.
All12 tracked destinations200/selfcanonical/query-preserved/retailerlinked,
tenindex-follow/two existing Chia/Bowling holds; no source/catalog/cache/page
mutation or requeue. Existing catalog handoff and rename hold unchanged.

14 validated append-only events plus [PM receipt](pinterest-creative-lab/v34-concepts/verification/metrics-20261020-pm.json)
and [tracked destination audit](pinterest-creative-lab/v34-concepts/verification/destinations-20261020-pm.json)
retain evidence. No lifecycle change, publication/approval/retirement receipt or
cohort/deadline mutation. Next spider7day exact gate2026-10-21T16:42:53.716Z;
observe first scheduled time at/after, not early. Full review not due/delivered:
exact gate2026-10-31T16:44:52.279Z, regular eligible slotOct31 16:30Pacific.
Keep existing ACTIVE schedule, no new experiment/generation/publication even
after review without Cameron's explicit decision. Routine acquisition state
unchanged, no owner action or repeat outbound-click notification needed.

### October 20 morning — first native outbound clicks; no new creative

AssignedF, P6/F6,total12 cap frozen. No shortlist, concepts, image generation,
approval, dry-run or publication. Correct goosegifts BUSINESS account and all
twelve exact package/receipt-board readbacks verify; no unresolved receipt or
successful publication today. Generation/publicPosting/paidSpend remain false.

At2026-10-20T16:39:08.583Z P1150impressions/18opens/3saves/2outbound;
F291/5/1/0outbound. Bowling1124/16/3/2 supplies97.74%ofP impressions and
both clicks; Toast246/3/1/0 supplies84.54%ofF. Without the dominant Pins,
P26/2/0/0 versus F45/2/0/0. A second exact-ID read at16:40:24.142UTC confirms
bowling's two native outbound clicks; public Pin200 and Goose tracking link200
with UTM query intact and visible retailer CTA. No operator/retailer click.
This is encouraging product-level action, not a demonstrated format winner,
verified unique/human sessions, retailer conversion or sales. Earlier dated
zero-outbound observations remain intact. Final cohort review is not due.

28 retained public Pins (26listed+two known exact-ID omissions),3302impressions/
50opens/7saves/2outbound. Six separately owner-authorized legacy retirements
were excluded before fetch; all12 v11 Pins remain. Prior34 aggregate3487/51/8/0
minus retired308/4/2/0 gives comparable retained baseline3179/47/6/0. Do not
report raw34-to28 inventory or aggregate changes as lost distribution. No
retired-ID fetch, deletion, repost, account mutation or rename here.

Bounded GA4property507421709 Oct14–20Pacific/currentdaypartial:
369direct+1not-set sessions,one engaged direct,no attributed Pinterest/retailer
row. PostHog550427:5page/7list/1search,no attributed row. Both sources respond;
no ongoing-outage claim, absent-host filter or inference from retired DB/Vercel
zeros. Sandbox/v3 and QA/operator campaigns excluded; downstream unknown.

All12 destinations200/selfcanonical/retailerlinked,tenindex-follow/two existing
Chia/Bowling holds; existing separate catalog handoff unchanged. No catalog,
cache, page or source mutation. No new checkpoint due at AM snapshot; sheep
7day exact gate2026-10-20T20:07:09.336Z, first eligible regular slot this
afternoon. Preserve actual late checkpoints rather than invent equal-age data.

Thirteen validated append-only events and [AM receipt](pinterest-creative-lab/v34-concepts/verification/metrics-20261020-am.json)
plus [twelve-page audit](pinterest-creative-lab/v34-concepts/verification/destinations-20261020-am.json)
retain this cap-driven no-op. Publication receipts, approval manifest, cohort
ledger/deadline and retirement evidence unchanged; finalReviewDelivered=false/null.
Existing ACTIVE slots intact; exact full-cohort gate October31T16:44:52.279Z,
regular eligible slot16:30Pacific. No new experiment or format adoption, no
further generation/publication even after review without Cameron's new decision.

### October 19 afternoon — quota no-op; analytics recovered on bounded retry

Assigned F, but full P6/F6,total12 remains frozen. No selection,shortlist,
concepts,generation,approval,create dryrun or publication. Correct goosegifts
BUSINESS1107815345747925810,all12 exact packages/durable receipt boards
verify;34 public Pins(32listed+two known exact-ID omissions),zero successes
today,no unresolved receipt. Generation/publicPosting/paidSpend remain false.

At2026-10-19T23:30:44.906Z, native P1,064impressions/15opens/2saves,F279/5/1,
bothzerooutbound; profile3,487/51/8/zerooutbound, unchangedAM. Bowling97.65%P,
toast83.87%F; without them P25impressions/2opens,F45/2,zero saves/outbound.
No acquisition/format winner, equal-age history or premature full review.
GA4explicit507421709 Oct13–19Pacific/currentdaypartial:188direct+1not-set
sessions,one engaged direct,no attributed Pinterest/retailer row. PostHog550427
initial503 recovered on one bounded retry:6page/8list/1search,no attributed
row. Receipt clocks label attempt starts/query bounds, not inferred response
completion times. Both outcomes retained; no absent-host
filter or ongoing-outage claim. Per-Pin downstream unknown, not zero.

All12 destinations200/self-canonical/visible Amazon CTA+href;tenindex-follow,
Chia/Bowling stillnoindex-follow. Retain AM's dated external Toast improvement
and existing catalog handoff; no source/DB/catalog/cache/page mutation here.
No new checkpoint due; all prior24h/28day observations and lifecycle states
retained. Next sheep7day gate2026-10-20T20:07:09.336Z,first regular eligible
slot October20 afternoon. Cap-driven no-op is not source/quality exhaustion;
do not pause/reschedule or lower standards after routine measurement slots.

Thirteen validated append-only events and [PM receipt](pinterest-creative-lab/v34-concepts/verification/metrics-20261019-pm.json)
plus [twelve-page audit](pinterest-creative-lab/v34-concepts/verification/destinations-20261019-pm.json)
preserve this run. Publication receipts,manifest,twelve memberships and exact
review deadline2026-10-31T16:44:52.279Z unchanged;finalReviewDelivered=false/null.
Existing ACTIVE slots stay unchanged; first regular eligible full review
Oct31 16:30Pacific. Queue empty,no new creative/publication even after review
until new explicit owner experiment. No Bead/account/Pin mutation or spend.

### October 19 morning — metric-only; catalog handoff partially resolved

Assigned P, but completed P6/F6,total12 remains frozen. No product selection,
shortlist,concepts,generation,approval,dryrun or publication. Correct goosegifts
BUSINESS1107815345747925810,all twelve exact packages/receipt boards verify;
34 public Pins(32 listed+two known exact-ID omissions),zero successes today,
no unresolved receipt. Generation/publicPosting/paidSpend remain false.

At2026-10-19T16:30:05.052Z, P1,064impressions/15opens/2saves,F279/5/1,
bothzerooutbound; profile3,487/51/8/zerooutbound, unchangedOct18PM. Bowling
97.65%P and toast83.87%F dominate; without them P25impressions/2opens,F45/2,
zero saves/outbound. No acquisition/format winner or equal-age inference.
GA4explicit507421709 Oct13–19Pacific/currentdaypartial:109direct+1not-set
sessions,one engaged direct,no Pinterest/retailer row. PostHog550427 has
6page/8list/1search events,no attributed row; no absent-host filters. QA/operator,
Sandbox/v3 and retired DB/Vercel zeros excluded. Per-Pin downstream unknown.

All twelve canonical pages return200 with visible Amazon CTA/href. Separate
weekly catalog run11928e5b completed15:32:09.255UTC and regenerated Birthday
Toast; first studio verification16:30:25.676UTC now index/follow. Ten pages
are index/follow,Chia/Bowling remain noindex/follow. Preserve this destination
intervention chronology in final review; exact copy-change timestamp unknown.
Technical indexability is not Google indexation proof, and noindex did not
block direct visits or explain native outbound zero. Existing two-product
catalog handoff is already current; no catalog/source/page/DB work here.

All six newer24h and six older28day observations are already recorded; no
new checkpoint due. Retain existing lifecycle states; next sheep7day gate
2026-10-20T20:07:09.336Z. Do not duplicate a completed checkpoint or close
the next gate early. Thirteen validated append-only events and
[AM measurement receipt](pinterest-creative-lab/v34-concepts/verification/metrics-20261019-am.json)
plus [twelve-page audit](pinterest-creative-lab/v34-concepts/verification/destinations-20261019-am.json)
preserve this no-op. Original publication receipts,manifest,membership and
2026-10-31T16:44:52.279Z deadline unchanged; finalReviewDelivered=false/null.
First regular eligible review Oct31 16:30Pacific. Leave existing ACTIVE slots
unchanged,queue empty,no new creative/publication even after review until a
new explicit owner experiment. No Bead/schedule/account/Pin mutation or spend.

### October 18 afternoon — therapist28day and hat24h, cohort still frozen

Assigned P; full P6/F6,total12 means no selection, shortlist, concepts,
generation, new artifact, approval, dry run or publication. Production still
verifies correct goosegifts BUSINESS1107815345747925810, all twelve exact
packages/receipt boards and34 public Pins(32 listed plus two exact-ID
omissions). Zero successful publications today and no unresolved receipt.
Experiment active for metrics, generation/publicPosting/paidSpend false.

At2026-10-18T23:33:53.088Z, P1,064impressions/15opens/2saves and F279/5/1
both retain zero outbound; full profile3,487/51/8/zerooutbound, unchangedAM.
Bowling97.65%ofP,toast83.87%ofF; removing dominant products leaves P25
impressions/2opens,F45/2opens,zero saves/outbound. Unequal ages/products/
boards and concentration prevent a format/acquisition conclusion. Not the
complete-cohort review; no equal-age history reconstructed.

GA4property507421709 Oct12–18Pacific/currentdaypartial:39direct+1not-set
sessions,zero engaged,no attributed Pinterest/retailer row. PostHog550427
has6page/8list/1search events,no attributed row. The initial empty host-filter
query was diagnosed against the privacy allowlist and corrected to this
explicit bounded project; it was not reported as no traffic/outage. No app
change. Per-Pin sessions/retailer/revenue remain unknown. QA/operator,
Sandbox/v3 and retired database/Vercel zeros remain excluded.

Therapist28day exact gate2026-10-18T16:40:59.150Z; actual first eligible
scheduled observation23:34:45.644Z,late24,826,494ms(6h53m46.494s),13native
impressions/zero opens,saves,outbound. Original receipt/package, publicHTML
200/title/ID,image hash and canonical200/index-follow retailer path verify.
Recorded learning; measuring -> learned -> archived lifecycle only. Public
Pin1107815208389087383,original F membership/quota,receipts and future public
metrics retained; no delete/repost/replacement credit.

Hat24h exact gate2026-10-18T16:44:52.279Z; actual observation23:34:45.638Z,
late24,593,359ms(6h49m53.359s),zero native distribution/actions. Exact original
receipt/package, publicHTML,image hash and canonical200/index-follow retailer
path verify. Stay measuring; lack of delivery is not a taste verdict. Seven-day
gate October24T16:44:52.279Z. Both actual late timestamps are preserved,
not substituted for unavailable exact-age historical data. Five canonical
retailer paths verify; prior Chia/bowling/toast editorial noindex-follow holds
and separate catalog handoff unchanged, not repaired/requeued here.

Nineteen append-only validated events and [PM receipt](pinterest-creative-lab/v34-concepts/verification/metrics-20261018-pm.json),
[therapist28day](pinterest-creative-lab/v34-concepts/verification/therapist-28day-20261018-pm.json)
and [hat24h](pinterest-creative-lab/v34-concepts/verification/birthday-hat-24h-20261018-pm.json)
preserve evidence. Original twelve membership/receipts and exact review deadline
2026-10-31T16:44:52.279Z unchanged; final review delivered=false. Keep existing
ACTIVE schedule unchanged, first regular eligible review Oct31 16:30Pacific.
No new generation/publication even afterward until a new owner experiment.
Queue empty; next move remains eligible metrics and the full review once.

### October 18 morning — measurement-only; toast 28-day lifecycle complete

Assigned F; the full P 6/6, F 6/6 cohort still forbids generation/publication.
No shortlist, concepts, new artifact, approval, dry run or public Pin. The
correct goosegifts BUSINESS account and all twelve exact production packages/
receipt boards verify. Public union remains 34 Pins: 32 enumerated plus the
two known exact-ID omissions. Zero successful publications today and no
unresolved receipt. Generation/publicPosting/paidSpend remain false.

At 2026-10-18T16:28:53.437Z, P has 1,064 impressions, 15 opens, two saves,
zero outbound; F has 279 impressions, five opens, one save, zero outbound.
The full profile has 3,487 impressions, 51 opens, eight saves, zero outbound.
Since yesterday PM, P gained 108 impressions/three opens; F gained six/one.
Bowling supplies 97.65% of P exposure and toast 83.87% of F. Without those
products P has 25 impressions/two opens, F 45/two; neither has a save or
outbound click. Unequal ages/products and concentrated delivery still prevent
a format or acquisition winner; this is not the final review.

GA4 property 507421709, October 12–18 Pacific/current day partial, reports
16 direct sessions, zero engaged, no attributed Pinterest/retailer row.
Explicit PostHog project550427 has two page/two list events and no attributed
Pinterest/retailer row. Production-host and QA/operator exclusions retained;
missing per-Pin sessions/retailer actions/revenue remain unknown, not zero.
Sandbox/v3 and retired database/Vercel zeros are excluded.

Toast's first eligible scheduled 28-day observation is recorded at
2026-10-18T16:30:01.476Z, due 2026-10-17T23:40:34.916Z, late
16h49m26.560s. Native result: 234 impressions, three opens, one save, zero
outbound. Exact package/receipt, public HTML, canonical page and retailer
CTA/href verify. Actual late time is preserved, not invented equal-age history.
Learning recorded; lifecycle moved measuring -> learned -> archived. The
public Pin1107815208389027583, original F membership, receipt, tracking and
future public metrics remain; no deletion, replacement or quota credit.

At this snapshot, therapist28day due today16:40:59.150Z and hat24h due
16:44:52.279Z are not yet eligible and remain pending for a first eligible
run. Opossum24h was recorded yesterday. Five current pages were rechecked:
Chia, bowling and toast remain200/self-canonical/noindex-follow with Amazon
CTA/href; therapist and hat remain200/index-follow. The prior three-record
catalog handoff remains unchanged, not requeued or repaired here. No fresh
catalog/database/source write, cache mutation, catalog job or page/SEO change.

All twelve memberships and receipt-derived deadline
**2026-10-31T16:44:52.279Z** are unchanged, final review delivered=false.
Existing ACTIVE two-slot schedule stays unchanged; first regular eligible full
review is October31 at16:30Pacific. No new generation/publication even after
that review until a new explicit owner experiment. Seventeen validated events
and [AM measurement receipt](pinterest-creative-lab/v34-concepts/verification/metrics-20261018-am.json)
plus [toast28day receipt](pinterest-creative-lab/v34-concepts/verification/toast-28day-20261018-am.json)
preserve the no-op and actual checkpoint. Queue stays empty.

### October 17 afternoon — completed-cohort measurement-only slot

This assigned F slot generated and published nothing: P 6/6, F 6/6, twelve
of twelve. No candidate shortlist, concepts, approval or production create dry
run; the spent cohort takes precedence. Production still verifies the correct
goosegifts BUSINESS account, all twelve exact packages/receipt boards and the
34-Pin public union (32 listed plus two known exact-ID omissions). One public
success today belongs to the morning run; no unresolved receipt or new write.

At 2026-10-17T23:29:38.294Z, P has 956 impressions, 12 opens, two saves and
zero outbound clicks; F has 273 impressions, four opens, one save and zero
outbound. Profile totals: 3,331 impressions, 46 opens, seven saves, zero
outbound. Bowling supplies 97.38% of P exposure and toast 83.88% of F.
Removing those dominant products leaves P 25 impressions/two opens and F
44/two opens, both without saves/outbound. This is not an equal-age comparison
or final review, and there is no demonstrated acquisition/format winner.

Bounded GA4 property507421709, October11–17 Pacific/current day partial:
eight direct sessions, zero engaged, no Pinterest/retailer row. PostHog550427
has two page/two list views, including October17 activity, but no attributed
Pinterest or retailer row. Per-Pin sessions/actions remain unknown, not zero;
QA/operator campaigns, Sandbox/v3 and retired database/Vercel zeros excluded.

A bounded twelve-destination audit found all HTTP200, self-canonical and
retailer links/CTAs present. Nine are index/follow. Chia B008VVUWQC, bowling
B082PSJYYP and toast B0F88FJ56K are noindex/follow: each is active/purchasable
in the catalog but editorial_status=stale and sourceFactsHash differs from
editorialSourceHash. This matches the product-specific editorial eligibility
gate, not a global/random-page nofollow. Fresh read-only Creators API confirms
toast IN_STOCK. Noindex does not prevent a direct Pinterest visit, so this
does not establish a cause for zero native outbound clicks. Separate catalog
workflow handoff: re-enrich those exact three records against current facts.
No database requeue, catalog job, site implementation or Pin mutation occurred.

The 23:29–23:30 snapshots precede opossum24h due23:36:45.613Z and toast28day
due23:40:34.916Z; neither is closed early. Bowling28day was already recorded
this morning and remains lifecycle-archived/public. All twelve members and
receipt-derived deadline **2026-10-31T16:44:52.279Z** are unchanged; final
review delivered=false. Existing schedule stays ACTIVE/unchanged, experiment
generation/publicPosting remain false. First regular eligible final review is
October31 at16:30Pacific. No new creative/publication even after the deadline
without a new explicit owner experiment.

Later in the same run, opossum's first eligible 24-hour receipt check was
captured at 2026-10-17T23:37:21.545Z (35.932 seconds after its exact gate).
Native impressions/opens/saves/outbound are all zero; exact production package
still matches. This is current distribution evidence, not a creative verdict.
Next opossum gate: 2026-10-23T23:36:45.613Z. Toast28day remains pending;
it is not closed with the earlier snapshot. Two additional validated events
and opossum-24h-20261017-pm.json preserve the actual observation.

Evidence: [PM measurement receipt](pinterest-creative-lab/v34-concepts/verification/metrics-20261017-pm.json),
[landing eligibility audit](pinterest-creative-lab/v34-concepts/verification/destinations-20261017-pm.json)
and [single-product diagnostic](pinterest-creative-lab/v34-concepts/verification/toast-diagnostic-20261017-pm.json).
Twelve public metric events plus one learning were validated/appended without
rewriting history. The owner-ready queue stays empty.

### October 16 afternoon — opossum family-portrait poster

The scheduled P slot published [Pin 1107815208391305222](https://www.pinterest.com/pin/1107815208391305222/)
once at23:36:45.613 UTC through guarded production. Current Creators API/source
verify JAOYWAO B0H3P21YPW as purchasable framed printed canvas, source landscape
composition, small8x10-inch listing size and gold-colored frame. No scarcity,
price, actual-gold/wood/antique or original-painting promise. Exact canonical
page is200/self-canonical/indexable with material/size/ready-to-hang gift payoff.
The selected product was not touched by the latest October12 weekly run;
source/concept quality won over rank/latest-touch bonus. No catalog job ran.

Three saved concepts, two included source-guided1024x1536 executions and
original-resolution reviews yielded one4.75/5 survivor, all hard gates passing.
Exact five-word line: FINALLY, AN HONEST FAMILY PORTRAIT. Printed pose, paws,
tail/face and frame remain faithful, not pixel-identical source photography;
fine texture/molding is relit/resynthesized. Reading-chair alternative4.50/5
has competing foreground weight; dinner-host concept risks scale/template
drift. Both rejected durably. No diagnosed defect justified a third call.

Exact delegated package approval,14 targeted tests, build/lint, production dry
run, current BUSINESS identity, unused slot/day/UTM, receipts and arm/cohort
caps passed. Exact readback twice, public HTTP200/title/ID, platform-hosted
image inspection and tracked canonical/indexable destination verify. Receipt:
`receipt-1792193805613-editorial-opossum-family-portrait-poster-20261016-pm-publication-succeeded`.
All source, prompts, artifacts, reviews, checks and receipts are in v33.

Now **P5/F6,total11/12**, first Pin today;33 verified public Pins,2,936
impressions/45opens/7saves/zero native outbound. P651/11/2 and F245/4/1
remain zero outbound; new44.787-second baseline is not a verdict. Bounded
GA4 507421709 October10–16 partial has5direct+2unassigned sessions/1engaged,
no Pinterest/outbound row. PostHog550427 has2page views/2list views, no
attributed Pinterest/retailer row. Per-Pin downstream remains unknown.

Frog's first eligible late24h observation is zero at age30h52m38.368s, not
reconstructed exact24h history; its7day gate is October22T16:44:52.032Z.
Opossum24h is October17T23:36:45.613Z. Schedule stays ACTIVE unchanged.
Only one P quota remains, next intended October17 morning Pacific if qualified.
At twelfth success record all12 IDs/arms and latest durable success+14full days
as exact review deadline. No generation/publication after twelve, even after
deadline, without new owner authorization; keep metric-only and deliver review
once at first eligible scheduled run. No arm swap, catch-up or new cohort.

### October 16 morning — full F slot; belly late 24h recorded

Even-date AM assigns F, already six of six. This scheduled run generated and
published nothing, selected no product and created no approval/dry run. P4/F6
remains ten of twelve, with no public success today and no unresolved receipt.
Production verifies goosegifts BUSINESS and all ten exact packages/receipt
boards. Listing enumeration returns 30; exact reads of the two known omitted
IDs complete the 32-Pin public union. No omitted Pin was deleted or reposted.

At 16:32:13.260 UTC, profile totals remain 2,936 impressions/45 opens/seven
saves/zero outbound. P: 651 impressions/11 opens/two saves; F: 245/four/one;
both zero native outbound. Mini bowling supplies 96.3% of P exposure and toast
83.7% of F. Unequal age/product mix and concentrated exposure preclude a format
claim. GA4 507421709, October 10–16 Pacific/current day partial, has five direct
plus two unassigned sessions/one engaged, no Pinterest/outbound row after
production-host and QA/operator exclusions. Explicit PostHog 550427 has two
page views/two list views and no attributed Pinterest/retailer row. Downstream
remains unknown. Public Pin/destination checks for belly and frog pass.

Belly's first eligible late 24h check is now recorded: zero native distribution
and actions at age 40h51m42.667s, 16h51m42.667s after the exact gate. This is
current evidence, not reconstructed exact-24h history. Next belly gate is
October 21 at 23:40:30.593 UTC. Frog 24h is not eligible at this snapshot:
due today 16:44:52.032 UTC; capture only when eligible. Mini bowling reaches
28 days October 17 at 16:45:23.812 UTC, not this run.

V32 `verification/metrics-20261016-am.json`, seven current metric events and
two validated learnings preserve the run. Owner-ready queue remains empty.
Schedule stays ACTIVE unchanged. The next intended P slots are today afternoon
and October 17 morning Pacific, only if qualified; no switched arm, catch-up
or new cohort. Exact full-cohort review deadline remains pending twelfth success.

### October 15 afternoon — full Arm F, measurement-only

The scheduled odd-date PM slot is F, already six of six. No source selection,
image generation, approval, dry run or public write occurred; P remains four,
total ten. Exact production reads verify all ten current packages and receipt
board IDs, 32 profile Pins and no unresolved publication receipt. Frog and
belly public HTTP 200/title/ID and canonical indexable destinations verify.

At 23:31:45 UTC, P is 651 impressions/11 opens/two saves; F is 245/four/one.
Both have zero native outbound clicks. Mini bowling supplies 627/651 (96.3%)
of P exposure; this is not an acquisition or format winner. GA4 507421709,
October 9–15 Pacific/current day partial, has four direct plus one unassigned
session, one engaged, no Pinterest/outbound row after production-host and
QA/operator exclusions. Explicit PostHog 550427 has two page views/two list
views, no attributed Pinterest/retailer row. Per-Pin downstream stays unknown.
Seven current metric events and one no-op learning are append-only validated;
raw public and bounded site evidence is `v32-concepts/verification/metrics-20261015-pm.json`.

Belly 24h is not eligible at this snapshot: exact gate is 23:40:30.593 UTC.
Frog 24h is October 16 at 16:44:52.032 UTC. Do not label early observations
as completed checkpoints. Leave the existing schedule ACTIVE unchanged; next
intended P slots remain October 16 afternoon and October 17 morning Pacific,
subject to quality. F slots remain metric-only, no swaps or backfill. The
full-cohort review deadline remains unset until the twelfth actual success;
derive it from the latest durable successful timestamp plus fourteen days.

### October 15 morning — greenhouse complaint poster

The scheduled Arm P run published the [grumpy frog poster](https://www.pinterest.com/pin/1107815208391186516/)
once at 16:44:52.032 UTC through guarded production. Exact current IN_STOCK
listing/source, miniature bronze-look resin identity and canonical indexable
destination verified. Three concepts, two included images, full-resolution
reviews and the sole 4.75/5 greenhouse survivor are durable in v32. The generic
Monday alternative was rejected; no causal revision was justified. The exact
five-word line is `THE GARDEN HAS A COMPLAINT`; material, placement and
boxed-gift details give a concrete plant-lover/housewarming click payoff.

Complete delegated approval, 14 targeted tests, build/lint, production dry run,
account, live public union/receipts, unused slot/day/arm/cohort cap and unique
UTM passed. Exact API readback passed twice, public HTTP 200 contains title/ID,
and tracked destination is self-canonical and indexable. Success receipt:
`receipt-1792082692032-editorial-grumpy-frog-greenhouse-poster-20261015-am-publication-succeeded`.

Current v11: **P 4/6, F 6/6, ten of twelve**, first Pin today. P has 651
impressions, 11 opens, two saves; F has 245, four opens, one save. Both have
zero native outbound clicks. Profile preflight: 2,936 impressions, 45 opens,
seven saves; 32 verified Pins after this new zero-action baseline. Bounded
October 9–15 GA4 has four direct sessions/one engaged, no Pinterest/outbound
row; explicit PostHog 550427 has two page views/two list views and no attributed
Pinterest/retailer row. Per-Pin downstream remains unknown, not historical
DB/Vercel zeros. Mini bowling's increased delivery is attention, not acquisition.

Spider's exact 24h gate passed during normal work: current readback and zero
native distribution/actions captured at 16:45:34 UTC. Keep measuring; seven-day
gate is October 21 at 16:42:53.716 UTC. Belly 24h remains pending until today
23:40:30.593 UTC. Leave the schedule active. This afternoon F is metric-only;
two P quota remain in their normal slots, next October 16 afternoon. No arm
swap, catch-up, higher cap or new cohort; complete-cohort 14-day review pending.

### October 14 afternoon — Arm P travel-function poster

The scheduled PM slot published and exact-readback-verified the
[belly waist-bag poster](https://www.pinterest.com/pin/1107815208391132026/)
at 23:40:30.593 UTC. Current source is IN_STOCK; three concepts, two included
1024x1536 executions, full-resolution review and the sole 4.75/5 survivor are
durable in v31. The five-word `THE DAD BOD HAS STORAGE` line makes a real
zippered accessory recognizable; the canonical page supplies storage,
adjustable-strap and gifting context. The formalwear alternative was rejected
for less direct utility; no third call was justified.

Exact delegated package approval, 14 targeted tests, build/lint, production
dry run, account, unique UTM and public/receipt cap guards passed. Created
once, read back twice, public HTTP 200/title/ID and tracked canonical indexable
destination verified. Durable receipt:
`receipt-1792021230593-editorial-belly-bag-carry-on-poster-20261014-pm-publication-succeeded`.

Current verified profile: 31 Pins, 2,615 impressions, 43 opens, six saves, zero
native outbound clicks. The listing endpoint enumerated 28 before publication;
exact-ID reads of known Gratiator/Mystic Pickle Pins completed the 30-Pin
preflight union. Do not treat enumeration alone as inventory or delete/repost
an omitted ID. V11 is now **P 3/6, F 6/6, nine of twelve**, second/final Pin today.
P has 391 impressions/10 opens/2 saves; F has 225/4/1, both zero native outbound.
GA4/PostHog per-Pin site/retailer attribution remains unknown. Sheep's late
current 24h observation is zero distribution/actions, not a creative verdict.
Chia crossed its exact 28-day gate at 23:41:47.926 UTC: 23 impressions, two
opens, no native save/outbound. Its individual lifecycle is archived while
its public Pin and v11 enrollment/cohort inclusion stay intact.

Leave the schedule active. Next normal selection is October 15 morning P;
three P quota remain, assigned F slots metric-only. Spider 24h is due at/after
2026-10-15T16:42:53.716Z and belly 24h at/after 2026-10-15T23:40:30.593Z; capture only when
eligible. No catch-up, arm switch, cadence increase or new cohort. Full-cohort
14-day comparison remains pending. Recovery Bead already closed.

### October 14 ordinary creative slot completed

The resumed morning scheduler created/read-verified the final Arm F Pin,
[the wooden spider prank box](https://www.pinterest.com/pin/1107815208391104701/),
at 16:42:53 UTC. Exact source, three concepts, two initial images, one causal
leader-line edit, 4.63/5 internal review, complete standing-authorized package,
production dry run, current account/slot/cap/duplicate guards and the durable
success receipt are in `pinterest-creative-lab/v30-concepts/`. Public HTML and
the tracked self-canonical/indexable gift page verify. This is one real
scheduled publication, first Pin today; the initial zero-action baseline is
not a demand verdict.

Current counts are **F 6/6, P 2/6, eight of twelve**. F has 225 impressions,
four opens and one save; P has 391 impressions, ten opens and two saves. Both
have zero native outbound clicks; per-Pin site/retailer attribution remains
unknown under bounded GA4/PostHog evidence. Assigned F slots must now be
measurement-only even while P enrollment remains open. Keep the same schedule,
never swap arms or backfill, and finish P only in its four remaining eligible
slots. Next normal selection: October 14 afternoon Arm P. Sheep reaches 24
hours at October 14 20:07:09.336 UTC; spider reaches 24 hours at October 15
16:42:53.716 UTC. The Moon Ring's 28-day lifecycle is archived with its public
Pin and cohort inclusion retained. Full twelve-Pin/fourteen-day review remains
pending; recovery Bead `roadmap-aguig` was already closed and is not reopened.

### Scheduled afternoon invocation completed as a spent-slot no-op

The October 13 16:33 Pacific heartbeat executed against canonical main
`1358871`. It verified the earlier sheep success receipt and exact production
readback, including board, copy, tracking URL and 1024x1536 media. The public
Pin and canonical indexable gift page returned HTTP 200. The afternoon F slot
was already spent: this scheduled invocation generated no image and published
no additional Pin. One successful receipt exists today and none is unresolved.
The recovery Bead was already closed after PR #167 and the owner's accepted
manual publication; this adds actual scheduled-execution evidence.

At 23:38 UTC, F is five Pins / 208 impressions / four opens / one save and P
is two Pins / 339 impressions / nine opens / two saves. Both have zero native
outbound clicks. The sheep Pin is still at zero native actions about 3.5 hours
after creation; its 24-hour gate is October 14 at 20:07:09.336 UTC. GA4 has
16 production sessions in October 6–13 Pacific (current day partial), all
direct/unassigned, and no outbound-event row after QA/operator exclusions.
Explicit PostHog project 550427 has two page views and two list views in the
bounded UTC window, with no attributed Pinterest or retailer row. The earlier
ingestion gap and attribution limitations keep per-Pin sessions and retailer
exits unknown. Retired database click writes are not current evidence.

Eight current metric events, two learnings and one archive transition were
appended through the validator. The older six are late checkpoints after missed
seven-day gates, not reconstructed historical results. Exact evidence is
`pinterest-creative-lab/v29-concepts/verification/scheduled-spent-slot-20261013.json`.
Keep the schedule active. Normal selection resumes October 14 at 09:30
Pacific, Arm F, with one F quota remaining; full-cohort evaluation remains
pending. Red Crab reached its exact 28-day gate later in this run, at 23:41:14
UTC, still at seven impressions and no native actions. Its individual lifecycle
was archived while retaining the public Pin and its full-cohort inclusion.

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
