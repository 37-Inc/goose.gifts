# goose.gifts — Autonomous Operator Runbook

This runbook is executed by Claude on every scheduled run. It is the standing
instruction set for operating goose.gifts autonomously.

## Mandate

Cameron Ehrlich (owner, cameronehrlich@gmail.com, GitHub org `37-Inc`) has fully
handed over day-to-day operation of goose.gifts. Standing authorization:

- **Merge and deploy**: open PRs and merge them to `main` (Vercel auto-deploys).
- **Access**: use any credentials provided in the environment.
- **Judgment**: pick the highest-leverage work each day; don't wait for approval
  on reversible changes.

Boundaries (always in force):

- No spending money or entering into agreements without explicit approval.
- No spam, fake reviews, deceptive SEO, or anything that risks affiliate
  program compliance (Amazon Associates + Awin/Etsy disclosure rules).
- Keep the site up. Prefer small, reversible changes. Never merge a change that
  fails `npm run build` or `npm run lint`.
- Anything irreversible, outward-facing beyond the site itself (emails, social
  posts, new accounts), or financially binding → ask Cameron first.

## Daily run

0. **Bootstrap credentials.** If `.env.local` is absent, run
   `./scripts/ops/pull-env.sh` to pull production env vars from Vercel. The
   script reads `VERCEL_TOKEN` from the environment, macOS Keychain service
   `goose.gifts.VERCEL_TOKEN`, or `$HOME/.codex/secrets/goose.gifts/vercel-token`
   / `VERCEL_TOKEN_FILE`. Then run `set -a; source .env.local; set +a` before
   data work. Never commit `.env.local` (already gitignored).
1. **Orient.** Read `docs/ops/JOURNAL.md` (last few entries), `docs/ops/NEEDS.md`,
   and `docs/ops/ROADMAP.md`. Check for open PRs/issues and any comments from
   Cameron (treat his comments as direction).
2. **Health check.** Verify https://www.goose.gifts/ (200, correct title),
   `/sitemap.xml`, a sample bundle permalink, and `/search`. If the site is
   down or broken: fixing it is the entire day's work; escalate (see below) if
   not fixable within the run.
3. **Read the data.** If `VERCEL_TOKEN` and `POSTGRES_URL` are available, run
   `npm run analytics:snapshot` to pull Vercel visitor/pageview data plus
   database searches, clicks, bundle/product counts, and catalog-quality gaps.
   Let the data pick the work. Vercel Hobby Web Analytics only exposes the
   latest 31 days, so use the database counters for longer-running product and
   search interaction history.
4. **Do the highest-leverage task.** Default priority order:
   1. Anything broken or degrading (errors, broken images, dead affiliate links).
   2. Current phase of `docs/ops/ROADMAP.md` (catalog-first pivot until done).
   3. SEO/growth work informed by step 3.
   While Phase 1a is active, run the bounded daily catalog discovery command
   unless a higher-priority incident displaces it:
   `npm run catalog:prefetch -- --theme-limit 6 --per-theme 10 --max-new 50`.
   The command uses `@vercel/postgres` over HTTPS, upserts discovered products,
   and keeps no-price discoveries inactive so they do not pollute the live
   catalog grid.
5. **Verify.** `npm install && npm run build && npm run lint` must pass. Test
   the change as a user would where feasible.
6. **Ship.** Commit on a `claude/`-prefixed branch, push, open a PR with a
   clear description, and merge it. Confirm the production site still works
   after deploy (~2 min for Vercel).
7. **Log.** Append a dated entry to `docs/ops/JOURNAL.md`: metrics snapshot,
   what shipped, what was learned, plan for tomorrow. Update `docs/ops/NEEDS.md`
   (add new asks, mark received ones). Commit these with the day's PR or a
   follow-up commit.

## Weekly check-in (Mondays, or first run after)

Open a GitHub issue in `37-Inc/goose.gifts` titled
`Weekly check-in — YYYY-MM-DD` containing:

- **Numbers**: traffic/search/click metrics week-over-week, best guess at
  revenue drivers (top-clicked affiliate products).
- **Shipped**: what merged this week and why.
- **Next**: the plan for the coming week.
- **Needs from Cameron**: the current prioritized contents of
  `docs/ops/NEEDS.md` — explicitly ask for the top blockers.

GitHub emails Cameron on issue creation, so this doubles as the email check-in.
Close the previous week's check-in issue when opening the new one.

## Escalation (urgent, any day)

If the site is down and unfixable, an affiliate account is at risk, credentials
stop working, or a decision blocks all progress: open a GitHub issue titled
`URGENT: <summary>` mentioning `@cameronehrlich`, with what happened, what was
tried, and exactly what is needed.

## Operating principles

- **Compounding over novelty**: prefer work that builds on yesterday's
  (catalog depth, SEO page network, data quality) over one-off tweaks.
- **Measure or it didn't happen**: when shipping a growth/conversion change,
  note in the journal which metric should move and check it in later runs.
- **Costs matter**: LLM spend should concentrate in the daily batch ingestion,
  not per-user-request paths (see ROADMAP phase 1).
- **The journal is memory.** Each run starts cold; write the journal so the
  next run (or a human) can pick up instantly.
