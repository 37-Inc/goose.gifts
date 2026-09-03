# Pinterest static-format v10 — 2026-09-03 afternoon Arm A

## Evidence and slot

- Slot: 2026-09-03 afternoon, assigned **Arm A** (clean, text-free editorial)
- Experiment: `exp-pinterest-static-format-v10`
- Public profile before generation: 12 Pins, 247 impressions, 2 Pin clicks,
  1 save, 0 outbound clicks
- Format cohort before generation: 2 Arm B Pins, both at zero impressions,
  saves, Pin clicks, outbound clicks, attributable site sessions, and downstream
  product clicks; 0 post-authorization Arm A Pins
- GA4, trailing 7 days: 30 sessions (28 direct, 2 Amazon Organic Shopping),
  with no `product_click` or `affiliate_click` rows
- First-party database, trailing 7 days: 2 searches, 0 product clicks
- Search Console, 2026-08-27 through 2026-09-03: priority guide pages
  continued to receive impressions but no clicks; no SEO mutation is authorized
  in this slot
- Pizza Boss 3000 reached its first due public checkpoint with 0 impressions,
  saves, Pin clicks, outbound clicks, attributable site sessions, or downstream
  product clicks about 30 hours after publication

Pinterest v3 and Sandbox objects remain permanently excluded from public
performance evidence.

## Exact product verification

- Product: Junwait blue smiling middle-finger resin desk statue
- Stable ID: `B0C7J5SMPK`
- Source listing: `https://www.amazon.com/dp/B0C7J5SMPK?tag=goose-gifts-37-20&linkCode=ogi&th=1&psc=1`
- Canonical destination: `https://www.goose.gifts/gifts/give-the-finger-office-edition`
- Source image: `product-references/B0C7J5SMPK-source.jpg`
- Live state: Amazon Creators API returned `IN_STOCK`, `$12.99`, the same
  image, and dimensions of roughly 4.7 x 4.3 x 3.94 inches on 2026-09-03
- Page state: production returned 200, `index, follow`, and a self-canonical
  link
- Literal product noun phrase: a small matte-blue synthetic-resin desk statue
  shaped like a round seated character with short blue arms and tiny flesh-tone
  hands and feet; its tall flesh-tone raised middle finger is also its long
  smiling face and head

Uncertainty: the source is a small composite listing image rather than a
multi-angle product set. The character's exact back and side construction are
not verified, so both concepts keep the front silhouette dominant and avoid
inventing hidden parts.

## Three genuinely different product-derived concepts

### 1. Middle management

- Board/audience: Funny Gifts for Coworkers; office workers and managers who
  enjoy a dry visual joke
- Hook: a beautifully restrained miniature executive boardroom is empty except
  for the exact four-inch statue presiding at the head of the table
- Stop reason: the polished corporate symmetry registers first; the smiling
  raised-finger head lands on the second look
- Click reason: the viewer needs to confirm whether this genuinely exists as a
  desk object and see its real scale and details
- Exact driving feature: the product's single raised middle finger is literally
  its smiling head, turning it into an implausibly calm chairperson
- Swap test: replacing it with an unrelated desk object breaks the chairperson
  gesture and the entire "middle management" joke
- Fidelity risk: the model may enlarge the four-inch statue to human scale or
  convert the finger/head into a separate hand
- Anti-template mechanism: one product-specific character occupies a plausible
  miniature narrative role; there is no card, badge, headline, logo, or CTA

### 2. The least relaxing desk garden

- Board/audience: Novelty Desk Toys; people saving playful but visually tidy
  desk ideas
- Hook: the exact little blue statue sits serenely in a carefully raked desktop
  sand garden, centered like a meditation figure
- Stop reason: tactile pale sand, smooth stones, and soft window light make a
  calming saveable desk image before the rude gesture appears
- Click reason: the contradiction invites a closer look at the strange statue
  and whether it is a real desk ornament
- Exact driving feature: its closed-eye smile and seated blue body read as calm
  while the elongated face is an unmistakable raised middle finger
- Swap test: a normal figurine would leave only a generic zen-garden image and
  remove the insult-versus-serenity contradiction
- Fidelity risk: sand may bury the tiny feet, or the model may make the finger
  a separate limb instead of the face
- Anti-template mechanism: material contrast and the product's dual expression/
  gesture do the work without a reusable campaign layout

### 3. Museum of workplace diplomacy

- Board/audience: Weird Home Decor; design-minded people saving strange small
  sculptures
- Hook: the exact small statue is displayed under gallery lighting on a narrow
  plinth among distant classical busts
- Stop reason: the formal gallery treatment makes the intentionally crude resin
  character feel absurdly important
