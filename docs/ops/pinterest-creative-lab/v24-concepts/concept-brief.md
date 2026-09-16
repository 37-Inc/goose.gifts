# V24 Arm P concept brief — Chia Pet Gnome

Date: 2026-09-16 afternoon slot
Experiment: `exp-pinterest-editorial-mix-v11`
Assigned arm: P — playful editorial poster with one four-to-seven-word line
Candidate: `cand-v11-chia-gnome-poster`

## Product preflight

- Exact product: Chia Pet Classic Gnome terracotta planter with seed pack,
  ASIN `B008VVUWQC`.
- Literal source-image noun phrase: one small seated orange-brown terracotta
  garden gnome planter with a tall pointed hat, sleepy molded face, bent legs,
  and a dense green chia-sprout beard growing across its chest.
- Amazon Creators GetItems reverified the listing on 2026-09-16 as `IN_STOCK`
  at `$24.82`, with the same primary image and affiliate destination.
- Verified listing facts: the package includes one pottery planter, a plastic
  drip tray, and enough chia seed for three plantings; full growth takes one to
  two weeks; the planter can be washed and replanted; dimensions are 4.5 inches
  wide by 7 inches high by 8 inches long.
- Canonical Goose destination:
  `https://www.goose.gifts/gifts/gnome-pun-intended-the-chia-pet-edition`
  returned 200, self-canonical, and `index, follow`.
- Strict identity reference:
  `docs/ops/pinterest-creative-lab/v24-concepts/product-references/B008VVUWQC-source.jpg`
  (`500x500`, SHA-256
  `a763592c8b0407bc5eff5c511828416aae76161629a047a169e6bad853c624b8`).

The source includes retail packaging, but the creative must show only the
grown planter. Packaging copy is not part of the product's visual identity and
must not appear. The source controls the exact seated terracotta gnome form,
pointed hat, face, leg pose, compact scale, and beard-shaped chia growth.

## Concept 1 — Barber's most demanding client

- Audience / board: oddball houseplant, desk-decor, and funny housewarming-gift
  savers; `Weird Home Decor`.
- Hook: the fully grown seven-inch Chia Gnome sits on a handsome vintage
  barbershop counter as if waiting for a trim, photographed with quiet grooming-
  editorial seriousness.
- Pause reason: worn leather, dark wood, mirror glow, and a tiny terracotta
  client create a polished barbershop portrait before the living beard registers.
- Click reason: the line makes the beard's care requirement funny but leaves the
  viewer wanting to see how the planter grows, what comes in the kit, and how
  long the transformation takes.
- Exact product feature: green chia sprouts grow specifically in the gnome's
  beard area and require watering.
- Swap test: an unrelated planter or novelty object cannot support the barber-
  client role or the living-beard line without changing the concept.
- Fidelity risk: the model could turn the pottery into a living gnome, replace
  chia sprouts with fur, invent scissors touching the plant, or enlarge the
  planter to human scale.
- Arm fit: strong. The one four-word line behaves like a magazine cover line,
  not a CTA or product caption.
- Text: `HIS BEARD NEEDS WATERING`.
- Decision: generate.

## Concept 2 — Horticultural nobility

- Audience / board: weird-garden, houseplant, and design-object savers;
  `Weird Home Decor`.
- Hook: the tiny grown planter receives a stately portrait in a formal glasshouse
  among clipped topiary and checkerboard stone, as if the beard has inherited
  the estate.
- Pause reason: crisp daylight, architectural glass, and formal symmetry make a
  beautiful interiors-and-garden image before the rooted facial hair lands.
- Click reason: the line identifies a real growth mechanism while withholding
  the one-to-two-week process and reusable planting kit available on the page.
- Exact product feature: the terracotta figure grows a dense living chia beard.
- Swap test: replacing it with an unrelated product breaks the rooted-beard
  portrait and the contrast between horticulture and facial hair.
- Fidelity risk: the formal setting could make the planter life-size, bury its
  seated legs, redesign its face, or turn the beard into clipped boxwood.
- Arm fit: strong. One five-word line supplies the joke without converting the
  scene into an ad or infographic.
- Text: `THE BEARD HAS TAKEN ROOT`.
- Decision: generate.

## Concept 3 — Kitchen-window plant parent

- Audience / board: houseplant and cozy-kitchen savers.
- Hook: the grown gnome sits among ordinary herbs on a sunlit kitchen sill as
  the only plant whose foliage is facial hair.
- Pause reason: an attractive lived-in kitchen gives the object native home-
  decor context.
- Click reason: the viewer may wonder whether the beard is real growth.
- Exact product feature: chia sprouts form the gnome's beard.
- Swap test: weak; almost any novelty planter could survive the same kitchen-
  sill arrangement.
- Fidelity risk: neighboring herbs could obscure the gnome or make the source-
  specific silhouette secondary.
- Arm fit: weak because the scene is generic houseplant styling and risks
  becoming a reusable product-placement template.
- Decision: reject before generation.

## Hard constraints

Each generated image may contain only its one exact line. No product name,
brand, package, price, logo, watermark, button, CTA, badge, border, grid,
collage, card frame, seed packet, instruction panel, extra gnome, before/after
comparison, or additional text. Preserve the source-like seated terracotta
body, pointed hat, face, legs, compact seven-inch height, and dense green chia-
sprout beard. The figure is pottery, not a living person.
