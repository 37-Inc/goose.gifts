import test from "node:test";
import assert from "node:assert/strict";

import {
  loadEvents,
  nextActions,
  serializeState,
  validateAndFold,
} from "../scripts/ops/creative-experiments.mjs";

const at = (minute) => `2026-07-12T12:${String(minute).padStart(2, "0")}:00-07:00`;

function event(eventId, type, data, minute = 0) {
  return { schemaVersion: 1, eventId, type, recordedAt: at(minute), actor: "test", data };
}

function experimentCreated(overrides = {}) {
  return event("evt-created", "experiment.created", {
    experimentId: "exp-test",
    name: "Test",
    channel: "pinterest",
    objective: "Learn",
    hypothesis: "One visual idea will win",
    initialStatus: "active",
    authorization: { generation: true, publicPosting: false, paidSpend: false },
    successCriteria: ["One candidate advances"],
    constraints: ["Do not publish"],
    ...overrides,
  });
}

function candidateCreated() {
  return event(
    "evt-candidate",
    "candidate.created",
    {
      experimentId: "exp-test",
      candidateId: "cand-1",
      title: "One wrong thing",
      creativeFamily: "beautiful room, one wrong thing",
      audience: "Pinterest decor browsers",
      hook: "A polished room reveals one absurd object",
      initialStatus: "idea",
      references: [],
    },
    1,
  );
}

function status(eventId, from, to, minute) {
  return event(
    eventId,
    "candidate.status_changed",
    {
      experimentId: "exp-test",
      candidateId: "cand-1",
      from,
      to,
      rationale: `Move from ${from} to ${to}`,
    },
    minute,
  );
}

function attempt() {
  return event(
    "evt-attempt",
    "prompt.recorded",
    {
      experimentId: "exp-test",
      candidateId: "cand-1",
      attemptId: "attempt-1",
      parentAttemptId: null,
      tool: "imagegen",
      prompt: "A restrained editorial interior with one absurd object",
      changesFromParent: "",
      referencePaths: [],
      artifactPaths: ["docs/ops/creative-assets/cand-1/attempt-1.png"],
      result: "generated",
    },
    4,
  );
}

function review(verdict = "advance", score = 4, gate = true) {
  return event(
    "evt-review",
    "review.recorded",
    {
      experimentId: "exp-test",
      candidateId: "cand-1",
      attemptId: "attempt-1",
      rubricVersion: 1,
      reviewer: "codex",
      scores: {
        scrollStop: score,
        pinterestNative: score,
        aestheticQuality: score,
        conceptClarity: score,
        saveworthiness: score,
        brandRestraint: score,
        productFidelity: score,
        aiArtifactControl: score,
      },
      gates: {
        singleIdea: gate,
        truthfulProduct: gate,
        noEmbeddedCta: gate,
        noAdTemplate: gate,
      },
      verdict,
      notes: ["Deliberate test review"],
    },
    6,
  );
}

test("repository event log is valid and exposes review-driven next actions", async () => {
  const state = validateAndFold(await loadEvents());
  const summary = serializeState(state);
  assert.equal(summary.experiments[0].experimentId, "exp-pinterest-native-v4");
  assert.equal(summary.experiments[0].authorization.publicPosting, false);
  assert.equal(summary.experiments[0].candidates.length, 4);
  assert.ok(nextActions(state).every((item) => item.action.includes("requires revision")));
});

test("folds prompt lineage and passing review into candidate state", () => {
  const events = [
    experimentCreated(),
    candidateCreated(),
    status("evt-briefed", "idea", "briefed", 2),
    status("evt-generating", "briefed", "generating", 3),
    attempt(),
    status("evt-review-status", "generating", "review", 5),
    review(),
  ];
  const summary = serializeState(validateAndFold(events));
  assert.equal(summary.experiments[0].candidates[0].attempts, 1);
  assert.equal(summary.experiments[0].candidates[0].latestVerdict, "advance");
  assert.equal(summary.experiments[0].candidates[0].latestReviewAverage, 4);
});

test("rejects advancing a weak or gate-failing review", () => {
  const events = [
    experimentCreated(),
    candidateCreated(),
    status("evt-briefed", "idea", "briefed", 2),
    status("evt-generating", "briefed", "generating", 3),
    attempt(),
    status("evt-review-status", "generating", "review", 5),
    review("advance", 3, false),
  ];
  assert.throws(() => validateAndFold(events), /cannot advance/);
});

test("rejects publication before explicit public-posting authorization", () => {
  const events = [
    experimentCreated(),
    candidateCreated(),
    status("evt-briefed", "idea", "briefed", 2),
    status("evt-generating", "briefed", "generating", 3),
    attempt(),
    status("evt-review-status", "generating", "review", 5),
    review(),
    status("evt-shortlisted", "review", "shortlisted", 7),
    status("evt-approved", "shortlisted", "approved", 8),
    event(
      "evt-published",
      "candidate.status_changed",
      {
        experimentId: "exp-test",
        candidateId: "cand-1",
        from: "approved",
        to: "published",
        rationale: "Publish",
        evidenceUrl: "https://www.pinterest.com/pin/example",
      },
      9,
    ),
  ];
  assert.throws(() => validateAndFold(events), /public posting is not authorized/);
});

test("keeps sandbox metrics separate and requires null for unavailable values", () => {
  const events = [
    experimentCreated(),
    candidateCreated(),
    event(
      "evt-sandbox-metrics",
      "metrics.recorded",
      {
        experimentId: "exp-test",
        candidateId: "cand-1",
        checkpointAt: at(3),
        cohort: "sandbox",
        source: "Pinterest Sandbox API",
        metrics: {
          impressions: null,
          saves: null,
          pinClicks: null,
          outboundClicks: null,
          siteSessions: 0,
          affiliateClicks: 0,
          revenueCents: null,
        },
        caveats: ["Sandbox objects receive no public distribution"],
      },
      3,
    ),
  ];
  const state = validateAndFold(events);
  assert.equal(state.candidates.get("cand-1").metrics[0].cohort, "sandbox");
  assert.equal(state.candidates.get("cand-1").metrics[0].metrics.impressions, null);
});
