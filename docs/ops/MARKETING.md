# goose.gifts Marketing Plan and Experiment Log

This is the durable marketing strategy, creative standard, experiment backlog,
and learning log for goose.gifts. Update it whenever an experiment is proposed,
prepared, launched, measured, or retired. The roadmap says where marketing fits
in the business; this file preserves how we intend to execute and what we learn.

## Positioning

goose.gifts helps people discover funny, strange, surprisingly giftable
products. Marketing should create the same feeling as the product: an attractive
or intriguing first impression followed by a funny double take.

## Operating principles

- Begin with something a person would choose to view, save, or share—not with an
  ad template that needs products inserted into it.
- Match the native behavior and aesthetic of each channel.
- Prefer a strong concept and a single visual idea over dense product grids.
- Verify the exact source listing before product-bound concepting. Aesthetic
  quality never overrides a false object type, scale, material, or product
  promise.
- Separate preparation, approval, publication, and measurement. Preparing an
  experiment never authorizes public posting, outreach, or paid spend.
- Give public tests enough distribution to learn before declaring a creative
  winner or loser. Sandbox objects are workflow tests, not traffic experiments.
- Preserve failed ideas and the reason they failed so future runs build on the
  work instead of repeating it.

## Current channel priorities

1. **Pinterest-native creative acquisition**: active public learning loop.
   Six product-faithful editorial Pins are live. As of 2026-08-21 they have 210
   public impressions in total, two Pin clicks, and one save, all engagement on
   the corrected goat, but no outbound click or attributable site session. That
   is a directional attention signal, not yet a creative or conversion
   verdict. A twice-weekly studio advances at most one excellent survivor per
   run and maintains an exact owner-review queue.
2. **SEO/GEO**: maintain crawl/indexation health and publish only useful,
   catalog-supported pages. The Weird Gift Index is the first original-data
   acquisition asset and should be improved as a cited, editioned report rather
   than expanded into thin adjacent pages.
3. **On-site conversion**: improve product relevance and measure attributable
   outbound affiliate clicks.
4. **Other owned/distribution channels**: retain as backlog until there is a
   channel-specific concept worth testing.

The traffic, backlink, outreach, and channel-distribution strategy lives in
`docs/ops/ACQUISITION.md`.

## Pinterest Creative Lab

### Problem statement

The v2 product collages and v3 editorial cards are too visibly constructed as
ads. V3 was posted only through Pinterest's Sandbox API, so it received no public
distribution and is not a performance test. Its useful learning is qualitative:
cleaner typography alone does not make a template feel native to Pinterest.

The target reaction is: **“That looks great—wait, what the fuck is that?”**

### Creative quality bar

A candidate should:

- stop the scroll through beauty, curiosity, humor, or a visual contradiction;
- look plausible in a person's Pinterest feed or saved board;
- present one immediately legible idea, usually with one hero product;
- use intentional composition, lighting, materials, color, and negative space;
- reveal or reward the joke instead of explaining it;
- remain interesting without prominent goose.gifts branding;
- represent the linked product honestly enough that the click is not deceptive;
- use a vertical 2:3 canvas and remain legible on a phone.

Reject candidates that rely on CTA buttons, badges, branded frames, floating
product-card grids, generic AI gloss, excessive copy, repeated master layouts,
or superficial color swaps.

### Initial creative families

1. **Absurd editorial still life** — photograph a ridiculous product with the
   restraint and craft of a luxury design object.
2. **Beautiful room, one wrong thing** — make a genuinely saveable interior or
   workspace whose bizarre product creates the double take.
3. **Visual punchline** — use one polished scene whose contradiction or reveal
   carries the joke with little or no copy.
4. **Tasteful field guide or moodboard** — use editorial crops, texture, and
   annotations around one tightly defined identity or situation; never an
   e-commerce grid in disguise.

### Active learning pipeline

1. Research Pinterest-native references and collect a small, tagged swipe file.
2. Extract the hook, composition, aesthetic, and reason each reference earns a
   pause; do not copy executions or brand assets.
3. Write several distinct concept briefs, then verify the exact source listing,
   image, object type, and believable scale before product-bound generation.
4. Produce roughs across at least three genuinely different art directions.
5. Apply a visual taste review and product-fidelity check; discard aggressively.
6. Refine only the strongest concepts into 1000x1500 production candidates.
7. Prepare an owner-review contact sheet and record the decision on each rough.
8. Continue the learning loop until the creative direction and product fidelity
   are strong enough to justify a separate public-pilot proposal.
