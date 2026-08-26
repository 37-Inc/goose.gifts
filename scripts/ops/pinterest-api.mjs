#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadEvents, validateAndFold } from './creative-experiments.mjs';
import {
  assertCandidateReadyForPublication,
  assertPinterestAccount,
  findExistingPin,
  findOwnerApproval,
  hasUnresolvedPublication,
  publicationReceipt,
  validateDraftPackage,
  validatePinReadback,
} from './pinterest-publishing.mjs';

const APP_ID = process.env.PINTEREST_APP_ID || readKeychain('goose.gifts.PINTEREST_APP_ID') || '1588384';
const APP_SECRET = process.env.PINTEREST_APP_SECRET || readKeychain('goose.gifts.PINTEREST_APP_SECRET');
const command = process.argv[2] || 'whoami';
const sandbox = process.argv.includes('--sandbox');
const apiBase = sandbox ? 'https://api-sandbox.pinterest.com/v5' : 'https://api.pinterest.com/v5';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const approvedPinDraftsPath = path.join(root, 'docs/ops/pinterest-approved-pins.json');
const legacyPublicWebResultsPath = path.join(root, 'docs/ops/pinterest-assets/batch-1-v3/manual-post-results.json');
const creativeEventsPath = path.join(root, 'docs/ops/marketing-experiments/events.jsonl');
const publicationReceiptsPath = path.join(root, 'docs/ops/pinterest-publication-receipts.jsonl');

if (!APP_SECRET) {
  throw new Error('Missing Pinterest app secret in PINTEREST_APP_SECRET or Keychain service goose.gifts.PINTEREST_APP_SECRET');
}

if (command === 'refresh') {
  const token = await refreshAccessToken({ sandbox });
  console.log(JSON.stringify(redactTokenResponse(token, sandbox), null, 2));
} else if (command === 'whoami') {
  const data = await apiGet('/user_account', { sandbox });
  console.log(JSON.stringify(data, null, 2));
} else if (command === 'boards') {
  const items = await apiGetAll('/boards', { sandbox });
  console.log(JSON.stringify({ items }, null, 2));
} else if (command === 'pins') {
  const items = await getAllOwnedPins({ sandbox });
  console.log(JSON.stringify({ items }, null, 2));
} else if (command === 'board-pins') {
  const boardId = getArg('--board-id');
  if (!boardId || !/^\d+$/.test(boardId)) {
    throw new Error('Missing or invalid --board-id <numeric Pinterest board id>.');
  }
  const items = await apiGetAll(`/boards/${boardId}/pins`, { sandbox });
  console.log(JSON.stringify({ boardId, items }, null, 2));
} else if (command === 'approved-pins') {
  const drafts = readApprovedPinDrafts();
  console.log(JSON.stringify(drafts, null, 2));
} else if (command === 'public-pin-metrics') {
  const metrics = await getPublicPinMetrics();
  console.log(JSON.stringify(metrics, null, 2));
} else if (command === 'publication-receipts') {
  console.log(JSON.stringify({ receipts: readPublicationReceipts() }, null, 2));
} else if (command === 'create-pin') {
  const result = await createPinFromArgs({ sandbox });
  console.log(JSON.stringify(result, null, 2));
} else if (command === 'delete-pin') {
  const result = await deletePinFromArgs({ sandbox });
  console.log(JSON.stringify(result, null, 2));
} else if (command === 'delete-board') {
  const result = await deleteBoardFromArgs({ sandbox });
  console.log(JSON.stringify(result, null, 2));
} else {
  throw new Error(`Unknown command: ${command}. Use one of: refresh, whoami, boards, pins, board-pins, approved-pins, public-pin-metrics, publication-receipts, create-pin, delete-pin, delete-board`);
}

