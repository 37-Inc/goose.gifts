# Stupid Gifts — Catalog Care

This is the active contract for the existing `goose-gifts-daily-ops` Codex task.
Current work is tracked in `~/roadmap`, especially `roadmap-lbbz1.4.3`.
Historical migration/recovery instructions are archived in
`archive/RUNBOOK_MIGRATION_2026-10-23.md`; they are not routine commands.

## What must stay true

- Release only to **Cloudflare stupid.gifts**, on **Free**. Never deploy to
  Vercel or reconnect its Git integration. Keep the old Goose/Neon rollback.
- Preserve all 3,383 migrated identities, stable URLs, original content and
  history. The restored baseline has 2,359 public gifts and 1,024 intentional
  curation holds. Do not promote holds indiscriminately or delete/deactivate
  products or native vectors because a supplier refresh deadline elapsed.
- Existing owner-cleared images/descriptions have no expiry. Keep them. Only
  genuinely finite supplier overlays use their original deadlines; their expiry
  falls back to the cleared listing, not catalog removal.
- Public identity: Stupid Gifts / Thirty Seven Inc. No personal-name bylines;
  contact `goosegifts@37.technology`. Weird Gift Index stays retired.
- Keep the canonical Amazon tag `goose-gifts-37-20`. Never fabricate current
  prices/availability. Public offers remain price-free; use the retailer link.
- No social posts, Slack messages, paid upgrades, new hosted job or creator-
  research integration from this task. Pinterest remains separately paused.

## Cadence and costs

Use this one task, daily at 08:30 Pacific. Reserve at most ten existing products
per Pacific day across retries. Monday additionally uses six rotating discovery
themes and admits at most twenty quality/dedup-approved new gifts. Tuesday–Sunday
make no external model calls. Reuse unchanged approved copy and embeddings.
The homepage's featured IDs feed the existing freshness selector; do not force
the same ten legacy books every day or add a blanket enrichment/backfill pass.

The routine uses an explicit, measured 5,000-HTTP / 12,000-SQL /
1.5M-reported-read / 30k-reported-write ceiling, plus conservative uncertain-cost
and untouched shared-account reserves. These are internal safeguards, not
Cloudflare's pricing tiers. The operator checks account-wide usage before work
and again before publication. Stop rather than upgrade if Free capacity is low.
Never reset immutable counters, erase unknown costs, or buy another merchant
batch after a failure.

## Operator

**Live validation accepted, October23.** Release
`recorded-canary-20261023-f731dd58` is live, with exact receipt, resolved build,
idle owner and desktop/mobile QA verified. See
`evidence/2026-10-23-catalog-care-accepted.json` for actual task-installation
state and evidence; an ACTIVE timer alone is never proof of writer readiness.

The retained execution checkout is
`/Users/cameronehrlich/.codex/worktrees/stupid-catalog-care/goose.gifts`.
It uses the reviewed runtime from PR269 plus documentation-only closeout commits.
Keep the historical canary checkout unchanged. Never blindly pull or republish
an older runtime over a newer live release; integrate/test genuine code changes
deliberately before switching the operator.

The maintained entry point is `scripts/catalog/daily-operator.mjs` (`catalog:care`),
not a growing collection of manually patched private helper copies. It discovers
its own clean Git source, then pins that source and immutable daily inputs before
dispatch. Keep that checkout unchanged while a run is in progress.

Use Node 22 with a scrubbed environment and the existing private workspace:

```sh
env -i HOME="$HOME" PATH="/Users/cameronehrlich/.nvm/versions/node/v22.23.1/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin" npm run catalog:care -- prepare
```

Run `start`, then `review`, then `publish <proposalSha256>` with the same prefix.
`status` is diagnostic. A recorded reservation means stop or resume the existing
run—not fetch again. Review is the scheduled agent checking the actual bounded
changes, not an owner approval request. The normal publisher retains its lock,
transaction receipts, restart safety and deployment verification.

Credentials come only from the existing reviewed Wrangler OAuth / Goose Keychain
references. Never log their values, change ACLs or fall back to ambient credentials.
If access fails, stop and request the exact attended credential approval needed.

After supplier-body retention deadlines, use the repository's registered workspace
cleanup with its exact original repository binding. Preserve minimal controls,
sealed successors, locks, historical receipts and all charged/unknown requests.
Cleanup never deletes catalog products or invents a new deadline. Historical
run-specific readers remain retained; do not replay completed migration helpers.

## What to review and verify

1. Inspect `git status`, current Beads and the newest journal entry. Preserve
   unrelated work. Do not start if a previous publication still owns the scope.
2. Run the operator's preparation and reserved maintenance. Confirm the exact
   selected cohort, counts and failures; no additional fetch after failure.
3. Inspect the review summary. Existing permanent listings/images/descriptions
   must remain. Review genuinely changed copy for factual quality, not more puns.
   Generic discoveries and duplicates stay held. A missing/unknown native entry
   is not a reason to queue a speculative delete or ask the owner for a label.
4. Publish that exact proposal. Confirm `state: finalized`, the actual D1
   publication receipt, resolved build and idle owner. Maintenance success alone
   is not publication. The operator records the accepted successor for next run.
5. Read the live `/.well-known/catalog-release.json`, homepage, a changed product,
   search, Load more and one affiliate destination. Check original content and
   the tag. Do not announce success from a cache 200 or merge alone.
6. Keep routine receipts in the protected care directory and reconcile Beads
   when the operating state materially changes. Do not dirty the retained
   execution checkout with daily log commits. Release-level journal/docs edits
   use a separate reviewed branch. Healthy maintenance and skips stay quiet;
   report material catalog changes, failures or exact required owner action.

## Site quality and code changes

The homepage leads with reviewed physical oddities, then quality/diversity-ranked
static batches. All public gifts remain reachable through Load more and product
URLs. Short factual card labels let the objects carry the joke; full original
descriptions remain on detail pages and in the dataset.

Search uses the published cleared catalog in Worker memory when all products have
permanent views, avoiding D1 query/diagnostic costs for that path. Semantic search
remains off until its full index is genuinely ready; do not call lexical matching
semantic parity or enable a near-empty native index. GA4/PostHog retain explicit
privacy-safe product/search events. No paid analytics or per-query generation.

For code changes: use an isolated branch, review/simplify the diff, run focused
tests, both strict typechecks, lint, security audits and an explicit-context static
build. Keep synthetic build outputs outside the retained execution checkout, or
archive only your own reproducible QA output before publication. Never adopt or
remove another run's registered output. Include new regressions in the normal gate. Browser-check desktop
and mobile, loading/empty/error states and history/clear behavior. Open/review/merge
one logical PR, publish through the normal Cloudflare contract and live-verify.
Keep source integration separate from production publication in every status.
