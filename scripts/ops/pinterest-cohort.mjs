import fs from 'node:fs';
import path from 'node:path';
import { sumPublicMetric } from './pinterest-studio-policy.mjs';

/** Receipt-derived deadline, not a scheduler date or the oldest Pin. No writes or format adoption. */
export function reviewPinterestCohort({ ledger, receipts, metrics, now = new Date() }) {
  const members = ledger.members;
  if (members.length !== 12 || new Set(members.map(pin => pin.pinId)).size !== 12
    || members.filter(pin => pin.arm === 'P').length !== 6 || members.filter(pin => pin.arm === 'F').length !== 6)
    throw new Error('v11 cohort membership mismatch');
  const times = members.map(member => {
    const receipt = receipts.find(value => value.receiptId === member.receiptId);
    if (receipt?.type !== 'publication.succeeded' || receipt.environment !== 'production' || receipt.pinId !== member.pinId
      || receipt.details?.readbackVerified !== true || receipt.recordedAt !== member.successfulPublicationAt)
      throw new Error(`v11 publication receipt mismatch: ${member.pinId}`);
    return Date.parse(receipt.recordedAt);
  });
  const deadline = new Date(Math.max(...times) + 14 * 24 * 60 * 60 * 1000).toISOString();
  if (deadline !== ledger.fullCohortEvaluationDeadlineUtc) throw new Error('v11 deadline mismatch');
  const pins = members.map(member => {
    const pin = metrics.pins.find(value => value.id === member.pinId);
    if (!pin) throw new Error(`v11 metric receipt missing: ${member.pinId}`);
    return { ...pin, arm: member.arm, publicUrl: member.publicUrl, successfulPublicationAt: member.successfulPublicationAt,
      ageHours: Math.round((now.getTime() - Date.parse(member.successfulPublicationAt)) / 36000) / 100,
      siteSessions: null, retailerActions: null };
  });
  const arms = ['P', 'F'].map(arm => {
    const selected = pins.filter(pin => pin.arm === arm);
    const summary = { arm, pins: selected.length, siteSessions: null, retailerActions: null };
    for (const name of ['impressions', 'pinClicks', 'saves', 'outboundClicks']) summary[name] = sumPublicMetric(selected, name);
    const dominant = selected.every(pin => pin.impressions !== null)
      ? selected.toSorted((a, b) => b.impressions - a.impressions)[0] : null;
    return { ...summary, outboundClicksPerImpression: summary.impressions > 0 && summary.outboundClicks !== null
      ? summary.outboundClicks / summary.impressions : null,
      dominantPinId: dominant?.id ?? null, dominantImpressionShare: summary.impressions > 0 ? dominant.impressions / summary.impressions : null };
  });
  return { experimentId: ledger.experimentId, observedAt: now.toISOString(), deadlineUtc: deadline,
    finalReviewDue: now.getTime() >= Date.parse(deadline) && !ledger.finalReviewDelivered,
    finalReviewDelivered: ledger.finalReviewDelivered, postingAllowed: false,
    exposureGateMet: arms.every(arm => arm.impressions >= 50), arms, pins,
    interpretation: 'No format adoption from this receipt. At deadline compare acquisition, age/exposure and product differences; both zero outbound or inseparable evidence means no demonstrated acquisition winner. Downstream per-Pin actions remain unknown unless separately attributable.' };
}

export function loadPinterestCohort(root, metrics, now) {
  const ledger = JSON.parse(fs.readFileSync(path.join(root, 'docs/ops/pinterest-creative-lab/v34-concepts/verification/full-cohort-operating-ledger.json'), 'utf8'));
  const receipts = fs.readFileSync(path.join(root, 'docs/ops/pinterest-publication-receipts.jsonl'), 'utf8').split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
  return reviewPinterestCohort({ ledger, receipts, metrics, now });
}
