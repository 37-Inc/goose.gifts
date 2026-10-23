# Stupid Gifts — Pinterest cutover and measurement restart

Owner authority, October23: finish the focused Pinterest cutover PR, then resume
the SAME task in measurement-only mode. No new creative/posting until the
October31 cohort review AND explicit approval of a next experiment. This is not
authorization to deploy the site, run catalog jobs, change provider collection,
rewrite/delete Pins or spend. Canonical and other pinned checkouts stay intact.

## Integration

- `pinterest:candidates` now reads only the current live Stupid.gifts release's
  D1 public projection joined to current verified/enriched source records.
  It verifies database identity, the actual publication receipt and stable live
  identity before/after four bounded SELECTs; no legacy Postgres/env fallback,
  product writes, merchant/model calls or catalog maintenance. Existing source
  truth/freshness/editorial quality/dedup gates remain. Future source listing
  reverification is still required; a shortlist is never creative authorization.
- New packages require canonical `https://stupid.gifts/gifts/<slug>` plus the
  existing complete exact-owner-approval/disclosure/account/state/receipt guards.
  Already public Goose packages/readbacks remain unchanged. A production dry-run
  `--destination-preview` can preview a cloned destination in memory only:
  `publishable:false`, `historicalPackageChanged:false`; no approval is recorded.
- `pinterest-studio-policy.json` is a fail-closed measurement freeze. The guarded
  API refuses production AND Sandbox create/delete before credentials/network;
  legacy generation/preparation/trial-post entrypoints are blocked too.
  `--dry-run` does not bypass delete guards. Date passage does not unlock writes.
- `pinterest:measure` verifies the production account and reads all28 retained
  IDs, explicit GA4 property507421709 and PostHog550427. Missing native metrics
  remain null through aggregation; absent per-Pin downstream attribution remains
  unknown. QA/operator campaigns/temporary identities are excluded. GA4 hosts
  are separated; PostHog intentionally lacks host/full URL/per-Pin utm_content.

## Actual evidence and remaining site boundary

Read `verification/measurement-smoke.json`, `catalog-source.json`,
`new-destination-dry-run.json`, `tagged-qa.json` and
`retained-destinations.json` (all dated actual reads, not deployment claims).

The catalog source binds to live release `existing-restore-6856584cbd6a`,
revision `stupid-restored-catalog-20261023-sql`. Latest COMPLETED enrichment is
weekly `11928e5b-6199-4f8e-8e71-9a33192b33c0`, completed
October19 15:32:09.255346UTC. The October23 failed daily canary is not freshness
credit, and this receipt does not enable the new daily writer.

All28 original Pin links exactly match their saved approved packages and all56
old/new tracked requests preserve their UTMs/path. Both domains return200 for
all28, but **200 does not necessarily mean a purchasable product**:

- 26 corresponding pages expose the same exact primary retailer product ID.
- Tube-guy Pin1107815208387817822 lands on the new site's intentional
  “Not currently in the collection” hold. It is not silently routed home.
- Dog-toy Pin1107815208387966131 has an exact new-site retailer destination
  B0FNNBK8Q6; its legacy page does not expose a directly comparable primary
  retailer link, so that comparison remains unavailable, not a guessed match.
- None of the old Goose URLs redirect to Stupid yet. Corresponding-product
  routing is a separate site-owner boundary, not falsely declared complete by
  the account/app rename. No Pins or holds were changed. Measurement can resume
  under current explicit authority while preserving this intervention caveat;
  new posting remains off regardless.

The earlier October22 sampled mini-bowling404 is superseded: that exact
Stupid.gifts page now returns200 with the correct product and preserved UTMs.
Both P/F tagged new-site QA landings and retailer actions are stored in PostHog;
F explicit page-view/retailer requests also returned GA4 204. Generic/automatic
provider collection is not per-Pin acquisition proof. The existing privacy
audit remains separate; raw browser/client identifiers are not retained here.

GA4 metadata confirms event-level custom traffic dimensions are not registered.
Its exclusion uses session campaign/medium: an existing direct/operator session
cannot be cleanly reclassified from the unregistered event traffic_campaign.
Do not label remaining direct rows as qualified customers. PostHog's explicit
campaign/QA-identity exclusion is separately verified. No collection/custom
dimension changes were made. `verification/validation.json` records the exact
38-test, lint, clean build and independent verifier acceptance at source0bdf589.

## Frozen cohort and scheduler

No new public Pin was created. v11 remains P6/F6. At the smoke read, P has
1,420impressions/22Pin clicks/3saves/2outbound; F336/5/1/0. Bowling accounts for
97.1% of P impressions. Native outbound is not attributable site/retailer
conversion; both per-arm downstream totals remain unknown. Do not adopt a
format from this interim imbalance.

Review deadline is unchanged: **2026-10-31T16:44:52.279Z**, derived from the
latest of the twelve durable successful readback receipts plus14full days.
Expected first eligible regular slot: October31 **4:30PM Pacific**. Record the
review once, including age/exposure concentration/category and rebrand effects.
No13th Pin or automatic new experiment, including after the deadline.

The same heartbeat ID `goose-gifts-pinterest-growth-studio` and target chat
`019fdd0f-a56b-7450-bb56-340333ef2ed2` retain09:30/16:30Pacific slots. The
reviewed replacement prompt is `measurement-task-prompt.txt`; actual activation
readback will be recorded after merge. A saved ACTIVE flag is not itself a
completed run: the current smoke receipt is actual read-only execution.

Retain this managed checkout as the active Pinterest measurement operator:
`/Users/cameronehrlich/.codex/worktrees/stupid-pinterest-cutover/goose.gifts`.
Do not move canonical production/catalog pins to run these tools. This operator
is still active through review, not a completed disposable implementation tree.
Central lifecycle issue remains `roadmap-lbbz1.8.1`; keep final review/destination
boundary explicit rather than creating duplicate tracking.
