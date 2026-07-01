# Needs from Cameron (prioritized)

Living list, reviewed every run and included in every weekly check-in.
Items move to "Received" when done.

## P0 — blocking autonomous operation

### 1. Activate the daily scheduler: add two GitHub secrets (one URL, ~2 min)

claude.ai routine creation is broken (research-preview bug, confirmed
2026-07-01 even with the correct repo selected), so the durable scheduler is
now a GitHub Actions workflow — `.github/workflows/daily-ops.yml`, already
merged. It runs daily at ~6:23am ET and no-ops until two repository secrets
exist. This is the only manual step left anywhere:

Go to **https://github.com/37-Inc/goose.gifts/settings/secrets/actions** →
**New repository secret** (twice):

1. Name `ANTHROPIC_API_KEY` — create the key at
   **https://console.anthropic.com/settings/keys**. Note: this bills
   API-metered usage (separate from the claude.ai subscription); expect
   very roughly $1–5 per daily run depending on how much ships.
2. Name `VERCEL_TOKEN` — the same token already shared in chat.

Verify: Actions tab → "Daily Ops" → **Run workflow**, and watch it go.

**Subscription-billed alternative** (use instead of, or in addition):
when Anthropic fixes routine creation, create the routine per the archived
steps below — routine runs draw on the claude.ai plan rather than API
billing. Worth retrying in a week or two, and also worth trying from the
Claude **Desktop app** (Routines in the sidebar → New routine → Remote) or
`/schedule` in a local `claude` CLI, which sometimes succeed where the web
form fails.

**Until either exists**: the current session bridges with a self-re-arming
in-session daily timer. Best-effort only — it dies if the session is
deleted or its container is reclaimed.

<details>
<summary>Archived: routine creation steps (for when the bug is fixed)</summary>

1. https://claude.ai/code/routines → New routine; name `goose.gifts daily ops`.
2. Prompt: "You are the autonomous operator of goose.gifts with standing
   authorization from the owner to merge and deploy. Read
   docs/ops/RUNBOOK.md in the repository and execute today's run exactly as
   it describes."
3. Repository `37-Inc/goose.gifts` (if absent from the picker, install
   https://github.com/apps/claude on the 37-Inc org first).
4. Environment: one that has `VERCEL_TOKEN` set (claude.ai/code →
   environment settings → Environment variables), Network access **Full**.
5. Trigger: Schedule → Daily, morning. Permissions: allow unrestricted
   branch pushes. Create, then Run now to verify.

</details>

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