9. If a later pilot is approved and published, record impressions, saves, Pin clicks, outbound
   clicks, site-side attribution, observations, and the next decision.

Concept generation and internal review are authorized. The v4 and v5
experiments contain explicit public-posting authorization only for candidates
that have their own owner approval event. A scheduled run may publish a
candidate only when production API access is confirmed and the exact image,
board, copy, disclosure, destination, and tracking package are approved.
The Standard-access application was submitted on 2026-07-28 and is awaiting
review. Until approval and a verified production OAuth path, an explicitly
approved candidate may be posted only through the signed-in Pinterest browser
in an interactive owner-authorized session; unattended runs must stop at
`docs/ops/pinterest-creative-lab/REVIEW_QUEUE.md`. Tool purchases,
subscriptions, and paid distribution remain unauthorized.

### Tool strategy and access

- **`$create-pinterest-native-product-images` skill**: reusable workflow for
  product verification, concept divergence, reference-guided generation, taste
  review, revision lineage, and durable learning. Its versioned source lives in
  `skills/create-pinterest-native-product-images/`.
- **Codex image generation**: default static-image studio for concepting,
  reference-guided scenes, visual review, and iteration. No additional account
  is required for the built-in workflow.
- **Pinterest itself**: primary source for channel-native visual research.
- **GetHookd**: optional hook and ad-pattern research layer. Manually validate
  that its corpus contains relevant gifting, humor, decor, editorial-product,
  or unusual-object references before considering paid API/MCP access. Use it
  for hook taxonomy, not as a source of Pinterest templates to clone.
- **Higgsfield**: optional specialist for cinematic product placement, coherent
  lifestyle scenes, alternate camera angles, or motion Pins. Test manually only
  after the static art direction is established; avoid one-click ad templates.

### Candidate record template

For every concept promoted beyond rough exploration, record:

- candidate ID and date;
- audience or board;
- product and destination page;
- hook and creative family;
- reference links and what was learned from them;
- generation/editing tool and prompt lineage;
- taste-review notes and product-fidelity risks;
- approval and publication status;
- tracking campaign/content IDs;
- performance checkpoints and conclusion.

## Experiment log

### 2026-08-21 — 14-day product cohort and distribution hold

- **Evidence checked**: Pinterest API v5 reports 40 impressions and one Pin
  click for the five-Pin launch cohort. The six truthful product creatives now
  total 210 impressions: goat 129 with two Pin clicks and one save, alligator
  61, ceramic eye 11, hippo desk four, hippo breakfast three, and hippo vanity
  two. None has an outbound click. GA4 has no Pinterest session or outbound
  event, and the first-party database has no public-Pinterest affiliate click;
  `goose-proof` QA remains excluded. Sandbox and v3 remain excluded.
- **Creative cycle**: recorded six public checkpoints and two evidence-linked
  learnings through the validated append-only workflow. The 18 impressions
  added since 2026-08-18 went to the alligator, ceramic eye, and hippo desk;
  the goat's directional attention signal did not move. That does not create a
  concrete new-product hypothesis, so no image or Pin was generated or
  published and the owner queue remains empty.
- **Organic checkpoint**: the scheduled 14-day five-product sample has two
  submitted/indexed pages with matching Google/user canonicals (Screaming Goat
  and alligator), two discovered-not-indexed pages (ceramic eye and Pizza
  Boss), and one URL currently unknown to Google (hippo). All five return 200,
  are self-canonical, emit `index, follow`, and appear in the live 97-URL
  sitemap. No `/gifts/` page appears in Search Analytics. Keep the 100/day
  catch-up disabled for the 28-day checkpoint on 2026-09-04.
- **SEO cadence**: this was the second studio run of the week, so no guide was
  edited after the 2026-08-18 Secret Santa improvement. Current 28-day totals
  are coworkers 544, white elephant 505, dads 424, Secret Santa 259, and
  kitchen 40 impressions, all with zero clicks. Existing measurement holds
  remain in force.
- **Monthly shortlist decision**: August's no-account shortlist check remains
  closed until September. The additional Pinterest impressions produced no
  outbound, sharing, or seasonal site signal that justifies reopening it.
- **Publishing boundary**: Standard access is still awaiting review and no
  production OAuth path has been verified. This unattended run published no
  Pin, used no production posting API, and spent no money.

