# Pinterest Creative Lab V5

Forward test of the versioned `create-pinterest-native-product-images` skill.
Generation and internal review are authorized. Publishing, outreach, paid
spend, subscriptions, and public-pilot preparation are not.

## Verified product

- Product ID: `B0F9DZMQBL`
- Listing title observed on goose.gifts: `Custom Cartoon Hippo Coffee Mug with Name, Funny ...`
- Destination: `https://www.goose.gifts/random-gift?gift=B0F9DZMQBL`
- Source image:
  `product-references/B0F9DZMQBL-hippo-mug.jpg`
- Verified appearance: glossy black ceramic mug; left-side handle in the
  reference view; circular turquoise-and-orange illustration of a brown hippo
  with extremely large glossy red lips; the personalized name `Patricia` in
  turquoise below the medallion.
- Likely scale: ordinary large coffee mug. Exact dimensions and whether the
  reverse side repeats the art are unknown.

Two sampled products were rejected before generation:

- `B09TXJM23M` is catalog-labeled as “Vintage Moonshine: Sanitizer Humor,” but
  its source image is a black printed T-shirt, not sanitizer.
- `B0CBSXMFQV` is an infant bib with an illustrated chicken-wing slogan. It is
  truthfully identifiable, but its dense printed joke makes it a weak fit for
  this cycle's beautiful-first visual objective.

## Concept divergence

### A. Memphis breakfast still life

- Audience/board: playful kitchen styling, colorful breakfast, unusual mugs.
- Hook: a restrained high-design breakfast setting quietly centers a mug whose
  hippo has applied far more lipstick than the table requires.
- Pause/save mechanism: saturated turquoise, tomato red, chrome, and warm
  morning light form a polished color study before the hippo face registers.
- Fidelity risk: generated lettering or lip shape may drift; the mug must stay
  ordinary scale and the medallion must remain a print on ceramic.
- Why it is not a template: the scene's palette and circular grapefruit/mug
  rhyme are derived from this product's exact art.

### B. Lipstick vanity double take

- Audience/board: maximalist vanity styling, playful beauty decor, gift ideas
  for a friend named Patricia.
- Hook: an elegant vintage vanity still life contains one black coffee mug
  whose glossy red-lipped hippo looks unexpectedly at home among lipsticks.
- Pause/save mechanism: cinematic mirror light and tactile beauty objects make
  a desirable still life; the mug supplies the second-read joke.
- Fidelity risk: a mirror can duplicate or mutate the product, and extra text
  can be invented. Use only one mug and keep reflections abstract.
- Why it is not a template: the visual category collision is specifically
  motivated by the product's exaggerated lips and personalized name.

### C. Serious creative-director desk

- Audience/board: stylish desk setups, creative offices, funny coworker gifts.
- Hook: a disciplined editorial workspace looks completely credible except
  that `Patricia`, the absurd hippo mug, appears to be running the meeting.
- Pause/save mechanism: graphic overhead composition and real work textures
  make the image board-worthy while the mug occupies the narrative power
  position.
- Fidelity risk: overhead view can hide the handle or distort the front art;
  the product must be angled enough to inspect without becoming oversized.
- Why it is not a template: the name and face establish a specific imagined
  owner, rather than a generic “coworker gift” layout.

## Selection

All three concepts are generated as separate forward-test attempts. This tests
whether product-specific color/shape rhyme, category collision, or narrative
placement produces the strongest Pinterest-native result without changing the
verified product.

## Internal review

All three 1024x1536 artifacts passed the four hard gates. They are internal
shortlists, not owner approvals and not publication authorization.

1. `01-hippo-mug-memphis-breakfast.png` — **5.00 / 5.00**. Strongest overall.
   The grapefruit and turquoise ceramic echoes derive directly from the
   product's medallion, palette, and lips, so the scene feels authored rather
   than decorated.
2. `02-hippo-mug-lipstick-vanity.png` — **4.88 / 5.00**. Strongest conceptual
   double take. The category collision is immediately motivated by the
   hippo's exaggerated glossy lips; slightly less broadly saveable because of
   the dark, niche styling.
3. `03-hippo-mug-creative-director-desk.png` — **4.75 / 5.00**. Highly polished
   and board-native, but the “running the meeting” idea needs more explanation
   and the setting could accept many novelty mugs unchanged.

The contact sheet is `v5-contact-sheet.png`. Exact prompts, scores, gates,
lineage, preflight rejection evidence, and the next action are preserved in
`v5-events.json` and appended through the canonical validator to
`docs/ops/marketing-experiments/events.jsonl`.

## Reusable learning

Concept quality improved when the hook was derived from an exact visible
product feature. Future selection should name that feature and ask whether the
scene would still work unchanged after swapping in an unrelated object. If it
would, the direction is probably tasteful styling rather than a product-specific
creative idea.
