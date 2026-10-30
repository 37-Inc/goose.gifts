# Stupid Gifts — Catalog care and homepage merchandising

Research and approved implementation contract, October 29, 2026.
Beads: `roadmap-lbbz1.4.14` (pipeline), `.4.15` (homepage), existing `.4.11`
(refresh fairness), `.4.13` (operational integration), `.4.8` (measured routine cost).
Audited source: `ca4e28600b03d6d5cc341f1905937522b08afcab`.
Owner approved bounded pipeline improvements and autonomous homepage curation.
Implementation is in PR301; source acceptance is not a production deployment.

## Recommendation in one paragraph

Keep the existing bounded catalog job, fix its remaining operating integration,
stop spending enrichment work on candidates that cannot be admitted, and give
nonfeatured products a fair share of refreshes. Separately, replace the entirely
pinned homepage with six weekly editorial anchors and eighteen quality-approved
items rotating daily at successful publication, not on every visit. Codex maintains
the selection logic; Cameron does not need to curate a weekly issue. Add a real
new-arrival lane once accepted first-publication evidence exists; do not manufacture
it from refresh timestamps. Use factual short descriptions as the universal goal,
not thousands of generated articles. No recommendation service, extra scheduler,
per-visitor database work or increased merchant/model allowance is needed.

The slot counts and cadence below are proposed starting defaults, not a proven
conversion optimum. Better merchandising can improve browsing and outbound
click-through; it does not itself create human acquisition.

## 1. Confirmed current state

### Source, serving state and operating state are different

- Live HTTP readback during this audit serves `semantic-search-20261026-3f144eb`,
  code `3f144ebf4b276b08c93304707e4534bba8c01df1`, catalog
  `owner-held-final-20261026`, snapshot
  `d6f1c526bcd2f7da7428a969580eb082deab2818be895760c6b207bbc95d6ddc`.
- The retained matching snapshot contains **3,352 public products, 31 exclusions,
  3,383 identities, 42 long articles, zero blank images and zero blank descriptions**.
  There are 990 generic source descriptions. All 990 have an exact ID/title-matched
  factual presentation note in `content/catalog-card-descriptions.json`.
  Do not equate missing long articles with missing card descriptions or regenerate
  the preserved dataset to fix a presentation concern.
- `goose-gifts-daily-ops` is **PAUSED**, with the existing 08:30 Pacific schedule.
  The separate Pinterest studio task was deleted and its chat archived at the
  owner's request. Cohort follow-ups remain in Beads; this catalog job must not
  recreate that timer or post Pins.
- Canonical `.4.13` and the protected `semantic-enable-20261026/recovery-complete.json`
  receipt record the old unsent-delete recovery as complete: `failed_recovered`,
  owner idle generation 23 / epoch 531, original native history/charges retained.
  That is accepted historical recovery evidence, not a fresh provider-owner query.
  **Never replay it.** The saved daily prompt's old WRITING-owner/unfixed-defect,
  pre-semantic release and `semanticOFF` assertions are stale.
- The remaining writer gate is real: reconcile maintained operator/prior successor
  to the actual accepted file release, carry incremental derived-search proofs
  from accepted inputs/receipts, test routine acceptance, then resume the SAME task.
  Owner already conditionally authorized resumption after those checks; another
  generic approval, paid plan or Google processing is not the missing prerequisite.
  Read current canonical `.4.13` immediately before execution.

### Why the home screen does not change

`static-site/lib/browse.ts:17-29` ranks public products with a date seed, but first
prepends **all 24** IDs from `content/homepage.json`. Those consume the full first
batch. Diversity controls only run for vacant slots; with 24 featured products
there are none. The seeded ranking changes the tail, not those 24 cards.
Also, the seed uses catalog `generatedAt`, not the date of a later code-only build.

`scripts/catalog/daily-operator.mjs` passes that same `featuredIds` list to the
refresh selector. `scripts/catalog/maintenance-d1.ts:453-466` sorts featured gifts
ahead of all nonfeatured ones, with age only within lanes. Repeated ten-item runs
can therefore starve the rest. These are two different problems.

## 2. Pipeline options, best first — bead .4.14

