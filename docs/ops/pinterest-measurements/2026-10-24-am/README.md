# October 24 AM — frozen-cohort measurement-only run

Trigger: `2026-10-24T16:32:32.872Z`. Actual snapshot:
`2026-10-24T16:33:54.943Z`. The complete `pinterest:measure` receipt is
`measurement-20261024T163354943Z.json`. Account **1107815345747925810 /
stupid_gifts / BUSINESS** verifies, with 28 retained public Pins and five
boards. Native profile totals are 3,894 impressions / 60 Pin clicks / 8 saves /
2 outbound clicks. The command made zero writes. **No public Pin was created.**

| Arm | Public Pins | Impressions | Pin clicks | Saves | Pinterest outbound | Attributable site sessions / retailer actions |
|---|---:|---:|---:|---:|---:|---|
| P | 6 | 1,441 | 22 | 3 | 2 | unknown / unknown |
| F | 6 | 353 | 5 | 1 | 0 | unknown / unknown |

Since October 23 PM, only native distribution increased: P +21 impressions,
F +17. There are no new Pin clicks, saves or outbound clicks. Both outbound
clicks remain on mini bowling, not corroborated site/retailer conversions.
Bowling has 1,390 impressions (96.46% of P), 20 Pin clicks, three saves and both
outbound clicks. Toast has 280 impressions (79.32% of F), three clicks and one
save. Excluding each dominant Pin leaves P 51/2/0/0 and F 73/2/0/0
(impressions/clicks/saves/outbound). Exposure minima are met, but this is not
proof of a format winner or a basis for early adoption.

All twelve public IDs, ages, successful receipt times, boards and approved
destinations are in the JSON. The full-cohort review is not due or delivered;
deadline remains **2026-10-31T16:44:52.279Z**, with first expected eligible normal
slot October 31 at 16:30 Pacific. Keep posting and generation off afterward
until Cameron explicitly approves a next experiment.

## Downstream evidence and destination intervention

- GA4 **property 507421709**, October 17–24 Pacific calendar dates/current day
  partial: www.goose.gifts 641 direct + 1 not-set sessions; stupid.gifts 35
  direct + 6 amazon + 1 not-set. Retailer events are four Stupid (two direct,
  two amazon) and one Goose/direct. No Pinterest-attributed row is returned.
  These unassigned rows are not Pinterest conversions or confirmed customers.
  Session-level exclusions cannot guarantee removal of operator events in an
  already-direct session; event traffic custom dimensions remain unregistered.
- PostHog **project 550427**, rolling UTC
  `2026-10-17T16:33:51.305Z`–`2026-10-24T16:33:51.305Z`: 42 page views,
  68 list views, six searches and three select-item events after campaign and
  whole-QA-identity exclusions. No attributed Pinterest/retailer row is returned.
  The read succeeded; the earlier 504 remains a historical gap. Host/full URL/
  per-Pin utm_content are intentionally absent, so host or per-Pin actions cannot
  be inferred. Browser identities are not sessions. Missing downstream stays
  null/unknown, not zero. No retired database/Vercel analytics was queried.
- Do not pool these distinct provider windows or infer a same-window trend
  from changing windows. Tagged QA is delivery evidence, not acquisition.
- Approved Goose Pin links have not been rewritten. The independently
  owner-authorized [Cloudflare redirect intervention](../../goose-redirect-2026-10-23/README.md)
  was fully verified at `2026-10-24T04:50:14.849Z`, preserving path/query to
  Stupid across apex/www and HTTP/HTTPS. Current measurement follows that
  intervention; October 23 PM preceded it. Prior claims of no redirect are
  historical, not current. Separate destination/rebrand changes from format in
  the review. Redirect QA is not acquisition; tube-guy remains intentionally held.

## Receipt and checkpoint audit

There are no unresolved production publication starts. No new 24-hour receipt
is pending. Six older v11 creative lifecycles are already archived but remain
public cohort members. No new 28-day lifecycle archive is due.

Opossum's seven-day gate was `2026-10-23T23:36:45.613Z`. This actual snapshot is
**61,029,330ms late**, with four impressions and no native actions. A validated
candidate learning records that current lifetime observation, not invented
exact-age history. Its prior scheduled snapshot was before the gate.

Hat's gate is `2026-10-24T16:44:52.279Z`, **657,336ms after this snapshot**. It
is not closed early, even if evidence recording finishes after the gate. Use a
later actually eligible scheduled observation; no artificial catch-up fetch.

Twelve public metric events, one candidate learning and one run learning were
appended only through `creative:record`: **984 events / 8 experiments /
37 candidates**, valid. Original approved packages, publication receipts,
cohort/deadline/review state and measurement-only policy are unchanged.

Source before this run: `639afd19622a98c23601f2018579b0fb612d5a91` in the
dedicated reviewed operator. This run changes only docs/evidence/events; it
does not advance the retained executable implementation or separately pinned
canonical/catalog checkouts. No creative, shortlist, approval, public/Sandbox
write, account/Pin/catalog/site mutation, deployment, spend, Bead mutation or
schedule change. Same ACTIVE task/cadence; routine unchanged acquisition
evidence requires no owner alert. Next hypothesis remains whether future
attributable outbound actions persist beyond the single dominant product;
do not start another test before review and explicit authorization.

Evidence integration: [PR #277](https://github.com/37-Inc/goose.gifts/pull/277),
retained-operator commit `434b85df7445434b227a7838ce38fbdf21c5aefb`.
A separate main-based temporary integration checkout preserves both complete
dated log entries during conflict resolution; it is not the measurement
operator and does not advance that operator's executable code. Its fresh
locked dependency install, creative validation, 6 creative tests, 18 Pinterest
tests and lint (zero errors/25 pre-existing warnings) also pass. No hosted CI
checks are configured for this PR; local gates and exact readbacks are the
evidence, not a claimed CI or production build.
