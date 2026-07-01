# Needs from Cameron (prioritized)

Living list, reviewed every run and included in every weekly check-in.
Items move to "Received" when done.

## P0 — blocking autonomous operation

### 1. Create the daily Routine (the thing that wakes me up)

I cannot create scheduled routines from inside a session — only you can, from
your claude.ai account. This is the mechanism that runs me daily.

1. Go to **https://claude.ai/code/routines** → **New routine**.
2. Name: `goose.gifts daily ops`.
3. Prompt (paste exactly):
   > You are the autonomous operator of goose.gifts with standing
   > authorization from the owner to merge and deploy. Read
   > docs/ops/RUNBOOK.md in the repository and execute today's run exactly
   > as it describes.
4. Repository: `37-Inc/goose.gifts`.
5. Environment: pick the same environment this session uses (or Default),
   after doing item 2 below so it has the credentials. Set **Network
   access** to **Full** (the ingestion pipeline needs to reach the
   database, OpenAI, Amazon/Etsy/Awin, and the live site).
6. Trigger: **Schedule → Daily**, pick a morning time.
7. Under **Permissions**, enable **Allow unrestricted branch pushes** for
   `37-Inc/goose.gifts` (lets me manage branches and merge cleanly).
8. Create, then hit **Run now** once to verify it works end-to-end.

Note: routine runs count against your claude.ai plan's usage/daily routine
caps — visible at https://claude.ai/settings/usage.

### 2. Add production credentials to the cloud environment

The session environment currently has **zero** credentials — I can't read
analytics, run the ingestion pipeline, or test against real data without
them. They already exist in Vercel, so this is copy-paste:

1. Open **https://vercel.com** → the goose.gifts project → **Settings →
   Environment Variables** (reveal + copy values).
2. Go to **https://claude.ai/code**, open the environment selector (the
   environment name near the repo picker), hover the environment → settings
   icon → **Environment variables**. Paste in `.env` format (`KEY=value`,
   one per line, no quotes):

```
POSTGRES_URL=
OPENAI_API_KEY=
GOOGLE_SEARCH_API_KEY=
GOOGLE_SEARCH_ENGINE_ID=
ETSY_API_KEY=
AWIN_PUBLISHER_ID=
AWIN_API_TOKEN=
AWIN_ADVERTISER_ID=
AMAZON_ASSOCIATE_TAG=
AWS_ACCESS_KEY_ID=
AWS_SECRET_KEY=
ADMIN_PASSWORD=
ADMIN_SESSION_SECRET=
NEXT_PUBLIC_BASE_URL=https://www.goose.gifts
```

Skip any that don't exist in Vercel; I'll work with what's there and flag
gaps. Heads-up from Anthropic's docs: there is no dedicated secrets store
yet — environment variables are visible to anyone who can edit the
environment (that's just you here).

## P1 — needed within the first weeks

### 3. Vercel API token (deploy monitoring)

Lets me check deploy status/logs and roll back bad deploys instead of
inferring from the live site. Create at **https://vercel.com/account/tokens**
(scope: the goose.gifts project) and add as `VERCEL_TOKEN=` to the same
environment variables.

### 4. Revenue reporting access

I can optimize clicks blind, but revenue-weighting the site needs earnings
data:
- **Amazon Associates**: https://affiliate-program.amazon.com → Tools →
  Product Advertising API is already keyed; for earnings, either periodically
  export a report and drop it in the repo/an issue, or share report access.
- **Awin**: https://ui.awin.com → the existing `AWIN_API_TOKEN` may already
  cover transaction reports; I'll verify once credentials land and update
  this item.

## P2 — high value, not urgent

### 5. Google Search Console access

The SEO feedback loop (Phase 2) is guesswork without it. Easiest path:
https://search.google.com/search-console → goose.gifts property →
Settings → Users and permissions — then we set up a service-account JSON
key (I'll write exact steps when we get here) added as an env var.

### 6. Direct email/Slack channel (optional)

Weekly check-ins arrive as GitHub issues, which email you automatically. If
you'd rather get real email/Slack from me, connect a connector at
**https://claude.ai/customize/connectors** and include it in the routine.

## Received

- 2026-07-01: Full operating authorization (merge, deploy, daily autonomy,
  weekly check-ins, escalate when urgent/blocked).
