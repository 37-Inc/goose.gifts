#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const args = new Set(process.argv.slice(2));
const production = args.has('--production');
const dryRun = args.has('--dry-run');
const force = args.has('--force');
const environment = production ? 'production-limited' : 'sandbox';
const apiBase = production ? 'https://api.pinterest.com/v5' : 'https://api-sandbox.pinterest.com/v5';
const manifestPath = getArgValue('--manifest') || path.join(root, 'docs/ops/pinterest-assets/batch-1-v3/manifest.json');
const resultsPath = getArgValue('--results') || path.join(root, 'docs/ops/pinterest-assets/batch-1-v3/post-results.json');

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

if (!manifest.assets?.length) {
  throw new Error(`No assets found in manifest: ${manifestPath}`);
}

const existingResults = readJsonIfExists(resultsPath);
if (existingResults?.posted?.length && !force && !dryRun) {
  throw new Error(`Existing post results found at ${resultsPath}. Pass --force to post again.`);
}

const boardMap = await getBoardMap();
const posted = [];

for (const asset of manifest.assets) {
  const boardId = await resolveBoardId(asset, boardMap);
  const imagePath = path.join(root, asset.imagePath);
  const imageBase64 = readFileSync(imagePath).toString('base64');
  const payload = {
    board_id: boardId,
    title: asset.title,
    description: asset.description,
    link: asset.link,
    alt_text: asset.altText,
    media_source: {
      source_type: 'image_base64',
      content_type: 'image/png',
      data: imageBase64,
    },
  };

  if (dryRun) {
    posted.push({
      status: 'dry-run',
      boardName: asset.boardName,
      boardId,
      title: asset.title,
      link: asset.link,
      imagePath: asset.imagePath,
      payloadBytes: Buffer.byteLength(JSON.stringify(payload)),
    });
    continue;
  }

  const response = await apiPost('/pins', payload);
  posted.push({
    status: 'posted',
    environment,
    id: response.id,
    boardName: asset.boardName,
    boardId: response.board_id || boardId,
    url: response.url || (response.id ? `https://www.pinterest.com/pin/${response.id}/` : null),
    title: response.title || asset.title,
    link: response.link || asset.link,
    media: response.media || null,
    imagePath: asset.imagePath,
  });
  console.log(`Posted ${asset.file}: ${response.id}`);
}

const results = {
  batch: manifest.batch,
  environment,
  dryRun,
  postedAt: new Date().toISOString(),
  manifestPath: path.relative(root, manifestPath),
  posted,
};

writeFileSync(resultsPath, `${JSON.stringify(results, null, 2)}\n`);
console.log(`${dryRun ? 'Prepared' : 'Posted'} ${posted.length} Pinterest trial pins. Results: ${path.relative(root, resultsPath)}`);

function getArgValue(flag) {
  const argsList = process.argv.slice(2);
  const index = argsList.indexOf(flag);
  if (index === -1) return '';
  return argsList[index + 1] || '';
}

function readJsonIfExists(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

async function getBoardMap() {
  const data = await apiGet('/boards?page_size=100');
  const boards = data.items || [];
  return new Map(boards.map((board) => [board.name, board]));
}

async function resolveBoardId(asset, boardMap) {
  if (production) return asset.productionBoardId;

  const sandboxName = sandboxBoardName(asset.boardName);
  const existing = boardMap.get(asset.boardName) || boardMap.get(sandboxName);
  if (existing?.id) return existing.id;

  if (dryRun) return `dry-run:${asset.boardName}`;

  const created = await apiPost('/boards', {
    name: sandboxName,
    description: `Sandbox board for goose.gifts ${asset.boardName} Pinterest API posting tests.`,
    privacy: 'PUBLIC',
  });

  boardMap.set(sandboxName, created);
  console.log(`Created sandbox board: ${sandboxName} (${created.id})`);
  return created.id;
}

function sandboxBoardName(boardName) {
  return `API Trial - ${boardName}`;
}

async function apiGet(apiPath) {
  const token = await getAccessToken();
  const response = await fetch(`${apiBase}${apiPath}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (response.status === 401) {
    await refreshAccessToken();
    return apiGet(apiPath);
  }

  if (!response.ok) {
    throw new Error(`GET ${apiPath} failed: HTTP ${response.status}: ${await response.text()}`);
  }

  return response.json();
}

async function apiPost(apiPath, payload) {
  const token = await getAccessToken();
  const response = await fetch(`${apiBase}${apiPath}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (response.status === 401) {
    await refreshAccessToken();
    return apiPost(apiPath, payload);
  }

  if (!response.ok) {
    throw new Error(`POST ${apiPath} failed: HTTP ${response.status}: ${await response.text()}`);
  }

  return response.json();
}

async function getAccessToken() {
  const suffix = production ? '' : 'SANDBOX_';
  const token = process.env[`PINTEREST_${suffix}ACCESS_TOKEN`]
    || readKeychain(`goose.gifts.PINTEREST_${suffix}ACCESS_TOKEN`);

  if (token) return token;

  await refreshAccessToken();
  const refreshed = readKeychain(`goose.gifts.PINTEREST_${suffix}ACCESS_TOKEN`);
  if (!refreshed) {
    throw new Error(`Missing goose.gifts.PINTEREST_${suffix}ACCESS_TOKEN after refresh`);
  }
  return refreshed;
}

async function refreshAccessToken() {
  const suffix = production ? '' : 'SANDBOX_';
  const refreshToken = process.env[`PINTEREST_${suffix}REFRESH_TOKEN`]
    || readKeychain(`goose.gifts.PINTEREST_${suffix}REFRESH_TOKEN`);
  const appId = process.env.PINTEREST_APP_ID || readKeychain('goose.gifts.PINTEREST_APP_ID') || '1588384';
  const appSecret = process.env.PINTEREST_APP_SECRET || readKeychain('goose.gifts.PINTEREST_APP_SECRET');

  if (!refreshToken) {
    throw new Error(`Missing refresh token. Run npm run pinterest:oauth -- ${production ? '' : '--sandbox'} first.`);
  }

  if (!appSecret) {
    throw new Error('Missing Pinterest app secret in PINTEREST_APP_SECRET or Keychain service goose.gifts.PINTEREST_APP_SECRET');
  }

  const endpoint = production
    ? 'https://api.pinterest.com/v5/oauth/token'
    : 'https://api-sandbox.pinterest.com/v5/oauth/token';
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${appId}:${appSecret}`).toString('base64')}`,
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
