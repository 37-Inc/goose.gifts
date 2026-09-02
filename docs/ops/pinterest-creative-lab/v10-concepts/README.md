# Pinterest static format comparison v10: Bullshit Button headline arm

## Verified product truth

- Product: Gemmy Bullshit Button, ASIN `B000L70MQO`
- Reverified: 2026-09-02 through Amazon Creators API
- Current state: `IN_STOCK` at `$8.99`
- Source: `product-references/B000L70MQO-primary.jpg`
- Exact form: a five-inch-wide tabletop sound button with a glossy red
  hemispherical dome, the white uppercase product word on the dome, a low
  circular gray plastic base, and small black speaker vents. The retail image
  also contains packaging and a pressing finger; neither is part of the loose
  product.
- Canonical destination:
  `https://www.goose.gifts/gifts/bullshit-button-hit-for-instant-hilarity`
  returned 200 with `index, follow` and a self-canonical URL.
- Real function: pressing the dome triggers one of five spoken phrases plus
  siren/buzz effects and a flashing light. It is not an actual detector,
  emergency control, or safety device.

## Three product-derived concepts

### 1. The meeting's referee — selected for generation

- Audience/board: people saving funny coworker gifts and sharply styled office
  humor; `Funny Gifts for Coworkers`.
- Stop feature: a handsome, restrained 1970s corporate presentation room has
  one glossy red button on the moderator's walnut console.
- Click feature: the viewer can read the button's actual product word but must
  visit the product page to learn what happens when it is pressed.
- Exact product feature: the pressable red dome, blunt white word, gray speaker
  base, and sound/light function turn a normal meeting into a refereed event.
- Fidelity risk: the button could become a built-in alarm, game-show prop,
  powered emergency stop, or giant architectural object.
- Anti-template test: replacing the button with an unrelated desk toy removes
  the entire meeting-referee premise.
- Proposed headline: `FOR MEETINGS WITH TOO MUCH CONFIDENCE` — six words,
  editorial rather than a CTA.

### 2. Museum of corporate honesty

- Audience/board: design-minded office-humor and novelty-object savers.
- Stop feature: the exact red button is treated as a small postmodern design
  object in an austere gallery of office artifacts.
- Click feature: the overly serious museum treatment makes the real sound
  phrases the unresolved joke.
- Exact product feature: the product's declarative label and push-button form.
- Fidelity risk: a plinth and spotlight can turn the scene into a conventional
  hero-product advertisement.
- Anti-template test: the curatorial joke weakens substantially without this
  confrontational labeled button.
- Proposed headline: `A SECOND OPINION, IN RED` — five words.

### 3. Emergency brake for nonsense — rejected before generation

- Audience/board: workplace humor and meeting-survival savers.
- Stop feature: the loose tabletop button appears beside a meticulous agenda
  at the end of a long corporate corridor.
- Click feature: the visual asks whether this is a real office tool or a gag.
- Exact product feature: its red pressable dome and audible response.
- Fidelity risk: the emergency-control metaphor could falsely imply a mounted
  safety device or actual detection capability.
- Anti-template test: the scene depends on the red button, but its safety-device
  ambiguity makes the truthful-product risk too high.

Concept 3 is rejected before generation. Generate concepts 1 and 2 without
additional scene text, choose the stronger truthful base, then apply one
deterministic headline treatment after generation so typography is not left to
the image model.

## Execution review

### The meeting's referee — advance

- Base: `attempts/bullshit-button-execution-b.png`
- Final artifact: `01-bullshit-button-meeting-headline.png`
- Resolution: `1024 × 1536`
- SHA-256:
  `3df3bdffb58d934095858d30a86619f50c6ec999cf6817ffcf3c2452277fa0dc`
- Mean score: `4.50/5`
- Hard gates: one idea pass; truthful product pass; no embedded CTA pass; no
  ad-template structure pass

Full-resolution inspection shows one loose five-inch-class red dome button on
a gray speaker base, physically grounded on a walnut moderator console. The
actual product word is correct and legible, and the image does not invent a
detector, alarm mount, cord, package, or hand. The six-word headline is rendered
once in a restrained cream condensed face over naturally dark wall space. It
describes the audience situation without instructing a purchase, showing a
price, adding a fake button, or framing the image like a product card. The base
vent pattern is slightly simplified versus the source, so product fidelity is
scored 4 rather than 5, but object identity, scale, material, and promise remain
truthful.

### Museum of corporate honesty — reject

- Artifact: `attempts/bullshit-button-execution-a.png`
- Resolution: `1024 × 1536`
- SHA-256:
  `5e97338b240b6815a15a4049898dff7587280e33e7b48e6e2dd83b98343b19d3`
- Decision: reject. The execution is clean and source-faithful, but the centered
  product-on-paper arrangement reads too much like a generic catalog or design
  object display. Adding a headline would strengthen the template feeling
  rather than create a more product-derived scene.

No model revision was needed. The deterministic headline treatment changes
only typography on the stronger meeting execution and leaves the generated
scene and product untouched.

## Production package and result

- Arm: B, restrained on-image headline
- Board: `Funny Gifts for Coworkers`
- Title: `Bullshit Button for Office Meetings`
- Tracking URL:
  `https://www.goose.gifts/gifts/bullshit-button-hit-for-instant-hilarity?utm_source=pinterest&utm_medium=organic_social&utm_campaign=pinterest_static_format_v1&utm_content=headline_bullshit_button_meeting_20260902_pm`
- Exact-package approval:
  `evt-20260902-v10-bullshit-button-approved`
- Public Pin: `https://www.pinterest.com/pin/1107815208387654951/`
- Publication receipt:
  `receipt-1788392579312-editorial-bullshit-button-meeting-headline-20260902-pm-publication-succeeded`

The guarded production API dry run and create both resolved the correct
`goosegifts` BUSINESS account and board. The create read back the exact title,
description, alt text, unique canonical tracking URL, and 1024x1536 artifact.
The immediate public baseline was zero impressions, saves, Pin clicks, and
outbound clicks; it is a publication receipt, not a performance verdict.
