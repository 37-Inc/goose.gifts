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
} else if (command === 'create-pin') {
  const result = await createPinFromArgs({ sandbox });
  console.log(JSON.stringify(result, null, 2));
} else {
  throw new Error(`Unknown command: ${command}. Use one of: refresh, whoami, boards, approved-pins, create-pin`);
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

  const board = await resolveBoard({ boardIdArg, boardName: boardName || draft.board });
  const payload = buildPinPayload(draft, board.id);

  if (dryRun) {
    return {
      dryRun: true,
      environment: sandbox ? 'sandbox' : 'production-limited',
      draft: draft.id,
      board: { id: board.id, name: board.name },
      payload: redactMediaData(payload),
    };
  }

  const response = await apiPost('/pins', payload, { sandbox });
  return {
    dryRun: false,
    environment: sandbox ? 'sandbox' : 'production-limited',
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
    environment: sandbox ? 'sandbox' : 'production-limited',
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
