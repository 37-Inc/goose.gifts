#!/usr/bin/env node

import { appendFile, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const DEFAULT_EVENT_PATH = path.join(
  REPO_ROOT,
  "docs/ops/marketing-experiments/events.jsonl",
);

const EVENT_TYPES = new Set([
  "experiment.created",
  "experiment.authorization_changed",
  "experiment.status_changed",
  "candidate.created",
  "candidate.status_changed",
  "prompt.recorded",
  "review.recorded",
  "metrics.recorded",
  "learning.recorded",
]);
const EXPERIMENT_STATUSES = new Set([
  "prepared",
  "active",
  "paused",
  "completed",
  "abandoned",
]);
const CANDIDATE_STATUSES = new Set([
  "idea",
  "briefed",
  "generating",
  "review",
  "shortlisted",
  "approved",
  "published",
  "measuring",
  "learned",
  "rejected",
  "archived",
]);
const REVIEW_SCORE_KEYS = [
  "scrollStop",
  "pinterestNative",
  "aestheticQuality",
  "conceptClarity",
  "saveworthiness",
  "brandRestraint",
  "productFidelity",
  "aiArtifactControl",
];
const REVIEW_GATE_KEYS = [
  "singleIdea",
  "truthfulProduct",
  "noEmbeddedCta",
  "noAdTemplate",
];

const EXPERIMENT_TRANSITIONS = {
  prepared: new Set(["active", "abandoned"]),
  active: new Set(["paused", "completed", "abandoned"]),
  paused: new Set(["active", "completed", "abandoned"]),
  completed: new Set(),
  abandoned: new Set(),
};
const CANDIDATE_TRANSITIONS = {
  idea: new Set(["briefed", "rejected"]),
  briefed: new Set(["generating", "rejected"]),
  generating: new Set(["review", "rejected"]),
  review: new Set(["generating", "shortlisted", "rejected"]),
  shortlisted: new Set(["generating", "approved", "rejected"]),
  approved: new Set(["published", "archived"]),
  published: new Set(["measuring", "archived"]),
  measuring: new Set(["learned", "archived"]),
  learned: new Set(["archived"]),
  rejected: new Set(["archived"]),
  archived: new Set(),
};

function fail(message) {
  throw new Error(message);
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function assertObject(value, label) {
  if (!isObject(value)) fail(`${label} must be an object`);
}

function assertAllowedKeys(value, keys, label) {
  assertObject(value, label);
  const unknown = Object.keys(value).filter((key) => !keys.includes(key));
  if (unknown.length) fail(`${label} has unknown field(s): ${unknown.join(", ")}`);
}

function assertString(value, label, { nullable = false } = {}) {
  if (nullable && value === null) return;
  if (typeof value !== "string" || !value.trim()) fail(`${label} must be a non-empty string`);
}

function assertStringArray(value, label) {
  if (!Array.isArray(value)) fail(`${label} must be an array`);
  value.forEach((item, index) => assertString(item, `${label}[${index}]`));
}

function assertAuthorization(value, label) {
  assertAllowedKeys(value, ["generation", "publicPosting", "paidSpend"], label);
  for (const key of ["generation", "publicPosting", "paidSpend"]) {
    if (typeof value[key] !== "boolean") fail(`${label}.${key} must be boolean`);
  }
}

function assertDateTime(value, label) {
  assertString(value, label);
  if (!/^\d{4}-\d{2}-\d{2}T/.test(value) || Number.isNaN(Date.parse(value))) {
    fail(`${label} must be an ISO 8601 date-time`);
  }
}

function sameAuthorization(left, right) {
  return ["generation", "publicPosting", "paidSpend"].every(
    (key) => left[key] === right[key],
  );
}

function assertBaseData(data, keys, label) {
  assertAllowedKeys(data, keys, label);
  assertString(data.experimentId, `${label}.experimentId`);
}

export function validateEventShape(event, index = 0) {
  const label = `event ${index + 1}${event?.eventId ? ` (${event.eventId})` : ""}`;
  assertAllowedKeys(
    event,
    ["schemaVersion", "eventId", "type", "recordedAt", "actor", "data"],
    label,
  );
  if (event.schemaVersion !== 1) fail(`${label}.schemaVersion must be 1`);
  assertString(event.eventId, `${label}.eventId`);
  if (!/^[a-z0-9][a-z0-9._-]+$/.test(event.eventId)) {
    fail(`${label}.eventId has invalid characters`);
  }
  if (!EVENT_TYPES.has(event.type)) fail(`${label}.type is unsupported: ${event.type}`);
  assertDateTime(event.recordedAt, `${label}.recordedAt`);
  assertString(event.actor, `${label}.actor`);
  assertObject(event.data, `${label}.data`);

  const data = event.data;
  const dataLabel = `${label}.data`;
  switch (event.type) {
    case "experiment.created": {
      assertBaseData(
        data,
        [
          "experimentId",
          "name",
          "channel",
          "objective",
          "hypothesis",
          "initialStatus",
          "authorization",
          "successCriteria",
          "constraints",
          "tags",
        ],
        dataLabel,
      );
      for (const key of ["name", "channel", "objective", "hypothesis"]) {
        assertString(data[key], `${dataLabel}.${key}`);
      }
      if (!EXPERIMENT_STATUSES.has(data.initialStatus)) {
        fail(`${dataLabel}.initialStatus is invalid`);
      }
      assertAuthorization(data.authorization, `${dataLabel}.authorization`);
      assertStringArray(data.successCriteria, `${dataLabel}.successCriteria`);
      assertStringArray(data.constraints, `${dataLabel}.constraints`);
      if (data.tags !== undefined) assertStringArray(data.tags, `${dataLabel}.tags`);
      break;
    }
    case "experiment.authorization_changed": {
      assertBaseData(data, ["experimentId", "from", "to", "rationale"], dataLabel);
      assertAuthorization(data.from, `${dataLabel}.from`);
      assertAuthorization(data.to, `${dataLabel}.to`);
      if (sameAuthorization(data.from, data.to)) fail(`${dataLabel} does not change authorization`);
      assertString(data.rationale, `${dataLabel}.rationale`);
      break;
    }
    case "experiment.status_changed": {
      assertBaseData(data, ["experimentId", "from", "to", "rationale"], dataLabel);
      if (!EXPERIMENT_STATUSES.has(data.from) || !EXPERIMENT_STATUSES.has(data.to)) {
        fail(`${dataLabel} contains an invalid experiment status`);
      }
      assertString(data.rationale, `${dataLabel}.rationale`);
      break;
    }
    case "candidate.created": {
      assertBaseData(
        data,
        [
          "experimentId",
          "candidateId",
          "title",
          "creativeFamily",
          "audience",
          "hook",
          "initialStatus",
          "product",
          "references",
          "notes",
        ],
        dataLabel,
      );
      for (const key of ["candidateId", "title", "creativeFamily", "audience", "hook"]) {
        assertString(data[key], `${dataLabel}.${key}`);
      }
      if (data.initialStatus !== "idea") fail(`${dataLabel}.initialStatus must be idea`);
      if (data.product !== undefined) {
        assertAllowedKeys(data.product, ["name", "sourceUrl", "destinationUrl"], `${dataLabel}.product`);
        assertString(data.product.name, `${dataLabel}.product.name`);
        if (data.product.sourceUrl !== undefined) {
          assertString(data.product.sourceUrl, `${dataLabel}.product.sourceUrl`);
        }
        if (data.product.destinationUrl !== undefined) {
          assertString(data.product.destinationUrl, `${dataLabel}.product.destinationUrl`);
        }
      }
      if (!Array.isArray(data.references)) fail(`${dataLabel}.references must be an array`);
      data.references.forEach((reference, refIndex) => {
        const refLabel = `${dataLabel}.references[${refIndex}]`;
        assertAllowedKeys(reference, ["source", "lesson"], refLabel);
        assertString(reference.source, `${refLabel}.source`);
        assertString(reference.lesson, `${refLabel}.lesson`);
      });
      if (data.notes !== undefined) assertStringArray(data.notes, `${dataLabel}.notes`);
      break;
    }
    case "candidate.status_changed": {
      assertBaseData(
        data,
        ["experimentId", "candidateId", "from", "to", "rationale", "evidenceUrl"],
        dataLabel,
      );
      assertString(data.candidateId, `${dataLabel}.candidateId`);
      if (!CANDIDATE_STATUSES.has(data.from) || !CANDIDATE_STATUSES.has(data.to)) {
        fail(`${dataLabel} contains an invalid candidate status`);
      }
      assertString(data.rationale, `${dataLabel}.rationale`);
      if (data.evidenceUrl !== undefined) assertString(data.evidenceUrl, `${dataLabel}.evidenceUrl`);
      break;
    }
    case "prompt.recorded": {
      assertBaseData(
        data,
        [
          "experimentId",
          "candidateId",
          "attemptId",
          "parentAttemptId",
          "tool",
          "model",
          "prompt",
          "negativePrompt",
          "changesFromParent",
          "referencePaths",
          "artifactPaths",
          "settings",
          "result",
          "notes",
        ],
        dataLabel,
      );
      for (const key of ["candidateId", "attemptId", "tool", "prompt"]) {
        assertString(data[key], `${dataLabel}.${key}`);
      }
      assertString(data.parentAttemptId, `${dataLabel}.parentAttemptId`, { nullable: true });
      if (data.model !== undefined) assertString(data.model, `${dataLabel}.model`);
      if (typeof data.changesFromParent !== "string") {
        fail(`${dataLabel}.changesFromParent must be a string`);
      }
      if (data.parentAttemptId && !data.changesFromParent.trim()) {
        fail(`${dataLabel}.changesFromParent is required for a revision`);
      }
      if (data.negativePrompt !== undefined && typeof data.negativePrompt !== "string") {
        fail(`${dataLabel}.negativePrompt must be a string`);
      }
      assertStringArray(data.referencePaths, `${dataLabel}.referencePaths`);
      assertStringArray(data.artifactPaths, `${dataLabel}.artifactPaths`);
      for (const artifactPath of data.artifactPaths) {
        if (path.isAbsolute(artifactPath) || artifactPath.split("/").includes("..")) {
          fail(`${dataLabel}.artifactPaths must be repository-relative without .. segments`);
        }
      }
      if (data.settings !== undefined) assertObject(data.settings, `${dataLabel}.settings`);
      if (!["generated", "failed", "discarded"].includes(data.result)) {
        fail(`${dataLabel}.result is invalid`);
      }
      if (data.result === "generated" && data.artifactPaths.length === 0) {
        fail(`${dataLabel}.artifactPaths is required when result is generated`);
      }
      if (data.notes !== undefined) assertStringArray(data.notes, `${dataLabel}.notes`);
      break;
    }
    case "review.recorded": {
      assertBaseData(
        data,
        [
          "experimentId",
          "candidateId",
          "attemptId",
          "rubricVersion",
          "reviewer",
          "scores",
          "gates",
          "verdict",
          "notes",
        ],
        dataLabel,
      );
      for (const key of ["candidateId", "attemptId", "reviewer"]) {
        assertString(data[key], `${dataLabel}.${key}`);
      }
      if (data.rubricVersion !== 1) fail(`${dataLabel}.rubricVersion must be 1`);
      assertAllowedKeys(data.scores, REVIEW_SCORE_KEYS, `${dataLabel}.scores`);
      for (const key of REVIEW_SCORE_KEYS) {
        if (!Number.isInteger(data.scores[key]) || data.scores[key] < 1 || data.scores[key] > 5) {
          fail(`${dataLabel}.scores.${key} must be an integer from 1 to 5`);
        }
      }
      assertAllowedKeys(data.gates, REVIEW_GATE_KEYS, `${dataLabel}.gates`);
      for (const key of REVIEW_GATE_KEYS) {
        if (typeof data.gates[key] !== "boolean") fail(`${dataLabel}.gates.${key} must be boolean`);
      }
      if (!["advance", "revise", "reject"].includes(data.verdict)) {
        fail(`${dataLabel}.verdict is invalid`);
      }
      assertStringArray(data.notes, `${dataLabel}.notes`);
      const scoreValues = REVIEW_SCORE_KEYS.map((key) => data.scores[key]);
      const average = scoreValues.reduce((sum, score) => sum + score, 0) / scoreValues.length;
      if (
        data.verdict === "advance" &&
        (!REVIEW_GATE_KEYS.every((key) => data.gates[key]) ||
          average < 4 ||
          Math.min(...scoreValues) < 3)
      ) {
        fail(`${dataLabel} cannot advance: pass all gates, average >= 4.0, and score >= 3 in every dimension`);
      }
      break;
    }
    case "metrics.recorded": {
      assertBaseData(
        data,
        ["experimentId", "candidateId", "checkpointAt", "cohort", "source", "metrics", "caveats"],
        dataLabel,
      );
      assertString(data.candidateId, `${dataLabel}.candidateId`);
      assertDateTime(data.checkpointAt, `${dataLabel}.checkpointAt`);
      if (!["public", "sandbox", "internal"].includes(data.cohort)) {
        fail(`${dataLabel}.cohort is invalid`);
      }
      assertString(data.source, `${dataLabel}.source`);
      const metricKeys = [
        "impressions",
        "saves",
        "pinClicks",
        "outboundClicks",
        "siteSessions",
        "affiliateClicks",
        "revenueCents",
      ];
      assertAllowedKeys(data.metrics, metricKeys, `${dataLabel}.metrics`);
      for (const key of metricKeys) {
        const value = data.metrics[key];
        if (value !== null && (!Number.isInteger(value) || value < 0)) {
          fail(`${dataLabel}.metrics.${key} must be null or a non-negative integer`);
        }
      }
      assertStringArray(data.caveats, `${dataLabel}.caveats`);
      break;
    }
    case "learning.recorded": {
      assertBaseData(
        data,
        [
          "experimentId",
          "candidateId",
          "scope",
          "statement",
          "evidenceEventIds",
          "decision",
          "nextAction",
        ],
        dataLabel,
      );
      if (!["experiment", "candidate"].includes(data.scope)) fail(`${dataLabel}.scope is invalid`);
      if (data.scope === "candidate") assertString(data.candidateId, `${dataLabel}.candidateId`);
      for (const key of ["statement", "decision", "nextAction"]) {
        assertString(data[key], `${dataLabel}.${key}`);
      }
      assertStringArray(data.evidenceEventIds, `${dataLabel}.evidenceEventIds`);
      if (data.evidenceEventIds.length === 0) fail(`${dataLabel}.evidenceEventIds cannot be empty`);
      break;
    }
  }
}

function createState() {
  return {
    experiments: new Map(),
    candidates: new Map(),
    attempts: new Map(),
    eventIds: new Set(),
    eventCount: 0,
  };
}

export function validateAndFold(events) {
  const state = createState();

  events.forEach((event, index) => {
    validateEventShape(event, index);
    if (state.eventIds.has(event.eventId)) fail(`duplicate eventId: ${event.eventId}`);

    const data = event.data;
    const experiment = data.experimentId ? state.experiments.get(data.experimentId) : undefined;
    const candidate = data.candidateId ? state.candidates.get(data.candidateId) : undefined;

    if (event.type === "experiment.created") {
      if (experiment) fail(`${event.eventId}: duplicate experimentId ${data.experimentId}`);
      state.experiments.set(data.experimentId, {
        ...data,
        status: data.initialStatus,
        authorization: { ...data.authorization },
        candidateIds: [],
        learnings: [],
        createdEventId: event.eventId,
        updatedAt: event.recordedAt,
      });
    } else {
      if (!experiment) fail(`${event.eventId}: unknown experimentId ${data.experimentId}`);

      switch (event.type) {
        case "experiment.authorization_changed":
          if (!sameAuthorization(experiment.authorization, data.from)) {
            fail(`${event.eventId}: authorization.from does not match current authorization`);
          }
          experiment.authorization = { ...data.to };
          experiment.updatedAt = event.recordedAt;
          break;
        case "experiment.status_changed":
          if (experiment.status !== data.from) {
            fail(`${event.eventId}: experiment is ${experiment.status}, not ${data.from}`);
          }
          if (!EXPERIMENT_TRANSITIONS[data.from].has(data.to)) {
            fail(`${event.eventId}: invalid experiment transition ${data.from} -> ${data.to}`);
          }
          experiment.status = data.to;
          experiment.updatedAt = event.recordedAt;
          break;
        case "candidate.created":
          if (candidate) fail(`${event.eventId}: duplicate candidateId ${data.candidateId}`);
          state.candidates.set(data.candidateId, {
            ...data,
            status: data.initialStatus,
            attempts: [],
            reviews: [],
            metrics: [],
            learnings: [],
            createdEventId: event.eventId,
            updatedAt: event.recordedAt,
          });
          experiment.candidateIds.push(data.candidateId);
          experiment.updatedAt = event.recordedAt;
          break;
        case "candidate.status_changed": {
          if (!candidate) fail(`${event.eventId}: unknown candidateId ${data.candidateId}`);
          if (candidate.experimentId !== data.experimentId) {
            fail(`${event.eventId}: candidate belongs to ${candidate.experimentId}`);
          }
          if (candidate.status !== data.from) {
            fail(`${event.eventId}: candidate is ${candidate.status}, not ${data.from}`);
          }
          if (!CANDIDATE_TRANSITIONS[data.from].has(data.to)) {
            fail(`${event.eventId}: invalid candidate transition ${data.from} -> ${data.to}`);
          }
          if (data.to === "published") {
            if (!experiment.authorization.publicPosting) {
              fail(`${event.eventId}: public posting is not authorized for ${data.experimentId}`);
            }
            if (!data.evidenceUrl) fail(`${event.eventId}: publication requires evidenceUrl`);
          }
          candidate.status = data.to;
          candidate.updatedAt = event.recordedAt;
          break;
        }
        case "prompt.recorded": {
          if (!candidate) fail(`${event.eventId}: unknown candidateId ${data.candidateId}`);
          if (candidate.experimentId !== data.experimentId) {
            fail(`${event.eventId}: candidate belongs to ${candidate.experimentId}`);
          }
          if (!experiment.authorization.generation) {
            fail(`${event.eventId}: generation is not authorized for ${data.experimentId}`);
          }
          if (!new Set(["generating", "review"]).has(candidate.status)) {
            fail(`${event.eventId}: prompt attempts require candidate status generating or review`);
          }
          if (state.attempts.has(data.attemptId)) fail(`${event.eventId}: duplicate attemptId ${data.attemptId}`);
          if (data.parentAttemptId) {
            const parent = state.attempts.get(data.parentAttemptId);
            if (!parent) fail(`${event.eventId}: unknown parentAttemptId ${data.parentAttemptId}`);
            if (parent.candidateId !== data.candidateId) {
              fail(`${event.eventId}: parent attempt belongs to another candidate`);
            }
          }
          state.attempts.set(data.attemptId, { ...data, eventId: event.eventId });
          candidate.attempts.push(data.attemptId);
          candidate.updatedAt = event.recordedAt;
          break;
        }
        case "review.recorded": {
          if (!candidate) fail(`${event.eventId}: unknown candidateId ${data.candidateId}`);
          const attempt = state.attempts.get(data.attemptId);
          if (!attempt) fail(`${event.eventId}: unknown attemptId ${data.attemptId}`);
          if (attempt.candidateId !== data.candidateId) {
            fail(`${event.eventId}: attempt belongs to another candidate`);
          }
          if (candidate.status !== "review") {
            fail(`${event.eventId}: reviews require candidate status review`);
          }
          candidate.reviews.push({ ...data, eventId: event.eventId, recordedAt: event.recordedAt });
          candidate.updatedAt = event.recordedAt;
          break;
        }
        case "metrics.recorded":
          if (!candidate) fail(`${event.eventId}: unknown candidateId ${data.candidateId}`);
          if (data.cohort === "public") {
            if (!experiment.authorization.publicPosting) {
              fail(`${event.eventId}: public metrics recorded without public-posting authorization`);
            }
            if (!new Set(["published", "measuring", "learned", "archived"]).has(candidate.status)) {
              fail(`${event.eventId}: public metrics require a published candidate`);
            }
          }
          candidate.metrics.push({ ...data, eventId: event.eventId });
          candidate.updatedAt = event.recordedAt;
          break;
        case "learning.recorded":
          for (const evidenceEventId of data.evidenceEventIds) {
            if (!state.eventIds.has(evidenceEventId)) {
              fail(`${event.eventId}: evidence must reference an earlier event: ${evidenceEventId}`);
            }
          }
          if (data.scope === "candidate") {
            if (!candidate) fail(`${event.eventId}: unknown candidateId ${data.candidateId}`);
            candidate.learnings.push({ ...data, eventId: event.eventId });
          } else {
            experiment.learnings.push({ ...data, eventId: event.eventId });
          }
          experiment.updatedAt = event.recordedAt;
          break;
      }
    }

    state.eventIds.add(event.eventId);
    state.eventCount += 1;
  });

  return state;
}

export async function loadEvents(eventPath = DEFAULT_EVENT_PATH) {
  const raw = await readFile(eventPath, "utf8");
  const events = [];
  for (const [index, line] of raw.split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    try {
      events.push(JSON.parse(line));
    } catch (error) {
      fail(`${eventPath}:${index + 1}: invalid JSON: ${error.message}`);
    }
  }
  return events;
}

function reviewAverage(review) {
  if (!review) return null;
  const values = REVIEW_SCORE_KEYS.map((key) => review.scores[key]);
  return values.reduce((sum, score) => sum + score, 0) / values.length;
}

export function serializeState(state) {
  return {
    eventCount: state.eventCount,
    experiments: [...state.experiments.values()].map((experiment) => ({
      experimentId: experiment.experimentId,
      name: experiment.name,
      channel: experiment.channel,
      status: experiment.status,
      authorization: experiment.authorization,
      updatedAt: experiment.updatedAt,
      learnings: experiment.learnings.map((learning) => ({
        statement: learning.statement,
        decision: learning.decision,
        nextAction: learning.nextAction,
      })),
      candidates: experiment.candidateIds.map((candidateId) => {
        const candidate = state.candidates.get(candidateId);
        const latestReview = candidate.reviews.at(-1);
        return {
          candidateId,
          title: candidate.title,
          creativeFamily: candidate.creativeFamily,
          status: candidate.status,
          attempts: candidate.attempts.length,
          reviews: candidate.reviews.length,
          latestVerdict: latestReview?.verdict ?? null,
          latestReviewAverage: reviewAverage(latestReview),
          metricCheckpoints: candidate.metrics.length,
          learnings: candidate.learnings.length,
          updatedAt: candidate.updatedAt,
        };
      }),
    })),
  };
}

export function nextActions(state) {
  const actions = [];
  for (const experiment of state.experiments.values()) {
    if (experiment.status === "prepared") {
      actions.push({ experimentId: experiment.experimentId, action: "Await or record authorization to activate." });
      continue;
    }
    if (experiment.status !== "active") continue;
    if (experiment.candidateIds.length === 0) {
      actions.push({ experimentId: experiment.experimentId, action: "Create distinct concept candidates before generating." });
    }
    for (const candidateId of experiment.candidateIds) {
      const candidate = state.candidates.get(candidateId);
      const latestReview = candidate.reviews.at(-1);
      const reviewAction = latestReview
        ? {
            advance: "Latest review advanced: move to shortlisted for owner selection.",
            revise: "Latest review requires revision: move back to generating and change only the cited weaknesses.",
            reject: "Latest review rejected the artifact: move to rejected, or return to generating only if the core concept remains sound.",
          }[latestReview.verdict]
        : "Score the latest generated attempt with rubric v1.";
      const byStatus = {
        idea: "Write the concept brief, then move to briefed.",
        briefed: "Move to generating and record the first prompt attempt.",
        generating: candidate.attempts.length
          ? "Move a surviving attempt to review, or record a deliberate revision."
          : "Record the first generation attempt.",
        review: reviewAction,
        shortlisted: "Await owner selection or revise; do not treat shortlisting as publication approval.",
        approved: experiment.authorization.publicPosting
          ? "Publication is authorized; publish only with evidence URL and tracking."
          : "Hold. Public posting is not authorized for this experiment.",
        published: "Move to measuring and record a public metric checkpoint.",
        measuring: "Record the next checkpoint, then capture a learning and decision.",
        learned: "Archive the candidate or use its learning to seed a new concept.",
      };
      if (byStatus[candidate.status]) {
        actions.push({ experimentId: experiment.experimentId, candidateId, action: byStatus[candidate.status] });
      }
    }
  }
  return actions;
}

function parseArgs(argv) {
  const command = argv[0] ?? "summary";
  const options = { command, json: false, dryRun: false, file: null, eventPath: DEFAULT_EVENT_PATH };
  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") options.json = true;
    else if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--file") options.file = argv[++index];
    else if (arg === "--events") options.eventPath = path.resolve(argv[++index]);
    else fail(`unknown argument: ${arg}`);
  }
  return options;
}

async function runCli() {
  const options = parseArgs(process.argv.slice(2));
  const events = await loadEvents(options.eventPath);
  const state = validateAndFold(events);

  if (options.command === "validate") {
    console.log(`Creative experiment log valid: ${state.eventCount} events, ${state.experiments.size} experiments, ${state.candidates.size} candidates.`);
    return;
  }

  if (options.command === "summary") {
    const summary = serializeState(state);
    if (options.json) {
      console.log(JSON.stringify(summary, null, 2));
      return;
    }
    console.log(`Creative experiments: ${summary.experiments.length} (${summary.eventCount} events)`);
    for (const experiment of summary.experiments) {
      console.log(`\n${experiment.experimentId} — ${experiment.name} [${experiment.status}]`);
      console.log(`  authorization: generation=${experiment.authorization.generation}, publicPosting=${experiment.authorization.publicPosting}, paidSpend=${experiment.authorization.paidSpend}`);
      console.log(`  candidates: ${experiment.candidates.length}; learnings: ${experiment.learnings.length}`);
      for (const candidate of experiment.candidates) {
        const score = candidate.latestReviewAverage === null ? "unreviewed" : candidate.latestReviewAverage.toFixed(2);
        console.log(`  - ${candidate.candidateId} [${candidate.status}] attempts=${candidate.attempts}, score=${score}`);
      }
    }
    return;
  }

  if (options.command === "next") {
    const actions = nextActions(state);
    if (options.json) {
      console.log(JSON.stringify(actions, null, 2));
      return;
    }
    if (actions.length === 0) {
      console.log("No active creative experiment action is available.");
      return;
    }
    actions.forEach((item) => {
      const subject = item.candidateId ? `${item.experimentId}/${item.candidateId}` : item.experimentId;
      console.log(`- ${subject}: ${item.action}`);
    });
    return;
  }

  if (options.command === "record") {
    if (!options.file) fail("record requires --file /absolute/path/to/event.json");
    const newEvent = JSON.parse(await readFile(path.resolve(options.file), "utf8"));
    validateAndFold([...events, newEvent]);
    if (options.dryRun) {
      console.log(`Event valid (dry run): ${newEvent.eventId}`);
      return;
    }
    await appendFile(options.eventPath, `${JSON.stringify(newEvent)}\n`, "utf8");
    console.log(`Recorded creative event: ${newEvent.eventId}`);
    return;
  }

  fail(`unknown command: ${options.command}`);
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  runCli().catch((error) => {
    console.error(`creative-experiments: ${error.message}`);
    process.exitCode = 1;
  });
}
