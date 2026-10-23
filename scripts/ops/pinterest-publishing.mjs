import fs from 'node:fs';
import path from 'node:path';

const REQUIRED_DRAFT_FIELDS = [
  'id',
  'candidateId',
  'approvalEventId',
  'board',
  'assetPath',
  'targetPage',
  'trackingUrl',
  'title',
  'description',
  'altText',
  'disclosure',
];

export function canonicalizeUrl(value) {
  const url = new URL(value);
  url.hash = '';
  url.searchParams.sort();
  return url.toString();
}

export function excludeDeletedProductionPins(pins, receipts) {
  const deletedIds = new Set(receipts
    .filter((receipt) => receipt.environment === 'production' && receipt.type === 'cleanup.pins_deleted')
    .flatMap((receipt) => receipt.pinIds || []));
  return pins.filter((pin) => !deletedIds.has(pin.id));
}

export function validateDraftPackage(draft, { root, requireApproval = true, historicalReadback = false } = {}) {
  const required = requireApproval
    ? REQUIRED_DRAFT_FIELDS
    : REQUIRED_DRAFT_FIELDS.filter((field) => !['candidateId', 'approvalEventId'].includes(field));
  const missing = required.filter((field) => typeof draft?.[field] !== 'string' || !draft[field].trim());
  if (missing.length > 0) {
    throw new Error(`Draft ${draft?.id || '(unknown)'} is missing required field(s): ${missing.join(', ')}`);
  }

  const target = new URL(draft.targetPage);
  const tracking = new URL(draft.trackingUrl);
  if (target.protocol !== 'https:' || tracking.protocol !== 'https:') {
    throw new Error(`Draft ${draft.id} targetPage and trackingUrl must use HTTPS.`);
  }
  if (historicalReadback && !draft.livePinUrl) throw new Error('Historical validation requires an already published package.');
  if (target.username || target.password || target.port || target.hash || tracking.username || tracking.password || tracking.port || tracking.hash
    || (historicalReadback ? !['goose.gifts', 'www.goose.gifts', 'stupid.gifts'].includes(target.hostname)
      : target.hostname !== 'stupid.gifts' || !/^\/gifts\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(target.pathname))) {
    throw new Error(`Draft ${draft.id} targetPage must be a canonical https://stupid.gifts/gifts/<slug> product page (historical readbacks are separate).`);
  }
  if (tracking.hostname !== target.hostname || tracking.pathname !== target.pathname) {
    throw new Error(`Draft ${draft.id} trackingUrl must point to the same product page as targetPage.`);
  }
  for (const [key, value] of target.searchParams) {
    if (!key.startsWith('utm_') && tracking.searchParams.get(key) !== value) {
      throw new Error(`Draft ${draft.id} trackingUrl must preserve targetPage query parameter ${key}.`);
    }
  }
  for (const [key, expected] of [
    ['utm_source', 'pinterest'],
    ['utm_medium', 'organic_social'],
  ]) {
    if (tracking.searchParams.get(key) !== expected) {
      throw new Error(`Draft ${draft.id} trackingUrl requires ${key}=${expected}.`);
    }
  }
  for (const key of ['utm_campaign', 'utm_content']) {
    if (!tracking.searchParams.get(key)) {
      throw new Error(`Draft ${draft.id} trackingUrl requires ${key}.`);
    }
  }

  if (!/affiliate disclosure:/i.test(draft.description)) {
    throw new Error(`Draft ${draft.id} description must include the affiliate disclosure.`);
  }
  if (!/ai-modified image/i.test(draft.description)) {
    throw new Error(`Draft ${draft.id} description must disclose the AI-modified image.`);
  }
  if (!/ai-modified image/i.test(draft.disclosure) || !/affiliate disclosure:/i.test(draft.disclosure)) {
    throw new Error(`Draft ${draft.id} disclosure must cover AI modification and the affiliate relationship.`);
  }

  if (root) {
    const assetPath = path.join(root, draft.assetPath);
    if (!fs.existsSync(assetPath)) throw new Error(`Draft ${draft.id} asset does not exist: ${draft.assetPath}`);
    const dimensions = readPngDimensions(assetPath);
    if (!dimensions || Math.abs((dimensions.height / dimensions.width) - 1.5) > 0.01) {
      throw new Error(`Draft ${draft.id} asset must be a vertical 2:3 PNG.`);
    }
  }

  return draft;
}

