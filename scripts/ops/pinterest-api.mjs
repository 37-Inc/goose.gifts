#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const APP_ID = process.env.PINTEREST_APP_ID || readKeychain('goose.gifts.PINTEREST_APP_ID') || '1588384';
const APP_SECRET = process.env.PINTEREST_APP_SECRET || readKeychain('goose.gifts.PINTEREST_APP_SECRET');
const command = process.argv[2] || 'whoami';
const sandbox = process.argv.includes('--sandbox');
const apiBase = sandbox ? 'https://api-sandbox.pinterest.com/v5' : 'https://api.pinterest.com/v5';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const approvedPinDraftsPath = path.join(root, 'docs/ops/pinterest-approved-pins.json');
const legacyPublicWebResultsPath = path.join(root, 'docs/ops/pinterest-assets/batch-1-v3/manual-post-results.json');
const creativeEventsPath = path.join(root, 'docs/ops/marketing-experiments/events.jsonl');

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
  const data = await apiGet('/boards?page_size=10', { sandbox });
  console.log(JSON.stringify(data, null, 2));
} else if (command === 'approved-pins') {
  const drafts = readApprovedPinDrafts();
  console.log(JSON.stringify(drafts, null, 2));
} else if (command === 'public-pin-metrics') {
  const metrics = await getPublicPinMetrics();
  console.log(JSON.stringify(metrics, null, 2));
} else if (command === 'create-pin') {
  const result = await createPinFromArgs({ sandbox });
  console.log(JSON.stringify(result, null, 2));
} else if (command === 'delete-pin') {
  const result = await deletePinFromArgs({ sandbox });
  console.log(JSON.stringify(result, null, 2));
} else {
  throw new Error(`Unknown command: ${command}. Use one of: refresh, whoami, boards, approved-pins, public-pin-metrics, create-pin, delete-pin`);
}

async function getPublicPinMetrics() {
  const publicPins = readApprovedPinDrafts().pins.filter((pin) => pin.livePinUrl).map((pin) => ({
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
      payload: redactMediaData(payload),
    };
  }

  const response = await apiPost('/pins', payload, { sandbox });
  return {
    dryRun: false,
    environment: sandbox ? 'sandbox' : 'production',
    draft: draft.id,
    board: { id: board.id, name: board.name },
    response,
  };
}

async function resolveBoard({ boardIdArg, boardName }) {
  const boards = await apiGet('/boards?page_size=100', { sandbox });
  const items = boards.items || [];

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
