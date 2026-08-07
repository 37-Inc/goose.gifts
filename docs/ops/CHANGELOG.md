# goose.gifts — Running Changelog & Plan

A running, human-readable log of the meaningful changes made to goose.gifts and
what's planned next. Its job is to give Cameron and any Claude session shared
context: **what we've done, and where we're going.**

- This log is commingled on purpose: both interactive owner+Claude sessions and
  the autonomous daily operator write here. Tag each entry with who did it —
  `[owner+claude]` for a hands-on session with Cameron, `[daily-ops]` for an
  autonomous run.
- Keep it skimmable. One short block per change: **what shipped**, **why**, and
  the PR/commit. Detailed operational metrics stay in `JOURNAL.md`; strategy
  lives in `ROADMAP.md`; open asks live in `NEEDS.md`. This file is the
  narrative thread across all of them.

> **Convention (do not skip):** update this file as part of any working session
> — append shipped work to the Changelog and keep "Upcoming / planned" honest —
> *before ending the session*, without waiting to be asked. See `CLAUDE.md`.

---

## Upcoming / planned

Living list; reorder as priorities shift. Not a commitment, a shared view of
what's likely next.

- **Indexation (top blocker) — all near-term levers pulled; now monitoring.**
  Diagnosis complete (2026-07-17): on-site healthy; guides never crawled
  (crawl-budget/authority); homepage stale-consolidated to the apex.
  **Request Indexing DONE 2026-07-17/18** for all 7 targets (homepage, guides hub,
  white-elephant, coworkers, dads, secret-santa, weird-kitchen) via the GSC UI —
  each confirmed queued. Cameron's account (`cam@37.technology`) is now a verified
  **owner** of the GSC property (DNS auto-verify), so UI access is permanent.
  **IndexNow seeded** (47 URLs, HTTP 202 — Bing/Yandex only; `docs/ops/indexnow.md`).
  Next: re-inspect ~Jul 25 / Aug 1 / Aug 17 via `scripts/ops/gsc.sh` and track
  Discovered→Crawled→Indexed (Beads `roadmap-fkvo`; dates recorded there). The
  remaining lever is external authority — Pinterest (`roadmap-fd1h`).
- **Distribution / Pinterest — submitted; awaiting review.** Standard-access application
  package written (`docs/ops/pinterest-standard-access.md`): use-case text, scope
  justifications, data-handling statement, terminal demo shot-list, and exact
  portal steps. Prereqs were verified, the demo was recorded/uploaded, and
  Cameron submitted the upgrade request on 2026-07-28. Until Pinterest approves
  it and production OAuth is verified, public posting remains browser-only.
  Tracked as Beads `roadmap-fd1h`. Helps indexation (external signals).
- **Pinterest creative workflow — measure the goat and vanity; review the desk.** The
  source- and scale-corrected Screaming Goat boardroom was owner-approved and
  browser-published as public Pin `1107815208385022014`. The stronger hippo
  vanity package was then owner-approved and browser-published as public Pin
  `1107815208385331910`; the hippo desk is the only exact unpublished package
  left in owner review. Do not generate a replacement while these public Pins
  gather distribution and the valid desk survivor awaits a decision.
  Public posting remains exact-candidate approved and browser-only until
  Standard access plus production OAuth are verified.
- **Amazon prices — deferred** (unchanged): the Creators API isn't delivering
  prices in practice (0.5% coverage; 0/122 recent enrichments), so
  commission/price-weighting stays parked.
- **Catalog-first relaunch** (daily-ops track): keep improving catalog depth,
  enrichment/relevance, search results, outbound CTR. `ROADMAP.md` Phase 1.
- **`/weird-gift-index` editorial pass** (owner+claude track): still deliberately
  distinct; give it an intentional pass when the higher-leverage items above land.

---

## Changelog

Newest first.

### 2026-08-07 — Desk survivor revalidated; public metrics advanced `[daily-ops]` ([PR #83](https://github.com/37-Inc/goose.gifts/pull/83))

