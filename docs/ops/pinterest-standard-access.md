# Pinterest API — Standard Access application package

Original submission package for the `Goose.gifts` app, now renamed in place to
**Stupid.gifts** on October21. App ID `1588384` and Standard access are retained.
Current facts and migration gates are below; submission-era descriptions and
the approved demo remain historical evidence, not a new submission request.

Prepared 2026-07-17 against the current Pinterest process
(`developers.pinterest.com/docs/key-concepts/access-tiers/`).

## Why this is the blocker

Trial access can call the live API, but **every Pin/Board it creates is a Sandbox
entity visible only to the creator** — no public distribution. Standard access is
the only way goose.gifts Pins reach real Pinterest feeds. Both tiers are free; the
gate is a one-time **video-demo review**, not money.

## App facts (verify these in the portal match)

| Field | Value |
|---|---|
| App name | `Stupid.gifts` (formerly `Goose.gifts`; verified 2026-10-21) |
| App ID | `1588384` |
| Account | `stupid_gifts` — **BUSINESS**, same ID `1107815345747925810` (verified via production `pinterest:whoami`) |
| Claimed websites | `stupid.gifts` selected on profile; `goose.gifts` retained |
| App website | https://stupid.gifts/ (saved, live200, self-canonical) |
| Privacy policy | https://stupid.gifts/privacy (saved, live200, self-canonical) |
| Scopes | `boards:read boards:write pins:read pins:write user_accounts:read` |
| Redirect URI | `http://localhost:3737/oauth/pinterest/callback` |
| Token storage | macOS Keychain — only OAuth `pina_`/`pinr_` tokens; no passwords/session |

## Approvability checklist

- [x] **Trial access approved** (active since 2026-07-07).
- [x] **Standard access approved** — Pinterest's verified developer-platform
      sender confirmed approval for the `Goose.gifts` app on 2026-08-24.
- [x] **Business account** (`account_type: BUSINESS`).
- [x] **Publicly accessible privacy policy on the app's own domain** — the single
      most common rejection reason. https://www.goose.gifts/privacy ✅.
- [x] **Data-handling compliance** — the integration stores *only* OAuth tokens
      (in Keychain), never Pinterest credentials or session data. This is exactly
      what the reviewer checks for.
- [x] **Complete, detailed app description / use case** in the portal — updated
      2026-07-24 to identify the integration as first-party, describe its
      publishing/reporting behavior, and document Keychain token storage.
- [x] **App icon** — uploaded the existing square goose.gifts brand icon on
      2026-07-24; Pinterest may continue to show "processing" briefly.
- [x] **Demo video** recorded and uploaded 2026-07-24. Pinterest confirmed
      "Upload successful!" in the Standard-access form. The 46-second silent
      screen recording shows OAuth, account verification, a dry run, a real
      Sandbox create response, and the resulting Pin in Pinterest.
- [~] Redirect URI is `http://localhost` (fine for a first-party server-side
      integration; Pinterest explicitly accepts terminal/Postman demos, so a
      localhost OAuth flow is acceptable). No change required.

## Use-case description (paste into the form)

> goose.gifts is a curated catalog of funny and unusual giftable products. This is
> a **first-party integration for a single, self-owned Pinterest business account**
> (`goosegifts`). We use the API only to publish our own editorial gift Pins —
> each linking to a goose.gifts catalog or gift-guide page we own — to boards we
> own, and to read back the resulting public Pin metrics to measure which gift
> ideas resonate. We do not act on behalf of other users, we do not ingest other
> users' data, and we send our own account through the standard OAuth flow. Access
> tokens are stored server-side (macOS Keychain); no Pinterest passwords or session
> data are ever collected or stored.

## Scope-by-scope justification (paste if asked)

- `boards:read` — list our own boards to target the correct board when posting and
  to verify board state.
- `boards:write` — create/organize our own topical boards (white elephant, weird
  kitchen, etc.).
- `pins:read` — read back public metrics on our own Pins to measure performance.
- `pins:write` — publish our own editorial gift Pins linking to goose.gifts pages.
- `user_accounts:read` — confirm the connected account identity (`whoami`) before
  posting so automation never targets the wrong account.

## Data-handling statement (paste if asked)

> The integration performs the OAuth 2.0 authorization-code flow and stores only
> the returned access and refresh tokens in the operator's macOS Keychain. It never
> collects or stores Pinterest login credentials or session cookies. Tokens are
> used solely to call the v5 API for our own account and can be revoked at any time
> from the Pinterest account's connected-apps settings.

## Demo video (the actual gating requirement)

Pinterest requires a screen recording proving (a) the **OAuth flow**, (b) **live
Pinterest API integration** (a real API action), and (c) that you're **not storing
sensitive information**. **Terminal / Postman recordings are explicitly accepted**,
which fits our CLI tooling. Keep it ~1–3 minutes.

