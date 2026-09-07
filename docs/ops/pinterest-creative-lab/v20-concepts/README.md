# Pinterest static-format v10 — 2026-09-07 afternoon Arm A

## Evidence and slot

- Slot: 2026-09-07 afternoon, assigned **Arm A** (clean editorial, no added typography)
- Experiment: `exp-pinterest-static-format-v10`
- Public profile before generation: 20 Pins, 262 impressions, 2 Pin clicks, 1 save, 0 Pinterest outbound clicks, 0 followers, and 245 monthly views
- Format cohort before generation: 4 Arm A Pins at 0 impressions and 6 Arm B Pins at 1 impression; neither arm has a save, Pin click, outbound click, attributable site session, or downstream product click
- GA4, trailing 7 days: 13 sessions in the morning snapshot and no Pinterest source or outbound-product event
- First-party database at 23:35 UTC: 0 product clicks and 0 searches in both 24 hours and 7 days

Pinterest v3 and Sandbox remain permanently excluded. The one Arm B impression is a delivery receipt, not a format winner. This is the second and final eligible daily slot; the morning Arm B Wiener Switch Pin is the only earlier 2026-09-07 publication.

## Exact product verification

- Product: DR DINGUS Mystic Pickle fortune-teller toy
- Stable ID: `B0CYKK1167`
- Amazon listing: `https://www.amazon.com/dp/B0CYKK1167?tag=goose-gifts-37-20&linkCode=ogi&th=1&psc=1`
- Canonical destination: `https://www.goose.gifts/gifts/pickle-your-problems-away-mystic-pickle-fortune-teller`
- Saved reference: `product-references/B0CYKK1167-source.jpg`
- Durable verification receipt: `verification/B0CYKK1167-20260907.json`
- Live state: Amazon Creators API returned `IN_STOCK`, `$14.99`, and the same current primary image at 23:36 UTC
- Page state: production returned 200, `index, follow`, and a self-canonical link
- Literal product noun phrase: one five-inch translucent yellow-green plastic pickle-shaped fortune teller, curved and rounded with raised pickle bumps and one circular recessed answer-viewing window on its side

The purple retail box and illustrated wizard are packaging, not part of the toy. The API's one-inch item dimensions and zero unit count conflict with the explicit five-inch size and visible single-object source, so they are recorded as unreliable and are not used in the creative or copy.

## Three genuinely different product-derived concepts

### 1. Midnight pickle oracle

- Board/audience: Funny White Elephant Gifts; people saving bizarre party gifts, fortune-teller novelties, and surreal still life
- Hook: the exact five-inch Mystic Pickle stands alone on plum velvet beneath a restrained celestial light, photographed with the gravity of an antique oracle
- Stop/save reason: a beautiful moody divination still life registers first; the bumpy translucent pickle and answer window create the second look
- Click reason: viewers can inspect whether the absurd pickle actually gives fortune-teller answers
- Driving feature: pickle silhouette plus the circular answer window; the scene collapses if replaced by an unrelated product
- Fidelity risk: the model could turn it into food, glass, a generic crystal, a face, a glowing lamp, or omit the answer window
- Arm fit: shape, texture, and serious-versus-silly treatment carry the joke without copy
- Anti-template mechanism: product-specific occult portrait, no card frame, badge, logo, price, CTA, or product grid

### 2. The fridge has spoken

- Board/audience: weird-kitchen and white-elephant savers
- Hook: at night, an immaculate design-forward refrigerator glows open around the exact Mystic Pickle standing upright in the otherwise orderly vegetable drawer like an oracle among ordinary produce
- Stop/save reason: the cinematic refrigerator light and tidy color rhythm become strange when one pickle is upright, translucent, and visibly mechanical
- Click reason: the circular answer window distinguishes the real novelty toy from an ordinary pickle and invites a closer look at how it works
- Driving feature: the pickle disguise and fortune-window reveal; an unrelated object destroys the mistaken-food mechanism
- Fidelity risk: the model could render a real pickle, duplicate it, hide the window, add brand labels, or imply refrigeration is required
- Arm fit: clean visual reveal with no typography
- Anti-template mechanism: exact product-category misdirection rather than a reusable lifestyle backdrop

### 3. Dinner-party tie breaker

- Board/audience: party hosts and gag-gift shoppers
- Hook: after dinner, the pickle sits between two elegant dessert choices while unseen guests defer to its answer window
- Stop/save reason: formal tablescaping collides with a tiny pickle oracle
- Click reason: curiosity about the toy's 100 answers
- Driving feature: fortune-teller function and compact scale
- Swap test: a Magic 8 Ball would preserve too much of the scene
- Fidelity risk: extra hands, labels, and food confusion would weaken truth and clarity
- Arm fit: possible without text, but less product-specific
- Anti-template mechanism: functional decision moment, though weaker than concepts 1 and 2

Generate concepts 1 and 2. Reject concept 3 before generation because the same scene survives a product swap and invites unnecessary hand/food ambiguity.

## Selection and outcome

Both separate 1024x1536 source-guided attempts passed the four hard gates at
full useful resolution. The refrigerator reveal scored `4.63/5` but was
rejected because its produce context makes the toy look too edible and weakens
the fortune-teller click promise. The midnight-oracle execution scored
`4.75/5`, preserved the molded translucent pickle, raised bumps, single answer
window, and plausible five-inch scale, and became the only survivor. No causal
revision was justified, so the run stopped after two model calls.

The exact package uses the canonical enriched product page, `Funny White
Elephant Gifts` board, search-first title `Mystic Pickle Fortune Teller Gag
Gift`, complete AI-modified and affiliate disclosures, and unique
`clean_mystic_pickle_midnight_oracle_20260907_pm` tracking content. It is Arm A
and the eleventh qualifying Pin under the 12-Pin experiment cap.

The guarded production dry run verified the exact package, correct
`goosegifts` BUSINESS account, second-and-final daily slot, unique UTM,
complete disclosures, and vertical artifact. Pinterest API v5 created and
read-verified Standard Pin `1107815208388077586` and wrote receipt
`receipt-1788825061222-editorial-mystic-pickle-midnight-oracle-clean-20260907-pm-publication-succeeded`.
The experiment now has five Arm A clean Pins and six Arm B headline Pins. Arm B
has one total impression and neither arm has a downstream action, so there is
no winner.
