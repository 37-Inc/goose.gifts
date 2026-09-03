# Pinterest static format comparison: Toilet Golf headline arm

## Slot assignment and evidence

- Local slot: 2026-09-03 morning
- Assigned arm: B, one restrained four-to-seven-word editorial headline
- Pairing plan: use `Funny White Elephant Gifts` and a playful functional
  product now, then prefer a comparably giftable text-free control for the
  afternoon slot. Product/category differences remain an unavoidable caveat.
- Public baseline at 2026-09-03 09:31 PDT: eleven truthful public Pins, 247
  impressions, two Pin clicks, one save, and zero Pinterest outbound clicks.
  The two September 2 Pins remain at zero impressions. GA4 reports 30 sessions
  in the trailing seven days (28 direct, two Amazon organic-shopping), no
  Pinterest source, and no `product_click` or `affiliate_click` event. The
  first-party database likewise records zero product clicks in 24 hours or
  seven days. Pinterest v3 and Sandbox are excluded.

## Verified product truth

- Product: GOODLYSPORTS Toilet Golf gag game, ASIN `B0BBCHQJSN`
- Reverified: 2026-09-03 through Amazon Creators API
- Current state: `IN_STOCK` at `$13.37`
- Source: `product-references/B0BBCHQJSN-primary.jpg`
- Source SHA-256:
  `5b70b83b618fc4746dff2555787cde558d515da6b397b7ff7f175669b6a136fe`
- Literal product noun phrase: a five-piece bathroom putting game comprising a
  roughly 27-by-31-inch contoured green printed fairway mat, a short black-and-
  red putter, white practice balls, and a small black practice cup with a red
  triangular flag.
- Exact use: the mat lies on the bathroom floor in front of a toilet so a
  seated player can putt toward the flagged cup. The person and toilet in the
  retail image are usage context, not included product components.
- Canonical destination:
  `https://www.goose.gifts/gifts/putt-on-the-potty-funny-toilet-golf-gift`
  returned 200 with `index, follow` and a self-canonical URL.
- Fidelity risks: rendering a full-size golf course, a conventional standalone
  putting mat with no bathroom context, extra clubs or holes, a turf rug, a
  person with malformed anatomy, or implying the toilet is included.

## Three product-derived concepts

### 1. The powder-room country club — selected for generation

- Audience/board: white-elephant and funny-dad gift savers;
  `Funny White Elephant Gifts`.
- Stop reason: a genuinely elegant, old-club powder room unexpectedly contains
  a tiny playable fairway running from the toilet to a red-flagged cup.
- Click reason: the image establishes the joke but leaves the exact kit,
  components, dimensions, and whether it is actually playable to the product
  page.
- Exact product feature: only this toilet-positioned green mat, miniature
  putter, ball, and flagged cup can turn the powder room into a golf hole.
- Swap test: replacing the kit with an unrelated novelty item destroys the
  country-club/bathroom collision.
- Fidelity risk: making the course too large, omitting the toilet relationship,
  or inventing a built-in bathroom fixture.
- Proposed headline: `PAR FOR THE PORCELAIN` — four words, an occasion/identity
  joke rather than a CTA.

### 2. Tournament morning overhead — selected for generation

- Audience/board: golfers, white-elephant shoppers, and design-minded humor
  savers; `Funny White Elephant Gifts`.
- Stop reason: a composed overhead editorial photograph makes the small green
  mat read like a real course map until the white porcelain toilet edge enters
  the frame.
- Click reason: the tightly arranged components invite inspection of how the
  absurd game fits and works in a normal bathroom.
- Exact product feature: the contoured fairway print, short putter, white ball,
  and red-flagged cup form a complete miniature hole.
- Swap test: another gift cannot preserve the overhead golf-course illusion.
- Fidelity risk: flattening the kit into a generic poster or changing the
  component count and proportions.
- Proposed headline: `THE NINETEENTH HOLE, TECHNICALLY` — four words.

### 3. The toilet-paper caddy — rejected before generation

- Audience/board: bathroom-humor and dad-gift savers.
- Stop reason: a sculptural toilet-paper stand acts like a club caddy beside
  the ready-to-play mat.
- Click reason: the viewer would want to understand whether the joke is one
  product or a styled set.
- Exact product feature: the short putter and bathroom placement create the
  caddy metaphor.
- Swap test: the premise weakens without a golf kit, but the extra prop could
  become more prominent than the actual product.
- Fidelity risk: falsely implying that a caddy/toilet-paper holder is included,
  cluttering the scene, and weakening the one-product click promise.
- Decision: reject before generation. The added prop makes the linked package
  less truthful and less immediately legible.

Generate concepts 1 and 2 as separate text-free bases using the exact source as
the product-identity reference. Inspect both at full resolution, advance only
the stronger truthful execution, and add its exact headline deterministically
after generation. Make at most one causal model revision if a diagnosed
weakness survives.

## Execution review

### Powder-room country club — advance

- Base: `attempts/toilet-golf-country-club-base.png`
- Final artifact: `01-toilet-golf-country-club-headline.png`
- Resolution: `1024 × 1536`
- Final SHA-256:
  `c650acddc30b6436bd606e70e9c8e2ff783d82c1560a3cb6fb3fff8912017325`
- Mean score: `4.50/5`
- Hard gates: one idea pass; truthful product pass; no embedded CTA pass; no
  ad-template structure pass

Full-resolution inspection shows one ordinary toilet as context and one small,
grounded game kit: a contoured green printed fairway mat, short black-and-red
putter, white ball, open black receiving cup, and red number-one flag. The
four-word headline is deterministic and clean on the existing dark
wainscoting. It adds no sales instruction, price, badge, logo, fake control, or
product-card frame. The fairway print is a close rather than pixel-identical
recreation, so product fidelity is scored 4 rather than 5; object identity,
component set, scale, use, and destination promise remain truthful.

### Tournament morning overhead — reject

- Artifact: `attempts/toilet-golf-overhead-base.png`
- Resolution: `1024 × 1536`
- SHA-256:
  `54f71fdd199660d45c36779339e860e5533d70ee3d6244fcd3282c53de2bbcc5`
- Decision: reject. The composition is graphic and attractive, but the black
  receiving cup reads as a solid display base with a ball perched on it, and
  the isolated flat lay feels closer to catalog arrangement than discovered
  editorial humor.

No model revision was needed. The deterministic headline treatment changes
only typography on the stronger country-club base and leaves the room, toilet,
and game kit untouched.

## Production package and result

- Arm: B, restrained on-image headline
- Board: `Funny White Elephant Gifts`
- Title: `Toilet Golf Gag Gift for Golfers`
- Tracking URL:
  `https://www.goose.gifts/gifts/putt-on-the-potty-funny-toilet-golf-gift?utm_source=pinterest&utm_medium=organic_social&utm_campaign=pinterest_static_format_v1&utm_content=headline_toilet_golf_country_club_20260903_am`
- Exact-package approval: `evt-20260903-v10-toilet-golf-approved`
- Public Pin: `https://www.pinterest.com/pin/1107815208387708056/`
- Publication receipt:
  `receipt-1788453732073-editorial-toilet-golf-country-club-headline-20260903-am-publication-succeeded`

The guarded production dry run and create both resolved the correct
`goosegifts` BUSINESS account and board. The create read back the exact title,
description, alt text, unique canonical tracking URL, and 1024x1536 artifact.
The immediate public baseline was zero impressions, saves, Pin clicks, and
outbound clicks. The experiment now has two Arm B headline Pins and no
post-authorization Arm A control Pin; the afternoon slot should prefer a
comparably giftable text-free control if one clears every gate.
