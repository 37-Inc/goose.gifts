# Pinterest static-format v10 — 2026-09-04 morning Arm A

## Evidence and slot

- Slot: 2026-09-04 morning, assigned **Arm A** (clean editorial, no added
  headline)
- Experiment: `exp-pinterest-static-format-v10`
- Public profile before generation: 13 Pins, 253 impressions, 2 Pin clicks,
  1 save, 0 outbound clicks
- Format cohort before generation: 1 Arm A Pin and 2 Arm B Pins; all three
  remained at zero impressions, saves, Pin clicks, outbound clicks,
  attributable site sessions, and downstream product clicks
- GA4, trailing 7 days: 29 sessions (26 direct, 2 Amazon Organic Shopping,
  1 unassigned), with no Pinterest source or `product_click`/
  `affiliate_click` rows
- First-party database: 0 product clicks in 24 hours or 7 days and 1 search in
  7 days
- Bullshit Button Arm B first scheduled checkpoint after 24 hours: 0
  impressions and 0 engagement about 40 hours after publication. With no
  delivery, this is not a creative verdict.

Pinterest v3 and Sandbox objects remain permanently excluded from public
performance evidence.

## Exact product verification

- Product: FoxUncle weird medieval cat tapestry, 40 by 60 inches
- Stable ID: `B0GSW1X3P4`
- Source listing:
  `https://www.amazon.com/dp/B0GSW1X3P4?tag=goose-gifts-37-20&linkCode=ogi&th=1&psc=1`
- Canonical destination:
  `https://www.goose.gifts/gifts/medieval-cat-tastic-tapestry-a-purrfectly-quirky-decor`
- Source image: `product-references/B0GSW1X3P4-source.jpg`
- Live state: Amazon Creators API returned `IN_STOCK`, `$16.14`, the same
  primary image, polyester material, and a 40-by-60-inch size on 2026-09-04
- Page state: production returned 200, `index, follow`, and a self-canonical
  link
- Literal product noun phrase: one vertical parchment-beige tapestry with an
  ornate red-orange floral and blue-green vine border, a grumpy upright gray
  cat stirring a steaming brown cauldron over orange flames, and the exact
  blackletter sentence `That's it, you're going in the soup.`

Uncertainty: the current listing supplies one 500-pixel composite source rather
than a high-resolution print file. The generated interiors keep every defining
motif and the fixed sentence but reconstruct small illustration lines and
border details; product fidelity is therefore scored 4, not 5.

## Three genuinely different product-derived concepts

### 1. Supper is being supervised

- Board/audience: Weird Home Decor; cat people, dramatic cooks, and people
  saving eccentric but attainable kitchens
- Hook: the exact tapestry hangs over a warm modern breakfast nook with one
  quiet bowl of soup below it
- Stop reason: the beautiful room registers first; the grumpy cauldron cat and
  actual printed threat land on the second look
- Click reason: the viewer can confirm that the illustrated threat is a real
  40-by-60-inch wall hanging and inspect its actual product details
- Exact driving feature: the cat is cooking soup while the single foreground
  bowl makes the fixed product sentence part of a room narrative
- Swap test: unrelated wall decor breaks the soup-night threat and joke
- Fidelity risk: generated illustration details or the printed sentence could
  drift, and the tapestry could be shown at poster scale
- Anti-template mechanism: one contextual bowl extends the product's actual
  story; there is no headline, card, badge, CTA, frame, or reusable layout

### 2. One medieval threat in a modern reading room

- Board/audience: Weird Home Decor; people saving colorful collected interiors
- Hook: the exact parchment tapestry anchors a peacock-blue reading corner
  above a low walnut bookcase
- Stop reason: saturated blue, mustard, rust, walnut, and brass make a highly
  saveable room before the strange cat art is read
- Click reason: the viewer may want to identify the real tapestry anchoring the
  room
- Exact driving feature: the large fixed cat-and-cauldron illustration is the
  only wall art and supplies all humor
- Swap test: many other tapestries could still support this scene, so the
  mechanism is less product-derived than concept 1
- Fidelity risk: aesthetic room styling could overwhelm the product, and book
  spines could acquire pseudo-writing
- Anti-template mechanism: collected-home color and physical fabric avoid an
  ad structure, but the decor premise remains somewhat interchangeable

### 3. The cat's kitchen decree

- Board/audience: Weird Kitchen Gadgets and Weird Home Decor; people drawn to
  maximal old-world kitchens
- Hook: the tapestry hangs near a real stockpot and herbs in a stone-walled
  kitchen
- Stop reason: cat, cauldron, and real cookware create an immediate visual rhyme
- Click reason: the viewer needs to know whether the medieval cat image is a
  purchasable textile