- Click reason: viewers may want to discover what the miniature object actually
  is and where it belongs
- Exact driving feature: the smiling finger/head lets the object mimic a bust
  while delivering a gesture no classical bust would make
- Swap test: another odd sculpture could still support the gallery premise, so
  this concept is less product-derived than concepts 1 and 2
- Fidelity risk: scale cues may be weak and the scene could become a generic
  luxury packshot
- Anti-template mechanism: the gallery category collision is specific, but the
  pedestal composition risks becoming reusable and ad-like

## Selection

Generate concepts 1 and 2. Concept 1 has the strongest product-derived joke and
matches the `Funny Gifts for Coworkers` board. Concept 2 supplies a materially
different tactile, top-down-ish environment rather than an angle or palette
variant. Reject concept 3 before generation because its core mechanism would
survive a product swap and the pedestal treatment risks a templated packshot.

Arm A contains no embedded headline or other scene text. The single-click
hypothesis is that a polished, apparently serious workplace or wellness scene
containing this impossible little chairperson earns curiosity about the exact
object, while the clean control tests whether the visual contradiction alone
can create the first attributable outbound click.

## Execution review

### Middle management boardroom — advance

- Artifact: `01-middle-management-boardroom.png`
- Resolution: `1024 x 1536`
- SHA-256:
  `9dd782f10032470318cbfc26d75db8cebc21e10ef62f7caef7bf580985f6611a`
- Mean score: `4.75/5`
- Hard gates: one idea pass; truthful product pass; no embedded CTA pass; no
  ad-template structure pass

Full-resolution inspection shows one scale-plausible miniature walnut
boardroom and one source-faithful small statue presiding at the head: matte-
blue round seated body, short arms, tiny flesh-tone hands and feet, and one
single long flesh-tone smiling finger/head. The empty chairs and table geometry
make the product-specific middle-management joke legible without a headline.
There is no pseudo-writing, logo, price, badge, packaging, CTA, frame, collage,
duplicate product, separate raised hand, extra limb, or visible defect. The
object is reconstructed rather than pixel-identical, so product fidelity is 4
rather than 5; its identity, silhouette, color, construction, and small scale
remain truthful.

### Desk sand garden — reject

- Artifact: `attempts/middle-management-zen-garden.png`
- Resolution: `1024 x 1536`
- SHA-256:
  `5a8d4953cee05d39e6e01b10a88afa9ea615c886d083dfee3a4a1c2b6fffa972`
- Mean score: `4.25/5`

The sand, stones, walnut, light, and product fidelity are strong, but the
centered tray reads closer to conventional product styling and many unrelated
figurines could occupy the same scene. Reject rather than create a second
survivor or revise a weaker core mechanism. The gallery concept remained
ungenerated for the same product-swap and packshot risk. No revision call was
needed.

## Exact production package

- Arm: A, clean text-free editorial
- Board: `Funny Gifts for Coworkers`
- Title: `Middle Management Is Making a Point`
- Description: `A tiny blue resin statue with a smiling middle-finger head chairs an improbably serious miniature board meeting. A funny desk gift for coworkers with no patience left. AI-modified image. Affiliate disclosure: goose.gifts may earn from qualifying purchases.`
- Alt text: `Small matte-blue seated resin character whose smiling face is a raised middle finger, presiding over a miniature walnut boardroom table with six empty chairs.`
- Disclosure: `AI-modified image. Affiliate disclosure: goose.gifts may earn from qualifying purchases.`
- Tracking URL:
  `https://www.goose.gifts/gifts/give-the-finger-office-edition?utm_source=pinterest&utm_medium=organic_social&utm_campaign=pinterest_static_format_v1&utm_content=clean_middle_management_statue_20260903_pm`
- Exact-package approval: `evt-20260903-v10-middle-management-approved`

This is the second and final authorized Pin for 2026-09-03 and the third
qualifying Pin under the bounded 12-Pin static-format comparison. The package
authorizes one guarded production API create after a passing dry run, with no
video, Sandbox use, account mutation, deletion, spend, third daily Pin, or
second publication in this run.

## Production result

- Public Pin: `https://www.pinterest.com/pin/1107815208387734801/`
- Publication receipt:
  `receipt-1788478899705-editorial-middle-management-boardroom-clean-20260903-pm-publication-succeeded`

The guarded production dry run and create both resolved the correct
`goosegifts` BUSINESS account and board. The create read back the exact title,
description, alt text, unique canonical tracking URL, and 1024x1536 artifact.
The immediate baseline was zero impressions, saves, Pin clicks, outbound
clicks, attributable sessions, and downstream product clicks. The format
experiment now contains one Arm A clean Pin and two Arm B headline Pins; no arm
has received distribution yet, so there is no winner.
