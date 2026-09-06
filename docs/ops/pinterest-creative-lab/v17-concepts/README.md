# Pinterest static-format v10 — 2026-09-06 morning Arm A

## Evidence and slot

- Slot: 2026-09-06 morning, assigned **Arm A** (clean editorial, no added
  typography)
- Experiment: `exp-pinterest-static-format-v10`
- Public profile before generation: 17 Pins, 261 impressions, 2 Pin clicks,
  1 save, 0 Pinterest outbound clicks, 0 followers, and 263 monthly views
- Format cohort before generation: 3 Arm A Pins at 0 impressions and 4 Arm B
  Pins at 1 impression; neither arm has a format-cohort save, Pin click,
  outbound click, attributable site session, or downstream product click
- GA4, trailing 7 days: 13 `session_start` events and no Pinterest source,
  `product_click`, or `affiliate_click` event
- First-party database: 0 product clicks and 0 searches in 24 hours; 0 product
  clicks and 0 searches in 7 days

Pinterest v3 and Sandbox objects remain permanently excluded. One Arm B
impression is a delivery receipt, not a format winner.

## Exact product verification

- Product: Fresh Memes medium ChewyV plush squeaky dog toy
- Stable ID: `B0FNNBK8Q6`
- Amazon listing:
  `https://www.amazon.com/dp/B0FNNBK8Q6?tag=goose-gifts-37-20&linkCode=ogi&th=1&psc=1`
- Canonical destination:
  `https://www.goose.gifts/gifts/fresh-memes-dog-toy-fetch-a-laugh`
- Saved reference: `references/fresh-memes-dog-toy-source.jpg`
- Durable verification receipt:
  `verification/B0FNNBK8Q6-20260906.json`, linked by append-only event
  `evt-20260906-v10-dog-toy-verification-receipt`
- Live state: Amazon Creators API returned `IN_STOCK`, `$18.99`, and the same
  current primary image on 2026-09-06
- Page state: production returned 200, `index, follow`, and a self-canonical
  link
- Literal product noun phrase: one medium plush slipper-shaped dog toy with a
  tan body, fuzzy ochre footbed and rounded open toe, green-red-green band,
  centered black `POOCCI` product lettering, soft stuffed construction, and a
  hidden squeaker

The source photo includes a golden retriever puppy as usage context; the puppy
is not included with the product. The unavailable belly fanny pack
`B075S2ZCYQ` was rejected during live selection rather than sent to generation.

## Three genuinely different product-derived concepts

### 1. Gallery runway

- Board/audience: Funny Gifts for Pet Lovers; dog owners, pet-style savers, and
  people looking for funny dog gifts
- Hook: one adult golden retriever trots confidently down a restrained gallery
  corridor carrying the exact slipper-shaped toy like a fashion accessory
- Stop/save reason: the composed runway photograph and proud dog register
  before the parody footwear becomes the second look
- Click reason: viewers can inspect whether the funny accessory is a real,
  carryable squeaky toy rather than a styled prop
- Driving feature: the slipper silhouette, fuzzy ochre opening, stripe, and
  product lettering create the fashion-category collision
- Swap test: a ball, rope, or ordinary plush destroys the runway-accessory joke
- Fidelity risk: generation could make the toy into a wearable shoe, alter its
  lettering or stripes, merge it into the dog's mouth, or distort canine legs
- Arm fit: the product and dog's confident movement carry the clean Arm A idea
  without a headline
- Anti-template mechanism: a real use moment is photographed with fashion
  restraint; there is no card, frame, badge, price, logo, or CTA

### 2. Mudroom mix-up

- Board/audience: dog owners and people saving playful home and pet styling
- Hook: a beautiful entryway shoe shelf contains neutral adult shoes while the
  exact plush toy sits on the floor in front of an expectant dog
- Stop/save reason: the clean home vignette becomes funny when one "shoe" is
  visibly fuzzy, squeaky, and dog sized
- Click reason: viewers may want to see how the product works as both dog toy
  and visual prank
- Driving feature: its slipper form and fashion-parody stripe make the mistaken
  shoe placement legible
- Swap test: an ordinary bone or plush removes the entire shoe-rack double take
- Fidelity risk: the model could scale the toy as human footwear, add a pair,
  or make the dog wear it
- Arm fit: text-free editorial identity scene
- Anti-template mechanism: a product-specific domestic mix-up, not a reusable
  merchandise layout

### 3. Velvet-lobby portrait

- Board/audience: style-minded dog owners and funny gift shoppers
- Hook: a poised dog sits on a moss velvet lobby bench with the toy resting at
  its paws like a luxury purchase
- Stop/save reason: a restrained pet portrait gives the parody toy an amusing
  high-low contrast
- Click reason: the large foreground product makes its soft texture and slipper
  construction inspectable
- Driving feature: plush fashion parody and squeaker use
- Swap test: a normal dog toy preserves too much of the general luxury-pet scene
- Fidelity risk: staged glamour could read as an ad and the product could be
  treated as a real shoe
- Arm fit: clean and text-free but less specifically derived
- Anti-template mechanism: product color and form set the palette, though the
  concept is weaker than the two selected directions

Generate concepts 1 and 2. Reject concept 3 before generation because its
luxury-pet portrait mechanism survives too much of a product swap.

## Selection and outcome

Both separate 1024x1536 attempts passed truth, single-idea, no-CTA, and
no-template gates at full useful resolution. The mudroom mix-up scored
`4.75/5` but was rejected because its stationary composition is less active
and emotionally immediate at thumbnail size. The gallery runway scored
`4.88/5`, preserved the exact plush-toy identity and natural carry use, and
became the only survivor. No causal revision was justified, so the run stopped
at two model calls.

The exact publication package uses the canonical enriched product page,
`Funny White Elephant Gifts` board, search-first title `Funny Squeaky Dog Toy
for Stylish Pups`, complete AI-modified and affiliate disclosures, and unique
`clean_dog_toy_gallery_runway_20260906_am` tracking content. It is Arm A and
the eighth qualifying Pin under the 12-Pin experiment cap.

The production dry run verified the exact package, correct `goosegifts`
BUSINESS account, first-and-only daily slot, unique UTM, complete disclosures,
and vertical artifact. Pinterest API v5 created and read-verified Standard Pin
`1107815208387966131` and wrote receipt
`receipt-1788712937232-editorial-dog-toy-gallery-runway-clean-20260906-am-publication-succeeded`.
The experiment is now balanced at 8 of 12: four Arm A clean Pins and four Arm B
headline Pins. Arm B has one public impression, Arm A has none, and neither arm
has a downstream action, so there is no winner.
