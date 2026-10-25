# October 25 PM — unchanged frozen-cohort measurement

Trigger `2026-10-25T23:31:29.337Z`; actual observation
`2026-10-25T23:32:34.852Z`. Complete read-only receipt:
`measurement-20261025T233234852Z.json`. Account **1107815345747925810 /
stupid_gifts / BUSINESS** verifies: 28 retained public Pins/five boards. All
original IDs, tracked links, boards and native metrics match this morning.
**No public Pin was created.** The measurement command made zero writes.

| Arm | Pins | Impressions | Pin clicks | Saves | Pinterest outbound | Attributable site sessions / retailer actions |
|---|---:|---:|---:|---:|---:|---|
| P | 6 | 1,448 | 22 | 3 | 2 | unknown / unknown |
| F | 6 | 355 | 5 | 1 | 0 | unknown / unknown |

Profile: 3,959 impressions / 60 Pin clicks / 8 saves / 2 native outbound.
Bowling has 1,395 impressions (96.34% of P), 20 opens, three saves and both
native outbound. Toast has 282 impressions (79.44% of F), three opens and one
save. Excluding each dominant product leaves P 53/2/0/0 and F 73/2/0/0
(impressions/opens/saves/outbound). No new measured acquisition evidence or
format adoption. Minimum exposure is met, not proof of a winner or attributable
site/retailer response. Actual ages/timestamps for all twelve remain in JSON.

## Bounded downstream, not inferred Pinterest conversions

- GA4 **property 507421709**, October 18–25 Pacific/current partial day:
  www.goose.gifts 627 direct sessions; stupid.gifts 41 direct + 6 amazon +
  1 not-set. Retailer events: two Stupid/direct, two Stupid/amazon and one
  Goose/direct. No Pinterest-attributed row is returned. These rows are not
  Pinterest conversions or confirmed customers. Session-level QA/operator
  exclusions cannot fully remove operator activity in an already-direct
  session; event custom traffic dimensions remain unregistered.
- PostHog **project 550427**, rolling UTC
  `2026-10-18T23:32:30.970Z`–`2026-10-25T23:32:30.970Z`: 44 page views,
  68 list views, five searches and five select-item events after campaign and
  whole-QA-identity exclusions. No attributed Pinterest/retailer row returned.
  Host/full URL/per-Pin utm_content are intentionally absent; do not infer
  host-specific sessions/per-Pin actions or equate browser IDs with sessions.
- Both reads succeeded; arm/Pin downstream and revenue remain unknown, not
  zero. Preserve historical provider gaps. Do not pool different provider
  windows, infer deduplicated people or interpret moving-window changes as
  qualified acquisition/regression. QA is delivery evidence only. No retired
  database clicks, Vercel analytics or v3/Sandbox public traffic was used.

Approved Goose links/receipts remain unchanged. The independently authorized
[path/query-preserving redirect](../../goose-redirect-2026-10-23/README.md)
verified `2026-10-24T04:50:14.849Z` remains a destination/rebrand intervention,
not a creative-format effect or acquisition proof. Old no-redirect claims are
historical. This run changes no routing, removes no holds and makes no new
destination-QA claim. Retain pre/post effects in the final review.

## Checkpoints, storage and freeze

No unresolved production publication start or newly due 24-hour receipt,
seven-day learning or 28-day lifecycle archive. Prior late observations remain
as observed, not reconstructed/repeated. Six archived lifecycles remain public;
six remain measuring. Next 28-day gate: Sheep, `2026-11-10T20:07:09.336Z`.

v11 remains P6/F6, 12 total. Review is undelivered/not due until
**2026-10-31T16:44:52.279Z**; first expected eligible normal slot October 31
16:30 Pacific / 23:30 UTC. Keep generation/posting off even afterward until
Cameron explicitly approves a next experiment. No duplicate review task.

Local Data volume had **49GiB available** at this run's initial check. This
supersedes the morning near-full condition as a current observation, without
claiming this task caused the recovery. No broad cleanup, new install attempt
or repeat storage alert. The original ENOSPC evidence remains historical.

Twelve metric events + one run learning appended only through `creative:record`:
**1,025 events / 8 experiments / 37 candidates**, valid. Source before this
run `a35f203fea74a8bf75412e56aea52d5e18f71bf7`; retained executable/static/
dependency source and canonical/catalog runtime pins are unchanged. No creative,
shortlist, package, approval, public/Sandbox/account/Pin/catalog/site mutation,
deployment, spend, Bead or schedule change. Same ACTIVE 09:30/16:30 Pacific
task/chat; healthy unchanged evidence requires no new owner alert. Next
hypothesis remains whether attributable outbound response extends beyond one
dominant product after separating destination/rebrand effects; do not start it.