### 2026-08-18 — First save, product-index interim check, and Secret Santa guide

- **Evidence checked**: Pinterest API v5 reports 40 impressions and one Pin
  click for the five-Pin launch cohort. The six truthful product creatives now
  total 192 impressions: goat 129 with two Pin clicks and one save, alligator
  47, ceramic eye eight, and the three hippo variants eight combined. None has
  an outbound click. GA4 has no Pinterest session or outbound event, and the
  first-party database has no public Pinterest affiliate click; `goose-proof`
  QA remains excluded. Sandbox and v3 remain excluded.
- **Creative cycle**: recorded six public checkpoints and two evidence-linked
  learnings through the validated append-only workflow. The goat remains the
  only attention leader, but no new product concept or replacement was made
  while the existing cohort remains under-distributed. No image or Pin was
  generated or published, and the owner queue remains empty.
- **Organic checkpoint**: the interim 2026-08-07 product cohort sample now has
  two submitted/indexed pages with matching canonicals (the original Screaming
  Goat and alligator), two discovered-not-indexed pages (hippo and ceramic eye),
  and one URL still unknown (Pizza Boss). No gift URL appears in current Search
  Analytics, so the 100/day catch-up remains disabled for the scheduled 14/28-
  day checks. Eligible gift pages remain crawlable and `index, follow`; held
  pages remain stable `200, noindex, follow` outside the sitemap.
- **SEO move**: current Search Console evidence selected the existing Secret
  Santa guide: 248 impressions, zero clicks, and average position 54.7 in the
  2026-07-20 through 2026-08-16 window. The page now distinguishes an assigned
  recipient from a steal-and-swap exchange, adds recipient/workplace/handoff
  constraints, links to four useful adjacent guides, and exposes three matching
  visible FAQs/schema. The live catalog audit found 12 distinct eligible
  products. Recheck on 2026-09-01 and 2026-09-15.
- **Monthly shortlist decision**: August's no-account shortlist check remains
  closed until September. A Pinterest save without an outbound or site-sharing
  signal does not justify reopening a new product workstream.
- **Publishing boundary**: Standard access is still awaiting review and no
  production OAuth path has been verified. This unattended run published no
  Pin, used no production posting API, and spent no money.
- **Production receipt**: PR #107 merged as `c7e9bcd8`; the matching Vercel
  production deployment reached READY. The live guide returns 200 with the new
  metadata, H1, editorial, FAQs, and matching canonical, appears in the current
  97-URL sitemap, and remains open to public search and model crawlers.

### 2026-08-14 — Goat attention signal and first product-index cohort check

- **Evidence checked**: Pinterest API v5 reports 40 impressions and one Pin
  click for the five-Pin launch cohort. The six truthful product creatives now
  total 149 impressions and two Pin clicks: goat 104/two, alligator 33/zero,
  ceramic eye seven/zero, breakfast two/zero, desk two/zero, and vanity
  one/zero. None has a save or outbound click. GA4 has no Pinterest session or
  outbound event, and first-party database acquisition has no public Pinterest
  affiliate click; `goose-proof` QA traffic remains excluded. Sandbox and v3
  remain excluded.
- **Creative cycle**: recorded six public checkpoints and two evidence-linked
  learnings through the validated append-only workflow. The goat is now the
  first directional attention signal, but 104 impressions and no site click do
  not justify a verdict or unnecessary seventh survivor. No image or Pin was
  generated or published, and the owner queue remains empty.
- **Organic checkpoint**: the 2026-08-07 product cohort produced its first
  indexed sample. Search Console reports the Screaming Goat submitted and
  indexed with matching Google/user canonicals and indexing allowed. Of five
  sampled eligible gift URLs, one is indexed, the hippo is discovered but not
  indexed, and three are unknown; product-page Search Analytics still has no
  impressions. Keep the 100/day catch-up disabled.
- **Technical repair**: URL Inspection exposed an invalid Product-snippet
  object on pages without a fresh offer, review, or visible rating. Gift pages
  now retain WebPage/Breadcrumb schema and emit Product schema only when a
  current visible offer can satisfy Google's eligibility requirement. This
  removes the rich-result error without changing the page's `index, follow`
  status or factual editorial.