async function getPublicPinMetrics() {
  const publicPins = readApprovedPinDrafts().pins
    .filter((pin) => pin.livePinUrl && pin.publicationStatus !== 'deleted')
    .map((pin) => ({
    cohort: pin.id.startsWith('editorial-') ? 'pinterest_editorial_v1' : 'pinterest_launch_v2',
    id: pin.livePinUrl.match(/\/pin\/(\d+)/)?.[1],
    title: pin.title,
    }));
  const legacyPublicWeb = JSON.parse(fs.readFileSync(legacyPublicWebResultsPath, 'utf8'));
  if (legacyPublicWeb.environment !== 'production-web') {
    throw new Error('Legacy field-note results are not marked as production-web; refusing to treat them as public.');
  }
  const legacyPins = legacyPublicWeb.posted.filter((pin) => pin.status === 'posted').map((pin) => ({
    cohort: 'pinterest_legacy_field_notes_public_web',
    id: pin.id,
    title: pin.title,
  }));
  const uniquePins = new Map();
  for (const pin of [...publicPins, ...legacyPins, ...readPublishedCreativePins()]) {
    if (!pin.id) throw new Error(`Could not resolve public Pinterest Pin id for ${pin.title}`);
    if (!uniquePins.has(pin.id)) uniquePins.set(pin.id, pin);
  }

  const pins = await Promise.all([...uniquePins.values()].map(async (pin) => {
    if (!pin.id) throw new Error(`Could not resolve public Pinterest Pin id for ${pin.title}`);
    const data = await apiGet(`/pins/${pin.id}?pin_metrics=true`, { sandbox: false });
    const lifetime = data.pin_metrics?.lifetime_metrics || {};
    return {
      ...pin,
      title: data.title || pin.title,
      createdAt: data.created_at,
      impressions: Number(lifetime.impression || 0),
      pinClicks: Number(lifetime.pin_click || 0),
      outboundClicks: Number(lifetime.outbound_click || 0),
      saves: Number(lifetime.save || 0),
      lastUpdated: lifetime.last_updated || null,
    };
  }));

  const cohorts = Object.values(pins.reduce((byCohort, pin) => {
    byCohort[pin.cohort] ||= {
      cohort: pin.cohort,
      pins: 0,
      impressions: 0,
      pinClicks: 0,
      outboundClicks: 0,
      saves: 0,
    };
    const summary = byCohort[pin.cohort];
    summary.pins += 1;
    summary.impressions += pin.impressions;
    summary.pinClicks += pin.pinClicks;
    summary.outboundClicks += pin.outboundClicks;
    summary.saves += pin.saves;
    return byCohort;
  }, {}));

  return { generatedAt: new Date().toISOString(), cohorts, pins };
}

function readPublishedCreativePins() {
  const candidates = new Map();
  const published = [];
  const lines = fs.readFileSync(creativeEventsPath, 'utf8').split(/\r?\n/).filter(Boolean);

  for (const line of lines) {
    const event = JSON.parse(line);
    if (event.type === 'candidate.created') {
      candidates.set(event.data.candidateId, event.data.title);
      continue;
    }
    if (event.type !== 'candidate.status_changed' || event.data.to !== 'published') continue;

    const pinId = event.data.evidenceUrl?.match(/pinterest\.com\/pin\/(\d+)/)?.[1];
    if (!pinId) continue;
    published.push({
      cohort: 'pinterest_creative_lab_public',
      id: pinId,
      title: candidates.get(event.data.candidateId) || event.data.candidateId,
    });
  }

  return published;
}

async function apiGet(path, { sandbox }) {
  const token = await getAccessToken({ sandbox });
  const response = await fetch(`${apiBase}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (response.status === 401) {
    await refreshAccessToken({ sandbox });
    return apiGet(path, { sandbox });
  }

  if (!response.ok) {
    throw new Error(`${path} failed: HTTP ${response.status}: ${await response.text()}`);
  }

  return response.json();
}

async function apiGetAll(path, { sandbox }) {
  const items = [];
  let bookmark = '';

  do {
    const separator = path.includes('?') ? '&' : '?';
    const page = await apiGet(
      `${path}${separator}page_size=100${bookmark ? `&bookmark=${encodeURIComponent(bookmark)}` : ''}`,
      { sandbox },
    );
    items.push(...(page.items || []));
    bookmark = page.bookmark || '';
  } while (bookmark);

  return items;
}

async function getAllOwnedPins({ sandbox }) {
  const boards = await apiGetAll('/boards', { sandbox });
  const boardPins = await Promise.all(
    boards.map((board) => apiGetAll(`/boards/${board.id}/pins`, { sandbox })),
  );
  const unique = new Map();
  for (const pin of boardPins.flat()) unique.set(pin.id, pin);
  return [...unique.values()].sort((left, right) => (
    new Date(right.created_at || 0).getTime() - new Date(left.created_at || 0).getTime()
  ));
}

async function apiPost(path, body, { sandbox }) {
  const token = await getAccessToken({ sandbox });
  const response = await fetch(`${apiBase}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (response.status === 401) {
    await refreshAccessToken({ sandbox });
    return apiPost(path, body, { sandbox });
  }

  const text = await response.text();
  const parsed = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(`${path} failed: HTTP ${response.status}: ${text}`);
  }

  return parsed;
}

