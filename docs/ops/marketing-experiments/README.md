# Creative experiment learning loop

`events.jsonl` is the canonical, append-only history of creative work. One line
is one event conforming to `event.schema.json`. Never rewrite an earlier event
to make a result look cleaner; add a correction, status change, review, or
learning event. This lets later Codex runs distinguish what was proposed, what
was actually generated, why an attempt was rejected, and what happened after
publication.

## Normal workflow

1. Read the current state and suggested next actions:

   ```bash
   npm run creative:validate
   npm run creative:summary
   npm run creative:next
   ```

2. Add a `candidate.created` event before generating. A candidate is one visual
   concept, not a minor prompt variation.
3. Move it to `briefed`, then `generating`, using
   `candidate.status_changed` events.
4. Record every meaningful generation as `prompt.recorded`. Give each attempt a
   unique `attemptId`; set `parentAttemptId` to the attempt being revised, and
   state the one or two intentional changes in `changesFromParent`. Artifact
   paths must be repository-relative. A failed or discarded generation is still
   useful evidence.
5. Move surviving candidates to `review`, then add `review.recorded`. Scores are
   integers from 1 (poor) to 5 (excellent). `advance` is valid only when all
   four gates pass, the mean score is at least 4.0, and no score is below 3.
6. Add a `learning.recorded` event whenever evidence changes what should be
   tried next. A learning must cite prior event IDs and end in a decision plus a
   concrete next action.
7. Only record public performance as cohort `public`. Sandbox and internal
   workflow checks use their own cohorts and are excluded from public totals.

To append safely, put one event object in a temporary JSON file and run:

```bash
npm run creative:record -- --file /absolute/path/to/event.json
```

The command validates both the new event and the complete causal history before
appending it. `--dry-run` performs the same validation without writing. Future
automation should never append with a raw shell redirect.

## Status models

Experiment statuses:

```text
prepared -> active -> completed
             |  ^
             v  |
           paused

prepared/active/paused -> abandoned
```

Candidate statuses:

```text
idea -> briefed -> generating -> review -> shortlisted -> approved
                       ^           |                         |
                       |-----------|                         v
                                                    published -> measuring
                                                                    |
                                                                    v
                                                                 learned
```

Any pre-publication status can move to `rejected`. Rejected, learned, or
approved-but-unpublished work can be archived. Returning from review to
generating is the explicit revision loop.

## Review rubric v1

- `scrollStop`: earns attention before the viewer reads.
- `pinterestNative`: plausibly belongs in a personal feed or saved board.
- `aestheticQuality`: intentional lighting, color, composition, and materials.
- `conceptClarity`: one visual idea is quickly understood.
- `saveworthiness`: useful, aspirational, funny, or intriguing enough to keep.
- `brandRestraint`: remains compelling without overt branding or sales devices.
- `productFidelity`: does not misrepresent what a click leads to.
- `aiArtifactControl`: avoids generic AI gloss and visible generation defects.

Hard gates are `singleIdea`, `truthfulProduct`, `noEmbeddedCta`, and
`noAdTemplate`.

## Metric semantics

Use `null`, not zero, when a metric is unavailable. Zero means the source
measured the metric and observed none. Always name the source and checkpoint
time. Revenue remains `null` until an actual affiliate report supplies it.

Publishing remains a separately authorized action. Experiment-level
`publicPosting: true` is only a technical ceiling for candidates with their own
Cameron approval event; it is not blanket approval for an experiment, queue, or
cadence. Paid spend and paid tool subscriptions remain unauthorized. When the
owner changes an experiment boundary, record an
`experiment.authorization_changed` event before taking the newly authorized
action; the validator will reject publication that gets ahead of authorization.

For production API posting, the reviewed manifest entry must also name the
candidate and Cameron's exact `approved` event. Run a dry run first, then use
`npm run pinterest:create-pin -- --draft <draftId>` only after the complete
package in `REVIEW_QUEUE.md` is approved. The publisher checks the account and
existing Pins, creates at most once, reads the Pin back, appends a publication
receipt to `docs/ops/pinterest-publication-receipts.jsonl`, and records the
`approved -> published` creative transition. This deliberately uses ordinary
IDs and validated state; cryptographic signing is not required.