- **Production receipt**: PR #102 merged as
  `2eb445d8e51f7e2bd1da3218b6a06a31c5ae4ded` and the matching Vercel deployment
  reached READY on `www.goose.gifts`. Live HTML retains the matching canonical,
  `index, follow`, WebPage/Breadcrumb schema, and the UTM-preserving legacy 308.
  Search Console accepted the refreshed sitemap with HTTP 204, downloaded it at
  `2026-08-14T16:48:52Z`, and now reports all 94 URLs with zero warnings/errors.
- **Publishing boundary**: Standard access is still awaiting review and no
  production OAuth path has been verified. This unattended run published no
  Pin and spent no money.

### 2026-08-11 — Public hold checkpoint and funny-dad guide improvement

- **Evidence checked**: Pinterest API v5 reports 40 impressions and one Pin
  click for the five-Pin launch cohort, 41 impressions for the three earlier
  editorial Pins, and one impression for the three later Creative Lab Pins;
  none has an outbound click or save. The six product-faithful creative Pins
  total 42 impressions: alligator 32, ceramic eye seven, breakfast two, vanity
  one, goat zero, and desk zero. GA4 has no Pinterest session or outbound-click
  event, and the database's two `Pinterest / social / goose-proof` clicks are
  explicitly QA traffic rather than public-Pin acquisition. Sandbox and
  Pinterest v3 remain excluded.
- **Creative cycle**: no replacement was generated. The public cohort is still
  testing distribution, not creative quality, and every valid prior survivor
  is already live. The stale `cand-unhinged-desk-guide` revision was rejected
  because it never had verified product references and failed the truthful-
  product gate; the owner-ready queue and revision queue are now both empty.
- **Organic move**: current Search Console evidence selected
  `/gift-guides/funny-gifts-for-dads` (285 impressions, zero clicks, average
  position 44.1). Its observed demand includes `funny gifts for dad` (40
  impressions), `funny dad gifts` (31), and `dad joke gifts` (16). The page now
  distinguishes dad-joke, birthday/holiday, hobby, and practical-novelty
  choices; avoids pretending every dad fishes or grills; links to fishing,
  golf, coffee, kitchen, and sarcastic-gift guides; and exposes matching visible
  FAQs and schema. The catalog audit found 36 distinct eligible products.
- **Crawl and model access**: the Dad guide is submitted and indexed with the
  `www` canonical, successful mobile fetch, and indexing allowed. The live
  sitemap has 94 URLs with no reported errors. A representative editorial gift
  page is `index, follow`, self-canonical, present in the sitemap, and currently
  discovered but not yet indexed; the existing 7/14/28-day product cohort gate
  remains in force. GPTBot, ClaudeBot, and Applebot-Extended remain blocked only
  from the high-cost randomizer, not `/gifts/` or gift guides.
- **Monthly shortlist decision**: the August check was completed on 2026-08-04.
  Today's evidence added no real Pinterest outbound click, share signal, or
  seasonal conversion evidence, so the no-account shortlist idea stays closed
  until the September evidence check. No wishlist, email/PII, or new product
  workstream was started.
- **Publishing boundary**: Standard access is still awaiting review and no
  production OAuth path has been verified. This unattended run published no
  Pin and spent no money.

### 2026-08-10 — Catalog telemetry acceptance and crawlable expansion

- **Recovery outcome**: the first instrumented run exposed over-redacted token
  counters, ambiguous timestamps, incomplete model batches, and three approved
  pages that had been demoted. The production migration and bounded recovery
  replays restored the three pages and resolved the original 26-item hold to 20
  ready, five blocked, one automatic pending item, and no owner queue. The two
  paid replays used 52,350 provider-reported tokens and an estimated $0.013099.
- **Crawler acceptance**: the live sitemap now contains 46 eligible gift URLs
  and 94 URLs total. Every gift URL in it returned 200 with a matching canonical
  and no `noindex`; sampled held pages remained `200, noindex, follow` outside
  the sitemap. The old product-pinned random destination still returned a
  UTM-preserving 308 to the exact canonical slug. The random-page bot rule has
  not leaked onto product SEO surfaces.
- **Cadence decision**: the normal bounded weekly job continues. Do not enable
  the proposed 100/day catch-up merely because generation recovered; wait for
  the existing 7/14/28-day Search Console cohort to show healthy crawl,
  canonical selection, exclusions, and indexation.

### 2026-08-09 — Catalog enrichment observability and crawler scope

