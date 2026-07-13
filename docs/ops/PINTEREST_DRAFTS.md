# Pinterest Drafts

## Performance baseline — 2026-07-10

- v2 public batch: 26 aggregate impressions across five Pins; 0 Pin clicks,
  0 outbound clicks, and 0 saves.
- v3 Sandbox batch: not eligible for public traffic or performance measurement.
- Site-side database attribution: 0 Pinterest-attributed product clicks.
- GA4 outbound conversions: 2 direct/none conversions; none from Pinterest.

Run `npm run pinterest:metrics` for the current read-only Pinterest totals.
Leave the v2 cohort live and do not create another public batch until at least
2026-07-21 (14 days after the first corrected v2 Pin) or 250 aggregate
impressions, whichever comes first. If distribution is still below 100
impressions at the time checkpoint, treat account/distribution maturity—not
creative conversion—as the constraint.

Review status: batch approved by Cameron and posted on 2026-07-06
Prepared: 2026-07-05
Original clean-card assets: `docs/ops/pinterest-assets/batch-1/`
Recommended v2 product-collage assets: `docs/ops/pinterest-assets/batch-1-v2/`
API trial v3 editorial assets: `docs/ops/pinterest-assets/batch-1-v3/`
Recommended v2 contact sheet:
`docs/ops/pinterest-assets/batch-1-v2/batch-1-v2-contact-sheet.png`
API trial v3 contact sheet:
`docs/ops/pinterest-assets/batch-1-v3/batch-1-v3-contact-sheet.png`
Original clean-card contact sheet:
`docs/ops/pinterest-assets/batch-1/batch-1-contact-sheet.png`

Posted externally after Cameron approved the v2 batch. Use this file as the
source record for copy, assets, tracking URLs, and live Pin URLs.

Machine-readable copy lives in `docs/ops/pinterest-approved-pins.json` for
repeatable API smoke tests and future approved posting runs. Useful commands:

- `npm run pinterest:approved-pins`
- `npm run pinterest:create-pin -- --draft white-elephant-gifts --dry-run`

Omit `--dry-run` only for an owner-approved posting run.

## Batch 1 - Starter board launch

### 1. Funny White Elephant Gifts

- Board: Funny White Elephant Gifts
- Board URL: https://www.pinterest.com/goosegifts/funny-white-elephant-gifts/
- Target page: https://www.goose.gifts/gift-guides/white-elephant-gifts
- Tracking URL: https://www.goose.gifts/gift-guides/white-elephant-gifts?utm_source=pinterest&utm_medium=social&utm_campaign=pinterest_launch&utm_content=white_elephant_guide
- Recommended image asset: `docs/ops/pinterest-assets/batch-1-v2/01-white-elephant-gifts.png`
- Fallback image asset: `docs/ops/pinterest-assets/batch-1/01-white-elephant-gifts.png`
- Live Pin URL: https://www.pinterest.com/pin/1107815208383151361/
- Pin title: Funny White Elephant Gifts People Will Actually Steal
- Pin description: Need a gift exchange idea that gets a reaction? Browse funny, weird, and useful white elephant picks from goose.gifts before the next party.
- Draft visual: vertical 1000x1500 branded guide card. Use the goose.gifts logo at top, a warm red accent, the headline "Funny White Elephant Gifts", the hook "weird picks people actually steal", and a small footer reading "browse the guide".
- Alt text: Funny white elephant gift guide from goose.gifts.

### 2. Funny Gifts for Coworkers

- Board: Funny Gifts for Coworkers
- Board URL: https://www.pinterest.com/goosegifts/funny-gifts-for-coworkers/
- Target page: https://www.goose.gifts/gift-guides/funny-gifts-for-coworkers
- Tracking URL: https://www.goose.gifts/gift-guides/funny-gifts-for-coworkers?utm_source=pinterest&utm_medium=social&utm_campaign=pinterest_launch&utm_content=coworker_gifts_guide
- Recommended image asset: `docs/ops/pinterest-assets/batch-1-v2/02-funny-gifts-for-coworkers.png`
- Fallback image asset: `docs/ops/pinterest-assets/batch-1/02-funny-gifts-for-coworkers.png`
- Live Pin URL: https://www.pinterest.com/pin/1107815208383131573/
- Pin title: Office-Safe Funny Gifts for Coworkers
- Pin description: Funny coworker gifts that stay safe for the office: desk finds, meeting jokes, and small gag gifts that do not feel like junk.
- Draft visual: vertical 1000x1500 branded guide card. Use the goose.gifts logo, a clean desk-inspired layout, the headline "Funny Gifts for Coworkers", the hook "office-safe picks for bad meetings", and a footer reading "browse the guide".
- Alt text: Office-safe funny gifts for coworkers from goose.gifts.

