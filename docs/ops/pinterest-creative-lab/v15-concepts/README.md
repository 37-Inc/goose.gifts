# Pinterest static-format v10 — 2026-09-05 morning Arm B

## Evidence and slot

- Slot: 2026-09-05 morning, assigned **Arm B** (search-native editorial
  headline added only after image generation)
- Experiment: `exp-pinterest-static-format-v10`
- Public profile before generation: 15 Pins, 261 impressions, 2 Pin clicks,
  1 save, 0 Pinterest outbound clicks
- Format cohort before generation: 2 Arm A Pins at 0 impressions and 3 Arm B
  Pins at 1 impression; neither arm has a save, Pin click, outbound click,
  attributable site session, or downstream product click
- GA4, trailing 7 days: 10 sessions (8 direct, 1 Amazon Organic Shopping,
  1 unassigned), with no Pinterest source and no `product_click` or
  `affiliate_click` event
- First-party database: 0 product clicks and 0 searches in 24 hours or 7 days
- Hippo desk 28-day checkpoint: 9 impressions and no engagement or attributable
  downstream action; archive measurement without deleting its public Pin

Pinterest v3 and Sandbox objects remain permanently excluded from public
performance evidence. Bullshit Button's first impression is delivery evidence,
not enough to identify a format winner.

## Exact product verification

- Product: PELEG DESIGN Gratiator handheld cheese grater
- Stable ID: `B074J425V7`
- Amazon listing:
  `https://www.amazon.com/dp/B074J425V7?tag=goose-gifts-37-20&linkCode=ogi&th=1&psc=1`
- Official product reference: `https://peleg-design.com/products/gratiator`
- Canonical destination:
  `https://www.goose.gifts/gifts/the-gratiator-grate-expectations`
- Saved references: `product-references/B074J425V7-source.jpg`,
  `product-references/B074J425V7-official-overhead.jpg`, and
  `product-references/B074J425V7-official-function.jpg`
- Live state: Amazon Creators API returned `IN_STOCK`, `$15.90`, the same
  primary image, and one new Gratiator on 2026-09-05
- Official truth: PELEG DESIGN identifies the product as a stainless-steel and
  plastic sword-shaped hand grater, 20.5 by 7.6 by 1.4 cm, food-safe, with a
  hanging handle; it can grate hard cheese, nutmeg, dark chocolate, citrus
  rind, and vegetables
- Page state: production returned 200, `index, follow`, and a self-canonical
  link
- Literal product noun phrase: one flat handheld grater shaped like a short
  Roman sword, with a pointed perforated stainless-steel blade, dark navy-blue
  plastic crossguard, tapered grip, and circular open pommel

Uncertainty: Amazon stores the size as `8x3` and 10.2 inches long, while the
brand gives 20.5 cm (about 8.1 inches) by 7.6 cm; use the maker's dimensions
and keep the tool ordinary handheld scale. The contextual food is not included.

## Three genuinely different product-derived concepts

### 1. Caesar salad meets its Gratiator

- Board/audience: Weird Kitchen Gadgets; home cooks, Caesar-salad fans, and
  people saving playful but useful kitchen tools
- Hook: one sword-shaped grater rests dramatically across a handsome overhead
  Caesar salad beside a small Parmesan wedge and fresh shavings
- Stop/save reason: crisp greens, stoneware, linen, steel, and restrained
  restaurant styling make a saveable food image before the tiny sword joke
  registers
- Click reason: the viewer can confirm that the apparent prop is a real,
  food-safe handheld grater and inspect what it grates
- Exact driving feature: the pointed perforated blade, crossguard, and pommel
  make the working grater unmistakably sword-shaped
- Swap test: replacing it with an unrelated kitchen gadget breaks both the
  Caesar/Gratiator wordplay and the food-tool action
- Fidelity risk: generation could turn the perforations into a sharp knife,
  remove the crossguard, invent a cutting edge, or imply an oversized weapon
