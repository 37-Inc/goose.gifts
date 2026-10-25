# October 25 AM — routine frozen-cohort measurement

Trigger `2026-10-25T16:30:52.961Z`; actual snapshot
`2026-10-25T16:31:42.267Z`. Complete read-only receipt:
`measurement-20261025T163142267Z.json`. Verified account
**1107815345747925810 / stupid_gifts / BUSINESS**, 28 retained public Pins,
five boards. All 28 original IDs, tracked links and boards match October 24 PM.
**No public Pin was created.** Command writes: zero.

| Arm | Pins | Impressions | Pin clicks | Saves | Pinterest outbound | Attributable site sessions / retailer actions |
|---|---:|---:|---:|---:|---:|---|
| P | 6 | 1,448 | 22 | 3 | 2 | unknown / unknown |
| F | 6 | 355 | 5 | 1 | 0 | unknown / unknown |

Profile: 3,959 impressions / 60 Pin clicks / 8 saves / 2 native outbound.
Compared with prior PM, distribution increases P +7/F +2 impressions, but no
native click, save or outbound count changes on any of the 28 Pins. Bowling
has 1,395 impressions (96.34% of P), 20 opens, three saves and both outbound;
Toast has 282 impressions (79.44% of F), three opens and one save. Excluding
these dominant products leaves P 53/2/0/0 and F 73/2/0/0
(impressions/opens/saves/outbound). Exposure minima are met, not proof of a
format winner. No new measured acquisition evidence or format adoption.

## Bounded site evidence, not inferred conversions

- GA4 **property 507421709**, October 18–25 Pacific/current partial day:
  www.goose.gifts 627 direct sessions; stupid.gifts 40 direct + 6 amazon +
  1 not-set. Retailer events are two Stupid/direct, two Stupid/amazon and one
  Goose/direct. No Pinterest-attributed row is returned. These rows are not
  Pinterest conversions or confirmed customers. Campaign/QA-medium exclusions
  cannot fully remove operator activity in an already-direct session; event
  traffic custom dimensions remain unregistered.
- PostHog **project 550427**, rolling UTC
  `2026-10-18T16:31:39.588Z`–`2026-10-25T16:31:39.588Z`: 43 page views,
  69 list views, six searches and three select-item events after campaign and
  whole-QA-identity exclusions. No attributed Pinterest/retailer row is
  returned. Host/full URL/per-Pin utm_content are intentionally absent; do not
  infer host-specific sessions or per-Pin actions, or call browser IDs sessions.
- Both reads succeeded. Unknown arm/Pin downstream and revenue remain null,
  not zero. Earlier provider gaps remain historical. Do not pool different
  windows or treat rolling-window/reclassification changes as acquisition,
  customer regression or deduplicated people. QA is delivery evidence only.
  Retired database clicks, Vercel analytics and v3/Sandbox are excluded.

The separately owner-authorized [Goose redirect intervention](../../goose-redirect-2026-10-23/README.md)
was verified at `2026-10-24T04:50:14.849Z`, preserving path/query to Stupid.
Original approved Pin links/receipts remain unchanged. Old no-redirect claims
are historical. Carry pre/post-destination and rebrand effects into the final
review, not a format effect or acquisition proof. This run makes no routing
change or new destination-QA claim; tube-guy's intentional hold is not removed.

## Checkpoints, freeze and validation

No unresolved production publication start or newly due 24-hour receipt,
seven-day learning or 28-day archive. Prior late checkpoint times are retained,
including Hat seven-day on October 24 PM; nothing is reconstructed or closed
again. Six older lifecycles remain archived/public; six remain measuring.
Next individual 28-day gate: Sheep, `2026-11-10T20:07:09.336Z`.

v11 remains P6/F6, 12 total. All twelve ages and actual successful publication
times are in the JSON. Full review remains undelivered/not due until
**2026-10-31T16:44:52.279Z**; expected first eligible normal slot is October 31
16:30 Pacific / 23:30 UTC. Keep generation/posting off even after that review
until Cameron explicitly approves another experiment. No duplicate review job.

Twelve public metric events + two run learnings appended only through
`creative:record`: **1,012 events / 8 experiments / 37 candidates**, valid.
Prior source `39d2969a51318348333ea2ec64cbc618d88a7bc3` in the retained operator;
no executable/static/dependency changes. No creative, shortlist, package,
approval, public/Sandbox/account/Pin/catalog/site mutation, deployment, spend,
Bead or schedule change. Canonical/catalog production pins and all approvals,
receipts, policy, cohort/deadline/review state are preserved.

Same ACTIVE 09:30/16:30 Pacific task/chat. Routine distribution increments
without new native acquisition or owner action remain quiet. The next hypothesis
remains whether attributable outbound response extends beyond one dominant
product after separating rebrand/destination effects; do not start a new test.

## Local storage incident — one owner alert, measurement succeeded

The later main-based integration install failed `ENOSPC`. Only this run's
incomplete 525MB generated dependency directory was removed, without force;
it is reconstructible from the lockfile. No user project files or other
projects were cleaned. Free space recovered from 103MiB to 653MiB, but was
still only **648MiB at 16:41:55UTC**. Owner action: free local disk space before
larger dependency installs/builds. Do not pause or reschedule this task.

Evidence integration can still finish: an existing reviewed shared dependency
installation has the byte-identical integration lockfile (SHA256
`a43344f0f71170325664381c153f2d8acc8519d3a7986a15536ce56dab748381`) and
verified package versions. Read-only reuse through an ignored symlink passes
creative validation, six creative tests, 18 Pinterest tests and lint with zero
errors/warnings. The retained operator separately passes with its 25 existing
warnings. No fresh install, new build or deployment is claimed; no shared
dependency/catalog/canonical update occurred. Main source integration does not
advance the retained measurement runtime. See `host-storage-incident.json`.

The original acquisition no-op remains true. A separate validated learning
supersedes only its quiet-notification decision because host storage needs
owner action, not because of new acquisition or a provider failure.