- **Run evidence**: weekly revalidation, discovery, and editorial backfill now
  share one durable run ID. The database keeps append-only selection,
  rejection, duplicate, unavailable, generated, failed, and manual-review
  transitions even for candidates never inserted into the catalog. Run
  receipts include sanitized configuration, Git revision, timing, provider
  token usage, dated API-cost estimates, warnings, and honest partial/failure
  states; Slack cites the same run ID.
- **Owner review**: `npm run catalog:report -- --latest` reconstructs a run and
  `npm run catalog:review-queue` returns only exact items that need intervention
  with product evidence, destination, canonical page, reason, and next action.
  Generic, duplicate, and unavailable items stay held without creating a
  catalog-wide browser-review burden.
- **Crawl boundary**: PR #89 confines model-training crawler protection to
  `/random-gift` and private routes. Canonical `/gifts/<slug>` pages and guides
  remain fetchable by search and model crawlers; their per-page factual index
  gate, not the random-page bot incident, controls sitemap/index eligibility.
  The next scheduled weekly run is the first production telemetry cohort and
  must be audited before catch-up volume changes.

### 2026-08-07 — Product-page editorial backfill foundation

- **Destination quality**: new-product collection and existing-product
  enrichment now require current Amazon facts, availability, source hashes,
  duplicate ownership, and reviewed multi-paragraph editorial before a gift
  page can be indexed. The first 25-product cohort plus four existing public-Pin
  destinations gives Pinterest and organic work 29 stable, crawlable editorial
  destinations without exposing thin catalog pages.
- **Discovery**: `/gifts` is a server-rendered, paginated directory linking only
  to the approved cohort. Old product-pinned random-gift URLs still redirect to
  their exact canonical pages with UTM attribution. Sandbox and Pinterest v3
  remain excluded from public evidence, and no Pin was published as part of
  this catalog work.
- **Rollout receipt**: the live sitemap contains 29 approved gift URLs and 77
  URLs total. Google accepted its refresh with HTTP 204 and currently reports
  it pending; sample inspection states are unknown or discovered but not
  indexed. Recheck at 7, 14, and 28 days before expanding the cohort.

### 2026-08-07 — Owner-approved hippo desk publication

- **Publication**: Cameron approved the exact `cand-v5-hippo-desk` package.
  The signed-in `goose.gifts` browser posted public Pin
  `1107815208385562809` to `Funny Gifts for Coworkers` with the exact image,
  title, description, alt text, tracked destination, affiliate disclosure,
  Pinterest AI-modified label, and similar-product recommendations disabled.
- **Receipt**: the public detail page verified the board, title, description,
  AI label, and exact tracking link. Pinterest API v5 then measured zero
  impressions, saves, Pin clicks, and outbound clicks about one minute after
  publication. This is a receipt, not a performance verdict; Sandbox and v3
  remain excluded.
- **Destination architecture**: canonical `/gifts/<slug>` pages shipped on
  2026-08-07 with Goose-owned UUIDs, explicit retailer exits, and substantive
  product-specific editorial for the four products already used by public Pins.
  All six existing `/random-gift?gift=<retailer-id>` campaign destinations now
  permanently redirect to the appropriate canonical page while preserving UTM
  attribution. `/random-gift` remains the discovery utility; unreviewed catalog
  gift pages stay `noindex` rather than becoming thin search inventory.

### 2026-08-07 — Public distribution and desk-survivor checkpoint

- **Public evidence**: the five-Pin launch cohort has 40 impressions, one Pin
  click, zero saves, and zero outbound clicks. The three earlier editorial
  Pins now have 32 impressions with no engagement, led by the alligator oven
  mitt at 23. The goat remains at zero impressions and the newly published
  vanity has one; together the two Creative Lab browser publications have one
  impression and no engagement. GA4 and database attribution still show no
  Pinterest session or affiliate click. Pinterest v3 and every Sandbox object
  remain excluded.
- **Creative cycle**: Amazon Creators API remotely verified the exact active
  `B0F9DZMQBL` mug, current title, $11.99 listing, source image, and affiliate
  destination. The current source image exactly matches the stored reference;
  the tracked Goose destination is 200. A new full-resolution inspection of
  the 1024x1536 desk artifact reconfirmed its black ceramic mug, hippo medallion,
  exaggerated red lips, turquoise `Patricia` name, ordinary scale, and all four
  hard gates. It remains the sole ready candidate; no replacement was generated.
