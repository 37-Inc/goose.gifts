# Pinterest static-format v10 — 2026-09-04 afternoon Arm B

## Evidence and slot

- Slot: 2026-09-04 afternoon, assigned **Arm B** (search-native editorial
  headline added after image generation)
- Experiment: `exp-pinterest-static-format-v10`
- Public profile before generation: 14 Pins, 253 impressions, 2 Pin clicks,
  1 save, 0 outbound clicks
- Format cohort before generation: 2 Arm A Pins and 2 Arm B Pins; all four
  remained at zero impressions, saves, Pin clicks, outbound clicks,
  attributable site sessions, and downstream product clicks
- GA4, trailing 7 days: 30 sessions (27 direct, 2 Amazon Organic Shopping,
  1 unassigned), with no Pinterest source and no `product_click` or
  `affiliate_click` event
- First-party database: 0 product clicks and 0 searches in 24 hours or 7 days
- Raw Chicken seven-day checkpoint: 1 impression, 0 saves, 0 Pin clicks, and 0
  outbound clicks
- Toilet Golf first scheduled checkpoint after 24 hours: 0 impressions and 0
  engagement

Pinterest v3 and Sandbox objects remain permanently excluded from public
performance evidence. No current result is large enough to identify a format
winner.

## Exact product verification

- Product: Wacky Waving Inflatable Tube Guy (The Original), RP Minis
- Stable ID / ISBN-10: `0762462876`
- Source listing:
  `https://www.amazon.com/dp/0762462876?tag=goose-gifts-37-20&linkCode=ogi&th=1&psc=1`
- Publisher reference:
  `https://www.hachettebookgroup.com/titles/conor-riordan/wacky-waving-inflatable-tube-guy/9780762462872/`
- Canonical destination:
  `https://www.goose.gifts/gifts/wacky-waving-inflatable-tube-guy-your-party-s-best-friend`
- Source image: `product-references/0762462876-source.jpg`
- Live state: Amazon Creators API returned `IN_STOCK`, `$11.66`, and the same
  source image on 2026-09-04
- Publisher truth: a 17-inch red waving tube man with a fan in its black base;
  a 32-page mini history book is included; a 9-volt battery or compatible
  adapter is required and neither is included
- Page state: production returned 200, `index, follow`, and a self-canonical
  link
- Literal product noun phrase: one bright-red nylon air dancer with fringed
  tube top, two white-and-black oval eyes, a wide white smile, two long red
  arms, and a narrow body mounted into a square black plastic fan base; the set
  also contains a small blue history booklet and yellow printed package

Uncertainty: the listing provides only a front composite and does not expose
the base's back or power connector. Keep the front and top of the base dominant,
do not invent controls, and omit the package/book from the editorial scene
rather than imply they are part of the moving object.

## Three genuinely different product-derived concepts

### 1. Full dealership energy, desk-sized

- Board/audience: Novelty Desk Toys; office workers, car people, and people
  saving playful desk setups
- Hook: the exact 17-inch tube guy dances behind a meticulous miniature car
  lot built on a real walnut studio desk
- Stop reason: the model cars and architectural precision read first; the red
  air dancer then makes the tiny dealership absurdly complete
- Click reason: the scale collision invites viewers to confirm that a working
  desktop air dancer with its own fan base really exists
- Exact driving feature: the product miniaturizes the full-size air dancers
  associated with car dealerships
- Swap test: replacing it with an unrelated desk toy breaks the dealership
  recognition and scale joke
- Fidelity risk: the model may turn the tube guy into a rigid figurine, hide
  the fan base, or imply that model cars are included
- Arm fit: the headline `FULL DEALERSHIP ENERGY. DESK-SIZED.` names the specific
  visual contradiction in four words without a command or sales claim
- Anti-template mechanism: a real desk contains one product-specific miniature
  world; there is no card, price, badge, logo, CTA, or reusable product frame

### 2. Your desk needed a hype man

- Board/audience: Novelty Desk Toys and Funny Gifts for Coworkers; people
  saving cheerful home-office ideas
- Hook: the exact tube guy bends enthusiastically toward a closed laptop on a
  colorful but disciplined creative desk
- Stop reason: the red moving silhouette and joyful face interrupt an otherwise
  composed working space
- Click reason: viewers may want to see whether the 17-inch powered desk toy
  actually waves rather than merely stands
- Exact driving feature: its real fan-driven flailing motion makes it a literal
  tiny hype man
- Swap test: a static figurine would not sell the cheerleader role or implied
  movement
- Fidelity risk: generated motion could add arms, remove the square fan base,
  or make the fabric look like solid plastic
- Arm fit: `YOUR DESK NEEDED A HYPE MAN` is a six-word specific-identity hook
  with no purchase instruction
- Anti-template mechanism: motion interrupts a real workspace; the product is
  not centered on a pedestal or isolated like a catalog item

### 3. The smallest office dance break

- Board/audience: Funny Gifts for Coworkers; people collecting Friday office
  humor
- Hook: the tube guy dances alone under one small disco reflection in an empty
  after-hours conference room
- Stop reason: a serious room with one exuberant miniature dancer creates a
  clean mood collision
- Click reason: the viewer may wonder what powers the tiny moving desk figure
  and what is included
- Exact driving feature: its long flexible fabric body and fan base perform the
  real dance