Everything below is already built (`scripts/ops/pinterest-*`, `package.json`).
Record the terminal while running these; the guided runner explains each step
on screen, so audio narration is optional.

The easiest recording path is the guided one-command runner:

```bash
npm run pinterest:review-demo
```

It opens the Pinterest OAuth consent screen automatically, pauses at each
reviewer-relevant transition, verifies the connected business account, previews
the approved ceramic-eye Pin payload, creates one real Sandbox Pin, and opens
the returned Pin directly on Pinterest so the reviewer can see the completed
integration. Start macOS screen recording before running it and stop when the
script says the demo is complete. The individual commands below remain
documented as a fallback.

**Shot list**

1. **Intro (5s):** say who you are and that goose.gifts posts only to its own
   `goosegifts` business account.
2. **OAuth flow:** run `npm run pinterest:oauth`. It opens the browser to
   Pinterest's consent screen (scopes listed above). Log in as `goosegifts`,
   approve. Narrate: "user is sent through Pinterest's own OAuth consent screen."
   The callback returns to `localhost:3737` and the CLI stores tokens.
3. **Show token handling (no values):** narrate that only the `pina_`/`pinr_`
   tokens are saved to Keychain — do **not** reveal the token strings on screen.
   (Optionally show the Keychain entry *names* only.)
4. **Identify the account:** run `npm run pinterest:whoami` → shows the `goosegifts`
   BUSINESS account. Narrate: "confirming we act on our own account."
5. **Live API action (create a Pin):** first list the approved drafts with
   `npm run pinterest:approved-pins`, then post one:
   `npm run pinterest:create-pin -- --draft <draftId>`. This reads the draft's
   title/description/alt-text/tracking-URL/image from
   `docs/ops/pinterest-approved-pins.json`, resolves the target board, and `POST`s
   to `/v5/pins`. Show the API returning a created Pin object. Narrate: "publishing
   our own gift Pin to our own board, linking to our own site."
   (Rehearse first with `-- --draft <id> --dry-run`, which prints the exact payload
   without posting; add `--sandbox` to target the sandbox API if you prefer not to
   create a live entity on camera.)
6. **Wrap (5s):** restate: only OAuth tokens stored, single first-party account,
   Pins link to our own catalog.

Record with QuickTime (⌘⇧5) or any screen recorder; export MP4. **Blur/skip any
frame that shows a raw token.**

## Submission steps (Cameron — portal clicks)

1. Go to **https://developers.pinterest.com** and sign in as the goose.gifts /
   `goosegifts` account owner.
2. Open **"My apps"** and find the **`Goose.gifts`** app card (App ID `1588384`).
3. Confirm the app's **description/use case** is complete (paste the use-case text
   above if it's thin) and that the **privacy policy URL** =
   `https://www.goose.gifts/privacy`. Save.
4. On the app card, click **"Upgrade"** (appears on Trial-eligible apps).
5. In the upgrade form: verify the app info/use case, confirm the privacy link, and
   **upload the demo video**.
6. Submit. Pinterest reviews on a rolling basis and **emails a decision** (no fixed
   SLA). Watch `goosegifts@37.technology`.

## Submission outcome and production verification (updated 2026-08-25)

- All remaining Sandbox Pins were deleted after Standard approval, including
  the polished editorial examples and duplicate ceramic-eye demo attempts. The
  five confirmed-empty `API Trial - ...` boards were then deleted successfully.
  Sandbox now reports zero Pins and zero boards.
- The portal app purpose is saved with the stronger first-party description and
  the app icon was uploaded.
- The upgrade form is prepared with **Pin creation & scheduling** and
  **Reporting** selected. **Ad campaign management** is unselected. The audience
  is **Creators** and **Businesses**.
- The uploaded demo created Sandbox Pin `1107815208384458180`; it was deleted
  during the 2026-08-25 post-approval cleanup.
- Cameron submitted the Standard-access upgrade request on 2026-07-28.
  Pinterest approved the `Goose.gifts` app for Standard access on 2026-08-24;
  the verified approval email was read and its completed two-message thread was
  archived on 2026-08-25. Do not resubmit it.
- The production token refreshed successfully on 2026-08-25 with
  `boards:read boards:write pins:read pins:write user_accounts:read`. Production
  API v5 then identified the correct `goosegifts` BUSINESS account, returned the
  real public boards and public Pin metrics, and resolved a complete dry-run Pin
  payload against the intended public board. No public Pin was created during
  verification.

## Production operating state