async function apiDelete(path, { sandbox }) {
  const token = await getAccessToken({ sandbox });
  const response = await fetch(`${apiBase}${path}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (response.status === 401) {
    await refreshAccessToken({ sandbox });
    return apiDelete(path, { sandbox });
  }

  if (!response.ok) {
    throw new Error(`${path} failed: HTTP ${response.status}: ${await response.text()}`);
  }
}

async function deletePinFromArgs({ sandbox }) {
  const pinId = getArg('--pin-id');
  if (!pinId || !/^\d+$/.test(pinId)) {
    throw new Error('Missing or invalid --pin-id <numeric Pinterest Pin id>.');
  }
  await apiDelete(`/pins/${pinId}`, { sandbox });
  return {
    deleted: true,
    environment: sandbox ? 'sandbox' : 'production',
    pinId,
  };
}

async function deleteBoardFromArgs({ sandbox }) {
  const boardId = getArg('--board-id');
  if (!boardId || !/^\d+$/.test(boardId)) {
    throw new Error('Missing or invalid --board-id <numeric Pinterest board id>.');
  }

  const pins = await apiGetAll(`/boards/${boardId}/pins`, { sandbox });
  if (pins.length > 0) {
    throw new Error(`Refusing to delete non-empty board ${boardId}; it still has ${pins.length} Pin(s).`);
  }

  await apiDelete(`/boards/${boardId}`, { sandbox });
  return {
    deleted: true,
    environment: sandbox ? 'sandbox' : 'production',
    boardId,
  };
}

async function createPinFromArgs({ sandbox }) {
  const draftId = getArg('--draft');
  const boardName = getArg('--board');
  const boardIdArg = getArg('--board-id');
  const dryRun = process.argv.includes('--dry-run');

  if (!draftId) {
    throw new Error('Missing --draft <id>. Run `npm run pinterest:approved-pins` to list available drafts.');
  }

  const draft = readApprovedPinDrafts().pins.find((pin) => pin.id === draftId);
  if (!draft) {
    throw new Error(`Unknown approved Pin draft: ${draftId}`);
  }
  if (!sandbox && !dryRun && draft.livePinUrl) {
    throw new Error(
      `Refusing to republish ${draftId}: it already has a public Pin URL (${draft.livePinUrl}).`,
    );
  }

  const packageValidation = draft.candidateId
    ? validateDraftPackage(draft, { root })
    : null;

  let publicationContext = null;
  if (!sandbox && !dryRun) {
    if (!packageValidation) {
      throw new Error(`Refusing production publish for legacy draft ${draftId}: add a candidateId, approvalEventId, exact disclosure, and reviewed package first.`);
    }
    const events = await loadEvents(creativeEventsPath);
    const state = validateAndFold(events);
    findOwnerApproval(events, draft);
    const account = await apiGet('/user_account', { sandbox: false });
    assertPinterestAccount(account);
    const existingPin = findExistingPin(await getAllOwnedPins({ sandbox: false }), draft);
    publicationContext = { events, state };

    if (existingPin) {
      const candidate = state.candidates.get(draft.candidateId);
      if (!candidate || !['approved', 'published', 'measuring'].includes(candidate.status)) {
        throw new Error(`Found an existing Pin for ${draftId}, but candidate state ${candidate?.status || '(missing)'} cannot be reconciled automatically.`);
      }
      const board = await resolveBoard({ boardIdArg: existingPin.board_id, boardName: boardName || draft.board });
      validatePinReadback(existingPin, draft, board.id);
      const finalized = finalizeProductionPublication({
        draft,
        board,
        pin: existingPin,
        events,
        state,
        receiptType: 'publication.recovered',
      });
      return { dryRun: false, recovered: true, environment: 'production', ...finalized };
    }

    const unresolved = hasUnresolvedPublication(readPublicationReceipts(), draft.id);
    if (unresolved) {
      throw new Error(
        `Refusing to retry ${draft.id}: publication attempt ${unresolved.receiptId} has no terminal receipt and no exact Pin was found. Reconcile Pinterest before retrying.`,
      );
    }

    assertCandidateReadyForPublication(state, draft);
  }

  const targetBoardName = boardName || (
    sandbox
      ? draft.sandboxBoard || `API Trial - ${draft.board}`
      : draft.board
  );
  const board = await resolveBoard({ boardIdArg, boardName: targetBoardName });
  const payload = buildPinPayload(draft, board.id);

  if (dryRun) {
    return {
      dryRun: true,
      environment: sandbox ? 'sandbox' : 'production',
      draft: draft.id,
      board: { id: board.id, name: board.name },
      guardState: draft.candidateId
        ? { candidateId: draft.candidateId, approvalEventId: draft.approvalEventId }
        : { legacyDraft: true, publishable: false },
      payload: redactMediaData(payload),
    };
  }

  if (sandbox) {
    const response = await apiPost('/pins', payload, { sandbox });
    return {
      dryRun: false,
      environment: 'sandbox',
      draft: draft.id,
      board: { id: board.id, name: board.name },
      response,
    };
  }

  appendPublicationReceipt(publicationReceipt({ type: 'publication.started', draft, boardId: board.id }));
  let response;
  let readback;
  try {
    response = await apiPost('/pins', payload, { sandbox: false });
    if (!response?.id) throw new Error('Pinterest create response did not include a Pin id.');
    readback = await apiGet(`/pins/${response.id}`, { sandbox: false });
    validatePinReadback(readback, draft, board.id);
  } catch (error) {
    appendPublicationReceipt(publicationReceipt({
      type: 'publication.failed',
      draft,
      boardId: board.id,
      pinId: response?.id || null,
      details: { message: String(error.message || error).slice(0, 500) },
    }));
    throw error;
  }

  const finalized = finalizeProductionPublication({
    draft,
    board,
    pin: readback,
    events: publicationContext.events,
    state: publicationContext.state,
    receiptType: 'publication.succeeded',
  });
  return {
    dryRun: false,
    recovered: false,
    environment: 'production',
    ...finalized,
  };
}

function finalizeProductionPublication({ draft, board, pin, events, state, receiptType }) {
  const receipt = publicationReceipt({
    type: receiptType,
    draft,
    boardId: board.id,
    pinId: pin.id,
    details: { readbackVerified: true },
  });
  appendPublicationReceipt(receipt);
  appendPublishedCreativeEvent({ draft, pin, events, state });
  recordDraftPublication({ draftId: draft.id, pinId: pin.id, receiptId: receipt.receiptId });

  return {
    draft: draft.id,
    board: { id: board.id, name: board.name },
    pin: {
      id: pin.id,
      url: `https://www.pinterest.com/pin/${pin.id}/`,
      title: pin.title,
      link: pin.link,
    },
    receiptId: receipt.receiptId,
  };
}