### 3. Weird Kitchen Gadgets

- Board: Weird Kitchen Gadgets
- Board URL: https://www.pinterest.com/goosegifts/weird-kitchen-gadgets/
- Target page: https://www.goose.gifts/gift-guides/weird-kitchen-gadgets
- Tracking URL: https://www.goose.gifts/gift-guides/weird-kitchen-gadgets?utm_source=pinterest&utm_medium=social&utm_campaign=pinterest_launch&utm_content=kitchen_gadgets_guide
- Recommended image asset: `docs/ops/pinterest-assets/batch-1-v2/03-weird-kitchen-gadgets.png`
- Fallback image asset: `docs/ops/pinterest-assets/batch-1/03-weird-kitchen-gadgets.png`
- Live Pin URL: https://www.pinterest.com/pin/1107815208383131619/
- Pin title: Weird Kitchen Gadgets That Are Actually Giftable
- Pin description: Browse odd kitchen gadgets, funny mugs, and cooking gifts that are useful at least once and funny every time they come out of a drawer.
- Draft visual: vertical 1000x1500 branded guide card. Use the goose.gifts logo, red and yellow accents, the headline "Weird Kitchen Gadgets", the hook "useful once, funny forever", and a footer reading "browse the guide".
- Alt text: Weird kitchen gadget gift guide from goose.gifts.

### 4. Novelty Desk Toys

- Board: Novelty Desk Toys
- Board URL: https://www.pinterest.com/goosegifts/novelty-desk-toys/
- Target page: https://www.goose.gifts/gift-guides/novelty-desk-toys
- Tracking URL: https://www.goose.gifts/gift-guides/novelty-desk-toys?utm_source=pinterest&utm_medium=social&utm_campaign=pinterest_launch&utm_content=desk_toys_guide
- Recommended image asset: `docs/ops/pinterest-assets/batch-1-v2/04-novelty-desk-toys.png`
- Fallback image asset: `docs/ops/pinterest-assets/batch-1/04-novelty-desk-toys.png`
- Live Pin URL: https://www.pinterest.com/pin/1107815208383131622/
- Pin title: Novelty Desk Toys for Bad Meetings
- Pin description: Small desk toys, fidgets, and office gadgets for bored hands, home offices, and meetings that should have been shorter.
- Draft visual: vertical 1000x1500 branded guide card. Use the goose.gifts logo, a compact desk motif, the headline "Novelty Desk Toys", the hook "for bored hands and bad meetings", and a footer reading "browse the guide".
- Alt text: Novelty desk toy gift guide from goose.gifts.

### 5. Weird Home Decor

- Board: Weird Home Decor
- Board URL: https://www.pinterest.com/goosegifts/weird-home-decor/
- Target page: https://www.goose.gifts/gift-guides/weird-home-decor-gifts
- Tracking URL: https://www.goose.gifts/gift-guides/weird-home-decor-gifts?utm_source=pinterest&utm_medium=social&utm_campaign=pinterest_launch&utm_content=home_decor_guide
- Recommended image asset: `docs/ops/pinterest-assets/batch-1-v2/05-weird-home-decor.png`
- Fallback image asset: `docs/ops/pinterest-assets/batch-1/05-weird-home-decor.png`
- Live Pin URL: https://www.pinterest.com/pin/1107815208383131674/
- Pin title: Weird Home Decor Gifts for Rooms That Need a Double Take
- Pin description: Oddball shelf pieces, funny housewarming finds, and weird decor gifts for people who do not want another beige thing.
- Draft visual: vertical 1000x1500 branded guide card. Use the goose.gifts logo, a shelf/poster-style layout, the headline "Weird Home Decor Gifts", the hook "for rooms that need a double take", and a footer reading "browse the guide".
- Alt text: Weird home decor gift guide from goose.gifts.

## Approval checklist

- Titles were approved.
- Descriptions were approved.
- Boards were approved.
- Tracking URLs were approved.
- Visual direction was approved after moving to the v2 product-collage set.

Posting notes:
- The white elephant asset was regenerated before publishing to remove duplicate
  belly/fanny-pack products.
- The white elephant Pin was replaced on 2026-07-07 after a second duplicate
  product issue was spotted. Old duplicate-image Pin
  `https://www.pinterest.com/pin/1107815208383131380/` was deleted; corrected
  Pin is `https://www.pinterest.com/pin/1107815208383151361/`.
- Pinterest profile verification after publishing showed all five pins on the
  `Created` tab with the live URLs listed above.

## Batch 1 v3 - API Trial creative test

Status: generated and posted through the Pinterest API Sandbox on 2026-07-07.

Important limitation: the goose.gifts Pinterest app is still on Trial access.
These API-created Pins and boards are Sandbox entities visible only to the
creator. Public automated posting still requires Standard access approval.