- Arm fit: `CAESAR SALAD, MEET YOUR GRATIATOR.` is a five-word occasion-specific
  headline with no command, sales claim, price, badge, or CTA
- Anti-template mechanism: the exact tool shape creates the food narrative;
  there is no product card, branded frame, packshot pedestal, or generic hook

### 2. The cheese-board armory

- Board/audience: Weird Kitchen Gadgets; hosts, cheese-board builders, and
  housewarming-gift savers
- Hook: the Gratiator lies on dark slate between one hard-cheese wedge and a
  neat drift of grated cheese, treated like a museum armory object
- Stop/save reason: moody grazing-board materials and directional light make
  the small sword feel important without making it physically giant
- Click reason: viewers may want to know whether the sword really functions as
  a grater and how large it is
- Exact driving feature: the open ring pommel, navy crossguard, and perforated
  steel blade carry the armory reading
- Swap test: a normal box grater destroys the armory identity and composition
- Fidelity risk: dramatic lighting could obscure the holes or make the tool
  look like a sharpened metal weapon rather than food-safe grater
- Arm fit: `YOUR CHEESE BOARD CHOSE VIOLENCE.` is a five-word identity headline
- Anti-template mechanism: restrained material tension rather than a reusable
  product grid; no packaging, logo, badge, price, or CTA

### 3. Dinner enters the arena

- Board/audience: Weird Kitchen Gadgets and funny gifts for dads; pasta cooks
  and people saving dinner-party humor
- Hook: one Gratiator bridges two opposing pasta bowls like the ceremonial
  object before a duel
- Stop/save reason: strong tabletop symmetry and a single absurd utensil make
  the scene immediately legible
- Click reason: the improbable bridge invites inspection of the real compact
  grater and its ordinary kitchen function
- Exact driving feature: the Roman-sword silhouette supplies the duel premise
- Swap test: another blade-shaped novelty tool could partially preserve the
  arena setup, so it is less specific than the Caesar execution
- Fidelity risk: the theatrical symmetry could feel staged, imply two diners or
  duplicate products, or repeat the recent boardroom face-off composition
- Arm fit: `DINNER HAS ENTERED THE ARENA.` is a five-word editorial headline
- Anti-template mechanism: one table narrative rather than product-card copy,
  but the arena metaphor risks costume staging and repetition

## Selection

Generate concepts 1 and 2. The Caesar-salad composition has the clearest
product-derived click reason because it combines the exact sword silhouette,
the real cheese-grating function, and the Gratiator name in one food-native
image. The armory is a distinct, moodier identity execution. Reject concept 3
before generation because its bilateral face-off repeats recent boardroom
geometry and partially survives a product swap.

Generate both bases without typography, inspect product identity and food
contact first, then apply the assigned Arm B headline only to the stronger
source-faithful execution. The click hypothesis is that a polished five-word
Caesar/Gratiator line will resolve the real functional joke fast enough to make
viewers inspect the exact tool rather than only save the food styling.

## Outcome

- Generated and full-resolution-inspected two distinct 1024x1536 bases. The
  cheese-board armory was polished and truthful but rejected because its click
  reason was less specific. The dinner-arena concept remained ungenerated.
- Advanced `01-gratiator-caesar-headline.png` at `4.88/5`, with every truth,
  single-idea, no-CTA, and no-template gate passing. The first deterministic
  five-word typography layout fit cleanly; no revision was needed.
- Pinterest production API v5 created and read-verified Standard Pin
  `1107815208387877454` on `Weird Kitchen Gadgets` with the exact approved
  package and unique headline-arm UTM.
- Public URL: `https://www.pinterest.com/pin/1107815208387877454/`
- Receipt:
  `receipt-1788626701123-editorial-gratiator-caesar-headline-20260905-am-publication-succeeded`
- Immediate baseline: zero impressions, saves, Pin clicks, and outbound clicks;
  this is a receipt, not a performance verdict. The experiment is now 6 of 12:
  two Arm A clean Pins and four Arm B headline Pins. Arm B has one impression
  in total and neither arm has a downstream action.
