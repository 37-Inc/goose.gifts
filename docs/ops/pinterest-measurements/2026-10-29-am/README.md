# October 29 AM — measurement completed after locked-checkout recovery

Trigger `2026-10-29T16:34:28.230Z`; actual snapshot
`2026-10-29T16:35:45.617Z`. Full read-only receipt:
`measurement-20261029T163545617Z.json`. Production account
**1107815345747925810 / stupid_gifts / BUSINESS**, 28 retained public Pins and
five boards verified. All IDs, approved tracked links, boards and native action
counts match the prior PM. **No public Pin was created.** Command writes: zero.

| Arm | Pins | Impressions | Pin clicks | Saves | Pinterest outbound | Attributable site sessions / retailer actions |
|---|---:|---:|---:|---:|---:|---|
| P | 6 | 1,489 | 23 | 3 | 2 | unknown / unknown |
| F | 6 | 374 | 5 | 1 | 0 | unknown / unknown |

Since prior PM: +16 P / +5 F impressions, no native action changes across all
28 Pins. Profile: 4,216 impressions / 64 Pin clicks / 9 saves / 2 native outbound
(+83 impressions). Bowling's 1,409 impressions supply 94.63% of P exposure and
both outbound clicks; Toast's 289 supply 77.27% of F. Excluding those dominant
Pins gives P 80 / 3 / 0 / 0 and F 85 / 2 / 0 / 0
(impressions / Pin clicks / saves / outbound). No demonstrated acquisition or
format winner. Ages are actual receipt-derived ages, not reconstructed equal-age
history; the minimum exposure gate is not proof of superiority.

## Bounded downstream evidence

- GA4 **property 507421709**, October 22–29 Pacific, current day partial:
  stupid.gifts 51 direct sessions / 13 engaged, 12 amazon-not-set / 10 engaged,
  one not-set / none; www.goose.gifts one direct / one engaged.
  Retailer event rows: eight Stupid/direct plus two Stupid/amazon. No Pinterest
  row. These are not confirmed people, customers, or Pinterest conversions.
  Existing direct-session operator activity can remain; event traffic custom
  dimensions are unregistered.
- PostHog **project 550427**, rolling UTC
  `2026-10-22T16:35:39.257Z`–`2026-10-29T16:35:39.257Z`:
  69 page views, 95 list views, 15 select-item events, five searches and eleven
  retailer events. Retailer sources: ten chatgpt.com / empty campaign plus one
  www.google.com / empty campaign; no Pinterest row. Campaign and whole-QA-
  identity exclusions apply; untagged operator activity can remain.
- Both reads succeeded. Different moving windows/provider semantics and
  historical gaps stay explicit; falling or rising aggregates are not a
  same-window trend or causal migration effect. Do not pool providers or call
  event counts acquired people or sales. PostHog omits host, full URL and per-Pin
  utm_content: do not infer host-specific sessions, map rows onto GA4, or assign
  arm/Pin actions. Arm/Pin sessions, retailer actions and revenue remain
  **unknown, not zero**. QA, retired DB/Vercel and v3/Sandbox are not acquisition.

Original approved Goose packages and links remain unchanged. The independent
[path/query-preserving redirect](../../goose-redirect-2026-10-23/README.md),
verified `2026-10-24T04:50:14.849Z`, is a destination/rebrand intervention,
not format or acquisition proof. No routing changes, fresh destination-QA claim,
Pin rewrites or hold removal occurred.

## Third missing-files recurrence — existing lock did not prevent it

At discovery the exact required checkout directory was absent, **but its Git
registration, saved clean index, branch and prior active-operator lock remained**.
Local and remote refs matched `61ae5a0e80db6251399f5b5c61d0c29a2a35ab8a`.
Recreated only the missing checkout at the same required path from that revision,
reusing its retained administrative directory; reattached the same task. No
unlock, prune, reset, runtime advancement or credential change. The lock was
retained/read back, not newly created. See `operator-recovery.json`.

Canonical `/Users/cameronehrlich/goose.gifts` now resolves via a symlink to
`/Users/cameronehrlich/stupid.gifts`; its source remains pinned at `063d9a3`.
That alias is observed context, **not proof of removal cause**. Catalog remains
`628707b`. Remover, exact removal time and root cause are unknown. The ordinary
Git lock does not stop arbitrary filesystem deletion; this recurrence was not
prevented. Do not claim the cleanup problem fixed. Owner notice: exclude the
active operator from filesystem-based cleanup too, and retain it/its lock until
explicit owner cleanup approval. No new filesystem protections or schedule changes.
14 GiB free at check; no broad cleanup or dependency installation.

## Checkpoints and freeze

No unresolved production publication start or newly due v11 24-hour, seven-day or
28-day checkpoint. All six October seven-day learnings exist with honest late
timestamps. Six older lifecycles remain archived/public, six October members
measuring; next 28-day gate is Sheep, `2026-11-10T20:07:09.336Z`.
See `checkpoint-audit.json`. No lifecycle change or invented exact-age history.

Twelve metrics plus run/recovery learnings through `creative:record` only:
**1,105 events / 8 experiments / 37 candidates**, valid. Six creative and
18 Pinterest focused tests pass with the explicit shared tsx loader read-only.
Runtime, dependencies, approved packages, receipts, policy and cohort ledger
are unchanged. Studio documentation records the incident, not a new guard.

Same ACTIVE 09:30/16:30 Pacific task/chat. Review remains undelivered/not due until
**2026-10-31T16:44:52.279Z**; expected first eligible normal slot October 31,
16:30 Pacific / 23:30 UTC. Generation/posting remain off afterward until explicit
next-experiment approval. No creative, shortlist, package, approval, public/Sandbox
write, account/Pin/catalog/site mutation, deployment, spend, Bead or schedule change.
Next hypothesis remains whether attributable Pinterest response extends beyond a
single dominant product, separating destination/rebrand effects; do not start it.

Evidence integration: [PR #299](https://github.com/37-Inc/stupid.gifts/pull/299),
retained receipt `96a3af5c15ae050619dd90d7afcece6a77b39190`, main-based receipt
`6ac19c86f707b330e0b6a81f2ec295a33ac2cd75` against upstream `82e565b`.
Main-based log validation (1,105 events), six creative/18 Pinterest tests,
lint zero errors/warnings and diff check pass. Exact-lock shared dependencies
reused read-only, no install. Only evidence and dated operational documentation
changed; source, packages, policy, receipts and cohort remain unchanged. This is
not runtime advancement, a new build, hosted CI acceptance or site publication.
See `validation.json`.