- **Organic evidence**: over the current 28-day Search Console window,
  coworkers has 392 impressions, white elephant 292, dads 265, Secret Santa
  151, and kitchen 24, all with zero clicks. The two already edited pages are
  submitted and indexed, but their last recorded crawls predate those edits.
  Their 14/28-day holds remain correct, so this second weekly run made no SEO
  page change.
- **Monthly shortlist decision**: the August evidence check was completed on
  2026-08-04 and remains no-build. Today added no Pinterest outbound click,
  share event, or product demand signal that justifies reopening it before the
  September cadence.
- **Publishing boundary**: Standard access remains submitted and awaiting
  review, and no production OAuth path has been verified. This unattended run
  published nothing; the exact desk package remains an owner decision.

### 2026-08-04 — Owner-approved hippo vanity publication

- **Decision**: Cameron approved the exact hippo vanity publishing package and
  delegated whether to publish vanity alone or both remaining hippo scenes.
  Vanity alone was chosen because its lipstick/oversized-lips collision is more
  immediately product-derived, while posting two same-product Pins together
  would make an already tiny public cohort harder to interpret.
- **Publication**: the signed-in `goose.gifts` browser posted Pin
  `1107815208385331910` to `Weird Kitchen Gadgets` with the exact approved
  image, title, description, alt text, tracked destination, affiliate
  disclosure, Pinterest AI-modified label, and similar-product recommendations
  disabled. The hippo desk remains shortlisted and unapproved.
- **Baseline**: Pinterest API v5 confirmed the public Pin within one minute at
  zero impressions, saves, Pin clicks, and outbound clicks. This is a
  publication receipt, not performance evidence; Sandbox and v3 remain
  excluded. Recheck the public Pin after it has had time to distribute.

### 2026-08-04 — Public checkpoint, survivor revalidation, and white-elephant guide

- **Public evidence**: the five public launch Pins total 39 impressions, one Pin
  click, zero saves, and zero outbound clicks. The three earlier editorial Pins
  remain at six combined impressions with no engagement, and the three-day-old
  goat Pin has zero impressions. GA4 and database attribution still show no
  Pinterest session or affiliate click. Pinterest v3 and every Sandbox object
  remain excluded.
- **Creative cycle**: the exact active `B0F9DZMQBL` listing, stored source image,
  200 destination, and 1024x1536 hippo vanity/desk artifacts were rechecked at
  full useful resolution. Both still pass the one-idea, truthful-product,
  no-CTA, and no-template gates. No replacement was generated; the vanity
  remains the stronger first approval choice because its lipstick collision is
  more immediately derived from the product's exaggerated red lips.
- **Organic move**: current page/query evidence selected
  `/gift-guides/white-elephant-gifts` (260 impressions, zero clicks, average
  position 66.8). The page now aligns its search title and headline around
  funny gifts people will actually steal, explains a four-part reaction/use/
  stealability/room-fit rubric, adds workplace and exchange guidance, and links
  contextually to adult, coworker, Secret Santa, and Dirty Santa variants.
  Recheck impressions, CTR, average position, organic sessions, and
  `gift_guide` outbound clicks after 14 and 28 days.
- **Monthly shortlist decision**: do not start a wishlist or Secret Santa
  product workstream. The last 31 days show 59 visitors, 164 pageviews, six
  product clicks, three `/random-gift` visitors, no share event, and no public
  Pinterest outbound click. Secret Santa has 134 impressions but zero clicks;
  that still supports editorial discovery work, not accounts, email/PII, or a
  wishlist clone.
- **Publishing boundary**: Standard access remains submitted and awaiting
  review. This unattended run published nothing and left the two exact hippo
  packages in owner review.

### 2026-07-31 — Studio checkpoint, goat correction, and shortlist evidence check

- **Public evidence**: the five legacy public v2 Pins now total 35 impressions;
  the three public editorial Pins total 6 impressions. Both cohorts still have
  zero saves, Pin clicks, and outbound clicks, and GA4/database attribution
  shows no Pinterest sessions or affiliate clicks. This is insufficient
  exposure for a creative verdict. Sandbox and v3 objects remain excluded.