| Rank | Option | Assessment |
| --- | --- | --- |
| 1 | Repair and focus the existing bounded pipeline | Best value now. Recover normal operation, fair refresh selection, pre-enrichment candidate cap, approved-input-only embeddings and better six-query coverage. |
| 2 | Separate short-card readiness from optional long editorial | Good simplification, but cross-cutting. Implement explicitly after option 1; do not weaken an article validator and call the pipeline fixed. |
| 3 | High-volume/daily discovery or demand/commission-led automation | Defer. More inventory and model work are not justified by current traffic or operating reliability. Creator Product Research remains deferred. |

### Recommended pipeline contract

1. Preserve the existing single job: at most ten existing products per Pacific day
   across retries; Monday six discovery themes and at most twenty new admissions;
   Tuesday–Sunday model-free. Twenty is a ceiling, not a quota.
2. Implement existing `.4.11`: reserve four slots for oldest featured public items
   and six for oldest nonfeatured public items; deterministically backfill a sparse
   lane from the other. Use the existing observation/check timestamps, stable ID
   tie-break and consumed reservation. No new due-age/TTL or failure-history subsystem
   in V1. Repeated failures remain visible through existing run telemetry; adaptive
   failure backoff is a later measured refinement, not an implicit new history scan.
   Refresh priority is not permission to hide a persistent product when stale.
   Define public membership from the accepted public-display allowlist, including
   ordinary listings without articles. The bounded existing catalog-view query
   uses `public_display_json IS NOT NULL`, then active/nonduplicate/Amazon checks;
   it does not add a payload scan or accept arbitrary caller-supplied public IDs.
   Preserve the 31 explicit exclusions. Do NOT use
   `publishedMaintenanceProduct()` (`maintenance-state.ts:116-122`), whose long-article
   condition would incorrectly exclude most actual public gifts. Public membership
   must come from the accepted successor, not an arbitrary unverified client list.
3. After existing source-quality, ASIN/family and full-catalog dedup checks, rank
   candidates and select **at most `maxNew` before any drafting/review/embedding**.
   Record overflow as deferred by the existing decision telemetry. Do not generate
   all sixty possible search hits and discard forty after generation.
4. Embed new accepted inputs only. A rejected/incomplete generated draft must not
   create a new embedding. Reuse an existing approved vector when its accepted
   input is unchanged; do not erase old native history. Derived search proof must
   match actual current accepted inputs; keyword fallback remains valid on a miss.
5. A later measured improvement may version the discovery-query registry within
   the current six-request budget:
   two visually absurd useful objects, two undercovered recipient/interests, one
   appropriate season/occasion and one exploratory theme. These are proposed
   buckets, not six permanently fixed queries. Select deterministically from
   reviewed concrete examples; dedup against held identities too.
6. Review candidate images and literal product function, not just words such as
   "funny" or generated puns. Expand existing object-specific positive/negative
   tests conservatively; don't remove all quality gates or chase commission alone.
7. Review actual card copy for high-exposure items. Do not blanket rewrite 990
   preserved generic source strings: their visible notes already exist.

Current implementation details: discovery uses twelve fixed keyword themes and
six first-page searches of up to ten products (`prefetch-catalog.mjs:48-61,236-241`;
`lib/amazon-creators.js:290-297`). Candidate qualification/dedup runs in
`prefetch-catalog.mjs:318-419,1855-1922`. `enrichProducts` precedes the persistence
cap at `1966-2000`; its embedding call accepts all reviewed outcomes at `982-993`.
Existing selected enrichment is Monday-only (`1213-1246`), drafting/reviewing batches
of four with a 140–280-word article validator (`catalog-editorial-core.mjs:115-134`).
The current ten-existing-per-Monday path is not a bulk enrichment mechanism.

### Option 2, explicitly scoped

Universal listing readiness should require a factual short title/description,
usable image, exact retailer identity/link and valid public/search representation.
A long article should be optional and selected because it helps a visitor, not
because every product needs an SEO essay. Preserve all 42 existing articles.

The approved implementation uses a separate `short_ready` outcome and validator,
with factual review and
unchanged-copy reuse, through generation, persistence, public projection and search
input calculation. Article status stays separate from public listing eligibility.
Preserve manual locks and native input proofs. Never mark a short note as having
passed the existing long-article validator. Normal enrichment now requests short
copy by default; `--long-editorial` explicitly opts into the unchanged article
validator. A short approval does not newly approve a preserved historical article.
Keep lightweight canonical product pages for every public gift, not only articles.

### Pipeline implementation and tests

- Fair selection: `scripts/catalog/maintenance-d1.ts`, existing
  `tests/catalog-maintenance-d1.test.mjs`; keep current cadence/reservation tests.
