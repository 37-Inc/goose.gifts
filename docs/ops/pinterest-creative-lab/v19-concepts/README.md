# Pinterest static-format v10 — 2026-09-07 morning Arm B

## Evidence and slot

- Slot: 2026-09-07 morning, assigned **Arm B** (one restrained four-word
  headline added only after clean-base generation and truth review)
- Experiment: `exp-pinterest-static-format-v10`
- Public profile before generation: 19 Pins, 262 impressions, 2 Pin clicks,
  1 save, and 0 Pinterest outbound clicks
- Format cohort before generation: 4 Arm A Pins at 0 impressions and 5 Arm B
  Pins at 1 impression; neither arm has a save, Pin click, outbound click,
  attributable site session, or downstream product click
- GA4, trailing 7 days: 13 sessions from Direct or Amazon Organic Shopping,
  with no Pinterest source and no product or affiliate click event
- First-party database: 0 product clicks and 0 searches in 24 hours or 7 days
- Daily/cap state: no Pin had been created on 2026-09-07 and 9 of 12 bounded
  format Pins were live

Pinterest v3 and Sandbox objects remain permanently excluded from performance
evidence. One impression is delivery evidence, not enough to identify a format
winner.

## Exact product verification

- Product: AIVXV `OMG that Wiener Switch` yellow ambient night light
- Stable ID: `B0CGXSKGXL`
- Amazon listing:
  `https://www.amazon.com/dp/B0CGXSKGXL?tag=goose-gifts-37-20&linkCode=ogi&th=1&psc=1`
- Canonical destination:
  `https://www.goose.gifts/gifts/wiener-switch-light-up-your-night-with-laughter`
- Saved source: `product-references/B0CGXSKGXL-source.jpg`
- Durable receipt: `verification/B0CGXSKGXL-20260907.json`
- Live state: Amazon Creators API returned `IN_STOCK`, `$16.99`, and the same
  primary image on 2026-09-07
- Product truth: one approximately four-inch yellow male-torso night light with
  a ribbed yellow shade; its protruding anatomy is the push-up/press-down power
  switch. It is an ambient night light, not a bright reading lamp.
- Page state: production returned 200, `index, follow`, and a self-canonical
  link
- Literal product noun phrase: one compact glossy yellow male-torso night
  light with rounded feet, a ribbed drum shade, warm bulb, and one small
  protruding front toggle

## Three genuinely different product-derived concepts

### 1. Serious interiors shoot

- Hook: the exact joke light is photographed like impeccable 1970s design on a
  walnut nightstand in a warm, restrained bedroom
- Save/click reason: the polished room earns the first look; the anatomically
  placed switch makes the second look and invites a click to confirm how it
  turns on
- Swap test: a normal lamp removes the visual double take and makes the
  headline meaningless
- Fidelity risk: the body or switch can become exaggerated, the shade can
  change shape, or the tiny night light can become a full-size table lamp
- Arm fit: `MOOD LIGHTING GOT WEIRD` is four truthful, non-sales words

### 2. After-hours design museum

- Hook: the exact four-inch night light sits on a small travertine plinth in a
  dim design gallery, treated as an absurdly serious functional sculpture
- Save/click reason: gallery restraint gives the toy-sized object unusual
  visual status, while the protruding toggle rewards closer inspection
- Swap test: an ordinary night light leaves no collision between classical
  presentation and cheeky operating mechanism
- Fidelity risk: the plinth could make the object look large or imply that it
  is only sculpture rather than a working light
- Arm fit: the same four-word headline describes the function without a CTA

### 3. White-elephant reveal

- Hook: a hand lifts the glowing light from tissue paper while party guests
  react
- Rejection: not generated because the immediately prior Pin already used a
  social gift reveal, and hands around the product add fidelity risk without a
  new product-derived insight

## Generation and selection

The direct source-bound generation attempt was blocked at the output safety
stage because the real product is anatomy-shaped; no artifact was produced.
The workflow did not alter the product to evade that constraint. Instead, it
generated two text-free 1024-by-1536 context plates and composited a hand-masked
cutout made only from the exact verified source pixels.

The gallery treatment passed the truth and restraint gates but was rejected
because the plinth weakens functional night-light context. The retained
`01-wiener-switch-mood-lighting-headline.png` places one plausibly tiny exact
product on a walnut nightstand. The four-word headline was added
deterministically after base inspection. At full resolution it has no product
reconstruction, duplicate, person, malformed hand, invented feature, price,
badge, product card, frame, logo, CTA, or watermark. It passes all hard gates
at `4.5/5`.

## Exact publishing package

- Candidate: `cand-v10-wiener-switch-mood-lighting`
- Artifact: `01-wiener-switch-mood-lighting-headline.png`
- Board: `Weird Home Decor`
- Title: `Funny Wiener Switch Night Light for Weird Decor`
- Description: `This compact yellow novelty night light looks like a tiny serious design object until you notice the anatomy-operated switch. Push it up and press it down to turn the light on and off; the warm glow is meant for ambience, not reading. A funny white elephant, anniversary, or weird home-decor gift. AI-modified image. Affiliate disclosure: goose.gifts may earn from qualifying purchases.`
- Alt text: `Small yellow male-torso night light with a ribbed shade glowing on a walnut nightstand beneath the headline “Mood lighting got weird.”`
- Disclosure: `AI-modified image. Affiliate disclosure: goose.gifts may earn from qualifying purchases.`
- Tracking URL:
  `https://www.goose.gifts/gifts/wiener-switch-light-up-your-night-with-laughter?utm_source=pinterest&utm_medium=organic_social&utm_campaign=pinterest_static_format_v1&utm_content=headline_wiener_switch_mood_lighting_20260907_am`
- Approval event: `evt-20260907-v10-wiener-switch-approved`
- Draft ID: `editorial-wiener-switch-mood-lighting-headline-20260907-am`

The standing bounded-experiment approval covers this exact package as the
tenth qualifying Pin, sixth Arm B Pin, first local-day Pin, and only Pin in this
run. It does not authorize a second survivor, video, third daily Pin, Sandbox
write, weekly catalog run, SEO mutation, outreach, account change, deletion, or
spend.

## Production result

- Public Pin: `https://www.pinterest.com/pin/1107815208388049691/`
- Production receipt:
  `receipt-1788800062165-editorial-wiener-switch-mood-lighting-headline-20260907-am-publication-succeeded`
- Readback: correct `goosegifts` BUSINESS owner, `Weird Home Decor` board,
  exact title, description, alt text, unique tracking URL, and 1024-by-1536
  image
- Immediate baseline: 0 impressions, saves, Pin clicks, outbound clicks,
  attributable sessions, and downstream product clicks about 17 seconds after
  creation; this is a receipt, not a creative verdict
- Experiment state: 10 of 12; Arm A 4 Pins/0 impressions, Arm B 6 Pins/1
  impression; neither arm has a downstream action

## Checkpoint captured

Fresh Memes Dog Toy reached its 24-hour public checkpoint 24 hours, 5 minutes,
and 32 seconds after creation with zero impressions or actions. It remains
measuring; the absence of distribution is not a verdict on Arm A.
