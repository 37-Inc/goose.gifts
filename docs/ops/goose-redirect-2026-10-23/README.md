# Goose Gifts → Stupid Gifts domain redirects

Cameron asked this Pinterest/growth thread to take over the existing redirect
migration Beads and implement equivalent-URL redirects. Domains are the existing
`goose.gifts` / `www.goose.gifts` → `https://stupid.gifts`, not newly registered
`.com` names. No Pinterest mutation, catalog job, new-site deployment, provider
deletion, repository rename, renewal change or spend is included.

## Provider change and readback

Cloudflare account `7f05a1dcb6e16f9c239564a0293bbe74` /37.technology, zone
`ef6d3c7ffcd1943a80ff18d8fd197e29` /goose.gifts, Free. The ambient CLI token
could not see these zones; scrubbed CLI had no token. No permissions were
expanded. The already signed-in owner Chrome37 dashboard was used instead.

The reviewed rule in `redirect-rule.json` was accepted by UI validation and
deployed first. It matches ONLY the apex and www hosts, returns301 to the exact
HTTPS Stupid path and preserves query strings. The pre-existing301 sitemap
cleanup rule (`a673acb1b1ba47569b213780657b4407`) is retained as the second rule.
The apex A record's proxy flag was enabled without changing `216.198.79.1`;
www remains proxied with CNAME `26e4789c6f2426bd.vercel-dns-017.com`.
The original Google verification TXT and both origin values are preserved.

Redirects execute at Cloudflare's Rules phase before origin access, with no
Worker, D1 or Neon request. The origin values are rollback configuration, not
redirect serving dependencies. No origin or production Worker was redeployed.

## Public audit

`before.json` recorded184 new sitemap URLs and28 retained Pin targets healthy,
but no domain redirects. `after.json` retains the first partial propagation
observation: www28/28 Pins and20/40 host/protocol matrix cases passed; cached
apex DNS still reached Vercel. Do not erase that failed/partial observation.

`after-dns-converged.json`, observed **2026-10-24T04:50:14.849Z**, verifies:

- HTTP/HTTPS × apex/www ×10 representative paths: **40/40 exact301 targets**.
- **28/28 retained Pin URLs** redirect with their complete approved UTMs to the
  matching path, and all28 new pages return200.
- **184/184 sitemap targets** return200. This is not a claim that every one of
  the2,359 public product pages was independently fetched.
-27 current retailer IDs match the new-domain audit baseline, including the
  dog-toy whose old retailer comparison was unavailable. The tube-guy retains
  its deliberate unavailable hold; no unrelated homepage substitution.

The audit command is read-only and refuses to overwrite a receipt:
`node scripts/ops/goose-domain-redirect.mjs after NEW-EVIDENCE.json`.
Unknown/retired pages keep the same path and terminate in the new site's404.
`/search` and slug/trailing-slash aliases can add their existing canonical hop;
the domain hop itself never returns to Goose. No retired bundle, gift-ID map,
Weird Gift Index or old OG endpoint is reinstated.

## Remaining lifecycle boundaries

The existing Bead **Finish product redirects and Search Console migration**
(`roadmap-lbbz1.6.2`) owns this work. Search Console ownership/sitemap/change-of-
address receipts will be recorded separately; creating an unverified property
alone is not migration success. Preserve old Search Console history.

The old-domain provider overview shows registration expires **October3,2028**,
so the paid term covers at least one year of redirects from this cutover.
Keep DNS/TLS/domain registration. No renewal setting changed. Destructive
Vercel/Neon retirement, remaining consumer/recovery checks and the post-launch
observation gate remain in **Retire legacy hosting and finish rebrand cleanup**
(`roadmap-lbbz1.7`); the redirect prerequisite alone does not close that task.

This is a destination intervention in frozen v11, not a new creative test.
Preserve all12 cohort members, original approved Goose links, receipts and the
October31T16:44:52.279Z review deadline. Posting remains off after review until
Cameron approves a new experiment. Curl/HEAD tests are QA, not acquisition.