Rechecked all public-only Pinterest, GA4, Vercel/database, and Search Console
signals; recorded fresh causal checkpoints without using Sandbox/v3 as traffic
evidence. The exact live hippo-mug listing, source image, tracked destination,
and full-resolution desk artifact still pass every truth and taste gate, so the
desk remains the only owner-ready package and no replacement was generated.
The already edited coworker and white-elephant pages remain on their 14/28-day
holds; no SEO page or public Pin changed.

### 2026-08-04 — Hippo vanity Pin published `[owner+codex]`

Cameron approved the exact hippo vanity package and delegated whether to post
one or both remaining hippo concepts. Published only the stronger lipstick-
derived vanity scene to keep the tiny same-product cohort interpretable:
[Pin `1107815208385331910`](https://www.pinterest.com/pin/1107815208385331910/)
is live on `Weird Kitchen Gadgets` with the tracked Goose Gifts destination,
affiliate disclosure, Pinterest AI-modified label, exact alt text, and similar-
product recommendations disabled. Pinterest API v5 confirmed the public Pin at
a zero-distribution publication baseline. The desk remains unapproved.

### 2026-08-04 — White-elephant guide + complete public Pin metrics `[daily-ops]` ([PR #80](https://github.com/37-Inc/goose.gifts/pull/80))

Used current Search Console evidence to improve the existing white-elephant
guide (260 impressions, zero clicks) with a people-will-actually-steal search
promise, a concrete reaction/usefulness/stealability/room-fit rubric,
page-specific FAQs, and contextual exchange links. Revalidated both unpublished
hippo survivors without generating a replacement, recorded public-only
checkpoints through the append-only workflow, and fixed the metrics reader so
the browser-published goat is included. No Pin was published; hippo vanity and
desk remain exact-package owner decisions. The August wishlist check still
found no product evidence for accounts, email/PII, or a new workstream.

### 2026-07-31 — Coworker guide + truthful goat survivor `[daily-ops]` ([PR #77](https://github.com/37-Inc/goose.gifts/pull/77), [publication PR #79](https://github.com/37-Inc/goose.gifts/pull/79))

Used current Search Console evidence to improve the existing funny-coworker
guide (269 impressions, 0 clicks) with page-specific office-safe criteria,
boss/employee/colleague FAQs, and contextual guide links—no new URL or generic
site-wide copy. Revalidated the two unpublished hippo creatives and produced
one source- and scale-faithful Screaming Goat boardroom survivor from ASIN
`0762459816`; every prompt, failed intermediate, review, metric checkpoint, and
learning is preserved in the validated append-only log. Cameron later approved
the exact goat package, which was published through the signed-in browser to the
public coworker board as
[Pin `1107815208385022014`](https://www.pinterest.com/pin/1107815208385022014/).
The two hippo packages remain in owner review. Prior Pinterest exposure remains
too small for a verdict, and the monthly evidence check rejected starting a
wishlist.

### 2026-07-30 — Default share card refined `[owner+claude]` ([PR #76](https://github.com/37-Inc/goose.gifts/pull/76))

Replaced the serviceable banner-like default share card with Cameron's approved
editorial V3: a smaller signature goose, quiet warm-orange rule, and sturdier
literary serif that keeps “The internet's least serious gift catalog” legible
and confident at social-preview size. Preserved the rejected thin-serif V2,
approved V3, exact prompt, and review rationale under
`docs/ops/brand-explorations/` so future iterations build on the typography
learning instead of repeating it.

### 2026-07-30 — Warm-orange brand system unified `[owner+claude]` ([PR #75](https://github.com/37-Inc/goose.gifts/pull/75))

Applied the approved useful-absurdity brand direction across the public site and
share surfaces. `#c2410c` is now the accessible canonical orange, with the
existing brighter orange retained only for decorative accents; branded red
hovers, underlines, editorial sections, the default share card, and the dynamic
random-gift card now use the orange system. Semantic error and destructive
states remain red. The existing goose stays a restrained header, footer, and
default-share signature rather than becoming a larger mascot treatment.

### 2026-07-28 — Twice-weekly Pinterest and organic growth studio `[owner+codex]`

Kept the deterministic Monday catalog-quality job separate and added a
high-reasoning Tuesday/Friday creative-and-organic studio. It reuses the
installed Pinterest-native skill, produces at most one excellent survivor per
run, maintains an exact owner-review queue, and only publishes candidates with
explicit package-level approval and confirmed production API access. The first
queue contains the unpublished hippo vanity and desk survivors; the goat remains
a source-fidelity revision, and the false eye-rug premise remains rejected. The
first weekly run may also improve one of five Search Console opportunity pages
with distinctive editorial content instead of creating more URLs. Wishlist and
Secret Santa expansion is now a monthly evidence check, not a build commitment.
The automation is verified visible and active in Codex Scheduled Tasks for
Tuesday and Friday at 9:30 a.m. The Pinterest Standard-access application has
now been submitted; unattended runs must queue candidates, while any approved
public Pin is posted through the signed-in browser until production API access
is approved and verified.

### 2026-07-18 — Pinterest-native creative V5 forward test `[owner+codex]`

Ran the reusable creative skill on a newly verified product, rejected two
misleading or weak catalog candidates before generation, and produced three
product-faithful 2:3 editorial scenes for the black personalized hippo mug
`B0F9DZMQBL`. All passed the truth, single-idea, no-CTA, and no-ad-template
gates; the Memphis breakfast direction scored highest internally. The complete
source references, prompts, artifacts, contact sheet, reviews, and failures are
preserved under `docs/ops/pinterest-creative-lab/v5-concepts/` and in the
validated append-only experiment log. The skill now explicitly makes visible
source evidence override catalog wordplay and tests whether a hook is genuinely
derived from the product. Nothing was published.

### 2026-07-18 — First Weird Gift Index distribution wave prepared `[owner+codex]`

Moved the first two Index outreach actions to the exact owner-review boundary:
The Awesomer's Suggest a Story form and one Boing Boing editorial-tip email.
Both use the live edition's checkable straight-faced-novelty finding (2,377 of
3,314 listings, or 71.7%, contain none of ten published humor signals), clean
canonical links, explicit ownership/affiliate disclosure, and freshly verified
routes. Exact copy and per-action authorization boundaries live in
`docs/ops/acquisition/INDEX_WAVE_1_APPROVAL.md`. Nothing was submitted or sent.
Beads `roadmap-6611` reminds Cameron to approve or reject each action separately.

### 2026-07-18 — Weird Gift Index editorial pass + review fixes `[owner+claude]`

Shipped the `/weird-gift-index` editorial pass (PR #69): tighter hero dek and
stat-card copy, an orienting lede, two new data-derived insights (the
"straight-faced" 71.7% inverse of humor-signal coverage; catalog source breadth
in the methodology), a motif-chart scale caption, and a11y fixes (orange-500 →
orange-600 bar fill for WCAG 1.4.11 contrast; denominators + `role`/`aria-label`
on all chart bars). Review pass on top of the agent draft: made the
"largest motif" claims self-guarding (FAQ + JSON-LD now derive from the sorted
`motifs[0]` instead of hard-asserting Animals), and fixed a site-wide invalid-HTML
bug — the root layout's `<main>` wrapper nested every page's own `<main>`; it's
now a `div`, so each document has exactly one main landmark. Verified against
live catalog data: full build + lint green, JSON-LD parses, desktop + mobile
rendering checked.

### 2026-07-17 — Growth goal + Pinterest creative skill preserved `[owner+claude]`

Saved the autonomous traffic/acquisition goal at
`docs/ops/goals/GOOSE-GROWTH-GOAL.md` and distilled the successful v4 creative
method into the versioned `$create-pinterest-native-product-images` skill. The
skill makes source-product verification, concept divergence, reference roles,
hard truth/taste gates, causal revisions, and append-only learning reusable
instead of relying on session memory. It is installed in Cameron's personal
Codex skills directory; Beads `roadmap-dfas` tracks independent forward-testing
and iterative refinement. This work does not authorize public posting.

### 2026-07-17 — IndexNow submission tooling + initial seed `[owner+claude]`

Turned PR #63's key-file-only IndexNow setup into a working submission path.
New `scripts/ops/indexnow-submit.mjs` (`npm run indexnow:submit`): auto-discovers
the public key file, sources canonical public URLs from the live sitemap (guards
out `/api`, `/admin`, non-www, non-https, dupes), and POSTs to the single
`api.indexnow.org` endpoint (fans out to Bing/Yandex/Naver/etc.). Supports
`--dry-run` (rollback-friendly) and `--url` for changed-URL submissions.
**Seeded all 47 sitemap URLs → HTTP 202 accepted** (first IndexNow notification
for the domain). Docs in `docs/ops/indexnow.md`. Google does not consume
IndexNow, so this is a Bing/Yandex win, not a Google-indexation lever. Beads
`roadmap-uz2t` (Bing/Yandex Webmaster verification remains an owner portal task).

### 2026-07-17 — Local session: branches merged, OG cards shipped, indexation diagnosed, Pinterest packaged `[owner+claude]`

First local session (unlocks GSC key, Beads, Pinterest creds). Worked the owner's
prioritized batch.

- **Branches reconciled**: merged the mobile search-bar fix (PR #64) and the Beads
  pointer + session findings (PR #65); deleted `claude/changelog-deploy-note` (its
  content was already in main via PR #62). **Main→prod auto-deploy fired on its own
  for all three merges this session** — the earlier reliability concern didn't
  recur; no manual Vercel trigger needed.
- **Per-product OG share images** (PR #66, `ef20e61`, **shipped + verified live**):
  `/random-gift?gift=<id>` share links now render a per-product card (product image
  + punny title + witty line + `goose.gifts` red-underline branding). Since Next's
  `opengraph-image.tsx` doesn't get `searchParams`, it's a dynamic OG **API route**
  (`app/api/og/random-gift`) + `generateMetadata` (which does). Pre-fetches the
  retailer image → data URI so a slow image can't fail the card; branded fallback on
  missing/invalid id; canonical stays `/random-gift`. New `getProductById`.
- **Indexation diagnosed** (item #1): confirmed off-site/crawl-budget via
  `scripts/ops/gsc.sh` — guides never crawled, homepage stale-consolidated to apex,
  0 impressions/28d, on-site healthy. Recorded a checkpoint on Beads
  `roadmap-vpmm.1.1` and filed the push task `roadmap-fkvo`. Gave the owner exact
  GSC "Request Indexing" steps.
- **Pinterest Standard access packaged** (item #2): wrote the full ready-to-submit
  application (`docs/ops/pinterest-standard-access.md`) and filed Beads
  `roadmap-fd1h`. Verified prereqs. Owner records the demo + clicks "Upgrade".

### 2026-07-16 — Site-wide design unification `[owner+claude]`

Brought the guides list, individual guide pages, and the random-gift generator
into the same design language as the refreshed homepage (round 2 of the design
polish). Extracted two shared components — `components/ui/PageHero.tsx`
(centered hero + the hand-drawn red underline accent) and
`components/ui/SectionHeading.tsx` (quiet divider heading + soft "browse"
cards) — so the language stays consistent going forward.

- Replaced loud uppercase-red kickers, `font-black` display type, `bg-zinc-50`
  banded sections, and hard-bordered boxes with the calm white surface, centered
  underlined heroes, rounded-full pill buttons, guide chip rows, and soft
  ring cards used on the homepage.
- The individual guide page dropped its one-off custom header for the shared
  `<Header/>`; its guide nav is now a chip row matching the homepage.
- Privacy page header aligned too. `/weird-gift-index` left as an intentional,
  separate editorial piece.
- **Guides directory redesigned as visual tiles**: the 43-guide list was an
  unparsable wall of text (three columns of intro sentences). It's now
  image-tile grids grouped by section — each guide shows a representative
  product image + title. New `getGuidePreviewImages` picks one image per guide
  with a greedy scarcest-first assignment that guarantees no duplicate image
  *and* avoids visual near-duplicates (e.g. two fake-belly fanny packs) via a
  loose product-"family" check on the title. Runs at build/ISR
  (`revalidate 3600`), not per request. New `components/GuideTile.tsx`.
- `npm run build` + `lint` pass; desktop and mobile verified against production
  data. **Shipped to production** (PR #61 merged, commit `d25a865`).

> ⚠️ Deploy note (2026-07-16): merging PR #61 to `main` did **not**
> auto-trigger a production deploy (waited ~20 min; earlier merges fired in
> ~2). Triggered it manually via the Vercel API
> (`POST /v13/deployments`, `target: production`, `gitSource ref: main`) →
> `dpl_9sJKDC5Xav8Za15FgjNqxAjr9DMF`, READY + aliased, verified live. The
> autonomous operator's recent production deploys also came from `claude/*`
> refs (manual promotion), so main→prod auto-deploy may currently be
> unreliable for this project. Watch on the next merge; if it recurs,
> investigate the Vercel↔GitHub webhook / deploy settings.

### 2026-07-16 — Amazon Creators API migration `[owner+claude]`

Replaced the retired PA-API/SigV4 catalog path with an OAuth Creators API
client for discovery, enrichment, and stale-product refresh (PR #57,
rebased onto the design refresh and merged to `main`). Removed the legacy AWS
configuration and test/code cruft; Google CSE remains an optional verified-only
discovery fallback. Live API and dry-run catalog/revalidation checks passed.

The production cutover is complete: Creators credentials are installed in
Production, Preview, and Development; retired AWS variables/toggle are gone;
and Vercel deployment `goose-gifts-e5cj376vm-37-inc.vercel.app` is Ready with
the public aliases. Homepage, sitemap, redirect, and semantic-search smoke
checks passed.

### 2026-07-16 — Homepage & catalog design refresh `[owner+claude]`

Made the browsing experience feel like a polished consumer product instead of a
dense data grid. **Shipped to production** (PR #58, merged, deploy `e3d920c`
verified live).

- Product grid: 6 columns → max 4 (2 mobile / 3 tablet), far more breathing room.
- Cards decluttered: soft rounded image tile with hover lift, two-line title,
  one witty one-liner, small retailer mark. Removed the "Check price" row (only
  17 of 3,314 products carry price data) and tag chips; real prices now show as
  a floating chip on the image.
- Hero recentered with a hand-drawn underline accent; search pill + guide chips
  are the focal point. Removed banded gray sections for one calm white surface.
  Search now shows skeleton tiles while loading; friendlier empty state.
- Guide pages and random-gift inherit the new cards via shared `ProductGrid`.

Also enabled `POSTGRES_URL`/`DATABASE_URL` for Vercel **preview** deployments
(settings change only, no data copied) so Cameron can preview future PRs against
real catalog data. Kept on by owner's request.

### 2026-07-01 — Project handover & operating system `[owner+claude]`

Cameron handed over day-to-day operation of goose.gifts. Established the
operating docs that everything else runs from: `RUNBOOK.md` (daily loop, weekly
check-in, escalation, guardrails), `ROADMAP.md` (catalog-first pivot),
`NEEDS.md` (owner asks), `JOURNAL.md` (operator memory), later `HANDOFF.md`.

- Built `scripts/ops/pull-env.sh`: bootstraps all production env vars from
  Vercel given a single `VERCEL_TOKEN` (handles the API's per-var encryption).
- Scheduler saga: claude.ai routine creation was broken in research preview; a
  GitHub Actions scheduler was built then removed at owner's request; a daily
  routine is instead set up by a separate agent per `HANDOFF.md`.
- Learned (now load-bearing facts): cloud sandboxes block raw Postgres TCP 5432
  — use the `@vercel/postgres` HTTPS driver; production baseline showed the site
  had gone dormant, confirming the catalog pivot as a relaunch.
