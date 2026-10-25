# Stupid Gifts — Static asset capacity

The October 24 full package has **17,631 files, not 17,631 pages**: 2,514
HTML, 12,568 TXT, 2,402 PNG, 101 JSON and 46 other assets. Cloudflare Free is
kept at the existing hard 20,000-file packaging guard. No catalog trimming or
paid upgrade is part of this work.

## Immediate consolidation

Next exports the full Flight response twice (`page.txt` and
`page/__next._full.txt`), plus a layout-index response repeated across products.
The saved package's TXT bodies have 7,549 distinct hashes: 5,019 files are
byte-identical duplicates. Native anchor navigation is used throughout this
site, but we **keep all RSC URLs** instead of assuming framework files are unused.

The implemented conservative compactor leaves safe/legal files untouched. A
read-only in-memory pass over the actual sealed package reduced **17,631 to
12,623 files** (5,008 duplicates removed) and **335,360,374 to 270,036,801 bytes**.
Every original logical file reconstructed byte-for-byte, and the independent
full route/retention verification passed. That is not a new public deployment.

The builder now stores duplicate, policy-bound TXT bodies once. Its sealed
`assetAliases` map retains each original URL; the Worker uses that URL's original
expiry/state/cache policy and serves the same bytes. Shared safe/legal files,
HTML, scripts, CSS, fonts, photos, OG images and JSON are not removed. The
verifier expands aliases and independently recomputes routing, retention,
checksums and deterministic compaction. No old HTML/RSC retention is introduced.
Historical manifests without the new field still verify with their original
physical layout; they are not rewritten, compacted or uploaded again.

Compaction happens before the Free-plan file check. The builder removes only
its own newly generated duplicate outputs; historical releases and protected
workspaces are untouched. Retirement of the redundant directory independently
removes approximately 600 more files. At the current framework shape, all 3,383
identities as public product pages need 16,916 product/OG files after exact
deduplication, leaving roughly 3,000 files for guides, catalog shards and shared
UI assets. The actual final build, not this estimate, decides publication.

## Full-catalog local acceptance, October 25

The final integrated `596fb83` build, after directory retirement and reviewed
hold resolution, contains **3,353 public gifts and 30 retained held identities**.
Every public product has an existing image and short description (3,353/3,353
for each). The final export has:

- **17,228 physical assets**, including **3,408 HTML files**;
- **6,798 exact-byte RSC aliases**, preserving **27,552 logical guarded routes**;
- **2,772 files of headroom** under the existing 20,000-file Free guard.

Independent checks verify all physical file hashes, original build context,
release identity, catalog digest, feed and reconstructed route/compaction policy.
The root's local desktop/mobile browser checks passed: 24 initial cards,
Load More to 48 distinct cards with 48 descriptions, 36 complete search cards,
and Clear. Local HTTP checks also passed product/affiliate links, guides,
Random, exact aliased RSC bodies and genuine directory/Index 404s.

This was a **private local preview, not production publication**. Full build and
the normal independent release verifier passed against clean `596fb83`. All991
generic placeholders receive exact-ID/title factual short notes in UI/search.
Receipts are in the protected `catalog-resolution-preview-20261025` directory,
including `build-verification-596fb83.json` and `http-checks-596fb83.json`.
The earlier3,355-product builds (`75fae8e`:17,237 files; `33467fc`:17,238) remain
historical evidence, not relabeled as the final3,353-product result. Later
documentation/test-only commits do not change the recorded build identity.
The preview listener was stopped after QA. No provider calls, paid service or
catalog identities were removed for this capacity work.

## Keep the system small

1. Ship directory retirement and exact duplicate storage with all existing
   product URLs preserved. Record actual before/after file/byte counts.
2. Retain the current immutable content-addressed feed shards and bounded
   previous-release overlap. Do not accumulate historical builds in a live
   deployment or increase overlap bounds to hide stale clients.
3. Keep product-specific share images for useful link previews; no need to
   replace them with one generic image while capacity fits.
4. Track file count and remaining headroom on each build. Use **18,000 files**
   (90%) as a review warning, not another publication-approval gate; retain the
   existing hard 20,000-file refusal. At that warning, inspect measured growth
   and bounded old-asset overlap first. If more space is actually needed,
   selectively use the existing brand OG fallback for non-featured links before
   considering any framework rewrite. Do not change architecture or trim the
   catalog merely because a future limit is conceivable.

## Acceptance

- Exact-byte duplicate comparison and deterministic alias selection.
- Every original RSC URL returns identical bytes and content type.
- Different original deadlines still independently switch to safe content.
- Home/search/Load More/product/guide navigation and hydration work on desktop
  and mobile; no missing script, RSC or image request.
- Manifest, actual physical inventory, retained policies and alias verification
  agree; no symlink/traversal/chain or missing-target aliases are accepted.
- The actual complete catalog remains below 20,000 physical assets on Free.

This is file-layout consolidation, not content enrichment, a database change,
catalog deletion, or permission to alter a pending immutable publication.