function appendPublicationReceipt(receipt) {
  fs.appendFileSync(publicationReceiptsPath, `${JSON.stringify(receipt)}\n`, 'utf8');
}

function readPublicationReceipts() {
  if (!fs.existsSync(publicationReceiptsPath)) return [];
  return fs.readFileSync(publicationReceiptsPath, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        throw new Error(`Invalid publication receipt at line ${index + 1}: ${error.message}`);
      }
    });
}

function appendPublishedCreativeEvent({ draft, pin, events, state }) {
  const candidate = state.candidates.get(draft.candidateId);
  if (!candidate) throw new Error(`Unknown creative candidate: ${draft.candidateId}`);
  if (['published', 'measuring'].includes(candidate.status)) return;
  if (candidate.status !== 'approved') {
    throw new Error(`Cannot record publication for ${draft.candidateId} from ${candidate.status}.`);
  }

  const recordedAt = new Date().toISOString();
  const event = {
    schemaVersion: 1,
    eventId: `evt-${recordedAt.slice(0, 10).replaceAll('-', '')}-${draft.candidateId}-published-${pin.id}`,
    type: 'candidate.status_changed',
    recordedAt,
    actor: 'codex-pinterest-api',
    data: {
      experimentId: candidate.experimentId,
      candidateId: draft.candidateId,
      from: 'approved',
      to: 'published',
      rationale: 'Pinterest production API created and read-verified the exact owner-approved package; the durable publication receipt records the Pin id, board, title, and tracked destination.',
      evidenceUrl: `https://www.pinterest.com/pin/${pin.id}/`,
    },
  };
  validateAndFold([...events, event]);
  fs.appendFileSync(creativeEventsPath, `${JSON.stringify(event)}\n`, 'utf8');
}

