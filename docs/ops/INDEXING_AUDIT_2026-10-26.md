# Stupid Gifts — Indexing alert audit

Tracked in `roadmap-lbbz1.9`. Local implementation is not a production receipt.

## Verified cause

October26 live release `owner-held-final-20261026` has3,352public listings,
31specific exclusions and42original articles. Its sitemap contains87URLs,
including only42product pages. The other3,310public product pages carry both
HTML and HTTP `noindex`: page metadata and route policy reused the sealed
long-editorial qualification flag as general page indexability.

The signed-in Search Console report currently shows data last updatedOctober22:
five product noindex examples (last crawledOctober22) and two redirect examples
(HTTP apex/www homepages, last crawledOctober23). Those HTTP redirects are
intentional HTTPS/canonical normalization, not pages we should make indexable.
Search Console also confirms two old properties moving to the new domain.

Noindex examples:

- `/gifts/so-funny-it-might-cramp-your-style-chicken-soup-edition`
- `/gifts/the-worst-case-scenario-handbook-because-life-happens`
- `/gifts/life-and-other-mysteries-memoir-full-of-laughs`
- `/gifts/the-book-of-unusual-knowledge-the-facts-are-in`
- `/gifts/maths-laughs-a-comedic-equation`

The alert is delayed relative to recent catalog releases, but the live article-
only restriction is real and still needs correction. Robots.txt already permits
public search/AI crawling, with API/safe/preview exclusions; do not replace that
with bot-specific groups that accidentally bypass those exclusions.

## Narrow correction

Canonical product pages come only from the validated public catalog allowlist.
Use that existing publication decision, not the presence of a long article, for
HTML metadata and the matching Worker route/sitemap policy. Keep all fixture,
preview, held identity, auxiliary resource, query URL and finite-expiry controls.
Do not rewrite sealed product/indexability flags, native evidence, original
content, IDs, slugs, affiliate URLs or observation deadlines. No enrichment,
merchant/model batch, per-visitor database work, new service or paid plan is
needed to remove this presentation-layer restriction.

Approved finite public listings remain indexable only while their existing
route policy permits serving them; expired content still uses its noindex safe
fallback. This does not promote unapproved or excluded records into the public
allowlist. Short factual descriptions/images are existing content, not invented
articles, prices, ratings, scarcity or show endorsement.

## Verification and release

Build from the unchanged accepted full snapshot; require all3,352canonical
product routes to be eligible, all31exclusions still held, all42articles and
snapshot bytes unchanged, and HTML/HTTP/sitemap agreement. Check Googlebot,
Bingbot and search-oriented AI user agents with bounded functional probes;
user-agent tests are not authenticated crawler-IP evidence. Keep the reviewed
~7kdocument-only output and no external Flight requirement.

Review/merge normally, then deliberately advance the existing daily operator
only when no run is active. Never edit an active source/config, replay an old
publication or fetch another batch for SEO. Actual acceptance requires public
source/receipt/resolved-build/idle-owner/successor plus formerly blocked pages
and the complete live sitemap. Only then resubmit the canonical sitemap and
start appropriate noindex validation in Search Console. Expected redirects and
intentional exclusions do not need to be “fixed” away. Keep this Bead open until
production/provider evidence is recorded; Google's indexing after recrawl is
not guaranteed.

## Official guidance

- [Google: noindex](https://developers.google.com/search/docs/crawling-indexing/block-indexing)
- [Google: domain moves](https://developers.google.com/search/docs/crawling-indexing/site-move-with-url-changes)
- [Google: AI features](https://developers.google.com/search/docs/appearance/ai-features)
- [OpenAI: search crawler versus training crawler](https://developers.openai.com/api/docs/bots)

Prioritize crawlable useful HTML, canonical URLs, sitemap coverage, truthful
structured data and internal links. There is no special Google AI schema/text
file requirement; permitting OAI-SearchBot concerns ChatGPT search, while GPTBot
is a separate training control. Do not claim a ranking/citation guarantee or
add fabricated FAQ/statistical content.
