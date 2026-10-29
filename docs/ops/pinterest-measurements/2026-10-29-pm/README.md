# October 29 PM — unchanged native Pinterest evidence

Trigger `2026-10-29T23:28:04.179Z`; actual snapshot
`2026-10-29T23:28:26.510Z`. Full read-only receipt:
`measurement-20261029T232826510Z.json`. Account
**1107815345747925810 / stupid_gifts / BUSINESS**, 28 retained public Pins and
five boards verified. Every Pin metric, original ID, approved tracked link and
board matches AM. **No public Pin was created.** Measurement command writes: zero.

| Arm | Pins | Impressions | Pin clicks | Saves | Pinterest outbound | Attributable site sessions / retailer actions |
|---|---:|---:|---:|---:|---:|---|
| P | 6 | 1,489 | 23 | 3 | 2 | unknown / unknown |
| F | 6 | 374 | 5 | 1 | 0 | unknown / unknown |

Profile remains 4,216 impressions / 64 Pin clicks / 9 saves / 2 native outbound.
Bowling: 1,409 impressions, 20 Pin clicks, three saves and both outbound,
94.63% of P exposure. Toast: 289 impressions, three Pin clicks and one save,
77.27% of F exposure. Without those dominant Pins: P 80 / 3 / 0 / 0,
F 85 / 2 / 0 / 0 (impressions / Pin clicks / saves / outbound).
No demonstrated acquisition or format winner; minimum exposure is not proof.
Actual ages are retained in raw JSON, without reconstructed equal-age history.

## Downstream evidence stays separate

- GA4 **property 507421709**, October 22–29 Pacific/current partial day:
  stupid.gifts 53 direct sessions / 15 engaged, 12 amazon-not-set / 10 engaged,
  one not-set / none; www.goose.gifts one direct / one engaged. Retailer event
  rows: eleven Stupid/direct plus two Stupid/amazon. No Pinterest row. Remaining
  direct/operator sessions are not confirmed people, customers or Pinterest
  conversions; event traffic custom dimensions are unregistered.
- PostHog **project 550427**, rolling UTC
  `2026-10-22T23:28:23.032Z`–`2026-10-29T23:28:23.032Z`:
  66 page views, 83 list views, 16 select-item events, one search and eleven
  retailer events. Retailer sources: ten chatgpt.com / empty campaign plus one
  www.google.com / empty campaign; no Pinterest row. Campaign and whole-QA-
  identity exclusions apply, but untagged operator activity can remain.
- Both reads succeeded. Different moving windows/provider semantics and
  historical gaps are explicit. Do not pool providers, call changing aggregates
  a same-window trend or causal migration effect, or equate events with acquired
  people or sales. PostHog omits host, full URL and per-Pin utm_content; do not
  infer host-specific sessions or map events onto GA4 or particular Pins/arms.
  Arm/Pin sessions, retailer actions and revenue remain **unknown, not zero**.
  QA, retired DB/Vercel and v3/Sandbox are not acquisition evidence.

Original Goose packages/links and publication receipts are unchanged. The
independent [path/query-preserving redirect](../../goose-redirect-2026-10-23/README.md),
verified `2026-10-24T04:50:14.849Z`, remains a destination/rebrand intervention,
not format or acquisition proof. No routing changes, new destination-QA claim,
Pin rewrite or hold removal.

## Checkpoints, retained operator and freeze

No unresolved publication start or newly due v11 24-hour, seven-day or 28-day
checkpoint. All six October seven-day learnings retain honest late timestamps.
Six older lifecycles remain archived/public and six October members measuring.
Next 28-day gate: Sheep, `2026-11-10T20:07:09.336Z`.
See `checkpoint-audit.json`. No lifecycle change or invented exact-age history.

The reviewed operator exists and its prior Git lock is read back. No recovery,
new guard or instruction change this run. The AM
[missing-files recovery](../2026-10-29-am/operator-recovery.json) is historical;
remover/cause remain unverified, not claimed fixed. Retain operator/lock until
explicit owner cleanup approval. Healthy availability does not prove every
removal mechanism prevented, but requires no repeat alert. 14 GiB free; no
cleanup or dependency installation.

Twelve metrics plus run learning through `creative:record` only:
**1,118 events / 8 experiments / 37 candidates**, valid. Source before run:
`008cb41f64e7888e15586736ce3662aefe608040`. Six creative and 18 Pinterest
focused tests pass with explicit shared tsx loader read-only. Runtime,
dependencies, packages, receipts, policy, operating instructions, cohort and
deadline/review state stay unchanged. Canonical/catalog pins are not moved.

Same ACTIVE 09:30/16:30 Pacific task/chat. Review remains undelivered/not due until
**2026-10-31T16:44:52.279Z**, expected first eligible normal slot October 31,
16:30 Pacific / 23:30 UTC. Keep generation/posting off afterward until explicit
next-experiment approval. No creative, shortlist, package, approval, public/Sandbox
write, account/Pin/catalog/site mutation, deployment, spend, Bead or schedule change.
Next hypothesis remains attributable Pinterest response beyond one dominant product,
separating destination/rebrand effects; do not start it. Routine unchanged evidence
stays quiet.