- Swap test: another dancing novelty object could preserve much of the premise
- Fidelity risk: the dark room could obscure the black base or turn the scene
  into a nightclub campaign
- Arm fit: `THE SMALLEST OFFICE DANCE BREAK` is a five-word occasion hook
- Anti-template mechanism: the workplace emptiness is restrained, but the
  mechanism repeats recent office-room storytelling and is less distinctive

## Selection

Generate concepts 1 and 2. The miniature dealership is the strongest product-
derived mechanism because the real product collapses a familiar car-lot object
to desktop scale. The home-office hype-man concept is a materially different,
direct use case. Reject concept 3 before generation because it repeats the
recent conference-room setting and partially survives a product swap.

Generate both bases without typography, then add the assigned Arm B headline
only to the stronger source-faithful execution. The click hypothesis is that a
specific, polished four-to-seven-word identity line helps viewers understand
the desktop-scale contradiction quickly enough to inspect the real working
product rather than only admire the scene.

## Execution review

### Miniature dealership headline — advance

- Artifact: `01-wacky-tube-guy-dealership-headline.png`
- Resolution: `1024 x 1536`
- SHA-256:
  `b97083f02f8b81b952356120e18a08ec8916b55366e29095fae51a8993e36fb3`
- Mean score: `4.63/5`
- Hard gates: one idea pass; truthful product pass; no embedded CTA pass; no
  ad-template structure pass

Full-resolution inspection shows one flexible red fabric dancer with one
fringed top, two eyes, one smile, exactly two arms, a continuous wrinkled body,
and a visible square black fan base at believable 17-inch scale on a real desk.
The unbranded miniature building, three model cars, ruler, and desk edge make
the product's car-lot origin and desk scale instantly legible without presenting
the diorama as included. The generated face and small base hardware are close,
not pixel-identical, so fidelity is 4. No package, mini book, person, duplicate,
extra limb, floating object, recognizable logo, pseudo-writing, CTA, badge,
price, product card, or visible defect appears.

The first deterministic typography layout used the exact four words but its
72-pixel first line intersected the raised red arm. One causal typography-only
revision reduced it to 54 pixels and stacked `FULL DEALERSHIP / ENERGY. /
DESK-SIZED.` in the untouched upper-left wall. The final is correctly spelled,
legible, separated from the product, and editorial rather than promotional.

### Home-office hype man — reject

- Artifact: `attempts/wacky-tube-guy-home-office-base.png`
- Resolution: `1024 x 1536`
- SHA-256:
  `96e52a2c64cad566f2371c89e5539bb446deb666e061fad6add26c20581b8eff`
- Mean score: `4.50/5`

The direct desk use is polished, saveable, truthful, and artifact-free, but its
mechanism repeats a familiar novelty-object-on-desk treatment and offers less
specific curiosity than the product's miniature dealership origin. The empty
conference-room dance break remained ungenerated because it repeated recent
office storytelling. This run used two model-generation calls, one rejected
typography layout, and one causal deterministic typography correction, leaving
one survivor.

## Exact production package

- Arm: B, restrained four-word on-image headline
- Board: `Novelty Desk Toys`
- Title: `Wacky Waving Inflatable Tube Guy for Your Desk`
- Description: `The original 17-inch Wacky Waving Inflatable Tube Guy brings full dealership energy to a desk with its own fan base and a 32-page mini history book. A funny coworker or white elephant gift. Battery and adapter not included. AI-modified image. Affiliate disclosure: goose.gifts may earn from qualifying purchases.`
- Alt text: `Seventeen-inch red Wacky Waving Inflatable Tube Guy dancing on its black fan base behind a miniature three-car dealership diorama beneath the headline “Full dealership energy. Desk-sized.”`
- Disclosure: `AI-modified image. Affiliate disclosure: goose.gifts may earn from qualifying purchases.`
- Tracking URL:
  `https://www.goose.gifts/gifts/wacky-waving-inflatable-tube-guy-your-party-s-best-friend?utm_source=pinterest&utm_medium=organic_social&utm_campaign=pinterest_static_format_v1&utm_content=headline_wacky_tube_guy_dealership_20260904_pm`
- Exact-package approval: `evt-20260904-v10-wacky-tube-guy-approved`

This is the second and final authorized Pin for 2026-09-04 and the fifth
qualifying Pin under the bounded 12-Pin static-format comparison. The package
authorizes one guarded production API create after a passing dry run, with no
video, Sandbox use, account mutation, deletion, spend, second publication in
this run, third daily Pin, or publication beyond the experiment ceiling.

## Production result

- Public Pin: `https://www.pinterest.com/pin/1107815208387817822/`
- Publication receipt:
  `receipt-1788565272225-editorial-wacky-tube-guy-dealership-headline-20260904-pm-publication-succeeded`

The guarded production dry run and create resolved the correct `goosegifts`
BUSINESS account and `Novelty Desk Toys` board. The create read back the exact
title, description, alt text, unique canonical tracking URL, and 1024x1536
artifact. The immediate baseline was zero impressions, saves, Pin clicks,
outbound clicks, attributable sessions, and downstream product clicks. The
format experiment now contains two Arm A clean Pins and three Arm B headline
Pins; none has received distribution yet, so there is no format winner. The
Middle Management Arm A control also remained at zero at its first scheduled
checkpoint after 24 hours.