**Latest domain verification, October21 Pacific / October22 UTC:** the business
mailbox received “Trouble claiming your website” at23:17:05UTC, not an app-access
rejection. No TXT or HTML verification was present. Added one TXT record to the
Cloudflare apex, DNS-only/TTL Auto:
`pinterest-site-verification=d26f095726909fff0819fed34db1267f`.
The two existing Worker records were preserved. Cloudflare table, both
authoritative nameservers and1.1.1.1 independently return the exact value.
Pinterest then showed “Connected / You're all set!” for stupid.gifts and sent
“Website claimed!” at2026-10-22T01:02:30Z. Goose's claim is also retained.

Profile website now selects stupid.gifts; API returns http://stupid.gifts,
verified to redirect to https://stupid.gifts/. App website/privacy fields already
contained the new www host on arrival and were normalized/saved/read back as
https://stupid.gifts/ and https://stupid.gifts/privacy. Both return200 with the
expected canonicals; www redirects to apex. App1588384 still shows Standard
access active, same localhost redirect. Production account still matches
1107815345747925810 / stupid_gifts / BUSINESS,28 Pins/five boards.
No credentials, scopes, old Pin URLs, catalog/analytics, publisher-domain guard
or schedule were changed. Studio remains PAUSED; this is not publishing restart
or full product-destination migration. [Receipt/screenshots](pinterest-rebrand-2026-10-21/domain-receipt.json).

