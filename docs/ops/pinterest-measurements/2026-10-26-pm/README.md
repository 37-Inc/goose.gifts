# October 26 PM — acquisition unchanged; reviewed operator recovered

Trigger `2026-10-26T23:31:15.148Z`; actual observation
`2026-10-26T23:32:09.721Z`. Complete read-only receipt:
`measurement-20261026T233209721Z.json`. Account **1107815345747925810 /
stupid_gifts / BUSINESS** verifies: 28 retained public Pins/five boards.
All original IDs, tracked links and boards match the last durable October 25 PM
receipt. **No public Pin was created.** Measurement command writes: zero.

| Arm | Pins | Impressions | Pin clicks | Saves | Pinterest outbound | Attributable site sessions / retailer actions |
|---|---:|---:|---:|---:|---:|---|
| P | 6 | 1,451 | 22 | 3 | 2 | unknown / unknown |
| F | 6 | 359 | 5 | 1 | 0 | unknown / unknown |

Since the last durable receipt: P +3 impressions, F +4; all v11 native actions
unchanged. Profile: 4,010 impressions / 63 Pin clicks / 8 saves / 2 outbound;
the three new Pin opens are on pre-v11 cat-brush/Shark Pins, not site acquisition.
Bowling has 1,396 impressions (96.21% of P), 20 opens, three saves and both native
outbound. Toast has 283 impressions (78.83% of F), three opens and one save.
Without those products P is 55/2/0/0 and F 76/2/0/0 (impressions/opens/saves/
outbound). Minimum exposure is met, not proof of a winner. Actual per-Pin ages
are saved; no unavailable equal-age history is reconstructed.

## Bounded downstream, not inferred Pinterest conversions

- GA4 **property 507421709**, October 19–26 Pacific/current partial day:
  www.goose.gifts 459 direct sessions/four engaged. stupid.gifts: 43 direct/nine
  engaged; nine amazon/(not set)/six engaged; two not-set/none engaged; two
  amazon/blank-medium/one engaged. Retailer events: two Stupid/direct, two
  Stupid/amazon and one Goose/direct. No Pinterest-attributed row returned.
  These are not Pinterest conversions or confirmed customers. Session-level
  QA filters cannot fully exclude operator activity in an already-direct
  session; event custom traffic dimensions remain unregistered.
- PostHog **project 550427**, rolling UTC
  `2026-10-19T23:32:05.643Z`–`2026-10-26T23:32:05.643Z`: 48 page views,
  72 list views, five searches and five select-item events after campaign and
  whole-QA-identity exclusions. Attribution query returned no row. Host/full
  URL/per-Pin utm_content are intentionally absent; no host-specific sessions,
  per-Pin actions or browser-ID-as-session claims.
- Both reads succeeded. Per-arm/Pin downstream and revenue remain unknown,
  not zero. Earlier provider gaps remain gaps. Do not pool moving windows or
  infer deduplicated people, qualified acquisition or regression. QA is
  delivery evidence only. No retired DB/Vercel or public v3/Sandbox evidence.

Approved Goose links/receipts are unchanged. The independently authorized
[path/query-preserving redirect](../../goose-redirect-2026-10-23/README.md)
verified `2026-10-24T04:50:14.849Z` is a destination/rebrand intervention,
not a format effect or acquisition receipt. No routing/hold/Pin mutation or
new destination-QA claim occurred here.

## Checkpoints, local recovery and freeze

No unresolved production publication start or newly due 24-hour receipt,
seven-day learning or 28-day archive. Previous late observations retain their
actual times. Six archived lifecycles remain public; six October members remain
measuring. Next 28-day gate: Sheep, `2026-11-10T20:07:09.336Z`.
See `checkpoint-audit.json`; no final review delivery or lifecycle changed.

The required operator directory was missing at PM start although its task
artifact still said active. Git confirmed both local/remote retained branch at
`be034bfd237d752fb16b70baa107d48f60de2b89`, not registered in any worktree.
Restored that exact source at the same required path and reattached it. Cause
of removal is unverified. No reset, canonical/catalog update, source advancement,
credential change or fresh dependency installation. Measurement and focused
tests then succeeded. Read-only shared tsx loader was used explicitly for
retained Pinterest tests; no mismatched dependency tree was linked.
The interrupted AM attempt has no durable captured result and is not claimed
complete or backfilled. See `operator-recovery.json`. Local Data volume had
61GiB free at the later storage check; recovery is not attributed to this task.

Twelve public metric observations plus one run learning appended through
`creative:record`: **1,038 events / 8 experiments / 37 candidates**, valid.
No creative, shortlist, package, approval, public/Sandbox/account/Pin/catalog/
site mutation, deployment, spend, Bead or schedule change. Canonical/catalog
pins, approvals, receipts, policy, cohort/deadline and review-delivery state
remain unchanged. Same ACTIVE 09:30/16:30 Pacific task/chat.

Full review remains undelivered/not due until **2026-10-31T16:44:52.279Z**;
first expected eligible normal slot October 31 16:30 Pacific / 23:30 UTC.
Generation/posting stay off even afterward until Cameron explicitly approves
a new experiment. No duplicate review job. Next hypothesis remains whether
attributable response extends beyond one dominant product after separating
rebrand/destination effects; do not start it. Healthy routine observations and
successful local recovery require no owner action or new alert.

## Evidence integration, not runtime advancement

[PR #293](https://github.com/37-Inc/goose.gifts/pull/293) carries only run
docs/evidence/events. Retained receipt commit
`9c89e899d25a5267fb63e40f4aaec70c13272606`; main-based receipt commit
`c7164901e650477f0dd8925ea95375fc6c1e18ff` preserves complete upstream dated log
entries. Protected runtime/dependency/package/policy/cohort/receipt diff against
upstream `7da8b438db26723a014a91bcd4622ab37ea30136` is empty.
Main-based creative validation, six creative tests, 18 Pinterest tests and lint
(zero errors/warnings) pass using existing reviewed shared dependencies read-only,
after exact lock SHA256
`a43344f0f71170325664381c153f2d8acc8519d3a7986a15536ce56dab748381`
and installed-version checks. No fresh install, new build/deployment, hosted CI
or full-suite acceptance claimed. Upstream catalog/UI/indexing work belongs to
separate operators; it was neither executed here nor adopted into retained
measurement runtime. Canonical and catalog pins remain untouched.