function recordDraftPublication({ draftId, pinId, receiptId }) {
  const manifest = readApprovedPinDrafts();
  const draft = manifest.pins.find((item) => item.id === draftId);
  if (!draft) throw new Error(`Cannot update unknown Pin draft: ${draftId}`);
  draft.livePinUrl = `https://www.pinterest.com/pin/${pinId}/`;
  draft.publicationStatus = 'published';
  draft.publishedAt = new Date().toISOString();
  draft.publicationReceiptId = receiptId;
  const temporaryPath = `${approvedPinDraftsPath}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  fs.renameSync(temporaryPath, approvedPinDraftsPath);
}

async function resolveBoard({ boardIdArg, boardName }) {
  const items = await apiGetAll('/boards', { sandbox });

  if (boardIdArg) {
    const found = items.find((board) => board.id === boardIdArg);
    return { id: boardIdArg, name: found?.name || boardName || '(provided board id)' };
  }

  const normalizedBoardName = normalize(boardName);
  const board = items.find((item) => normalize(item.name) === normalizedBoardName);
  if (!board) {
    throw new Error(`Could not find Pinterest board named "${boardName}".`);
  }
  return { id: board.id, name: board.name };
}

function buildPinPayload(draft, boardId) {
  const assetPath = path.join(root, draft.assetPath);
  const data = fs.readFileSync(assetPath).toString('base64');

  return {
    board_id: boardId,
    title: draft.title,
    description: draft.description,
    alt_text: draft.altText,
    link: draft.trackingUrl,
    media_source: {
      source_type: 'image_base64',
      content_type: 'image/png',
      data,
    },
  };
}

function readApprovedPinDrafts() {
  return JSON.parse(fs.readFileSync(approvedPinDraftsPath, 'utf8'));
}

function getArg(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? '' : process.argv[index + 1] || '';
}

function normalize(value = '') {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function redactMediaData(payload) {
  return {
    ...payload,
    media_source: {
      ...payload.media_source,
      data: `[base64 ${payload.media_source.data.length} chars]`,
    },
  };
}

async function getAccessToken({ sandbox }) {
  const suffix = sandbox ? 'SANDBOX_' : '';
  const token = process.env[`PINTEREST_${suffix}ACCESS_TOKEN`]
    || readKeychain(`goose.gifts.PINTEREST_${suffix}ACCESS_TOKEN`);

  if (token) return token;

  await refreshAccessToken({ sandbox });
  const refreshed = readKeychain(`goose.gifts.PINTEREST_${suffix}ACCESS_TOKEN`);
  if (!refreshed) throw new Error(`Missing goose.gifts.PINTEREST_${suffix}ACCESS_TOKEN after refresh`);
  return refreshed;
}

async function refreshAccessToken({ sandbox }) {
  const suffix = sandbox ? 'SANDBOX_' : '';
  const refreshToken = process.env[`PINTEREST_${suffix}REFRESH_TOKEN`]
    || readKeychain(`goose.gifts.PINTEREST_${suffix}REFRESH_TOKEN`);

  if (!refreshToken) {
    throw new Error(`Missing refresh token. Run scripts/ops/pinterest-oauth.mjs${sandbox ? ' --sandbox' : ''} first.`);
  }

  const endpoint = sandbox
    ? 'https://api-sandbox.pinterest.com/v5/oauth/token'
    : 'https://api.pinterest.com/v5/oauth/token';
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${APP_ID}:${APP_SECRET}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  if (!response.ok) {
    throw new Error(`Pinterest refresh failed: HTTP ${response.status}: ${await response.text()}`);
  }

  const token = await response.json();
  writeKeychain(`goose.gifts.PINTEREST_${suffix}ACCESS_TOKEN`, token.access_token);
  if (token.refresh_token) {
    writeKeychain(`goose.gifts.PINTEREST_${suffix}REFRESH_TOKEN`, token.refresh_token);
  }
  return token;
}

function redactTokenResponse(token, sandbox) {
  const suffix = sandbox ? 'SANDBOX_' : '';
  return {
    environment: sandbox ? 'sandbox' : 'production',
    tokenType: token.token_type,
    responseType: token.response_type,
    expiresIn: token.expires_in,
    refreshTokenExpiresIn: token.refresh_token_expires_in,
    refreshTokenExpiresAt: token.refresh_token_expires_at,
    scope: token.scope,
    stored: [
      `goose.gifts.PINTEREST_${suffix}ACCESS_TOKEN`,
      token.refresh_token ? `goose.gifts.PINTEREST_${suffix}REFRESH_TOKEN` : null,
    ].filter(Boolean),
  };
}

function readKeychain(service) {
  const result = spawnSync('security', [
    'find-generic-password',
    '-a',
    'goose.gifts',
    '-s',
    service,
    '-w',
  ], { encoding: 'utf8' });

  return result.status === 0 ? result.stdout.trim() : '';
}

function writeKeychain(service, value) {
  const result = spawnSync('security', [
    'add-generic-password',
    '-U',
    '-a',
    'goose.gifts',
    '-s',
    service,
    '-w',
    value,
  ], { encoding: 'utf8' });

  if (result.status !== 0) {
    throw new Error(`Failed to write ${service} to Keychain: ${result.stderr || result.stdout}`);
  }
}
