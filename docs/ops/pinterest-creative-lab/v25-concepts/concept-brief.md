# V25 Arm P concept brief — Mini tabletop bowling

Date: 2026-09-19 morning slot
Experiment: `exp-pinterest-editorial-mix-v11`
Assigned arm: P — playful editorial poster with one four-to-seven-word line
Candidate: `cand-v11-mini-bowling-poster`

## Product preflight

- Exact product: SYZ wooden table-top mini bowling game set, ASIN
  `B082PSJYYP`.
- Literal source-image noun phrase: one compact, narrow light-wood tabletop
  lane with a rounded near end, raised tan backstop, two recessed side gutters,
  black triangular lane arrows, eight small white pins with thin red neck stripes,
  a tiny silver-colored ball, and a light-wood spring/ramp launcher.
- Amazon Creators GetItems reverified the listing on 2026-09-19 as `IN_STOCK`
  at `$9.99`, with the same primary image and affiliate destination.
- Verified listing facts: the longest listed dimension is about 12 inches; the
  game is intended for tabletop or desk play and the small launcher rolls the
  ball toward the pins. The source, rather than a generic regulation-bowling
  assumption, controls the visible eight-pin arrangement.
- Canonical Goose destination:
  `https://www.goose.gifts/gifts/bowling-mini-toys-strike-up-some-fun`
  returned 200, self-canonical, and `index, follow`.
- Strict identity reference:
  `docs/ops/pinterest-creative-lab/v25-concepts/product-references/B082PSJYYP-source.jpg`
  (`500x500`, SHA-256
  `e0d560203d79fd9e23e6295d51e95b5458e4fed75144e0f02375479287697360`).

The object must stay a small physical tabletop game, never a full-size bowling
alley. The source controls the lane shape, light wood, eight visible pins,
silver-colored ball, wooden launcher, gutters, backstop, and arrows.

## Concept 1 — After-hours boardroom league

- Audience / board: office-gift, desk-toy, and white-elephant savers; `Novelty
  Desk Toys`.
- Hook: the exact mini lane sits at the head of a dark walnut conference table
  after hours, lit with the quiet seriousness of a televised final.
- Pause reason: an austere boardroom and tournament lighting make the tiny
  wooden lane feel consequential before its compact scale registers.
- Click reason: the line identifies an office-life joke while leaving viewers
  wanting to inspect how the launcher, ball, gutters, and miniature pins make a
  playable desk game.
- Exact product feature: a working tabletop lane with a wood launcher and tiny
  ball turns an ordinary break-room table into a bowling game.
- Swap test: replacing the product with a generic desk toy breaks both the lane
  language and the tournament staging.
- Fidelity risk: generation could enlarge the object into a real alley, invent
  ten pins, replace the wooden launcher, or add human hands.
- Arm fit: strong. The five-word observation behaves like a magazine cover line
  and contains no command or sales claim.
- Text: `THE BREAK ROOM HAS LANES`.
- Decision: generate.

## Concept 2 — Rainy-day house tournament

- Audience / board: game-night, host-gift, and funny-family-gift savers;
  `Novelty Desk Toys`.
- Hook: the exact miniature set becomes the sole event on a low walnut coffee
  table in a warm parlor while rain softens the windows beyond.
- Pause reason: a beautiful, hushed domestic scene gives a very small physical
  game the visual gravity of a full evening's tournament.
- Click reason: the line makes scale the joke while withholding the mechanism,
  dimensions, and gift details available on the product page.
- Exact product feature: the complete bowling game is compact enough to fit on
  a table but still has a lane, gutters, pins, ball, and launcher.
- Swap test: an unrelated game cannot support the alley-specific visual or the
  scale contrast between tournament and tabletop.
- Fidelity risk: props could clutter the lane, the model could redesign the pin
  count, or cozy styling could hide the launcher and gutters.
- Arm fit: strong. The six-word line explains the visual contradiction without
  becoming a CTA or a product label.
- Text: `THE TOURNAMENT FITS ON THE TABLE`.
- Decision: generate.

## Concept 3 — Inbox stress management

- Audience / board: office-gift and coworker-gift savers; `Novelty Desk Toys`.
- Hook: the exact game replaces the expected stress ball on a very orderly
  executive desk.
- Pause reason: serious office styling makes the tiny bowling ritual feel like
  an approved workplace intervention.
- Click reason: the viewer may want to see whether the miniature lane actually
  plays and how small it is.
- Exact product feature: the wood launcher sends the tiny ball down a complete
  desktop lane toward standing pins.
- Swap test: only moderate; several playable desk toys could survive the same
  stress-relief setup.
- Fidelity risk: the office scene could become a reusable desk-product template
  or let stationery obscure the launcher.
- Arm fit: the five-word line fits, but the visual mechanism is less bespoke
  than the other two directions.
- Text: `A STRIKE AGAINST THE INBOX`.
- Decision: reject before generation because the swap test is weaker.

## Hard constraints

Each generated image may contain only its one exact line. No product name,
brand, package, price, logo, watermark, button, CTA, badge, border, grid,
collage, card frame, scorecard, scoreboard, extra lane, extra ball, people,
hands, or additional text. Preserve a compact roughly 12-inch tabletop scale,
one narrow light-wood lane, rounded near end, tan backstop, two recessed
gutters, black lane arrows, eight white pins with thin red neck stripes, one tiny
silver-colored ball, and one light-wood spring/ramp launcher.