export function readPngDimensions(assetPath) {
  const header = fs.readFileSync(assetPath).subarray(0, 24);
  const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (header.length < 24 || !header.subarray(0, 8).equals(pngSignature)) return null;
  return { width: header.readUInt32BE(16), height: header.readUInt32BE(20) };
}

export function findOwnerApproval(events, draft) {
  const approval = events.find((event) => event.eventId === draft.approvalEventId);
  if (!approval) throw new Error(`Draft ${draft.id} approval event does not exist: ${draft.approvalEventId}`);
  if (
    approval.type !== 'candidate.status_changed'
    || approval.actor.trim().toLowerCase() !== 'cameron'
    || approval.data.candidateId !== draft.candidateId
    || approval.data.to !== 'approved'
  ) {
    throw new Error(`Draft ${draft.id} approvalEventId is not Cameron's approval for ${draft.candidateId}.`);
  }
  return approval;
}

export function assertCandidateReadyForPublication(state, draft) {
  const candidate = state.candidates.get(draft.candidateId);
  if (!candidate) throw new Error(`Draft ${draft.id} references unknown candidate ${draft.candidateId}.`);
  if (candidate.status !== 'approved') {
    throw new Error(`Draft ${draft.id} candidate is ${candidate.status}, not approved.`);
  }
  const experiment = state.experiments.get(candidate.experimentId);
  if (!experiment?.authorization.publicPosting) {
    throw new Error(`Draft ${draft.id} experiment does not authorize public posting.`);
  }
  return { candidate, experiment };
}

export function findExistingPin(pins, draft) {
  const trackingUrl = canonicalizeUrl(draft.trackingUrl);
  return pins.find((pin) => {
    if (!pin.link) return false;
    try {
      return canonicalizeUrl(pin.link) === trackingUrl;
    } catch {
      return false;
    }
  }) || null;
}

export function assertPinterestAccount(account) {
  if (
    account?.id !== '1107815345747925810'
    || account?.username !== 'stupid_gifts'
    || account?.account_type !== 'BUSINESS'
  ) {
    throw new Error(
      `Refusing production publish: expected stupid_gifts BUSINESS (1107815345747925810), received ${account?.username || '(unknown)'} ${account?.account_type || '(unknown)'} (${account?.id || 'unknown ID'}).`,
    );
  }
}

export function validatePinReadback(pin, draft, boardId) {
  const mismatches = [];
  if (!pin?.id) mismatches.push('id');
  if (pin?.board_id !== boardId) mismatches.push('board_id');
  if (pin?.title !== draft.title) mismatches.push('title');
  if (pin?.description !== draft.description) mismatches.push('description');
  if (pin?.alt_text !== draft.altText) mismatches.push('alt_text');
  if (pin?.media?.media_type !== 'image') mismatches.push('media');
  try {
    if (canonicalizeUrl(pin?.link || '') !== canonicalizeUrl(draft.trackingUrl)) mismatches.push('link');
  } catch {
    mismatches.push('link');
  }
  if (mismatches.length > 0) {
    throw new Error(`Pinterest readback mismatch for ${draft.id}: ${mismatches.join(', ')}`);
  }
  return pin;
}

export function publicationReceipt({ type, draft, boardId, pinId = null, details = {} }) {
  return {
    schemaVersion: 1,
    receiptId: `receipt-${Date.now()}-${draft.id}-${type.replace(/[^a-z]+/g, '-')}`,
    type,
    recordedAt: new Date().toISOString(),
    environment: 'production',
    draftId: draft.id,
    candidateId: draft.candidateId,
    approvalEventId: draft.approvalEventId,
    boardId,
    pinId,
    title: draft.title,
    trackingUrl: draft.trackingUrl,
    details,
  };
}

export function hasUnresolvedPublication(receipts, draftId) {
  const latest = receipts.filter((receipt) => receipt.draftId === draftId).at(-1);
  return latest?.type === 'publication.started' ? latest : null;
}
