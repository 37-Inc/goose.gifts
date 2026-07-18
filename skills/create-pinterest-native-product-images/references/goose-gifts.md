# goose.gifts integration

## Read before acting

From the repository root, read:

- `docs/ops/CHANGELOG.md`
- `docs/ops/MARKETING.md`
- `docs/ops/marketing-experiments/README.md`
- `docs/ops/marketing-experiments/events.jsonl`
- `docs/ops/pinterest-standard-access.md`
- `docs/ops/NEEDS.md`

Use live documents over this snapshot when they differ.

## Durable creative principle

The target reaction is:

> That looks great—wait, what the fuck is that?

Images should be desirable or intriguing first and funny on the double take.
They should look like interiors, design, desk-styling, food, humor, or identity
posts that someone might save—not affiliate ads with the furniture removed.

## Evidence from the v4 cycle

- The alligator oven-mitt concept looked strong but first rendered the listing
  as a plush full-body alligator. A strict source reference corrected it to the
  actual long printed textile oven mitt.
- The highest-scoring “eye rug” concept was invalid. The source product was a
  ceramic eye sculpture, not a rug. The rug candidate was rejected and a new
  scale-correct tabletop candidate was created.
- The first goat scene rendered a tiny desk figurine as a life-size goat.
  Explicit scale and object-type language materially improved the revision.
- Product verification must happen before product-bound generation. Aesthetic
  scoring never overrides the truthful-product gate.

Existing examples and references live under:

```text
docs/ops/pinterest-creative-lab/v4-concepts/
```

## Learning-loop commands

Run:

```bash
npm run creative:validate
npm run creative:summary
npm run creative:next
```

Append one event safely with:

```bash
npm run creative:record -- --file /absolute/path/to/event.json
```

Never append raw JSONL with shell redirection. Follow the status transitions
and event shapes in `docs/ops/marketing-experiments/README.md`.

Record a candidate before generating. Record exact prompts and durable
repository-relative artifact/reference paths. Use a new attempt ID for every
meaningful generation and `parentAttemptId` for revisions.

## Authorization boundary

- Generation and internal review may be authorized while public posting is not.
- Pinterest v3 was Sandbox-only and had no public distribution. It is workflow
  evidence, not performance evidence.
- `docs/ops/pinterest-standard-access.md` contains the prepared Standard-access
  application package. Prepared or approved API access does not itself
  authorize a public batch.
- Public posting requires explicit approval of the exact creative,
  destination, board, copy, disclosure, tracking, and cadence.
- Tool purchases, subscriptions, paid generation, and spend require separate
  approval.

## Output locations

Store a new project-bound cycle under a versioned directory such as:

```text
docs/ops/pinterest-creative-lab/v5-concepts/
```

Store inspected source images in a `product-references/` child directory. Use
descriptive filenames with stable product IDs. Do not delete or overwrite
earlier attempts merely because a revision is better.
