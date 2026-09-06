# Pinterest static-format v10 — 2026-09-06 afternoon Arm B

## Evidence and slot

- Slot: 2026-09-06 afternoon, assigned **Arm B** (one restrained six-word
  headline added only after clean-base generation and truth review)
- Experiment: `exp-pinterest-static-format-v10`
- Public profile before generation: 18 Pins, 261 impressions, 2 Pin clicks,
  1 save, and 0 Pinterest outbound clicks
- Format cohort before generation: 4 Arm A Pins at 0 impressions and 4 Arm B
  Pins at 1 impression; neither arm has a save, Pin click, outbound click,
  attributable site session, or downstream product click
- GA4, trailing 7 days: 13 sessions, all direct or Amazon Organic Shopping,
  with no Pinterest source and no `product_click` or `affiliate_click` event
- First-party database: 0 product clicks and 0 searches in 24 hours or 7 days
- Daily/cap state: the morning Fresh Memes Pin was the only Pin created on
  2026-09-06 before this slot; 8 of 12 bounded format Pins were live

Pinterest v3 and Sandbox objects remain permanently excluded from performance
evidence. One impression is delivery evidence, not enough to identify a format
winner.

## Exact product verification

- Product: Prank-O My First Fire empty prank gift box
- Stable ID: `B0757WW6KB`
- Amazon listing:
  `https://www.amazon.com/dp/B0757WW6KB?tag=goose-gifts-37-20&linkCode=ogi&th=1&psc=1`
- Canonical destination:
  `https://www.goose.gifts/gifts/my-first-fire-not-what-you-think-it-is`
- Saved source: `product-references/B0757WW6KB-source.jpg`
- Durable receipt: `verification/B0757WW6KB-20260906.json`
- Live state: Amazon Creators API returned `IN_STOCK`, `$8.99`, and the same
  primary image on 2026-09-06
- Product truth: this is one empty professionally printed recyclable cardboard
  box, assembled to 11.25 by 9 by 3.25 inches, that hides a real present; it
  contains no fire starter, fire ring, poker, logs, or fuel can
- Page state: production returned 200, `index, follow`, and a self-canonical
  link
- First-party signal: the product has one catalog click in the 90-day database
  window
- Literal product noun phrase: one rectangular cream retail-style prank gift
  box with a dark fiery top, orange-brown `My First Fire` title, printed child
  beside a fake gray fire ring, red feature list, small printed fuel can and
  logs, and teal right panel

## Three genuinely different product-derived concepts

### 1. Quiet false-alarm aftermath

- Hook: the exact alarming box sits in torn cream paper on a warm travertine
  table after an otherwise tasteful gift exchange
- Save/click reason: refined wrapping creates a visual mismatch, while the
  viewer clicks to confirm that the apparent children's fire kit is only an
  empty box hiding the real present
- Swap test: a normal present removes both the false-alarm headline and the
  refined-versus-alarming packaging collision
- Fidelity risk: direct generation could rewrite dense fixed package copy or
  turn printed flames into real fire
- Arm fit: `FALSE ALARM. IT'S JUST THE BOX.` is six truthful, non-sales words

### 2. Party reveal

- Hook: three softly focused adult guests lean toward the exact box at the
  instant its prank package is revealed on a walnut table
- Save/click reason: the guests make the social payoff legible before the
  detailed package supplies a second look; the destination explains how the
  empty box hides a real gift
- Swap test: an ordinary product leaves the reactions and false-alarm line
  without a premise
- Fidelity risk: people could dominate, the box could look pasted-on, or a
  generative reconstruction could alter the fixed art
- Arm fit: the same six-word headline resolves the surprise without a CTA

### 3. Office exchange

- Hook: the box arrives among coworker gifts after a lunch exchange
- Rejection: not generated because the public cohort already overrepresents
  desk and workplace scenes; the visual mechanism also survives too much of a
  product swap

## Generation and selection

The first source-image scene expansion was blocked at the output moderation
stage because the real package itself combines a printed young child and
flames. No artifact was produced. The workflow did not rewrite or remove the
fixed product art. Instead, two text-free 1024x1536 editorial background plates
were generated and the exact verified source pixels were composited once into
each.

The quiet aftermath's first mask was oversized and carried a white catalog
shadow wedge. A single bounded composite correction traced the true package
silhouette, reduced it to plausible scale, and replaced the shadow without
changing any interior product pixel. It passed all gates after the correction
but was rejected because the social version has greater thumbnail energy.

The retained party reveal is
`01-first-fire-false-alarm-headline.png`. At full resolution it contains one
plausibly scaled exact-source package, three secondary adults, coherent
wrapping/table contact, and the exact headline once. It has no actual fire,
real child outside the printed box, claimed included fire parts, duplicate,
malformed hand, product card, price, badge, button, CTA, logo overlay, frame,
or watermark. It passed all four hard gates at `4.75/5`.

## Exact publishing package

- Candidate: `cand-v10-first-fire-false-alarm`
- Artifact: `01-first-fire-false-alarm-headline.png`
- Board: `Funny White Elephant Gifts`
- Title: `Funny Prank Gift Box for White Elephant`
- Description: `This empty My First Fire prank gift box makes a present look like a wildly questionable fire-starting kit for kids—then reveals the real gift hidden inside. The recyclable cardboard box ships flat and measures 11.25 by 9 by 3.25 inches when assembled. No fire starter included. AI-modified image. Affiliate disclosure: goose.gifts may earn from qualifying purchases.`
- Alt text: `My First Fire empty prank gift box sitting in torn cream wrapping paper on a dinner table while three adults laugh beneath the headline “False alarm. It’s just the box.”`
- Disclosure: `AI-modified image. Affiliate disclosure: goose.gifts may earn from qualifying purchases.`
- Tracking URL:
  `https://www.goose.gifts/gifts/my-first-fire-not-what-you-think-it-is?utm_source=pinterest&utm_medium=organic_social&utm_campaign=pinterest_static_format_v1&utm_content=headline_first_fire_false_alarm_20260906_pm`
- Approval event: `evt-20260906-v10-first-fire-approved`
- Draft ID: `editorial-first-fire-false-alarm-headline-20260906-pm`

The exact package is authorized as the ninth qualifying Pin, fifth Arm B Pin,
second-and-final local-day Pin, and only Pin in this run. The experiment ceiling
remains 12. No video, third daily Pin, additional survivor, Sandbox write,
weekly catalog run, SEO change, outreach, paid tool, account mutation, deletion,
or spend is authorized.

## Production result

- Public Pin: `https://www.pinterest.com/pin/1107815208387994026/`
- Production receipt:
  `receipt-1788738598412-editorial-first-fire-false-alarm-headline-20260906-pm-publication-succeeded`
- Readback: correct `goosegifts` BUSINESS owner, `Funny White Elephant Gifts`
  board, exact title, description, alt text, unique tracking URL, and 1024x1536
  image
- Immediate baseline: 0 impressions, saves, Pin clicks, outbound clicks,
  attributable sessions, and downstream product clicks about 18 seconds after
  creation; this is a receipt, not a creative verdict
- Experiment state: 9 of 12; Arm A 4 Pins/0 impressions, Arm B 5 Pins/1
  impression; neither arm has a downstream action

## Checkpoint captured

Shark Mug reached its 24-hour public checkpoint 24 hours, 1 minute, and 22
seconds after creation with zero impressions or actions. It remains measuring;
the absence of distribution is not a verdict on Arm A.