- Exact driving feature: the illustrated cauldron mirrors the real pot
- Swap test: another cooking-themed textile could partially survive the setup
- Fidelity risk: a literal medieval room could become costume styling and make
  the product look like set dressing
- Anti-template mechanism: product imagery drives the prop choice, but the
  themed set risks being too theatrical

## Selection

Generate concepts 1 and 2. Concept 1 has the strongest product-specific
narrative and click reason. Concept 2 is a genuinely different color,
composition, and save motive. Reject concept 3 before generation because its
literal medieval setting would compete with the attainable wall-decor use case.

Arm A means no added creative typography. This product contains fixed printed
words, so truthfully preserving its one real sentence does not turn it into the
Arm B headline treatment. The single-click hypothesis is that a beautiful,
plausible kitchen containing the real threat plus one restrained soup cue can
earn curiosity about the exact tapestry without an overlay or sales command.

## Execution review

### Kitchen banquette — advance

- Artifact: `01-medieval-cat-kitchen-banquette.png`
- Resolution: `1024 x 1536`
- SHA-256:
  `d7781762341c904fd24043d9232f3af2823724a27d0633d4b5c2be6c62705d7f`
- Mean score: `4.88/5`
- Hard gates: one idea pass; truthful product pass; no embedded CTA pass; no
  ad-template structure pass

Full-resolution inspection shows a believable warm breakfast nook with one
vertical, scale-plausible tapestry, one soup bowl and spoon, one vase, natural
cloth and wood texture, coherent window shadows, and grounded furniture. The
tapestry retains the parchment field, floral-vine border, grumpy gray cat,
steaming cauldron, orange flames, and exact single fixed sentence. It is a
source-faithful reconstruction rather than a pixel-identical print, which keeps
fidelity at 4. There is no added headline, pseudo-writing, person, living cat,
package, frame, badge, logo, price, CTA, card, collage, duplicate product, or
visible artifact. The bowl makes the visual mechanism fail the product-swap
test in the right direction.

### Reading room — reject

- Artifact: `attempts/medieval-cat-reading-room.png`
- Resolution: `1024 x 1536`
- SHA-256:
  `0a96f258affa7bdc1e82c6605d3666b4640b91472d0a0fedf9fa227debbd1c50`
- Mean score: `4.63/5`

The reading room is coherent, handsome, saveable, text-clean outside the
product, and product-faithful. Reject it because many unrelated tapestries
could occupy the same composition and the contextual click reason is weaker.
No causal model weakness justified a revision call; the ungenerated medieval
kitchen remained rejected for the same themed-set risk. This run produced one
survivor only.

## Exact production package

- Arm: A, clean editorial with no added headline
- Board: `Weird Home Decor`
- Title: `This Cat Has a Soup Policy`
- Description: `A grumpy medieval cat, one simmering cauldron, and the exact “you're going in the soup” tapestry presiding over a warm breakfast nook. A weird wall-decor gift for cat people with dramatic kitchens. AI-modified image. Affiliate disclosure: goose.gifts may earn from qualifying purchases.`
- Alt text: `Beige medieval-style tapestry showing a grumpy gray cat stirring a steaming cauldron beneath the words “That's it, you're going in the soup,” above a warm oak breakfast nook.`
- Disclosure: `AI-modified image. Affiliate disclosure: goose.gifts may earn from qualifying purchases.`
- Tracking URL:
  `https://www.goose.gifts/gifts/medieval-cat-tastic-tapestry-a-purrfectly-quirky-decor?utm_source=pinterest&utm_medium=organic_social&utm_campaign=pinterest_static_format_v1&utm_content=clean_medieval_cat_soup_20260904_am`
- Exact-package approval: `evt-20260904-v10-medieval-cat-approved`

This is the first authorized Pin for 2026-09-04 and the fourth qualifying Pin
under the bounded 12-Pin static-format comparison. The package authorizes one
guarded production API create after a passing dry run, with no video, Sandbox
use, account mutation, deletion, spend, second publication in this run, third
daily Pin, or publication beyond the experiment ceiling.

## Production result

- Public Pin: `https://www.pinterest.com/pin/1107815208387789981/`
- Publication receipt:
  `receipt-1788540089872-editorial-medieval-cat-soup-banquette-clean-20260904-am-publication-succeeded`

The guarded production dry run and create resolved the correct `goosegifts`
BUSINESS account and `Weird Home Decor` board. The create read back the exact
title, description, alt text, unique canonical tracking URL, and 1024x1536
artifact. The immediate baseline was zero impressions, saves, Pin clicks,
outbound clicks, attributable sessions, and downstream product clicks. The
format experiment now contains two Arm A clean Pins and two Arm B headline
Pins; none has received distribution yet, so there is no format winner.