- Candidate pre-cap and approved embedding filter: `scripts/ops/prefetch-catalog.mjs`,
  `tests/catalog-ops.test.mjs`, `tests/catalog-maintenance-selected-editorial.test.mjs`,
  `tests/catalog-provider-evidence.test.mjs`.
- Query registry: retain existing executor and `catalog-daily.mjs`; test six themes,
  deterministic weekly coverage and full-catalog dedup without additional calls.
- Required regressions: max ten unique refreshed identities across retries;
  fair lane coverage and empty-lane fallback, including public gifts without articles;
  at most twenty UNIQUE discovery candidates entering enrichment (draft, review and
  existing bounded retries may create more than twenty model input occurrences;
  Monday's ten selected existing gifts remain a separate permitted cohort);
  no new embeddings for rejected drafts; approved content/native history retained;
  no Tuesday–Sunday model calls; same-response evidence; affiliate tag unchanged.

Keep current 5,000 HTTP / 12,000 SQL / 1.5M known-read / 30k known-write guards,
uncertainty and account-wide headroom. These are existing internal ceilings, not
promises of routine cost. No extra merchant batch to demonstrate the improvement;
observe the next authorized normal run under `.4.8`.

## 3. Homepage options, best first — bead .4.15

| Rank | Option | Assessment |
| --- | --- | --- |
| 1 | Editorial anchors + deterministic qualified rotation | Approved: six weekly anchors, eighteen daily rediscoveries at publication. No owner-maintained weekly issue. |
| 2 | A manually curated weekly 24-product issue | Simplest high-taste fallback. Good if an automated pool produces weak assortments; needs recurring attention. |
| 3 | Quality-filtered newest-first | Suitable for one lane later, not the full homepage. New does not mean good, and refresh time is not first publication. |
| 4 | Behavior-informed ranking plus exploration | Later. Position bias, bot/QA traffic and tiny counts make raw-click winners misleading now. Start with reports. |
| 5 | Personalization, real-time bandits or unrestricted shuffle | Not for this stage. Added state/cost or weak first impressions without sufficient evidence. |

### Minimal V1 selector

- **24 cards: six editorial anchors + eighteen rotating rediscoveries.** Interleave
  anchors at positions 1, 2, 5, 9, 14 and 20; don't fill the first two rows only
  with pinned products. These positions are a reviewable default, not an optimum.
- Keep the clean single gallery, 24-item batches, ordinary search, canonical
  product pages, existing descriptions and mobile layout. No new tabs/badges needed.
- Reuse the existing 24 strong featured IDs as a weekly rotating anchor pool;
  select six rather than permanently pinning all 24. The other eighteen are an
  automatic source-qualified pool of physical novelties from the existing catalog.
  No new owner-maintained ID list, model taste scores or merchant fetches.
- Require accurate short copy, usable photo, clear gift function and an instantly
  understandable unusual object/joke. No two variants of the same family. Apply
  the existing archetype/family logic before selection and a max-two cap for
  dominant mug/shirt/book/sign/etc. types, including anchors. Prefer multiple
  different object types in the first six cards.
- Exclude printed commodities and generic fidgets/plush from the opening rotation,
  not the catalog. Rank qualified candidates with a deterministic, mildly quality-
  weighted daily shuffle; interleave the six weekly anchors. Test daily turnover,
  same-day stability and family/type diversity without claiming no repeats.
- Use Pacific day and Monday-based week derived from existing validated release-context
  `generatedAt`. No `Date.now()`, visitor cookies, new permission/reference string,
  daily exposure ledger or per-user storage. Different releases in the same day
  retain their order for unchanged source/pool/catalog; a new day/week takes effect
  only on an actual accepted publication. A paused publisher means no magic
  midnight update. No new hosted Cron and no merchant fetch just for rotation.
- If the pool is small or a pick is missing, use eligible prior curated candidates
  and then existing qualified deterministic ranking. Relax category diversity
  before dropping all results, but never relax product eligibility or duplicate
  identity checks. A truly small catalog may show fewer than 24.
- After choosing the opening 24, append EVERY other eligible public product once
  in the existing base order. Homepage exclusion does not deactivate catalog data.
  Opening family/type skips apply only to the opening selection, never the full feed.
  Do not preserve the current top-96 candidate cutoff as a catalog visibility cap.
- Keep the independently pinned `/h` rehearsal prototype unchanged if/when it is
  integrated; it is not live. Normal homepage rotation must not roll show picks.

### Honest arrival lane, next increment

The public snapshot does not carry `createdAt` or `firstPublishedAt`. Private
maintenance `createdAt` is not proof of when a migrated/held gift became public;
`updatedAt`, supplier refresh and deployment date must never manufacture "new".

Once needed, derive first-publication candidates from the difference between prior
and newly accepted public-ID sets, reconcile with same-run source transition evidence
and the first-publication ledger, and exclude previously public returning items.
`beforeSha256: null` proves source insertion, not public exposure: carry held/failed
insert evidence forward until genuine successful publication. Baseline 3,352 dates
remain unknown, not newly published; preserved prior-public history also prevents
calling an old returning item new. Make that data a separate reviewed build input;
do not append fields to the strict existing approval seal or rewrite product data.
Its precise build binding must be specified/tested in that increment. Until then
there is no arrival label/lane, and no need for a schema migration in V1.

Target mix then becomes six anchors + up to six approved arrivals from the last
30 days + twelve rediscoveries, with missing arrivals filled by rediscoveries.
An arrival must meet the same homepage-quality standard. Exposure cooldowns and
automated popular ranking stay later options, not V1 state.

### Homepage implementation and verification

1. Implement a pure `merchandisedBrowseProducts(snapshot, releaseGeneratedAt)`
   used by `createBrowseRelease`, **not a global change to `rankedBrowseProducts`**.
   Related-gift ranking currently consumes the latter; avoid changing thousands of
   detail pages unintentionally. Do not shrink/reorder `homepage.featuredIds` to
   implement display slots: the current daily refresh operator also consumes it.
2. Feed the SAME existing release-context timestamp into `static-site/lib/catalog.ts`,
   `scripts/staging/build.mts`, `static-site/lib/asset-routes.ts` and
   `scripts/staging/retention.mts`. The verifier recomputes with that context.
   Fixture/dev fallback uses a fixed snapshot timestamp. Checked-in policy is bound
   by existing `codeSha`; the timestamp is already bound by context/manifest.
   No approval-seal, snapshot or manifest schema extension is necessary for V1.
   Update `tests/helpers/static-export.mjs` to pass the same explicit capture time
   in build tests rather than accidentally exercising the fixture fallback.
3. Keep home HTML, feed shard paths, embedded first 24, Random pool and route safety
   consistent. A different mix produces its normal new content hash. Inspect Random
   behavior explicitly since its first-48 pool shares browse order. Old open-tab
   feed assets follow existing retention; no standalone Flight payload revival.
4. Add focused tests for exact repeatability, Pacific week/DST boundaries, arrival
   omission, missing anchors, family/type diversity, small/empty pools, consecutive
   weeks, full-catalog one-time reachability and same-context HTML/JSON/manifest.
   Existing shards/retention/homepage/Worker tests must pass.
5. Generate at least eight weekly plans offline from the same accepted snapshot;
   inspect the first two weeks at desktop/mobile widths, every selected image and
   description, Load more 24→48, search/Clear/Back, product links and affiliate tag.
   Snapshot equivalence must prove no identities, source fields or vectors changed.
6. A reviewed **code-only** Cloudflare release may publish this against the accepted
   snapshot independently of paused catalog care. Use the existing maintained file
   release path and full release/receipt checks; do not fabricate a new D1 receipt
   or wait on merchant fetches. Normal future successful publications use the same
   selector. Roll back the policy/selector through that same path if QA fails.

## 4. Measurement without pretending we have a learning engine

Primary outcome: qualified homepage sessions producing retailer outbound clicks.
Secondary: card visibility → product selection → outbound, by mix/lane/position.
Current explicit `view_item_list` events reflect rendered batches, not verified
viewport exposure, so do not call their ratio viewable-card CTR. Keep a clear
rendered-list baseline or introduce real viewport observation in a separate small
analytics slice. Do not add user profiles, autocapture, raw search terms, affiliate
URLs or query-bearing landing pages to providers. Preserve DNT/GPC/QA exclusions.

Current list/select events already include item ID, source and an index, but
list indexes restart per emitted batch while click indexes use current DOM order.
Correct that mismatch before comparing positions. There is no current mix identifier
or reliable homepage-to-product-detail-to-outbound cohort attribution.

Initially, associate the deterministic weekly mix via the accepted release date
in descriptive reports, not exact attribution: old open tabs can retain earlier
mixes, and multiple code/policy releases can occur in one week. If adding mix-level
measurement in V1, reuse the existing
sanitized `item_list_id` for a bounded policy/week value and retain stable UI
contexts; add parity tests for both providers. Do not add redundant new position
properties or a generic analytics schema for this. Lane and precise downstream
cohort tracking can wait until useful traffic exists. Arbitrary new properties
must not bypass the current allowlist.
Preserve existing `page_view`, `search`, `view_item_list`, `select_item`,
`conversion_event_outbound_click` and `random_gift_spin` contracts.

Review two weekly assortments for quality and real click counts, but calendar time
does not establish enough data for an A/B winner. Do not set automatic ranking
weights from a few slot-one clicks. Purchases and revenue stay unknown without
actual affiliate reporting; an outbound event is not a sale or proof of a human.

## 5. Execution order and activation path

1. Finish existing `.4.13` operator/successor/semantic-proof integration and reconcile
   stale runbook/task wording. Preserve completed recovery and history; no replay.
   Use fresh safe state/headroom checks, offline tests and the next normal allowance.
2. In parallel, implement/preview the independent homepage V1 selector. No database
   migration, model call or paid service required.
3. Implement pipeline pre-cap/embedding-waste fixes and existing `.4.11` fairness
   as narrow reviewed commits, not one broad pipeline rewrite. Validate with
   injected providers/offline fixtures before any real supplier call.
4. Record the exact clean maintained operator and existing semantic policy/proof
   carry-forward contract; update and resume the SAME 08:30 task only when it is
   genuinely ready. The owner's existing conditional authorization suffices.
5. Verify actual normal accepted catalog release/source, D1 receipt, resolved build,
   final idle owner, accepted successor and representative live flows. Record
   actual normal scheduled usage/storage in `.4.8`, not code-only release costs.
6. Owner chose the recommended bounded pipeline and autonomous daily/weekly mix.
   Keep `.4.14/.4.15` open until their actual runtime acceptance; attach source,
   test, deployment and normal-run evidence separately. High-volume discovery,
   bulk rewriting and behavior-trained recommendations remain deferred.

No owner credential action or plan upgrade is demonstrated by this research.
If fresh credential/headroom checks fail during implementation, report that exact
gate rather than adding a speculative approval or another recovery framework.

## 6. External evidence (read October 29, 2026)

- [Shopify collection sorting](https://help.shopify.com/en/manual/products/collections/collection-layout)
  documents manual, newest and best-selling order; without orders, best-selling
  falls back to newest. It supports explicit cold-start choices, not fake sales.
- [Uncommon Goods by interest](https://www.uncommongoods.com/interests) visibly
  separates interest navigation, bestsellers and recent items. This is UI evidence,
  not access to its proprietary ranking algorithm.
- [Touch of Modern](https://touchofmodern.com/) promotes curated daily drops.
  Borrow an editorial cadence, not unsupported scarcity/countdowns/sales claims.
- [ThisIsWhyImBroke](https://www.thisiswhyimbroke.com/) returned an unrendered
  JavaScript/404 template to our research tool. Indexed discovery modes are useful
  references, but the template's administrative zero counters are not business
  data and do not reveal its live ranking algorithm.
- [Algolia re-ranking prerequisites](https://support.algolia.com/hc/en-us/articles/9102640890641-Why-is-my-Dynamic-Re-Ranking-not-working)
  require material per-query/per-record interaction volume. These are that product's
  requirements, not a threshold to hard-code here; they illustrate cold-start limits.
- [Shopify product-description guidance](https://help.shopify.com/en/manual/products/details/product-descriptions/write)
  favors specific factual features/benefits over generic unsubstantiated claims.
- [Amazon SearchItems](https://affiliate-program.amazon.com/creatorsapi/docs/en-us/api-reference/operations/search-items)
  documents up to ten results and refinements/category/sort options. Better bounded
  queries are possible; none justify increasing our six-request discovery budget.
- [Cloudflare static-asset limits](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/)
  remain a reason to reuse existing static artifacts and avoid a parallel page
  family. This selector does not add product pages or per-visitor D1/model work.
- [OpenAI scheduled-task guidance](https://developers.openai.com/training/walkthroughs/scheduled-tasks)
  describes local scheduling prerequisites. Local saved task/provider receipts,
  not generic documentation, establish this project's actual execution state.

Retailer patterns inform the recommendation; the exact slots, weeks and query
mix above are our proposed policy and must be evaluated on our actual audience.