- **Creative cycle**: revalidated both unpublished hippo survivors, then used
  the exact active `0762459816` listing and source image to causally correct the
  boardroom goat. The first source-guided edit fixed the sculpt and stump base
  but remained oversized; the second changed only scale and passed all truth,
  single-idea, no-CTA, and no-template gates at `4.63/5`. It is the only new
  survivor from this run. Cameron later approved the exact package, and it was
  published through the signed-in browser to the public `Funny Gifts for
  Coworkers` board as Pin `1107815208385022014`.
- **Organic move**: current Search Console page/query evidence selected
  `/gift-guides/funny-gifts-for-coworkers` (269 impressions, 0 clicks, average
  position 39.9). The page now has office-specific selection guidance,
  boss/employee/colleague-aware FAQ answers, and contextual links rather than
  generic copy. Recheck impressions, CTR, average position, organic sessions,
  and guide outbound clicks after 14 and 28 days.
- **Monthly shortlist decision**: do not start a wishlist or Secret Santa
  product workstream. The latest 31 days show 61 visitors, 184 pageviews, only
  7 product clicks, 3 `/random-gift` visitors, no tracked share event, and no
  public Pinterest outbound click. Secret Santa has early search exposure (107
  impressions) but no clicks. That supports improving discovery pages, not
  adding account state, email/PII, or a wishlist clone. Recheck in August after
  there is real sharing or seasonal click evidence.
- **Publishing boundary**: Standard access is still submitted and awaiting
  review. The goat publication used an exact owner approval event and an
  interactive signed-in browser session; no production API path was used. The
  same exact-package gate remains in force for every later Pin until production
  OAuth is approved and verified.

### 2026-07-28 — Twice-weekly Pinterest and organic-growth studio

- **Cadence**: Tuesday and Friday at 9:30 a.m. local time in an isolated Codex
  worktree.
- **Creative scope**: one bounded creative cycle per run, using existing valid
  survivors before generating replacements. The hippo vanity and desk scenes
  are first in the owner-review queue; the goat requires a source-faithful
  revision; the false eye-rug product premise remains permanently rejected.
- **Publishing boundary**: the Standard-access application is submitted and
  awaiting review. Exact candidate approval is still required; while the
  production API path is unavailable, public posting is browser-only in an
  interactive authorized session. Scheduled runs queue everything for review.
- **Organic scope**: the first run each week may materially improve at most one
  existing Search Console opportunity; it must not mass-publish guide pages.
- **Product-feature scope**: once monthly, reassess whether evidence supports a
  minimal no-account shareable gift shortlist. Do not build a full wishlist or
  collect participant email/PII without a separate product decision.

### 2026-07-12 — Reference-guided product-fidelity cycle

- **Status**: two candidates shortlisted internally; public distribution still
  paused.
- **Correction**: the highest-scoring first-pass “eye rug” was based on a false
  catalog assumption. ASIN B0D57DDDM1 is a small ceramic eye sculpture, not a
  rug. The rug execution is explicitly rejected despite its aesthetic score.
- **Generated**: a source-guided alligator oven-mitt kitchen still life and a
  source-guided ceramic-eye interior. Both retain the clean, beautiful-first,
  strange-second direction while matching the real product form and scale.
- **Learning**: source-ASIN verification and a local product reference are now
  hard prerequisites. The creative log contains the exact prompts, reference
  paths, artifact paths, reviews, rejection, and causal learning events.
- **Next action**: owner taste review of the two shortlisted artifacts. Do not
  publish, prepare a Pinterest pilot, buy tools, or spend until separately
  authorized.

### 2026-07-12 — Pinterest Creative Lab first concept cycle

- **Status**: active; generation authorized, public distribution paused.
- **Decision**: replace template-first production with reference research,
  concept briefs, distinct art directions, AI-assisted scene generation, a
  documented taste gate, and an explicit product-fidelity review.
- **Prior learning**: v2 looks like a branded product collage. V3 is cleaner but
  still reads as a templated ad and was Sandbox-only, so it has no public
  performance signal.
- **Generated**: four distinct concept families plus one corrective goat-scale
  revision. The original goat attempt is retained as a rejected learning event.
- **Next action**: review Cameron's response, use actual product references for
  fidelity, and iterate only the directions that clear the taste bar. Do not
  prepare or publish a public pilot yet.

### Earlier Pinterest work

- **V2**: five public Pins established the account, boards, tracking, and a low
  initial distribution baseline. Creative reads as conventional advertising.
- **V3**: five Sandbox API Pins validated the generation/posting workflow only.
  It did not test public reach or conversion.
