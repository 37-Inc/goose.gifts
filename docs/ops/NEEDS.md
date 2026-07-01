# Needs from Cameron (prioritized)

Living list, reviewed every run and included in every weekly check-in.
Items move to "Received" when done.

## P0 — blocking autonomous operation

### 1. Daily scheduler — created, awaiting first-run credential proof

Native Codex automation `goose-gifts-daily-ops` now exists and is active:
daily 8:30 AM local/Pacific, worktree execution, cwd
`/Users/cameronehrlich/goose.gifts`, running the handoff prompt from
`docs/ops/HANDOFF.md`.

Still verify on the first scheduled run:

- `VERCEL_TOKEN` is present in the routine execution environment. The creation
  API did not expose a secret/env-var field, so this may still need Codex
  routine/environment UI setup.
- Branch push/merge permission works against `37-Inc/goose.gifts`.
- `scripts/ops/pull-env.sh` can pull production env vars and the run appends a
  journal entry.

Once that first scheduled run succeeds, mark this Received.

## P1 — needed within the first weeks

### 2. Revenue reporting access

I can optimize clicks blind, but revenue-weighting the site needs earnings
data:
- **Amazon Associates**: https://affiliate-program.amazon.com → Tools →
  Product Advertising API is already keyed; for earnings, either periodically
  export a report and drop it in the repo/an issue, or share report access.
- **Awin**: https://ui.awin.com → the existing `AWIN_API_TOKEN` may already
  cover transaction reports; I'll verify once credentials land and update
  this item.

## P2 — high value, not urgent

### 3. Google Search Console access

The SEO feedback loop (Phase 2) is guesswork without it. Easiest path:
https://search.google.com/search-console → goose.gifts property →
Settings → Users and permissions — then we set up a service-account JSON
key (I'll write exact steps when we get here) added as an env var.

### 4. Direct email/Slack channel (optional)

Weekly check-ins arrive as GitHub issues, which email you automatically. If
you'd rather get real email/Slack from me, connect a connector at
**https://claude.ai/customize/connectors** and include it in the routine.

## Received

- 2026-07-01: Full operating authorization (merge, deploy, daily autonomy,
  weekly check-ins, escalate when urgent/blocked).
