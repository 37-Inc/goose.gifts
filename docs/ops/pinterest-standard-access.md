# Pinterest API — Standard Access application package

Everything needed to submit the `Goose.gifts` app for Pinterest API v5 **Standard
access** (the upgrade from Trial that unlocks *public* automated Pins). This doc is
the durable, paste-ready source; the live submission happens in Pinterest's
developer portal and needs Cameron's logged-in session (see "Submission steps").

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
| App name | `Goose.gifts` |
| App ID | `1588384` |
| Account | `goosegifts` — **BUSINESS** account (verified via `pinterest:whoami`) |
| Claimed website | `www.goose.gifts` (shows as claimed on the profile) |
| Privacy policy | https://www.goose.gifts/privacy (live, 200) |
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

- Standard access and the production OAuth read/dry-run path are verified.
- Public posting still needs an exact candidate/package approval event (per
  `MARKETING.md` and `NEEDS.md`). Cameron's scheduled-studio exception permits
  at most one hard-gated exact package per spaced run and two per local day
  inside the bounded 12-Pin static-format comparison; it covers no third Pin,
  weak creative, video, Sandbox object, paid distribution, or spend. The event
  must bind the image, destination, board, title, description, alt text,
  disclosure, tracking URL, arm, slot, and experiment ceiling.
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
  Butt Station, Lick'em cat-brush, Pizza Boss, and Bullshit Button Pins.
  Combined with the six retained product-faithful browser posts, the current
  clean profile has eleven public Pins and zero Sandbox objects. The Bullshit
  Button is the first Pin created under the new bounded headline-versus-clean
  static-format authorization.

## References

- Access tiers: https://developers.pinterest.com/docs/key-concepts/access-tiers/
- API v5: https://developers.pinterest.com/docs/api/v5/