Assets and records:
- Asset directory: `docs/ops/pinterest-assets/batch-1-v3/`
- Contact sheet: `docs/ops/pinterest-assets/batch-1-v3/batch-1-v3-contact-sheet.png`
- Pin manifest: `docs/ops/pinterest-assets/batch-1-v3/manifest.json`
- API result record: `docs/ops/pinterest-assets/batch-1-v3/post-results.json`
- `manual-post-results.json` is a superseded local artifact and is not evidence
  of public v3 distribution.

### 1. White Elephant Gifts That Make the Room Pay Attention

- Sandbox board: API Trial - Funny White Elephant Gifts
- Sandbox board ID: `1107815277030430244`
- Sandbox Pin URL: https://www.pinterest.com/pin/1107815208383208933/
- Target page: https://www.goose.gifts/gift-guides/white-elephant-gifts
- Tracking URL: https://www.goose.gifts/gift-guides/white-elephant-gifts?utm_source=pinterest&utm_medium=social&utm_campaign=pinterest_api_trial_v3&utm_content=white_elephant_gifts
- Image asset: `docs/ops/pinterest-assets/batch-1-v3/01-white-elephant-gifts.png`
- Visual hook: "THIS IS HOW THE GIFT EXCHANGE GETS LOUD"

### 2. Funny Coworker Gifts for Meetings That Should Have Been Emails

- Sandbox board: API Trial - Funny Gifts for Coworkers
- Sandbox board ID: `1107815277030430246`
- Sandbox Pin URL: https://www.pinterest.com/pin/1107815208383208938/
- Target page: https://www.goose.gifts/gift-guides/funny-gifts-for-coworkers
- Tracking URL: https://www.goose.gifts/gift-guides/funny-gifts-for-coworkers?utm_source=pinterest&utm_medium=social&utm_campaign=pinterest_api_trial_v3&utm_content=funny_gifts_for_coworkers
- Image asset: `docs/ops/pinterest-assets/batch-1-v3/02-funny-gifts-for-coworkers.png`
- Visual hook: "FOR THE MEETING THAT SHOULD HAVE BEEN AN EMAIL"

### 3. Weird Kitchen Gadgets That Look Fake but Are Real

- Sandbox board: API Trial - Weird Kitchen Gadgets
- Sandbox board ID: `1107815277030430248`
- Sandbox Pin URL: https://www.pinterest.com/pin/1107815208383208941/
- Target page: https://www.goose.gifts/gift-guides/weird-kitchen-gadgets
- Tracking URL: https://www.goose.gifts/gift-guides/weird-kitchen-gadgets?utm_source=pinterest&utm_medium=social&utm_campaign=pinterest_api_trial_v3&utm_content=weird_kitchen_gadgets
- Image asset: `docs/ops/pinterest-assets/batch-1-v3/03-weird-kitchen-gadgets.png`
- Visual hook: "KITCHEN GIFTS THAT LOOK FAKE BUT AREN'T"

### 4. Novelty Desk Toys for Busy-Looking Nothing

- Sandbox board: API Trial - Novelty Desk Toys
- Sandbox board ID: `1107815277030430249`
- Sandbox Pin URL: https://www.pinterest.com/pin/1107815208383208942/
- Target page: https://www.goose.gifts/gift-guides/novelty-desk-toys
- Tracking URL: https://www.goose.gifts/gift-guides/novelty-desk-toys?utm_source=pinterest&utm_medium=social&utm_campaign=pinterest_api_trial_v3&utm_content=novelty_desk_toys
- Image asset: `docs/ops/pinterest-assets/batch-1-v3/04-novelty-desk-toys.png`
- Visual hook: "BUSY-LOOKING NOTHING FOR YOUR DESK"

### 5. Weird Home Decor Gifts With a Plot Twist

- Sandbox board: API Trial - Weird Home Decor
- Sandbox board ID: `1107815277030430250`
- Sandbox Pin URL: https://www.pinterest.com/pin/1107815208383208943/
- Target page: https://www.goose.gifts/gift-guides/weird-home-decor-gifts
- Tracking URL: https://www.goose.gifts/gift-guides/weird-home-decor-gifts?utm_source=pinterest&utm_medium=social&utm_campaign=pinterest_api_trial_v3&utm_content=weird_home_decor
- Image asset: `docs/ops/pinterest-assets/batch-1-v3/05-weird-home-decor.png`
- Visual hook: "YOUR LIVING ROOM JUST GOT A PLOT TWIST"

Correction recorded 2026-07-12: Cameron confirmed that v3 was Sandbox-only.
Do not treat the prior manual-result artifact or URLs as a public experiment,
query them as a public cohort, or expect traffic from them.
