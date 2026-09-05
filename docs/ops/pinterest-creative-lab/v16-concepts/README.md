# Pinterest static-format v10 — 2026-09-05 afternoon Arm A

## Evidence and slot

- Slot: 2026-09-05 afternoon, assigned **Arm A** (clean editorial, no added
  typography)
- Experiment: `exp-pinterest-static-format-v10`
- Public profile before generation: 16 Pins, 261 impressions, 2 Pin clicks,
  1 save, 0 Pinterest outbound clicks, 0 followers, and 263 monthly views
- Format cohort before generation: 2 Arm A Pins at 0 impressions and 4 Arm B
  Pins at 1 impression, specifically Bullshit Button; neither arm has a save,
  Pin click, outbound click, attributable site session, or downstream product
  click
- GA4, trailing 7 days: 11 `session_start` events, no Pinterest source, and no
  `product_click` or `affiliate_click` event
- First-party database: 0 product clicks and 0 searches in 24 hours; 0 product
  clicks and 0 searches in 7 days
- Wacky Waving Inflatable Tube Guy exact 24-hour checkpoint: 0 impressions,
  saves, Pin clicks, outbound clicks, or downstream action

Pinterest v3 and Sandbox objects remain permanently excluded. One Arm B
impression is a delivery receipt, not a format winner.

## Exact product verification

- Product: Glazery 13.5-ounce gray 3D shark ceramic coffee mug
- Stable ID: `B0DFW4V57B`
- Amazon listing:
  `https://www.amazon.com/dp/B0DFW4V57B?tag=goose-gifts-37-20&linkCode=ogi&th=1&psc=1`
- Canonical destination:
  `https://www.goose.gifts/gifts/shark-attack-coffee-mug-for-jawsome-sips`
- Saved reference: `product-references/B0DFW4V57B-source.jpg`
- Durable verification receipt:
  `verification/B0DFW4V57B-20260905.json`, linked by append-only event
  `evt-20260905-v10-shark-mug-verification-receipt`
- Live state: Amazon Creators API returned `IN_STOCK`, `$19.99`, and the same
  current primary image on 2026-09-05
- Page state: production returned 200, `index, follow`, and a self-canonical
  link
- Literal product noun phrase: one ordinary glossy ceramic mug with a gray
  shark face wrapping its front, white back and loop handle, projecting pointed
  snout, small raised fins, tiny black eye, blue base rim, and a wide irregular
  red drinking opening edged with blunt white teeth

The shortlist's `$18.99` price was stale and was not used in the public copy.
Breakfast props are context, not included product components.

## Three genuinely different product-derived concepts

### 1. Coastal breakfast

- Board/audience: Weird Kitchen Gadgets; shark fans, ocean lovers, funny-mug
  savers, and people collecting playful breakfast styling
- Hook: one shark mug holds coffee on pale limestone beside striped linen,
  sourdough toast, and a spoon under soft watery window reflections
- Stop/save reason: bright attainable breakfast styling reads before the
  tooth-lined mouth and projecting shark face create the second look
- Click reason: the viewer can inspect whether the surprising mouth rim is a
  real usable mug and see its exact shape
- Driving feature: the red tooth-lined opening, gray face, snout, fins, and
  blue base make the mug specific rather than merely shark themed
- Swap test: replacing it with a normal mug destroys the entire double take
- Fidelity risk: generation could animate the shark, invent fins or teeth,
  alter the color blocking, hide the handle, or make the mouth unusable
- Arm fit: the product shape alone carries the clean Arm A idea; no copy is
  needed
- Anti-template mechanism: a normal breakfast is interrupted by the exact
  sculptural drinking rim, with no product card, frame, badge, or CTA

### 2. Oceanographer flat lay

- Board/audience: ocean lovers and novelty-mug collectors
- Hook: a top-down study surface with the mug, a blank blue field notebook,
  pencil, shell, and folded chart
- Stop/save reason: calm scientific field-kit organization could make a
  saveable gift identity
- Click reason: viewers may want the strange cup in an ocean-lover kit
- Driving feature: shark shape and ocean palette
- Swap test: a whale or octopus mug could preserve too much of the concept
- Fidelity risk: top-down framing hides the projecting face and fins
- Arm fit: text-free, but visually less clear
- Anti-template mechanism: editorial kit rather than product grid

Rejected before generation because it obscures the product's most distinctive
three-dimensional features and partially survives a product swap.

### 3. Dark tide-pool still life

- Board/audience: design-minded coffee drinkers and ocean lovers
- Hook: one shark mug on matte deep-blue square tile with dawn light, linen, and
  two pale butter cookies
- Stop/save reason: saturated tile, gray glaze, white ceramic, and muted red
  create a handsome material study
- Click reason: the large mug makes its unusual red drinking rim inspectable
- Driving feature: the gray-white-red-blue color blocking and projecting face
- Swap test: a normal mug loses the predator silhouette and palette tension
- Fidelity risk: shadow can swallow the mouth or turn the object into a
  sculpture rather than a usable mug
- Arm fit: clean and text-free
- Anti-template mechanism: product-derived material mood, not a reusable card

## Selection and outcome

Generate concepts 1 and 3. Both separate 1024x1536 attempts passed truth,
single-idea, no-CTA, and no-template gates at full resolution. The dark tile
still life scored `4.63/5` but was rejected because its heavy upper shadow and
tight crop reduce thumbnail brightness and breakfast saveworthiness. The
high-key coastal breakfast scored `4.88/5`, preserved every defining product
feature, and became the only survivor. No causal revision was justified, so
the run stopped at two model calls.

The production dry run verified the exact package, correct `goosegifts`
BUSINESS account, `Weird Kitchen Gadgets` board, unique clean-arm UTM,
complete disclosures, second-and-final daily slot, and vertical artifact.
Pinterest API v5 created and read-verified Standard Pin
`1107815208387907452` and wrote receipt
`receipt-1788651683856-editorial-shark-mug-coastal-breakfast-clean-20260905-pm-publication-succeeded`.
The experiment is now 7 of 12: three Arm A clean Pins and four Arm B headline
Pins. Arm B has one total impression; neither arm has a downstream action, so
there is no winner.