**October21 owner-authorized rename completed:** profile/business name and app
name/company are now **Stupid.gifts**. `stupidgifts` was taken; after Pinterest's
no-dot rule was explained, Cameron explicitly selected **stupid_gifts**.
[Public profile](https://www.pinterest.com/stupid_gifts/) and production API
confirm the new handle/name, same BUSINESS ID `1107815345747925810`,28 Pins and
five boards. App details saved with “Updated!”; My apps readback shows
**Stupid.gifts**, same app ID **1588384**, **Standard access active**. Purpose
retains first-party-only behavior and token-storage handling. No new app,
review resubmission, OAuth rotation or scope change was needed/performed.

At the earlier rename, the transitional bio said Goose.gifts was becoming
Stupid.gifts and website/privacy/claim were unchanged; the later domain repair
above supersedes that metadata, not the original receipt. The account guard
requires the original stable ID, `stupid_gifts` and BUSINESS; tests reject
wrong/missing ID, old/wrong handle
and personal accounts. Destination guards still reject Stupid.gifts until
tested production cutover. The studio remains **PAUSED**, v11 remains frozen
P6/F6 with generation/posting disabled, and the final review remains pending.
The [durable receipt](pinterest-rebrand-2026-10-21/receipt.json) links visible
profile and Standard-access screenshots. Full restart gates, including catalog
source and analytics verification, remain in `PINTEREST_STUDIO.md`.

Official references: [profile/name/username editing](https://help.pinterest.com/en/article/edit-your-profile)
and [managing the existing app](https://developers.pinterest.com/docs/getting-started/connect-app/).

**Current verified state, October21 morning:** Standard production account
`goosegifts` BUSINESS remains correct. Final birthday-hat poster
`1107815208391368990` was created once/readback-verified;28 retained public Pins in the
verified union. V11 is **P6/F6,total12**, with experiment generation and public
posting disabled. Existing scheduler stays ACTIVE for metrics only; no new
creative/publication, even after review, without a new explicit owner experiment.
Exact receipt-derived review deadline:2026-10-31T16:44:52.279Z; first regular
eligible review slot October31 16:30Pacific. Current contract, all12 members,
receipts and one-time review-delivery state: `PINTEREST_STUDIO.md` and v34.
This supersedes historical counts below; Standard access never creates quota.
The AM slot performed no generation or publication. All twelve exact package/
receipt-board reads verify, with no unresolved receipt; account inventory
is28 (26 enumerated plus two exact-ID omissions). Six separately owner-authorized
pre-v11 legacy Pins were retired; the deletion receipt excludes them before
metrics fetch. This run deleted nothing and preserves all12 v11 memberships.
Native P1395impressions/22opens/3saves/2outbound,F310/5/1/0outbound.
Both clicks remain on mini bowling; original double readback is preserved in
October20 AM evidence. Current tracked destination200/query-preserved.
This is not corroborated human/site/retailer conversion or a format winner;
per-Pin downstream stays unknown.
Toast's AM and therapist's PM eligible28day observations archived their
lifecycles only. Public Pins and original F quota/membership are retained;
no post deletion or replacement. Hat24h is recorded and remains measuring.
October20 Sheep7day records zero native distribution/actions at23:34:02.495UTC,
late3h26m53.159s after its exact20:07:09.336UTC gate; lifetime observation,
not reconstructed exact-age data. Keep measuring/public/F membership intact.
Spider7day gate2026-10-21T16:42:53.716Z and belly23:40:30.593Z are not due
at this morning's16:29:47.252UTC snapshot; neither is closed early.
All twelve destinations remain200/canonical/retailer-linked. Birthday Toast is
now index/follow after separate catalog maintenance; two editorial holds remain.
This studio did not mutate products, pages, Pins, account or schedule.
Current bounded GA4/PostHog queries succeeded, without an attributed Pinterest/
retailer row. Historical provider gaps and retired DB/Vercel zeros remain
excluded; access, a native click or a measurement run never creates new quota.
At the morning observation the app/account rename was held; the later completed
rename above supersedes those names, not the dated measurement evidence.

- Standard access and the production OAuth read/dry-run path are verified.
- Public posting still needs an exact candidate/package approval event (per
  `MARKETING.md` and `NEEDS.md`). Cameron's current scheduled-studio
  authorization permits at most one hard-gated exact package per spaced run
  and two per local day inside the active 12-Pin v11 editorial-text mix. Every
  publication must bind the image, destination, board, title, description, alt
  text, disclosure, tracking URL, arm, slot, and experiment ceiling in its own
  Cameron approval event. It does not cover a third daily Pin, weak creative,
  video, Sandbox objects, paid distribution, account changes, deletion, or
  spend.
- The guarded production CLI requires the draft's candidate ID and Cameron
  approval-event ID, validates the current creative state and complete disclosed
  package, checks the connected account and existing tracking URL, reads a
  created Pin back, records a durable receipt, and marks the draft published. A
  retry recovers an exact existing Pin rather than creating a duplicate.
- `npm run pinterest:candidates` reads current verified/enriched catalog
  products and excludes previously published product families. It does not run
  the weekly catalog job, generate images, approve candidates, or publish.
- An exact approved package may use the production API or the interactive
  signed-in browser fallback. Sandbox and Pinterest v3 objects remain excluded
  from public performance evidence forever.
- The guarded production API has now created and read-verified the raw-chicken,
  Butt Station, Lick'em cat-brush, Pizza Boss, Bullshit Button, Toilet Golf,
  Middle Management statue, medieval cat tapestry, Wacky Waving Inflatable Tube
  Guy, Gratiator, Shark Coffee Mug, Fresh Memes dog-toy, My First Fire prank-box,
  Wiener Switch night-light, Mystic Pickle fortune-teller, The American
  Mustache coffee-table-book, Red the Crab annotated field-note, The Moon Ring
  courtship field-note, Chia Pet Gnome barbershop-poster, mini tabletop bowling
  boardroom-poster, crochet birthday-toast breakfast field-note, and Desktop
  Therapist boardroom field-note Pins. Combined with the six retained product-
  faithful browser posts, the current clean profile has twenty-eight public Pins
  and zero Sandbox objects. The bounded
  static-format cohort completed at twelve of twelve: six Arm A clean Pins and
  six Arm B headline Pins. At the final seven-day gate each arm had one
  impression and no action, so the result is inconclusive. Cameron then
  authorized a new 12-Pin editorial-text mix at the same one-Pin-per-run,
  two-per-day ceiling: playful product-specific posters versus bespoke one-hero
  annotated field notes. The first Arm F Pin, Red the Crab
  `1107815208388715714`, was production-created and read-verified on
  2026-09-15. The second, The Moon Ring `1107815208388765155`, was
  production-created and read-verified on 2026-09-16. The third and first Arm P
  Pin, Chia Pet Gnome `1107815208388788830`, was production-created and
  read-verified in the second 2026-09-16 slot. The fourth and second Arm P Pin,
  mini tabletop bowling `1107815208389000013`, was production-created and
  read-verified in the 2026-09-19 morning slot. The fifth and third Arm F Pin,
  crochet birthday toast `1107815208389027583`, was production-created and
  read-verified in the afternoon slot. The sixth and fourth Arm F Pin, Desktop
  Therapist `1107815208389087383`, was production-created and read-verified in
  the 2026-09-20 morning slot; v11 is Arm F 4/6, Arm P 2/6, and 6/12 overall
  with no performance verdict because every v11 Pin remains
  undistributed. Video, paid tools,
  paid distribution, Sandbox writes, account changes, deletion, and spend
  remain excluded.
- The historical September 20 production `GET /v5/pins` response returned
  twenty-eight Pins. For current inventory use the dated verified union above:
  listing enumeration can omit known IDs that still pass exact production
  readback. `pinterest-approved-pins.json`
  is a package/publication ledger rather than the profile inventory: it contains
  the three original retained browser posts and every guarded API publication,
  but the separately event-ledgered Goat, Hippo Vanity, and Hippo Desk browser
  posts predate that manifest. It also retains five deleted drafts as explicit
  cleanup history. Do not infer the live profile count from raw manifest row or
  URL counts; the metrics command joins and de-duplicates the manifest, creative
  event ledger, and verified legacy records against production API reads.

## References

- Access tiers: https://developers.pinterest.com/docs/key-concepts/access-tiers/
- API v5: https://developers.pinterest.com/docs/api/v5/
