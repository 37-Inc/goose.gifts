# IndexNow — non-Google search discovery

IndexNow notifies participating engines (Bing, Yandex, Naver, Seznam, Yep, …)
that URLs are new/updated so they re-crawl sooner. **Google does not use
IndexNow** — this is a Bing/Yandex/etc. lever, complementary to the Google
Search Console workflow (`scripts/ops/gsc.sh`), never a replacement.

**Acceptance ≠ indexing.** A `200`/`202` from the endpoint is a *receipt* that the
notification was queued. It does not guarantee a crawl or an index entry.

## How it's wired

- **Key file (auth):** `public/3de14c33ab144ad969b54c5ca35366e3.txt` — a public
  file at the site root whose contents equal its filename (the IndexNow
  convention). Engines fetch it to verify we own the host. There is no secret.
- **Submission tool:** `scripts/ops/indexnow-submit.mjs`
  (`npm run indexnow:submit`). It auto-discovers the key file, so nothing drifts
  if the key rotates.
- **Single endpoint:** submits to `https://api.indexnow.org/indexnow`, which
  distributes the notification to all participating engines. We do **not** run
  separate Bing/Yandex senders (that would double-submit).
- **Canonical-only guard:** URLs are sourced from the live sitemap by default and
  every URL is validated to be `https://www.goose.gifts/…` and not an
  `/api` or `/admin` route, then deduped. Admin/API/preview/non-canonical URLs
  can never be submitted.

## Usage

```bash
npm run indexnow:submit                 # submit ALL sitemap URLs (initial seed)
npm run indexnow:submit -- --dry-run    # print the payload, send nothing (rehearsal)
npm run indexnow:submit -- --url https://www.goose.gifts/gift-guides/funny-golf-gifts
npm run indexnow:submit -- --url <u> --url <u>        # only specific changed URLs
npm run indexnow:submit -- --endpoint https://www.bing.com/indexnow   # target one engine
```

**Guardrail:** seed once, then submit only URLs that were **created, materially
updated, or deleted**. Do NOT wire this to fire the entire sitemap on every
deploy — that looks like spam to the engines and wastes the signal.

## Rollback / disable

- This is a **manual, on-demand** tool. Nothing runs it automatically, so
  "disabling" is simply not invoking it. `--dry-run` never contacts any engine.
- To turn IndexNow off entirely, remove the key file `public/<key>.txt`;
  submissions then fail the engine-side key check.

## Log

- **2026-07-17** — Initial seed: all 47 sitemap URLs submitted via
  `api.indexnow.org` → **HTTP 202 accepted**. First IndexNow notification for the
  domain. Key file verified live (`200 text/plain`). (Beads `roadmap-uz2t`.)

## Still owner actions (not required for IndexNow itself)

`roadmap-uz2t` also covers verifying the `www.goose.gifts` property in **Bing
Webmaster Tools** and **Yandex Webmaster** and submitting the sitemap there for
coverage diagnostics. Those need portal logins and are separate from the
key-file-based IndexNow submission above (which needs no engine account).
