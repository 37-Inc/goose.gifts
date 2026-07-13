# Acquisition Queue

This directory turns `docs/ops/ACQUISITION.md` into an executable internal
queue. It is preparation only: nothing here authorizes an account, subscription,
submission, email, post, reply, direct message, paid placement, or spend.

## Current readiness

As of 2026-07-12, every external action is still blocked on at least one
prerequisite:

- the Weird Gift Index implementation is complete at `/weird-gift-index`, with
  a named byline, method, limitations, aggregate JSON, schema, and social image;
  confirm its production deployment and fill outlet-specific drafts with the
  exact published numbers before owner review;
- the random ridiculous gift utility does not yet exist as a polished,
  no-signup interactive destination;
- social and community accounts/API access have not been approved or confirmed;
- no outlet- or community-specific external action has owner approval.

The queue is therefore useful for deciding what to build and for preparing
channel-native copy, but it is not ready to execute.

## Files

- `prospects.jsonl` — append-only snapshots of outlets and channels. The latest
  valid record for a `prospectId` is current.
- `drafts.jsonl` — append-only snapshots of prepared outbound units. The latest
  valid record for a `draftId` is current.
- `DRAFT_EXAMPLES.md` — human-readable render of the strongest draft patterns.
- `POLICY_SOURCES.md` — primary-source routes and constraints checked during
  research.

Do not delete a prior record to change state. Append a complete replacement
record with the same ID, a later `recordedAt`, and an explanation in `notes`.
This keeps the acquisition learning history reconstructable.

## Prospect scoring

Each non-excluded prospect is scored 0–5 on six dimensions:

1. `topicalFit` — overlap with weird products, gifting, internet culture,
   independent web tools, or the specific report finding.
2. `audienceMatch` — likelihood that readers are gift shoppers, sharers,
   editors, or useful early users.
3. `editorialQuality` — real curation, identifiable editorial standards, and a
   non-spammy environment.
4. `pitchSpecificity` — ability to lead with a concrete finding, visual, or
   interactive behavior rather than the generic homepage.
5. `likelyReferralValue` — plausible qualified visits or legitimate earned
   citations; not domain authority alone.
6. `executionEase` — a documented, legitimate route with reasonable effort and
   no paid requirement.

`total` is the sum out of 30. A hard policy conflict overrides any numeric
score and sets the record to `excluded_policy`.

Suggested priority bands:

- 25–30: prepare first when the asset passes its gate;
- 20–24: worthwhile second wave or social test;
- 15–19: conditional/longer-term opportunity;
- below 15: hold unless new evidence materially improves fit.

## State model

- `blocked_asset` — the destination cannot yet justify outreach or a launch.
- `blocked_access` — account, API, subscription, or owner access is required.
- `blocked_rules_review` — the exact community/outlet rules must be refreshed.
- `blocked_query` — only respond when an exact, relevant journalist request
  exists and goose.gifts can answer it from first-party evidence.
- `ready_for_owner_review` — copy and destination are complete, but no external
  action is authorized.
- `approved_to_execute` — owner approved this exact action and version.
- `executed` — sent or posted through the approved route; store the public URL
  or message ID and timestamp.
- `measuring` — wait for the defined checkpoint.
- `closed_won`, `closed_no_response`, `closed_rejected`, or `excluded_policy`.

## Mandatory gates

### G0 — internal-only authorization

The default is always `externalActionAuthorized: false`. Drafting and research
do not grant permission to send, post, subscribe, create an account, apply for
API access, or spend.

### G1 — asset credibility

The destination must have:

- a single clear promise that matches the pitch;
- original value beyond affiliate product links;
- a named owner/byline, date, contact route, and clear affiliate disclosure;
- first-party methodology and limitations for any claimed finding;
- stable canonical URL, useful mobile view, custom social image, and working
  share behavior;
- accurate product representation with no unsupported price/availability claim;
- enough polish that an editor can link without apologizing for the page.

For the random utility, add: no signup wall, a fast “another one” interaction,
stable share URLs, and enough product variety that repeated use is interesting.

### G2 — route and rules refresh

Within 24 hours before execution, reopen the primary source in
`POLICY_SOURCES.md`, confirm the route still exists, and read the exact
community/outlet rules. A platform-wide policy never substitutes for a
community's own rules.

### G3 — disclosure and tracking

- Clearly disclose that the sender runs goose.gifts in pitches and maker posts.
- Never imply editorial independence when promoting an owned project.
- Do not send Amazon Special Links directly in editorial or community pitches.
- If an approved social post contains an Amazon Special Link, put a clear
  link-level disclosure beside it and ensure the required Amazon Associate
  statement is associated with the account.
- Put affiliate disclosures close to product recommendations on the destination.
- Use clean canonical URLs in editorial pitches unless the editor explicitly
  accepts tracking parameters. Referrer analytics are preferable for earned
  links.
- Use UTMs for owned social posts and launch pages:
  `utm_source={{SOURCE}}&utm_medium={{MEDIUM}}&utm_campaign={{CAMPAIGN}}&utm_content={{CONTENT_ID}}`.
- Never cloak or disguise the final destination.

### G4 — owner approval

Approval must identify the exact `draftId`, destination URL, recipient/channel,
copy version, disclosure, and execution method. One approval does not authorize
a batch, follow-up, reply, or cross-post.

### G5 — execution and learning

After an authorized action, append a new draft snapshot with the external ID or
URL. Measure at 7, 30, and 60 days where the channel supports that cadence:
referral sessions, engaged searches, outbound product clicks, earned links,
editor response, and qualitative feedback. Record rejection/no-response too.

## Recommended sequence

1. Confirm the Weird Gift Index production deployment, populate only the top
   Index drafts with its verified findings, and move those exact drafts to owner
   review. The unfinished utility still needs a delightful no-signup interaction
   and stable share results.
2. Use that asset to unlock only its matching prospects; do not pretend the
   unfinished sibling asset is ready too.
3. Re-score the queue with the actual asset in hand.
4. Prepare only the top three outlet-specific versions.
5. Ask for owner approval one action at a time.
6. Execute a small wave, measure, and revise before widening distribution.

## Useful reads

```bash
# Current prospect snapshots (valid JSON per line)
jq -s 'group_by(.prospectId) | map(max_by(.recordedAt)) |
  sort_by(.score.total // 0) | reverse |
  .[] | {prospectId, name, status, targetAsset, total: .score.total}' \
  docs/ops/acquisition/prospects.jsonl

# Drafts that are not externally authorized
jq -s 'group_by(.draftId) | map(max_by(.recordedAt)) | .[] |
  select(.externalActionAuthorized == false) |
  {draftId, channel, status, targetProspectId}' \
  docs/ops/acquisition/drafts.jsonl
```
