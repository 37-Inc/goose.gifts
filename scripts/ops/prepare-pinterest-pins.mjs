#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const siteUrl = 'https://www.goose.gifts';
const assetDir = path.join(root, 'docs/ops/pinterest-assets/batch-1-v2');
const manifestPath = path.join(assetDir, 'pins-manifest.json');
const appId = process.env.PINTEREST_APP_ID || readKeychain('goose.gifts.PINTEREST_APP_ID') || '1588384';
const appSecret = process.env.PINTEREST_APP_SECRET || readKeychain('goose.gifts.PINTEREST_APP_SECRET');
const apiBase = 'https://api.pinterest.com/v5';
const shouldCreateTrialPins = process.argv.includes('--create-trial-pins');
const campaign = process.env.PINTEREST_CAMPAIGN || 'pinterest_api_trial_batch_1_v2';

if (!appSecret) {
  throw new Error('Missing Pinterest app secret in PINTEREST_APP_SECRET or Keychain service goose.gifts.PINTEREST_APP_SECRET');
}

const drafts = [
  {
    asset: '01-white-elephant-gifts.png',
    title: 'Funny White Elephant Gifts People Fight Over',
    description: 'A goose.gifts roundup of weird, useful, steal-worthy white elephant gift ideas with real products and quick picks.',
    guideSlug: 'white-elephant-gifts',
    publicBoard: 'Funny White Elephant Gifts',
    trialBoard: 'API Trial - Funny White Elephant Gifts',
  },
  {
    asset: '02-funny-gifts-for-coworkers.png',
    title: 'Coworker Gifts That Will Not Get You Fired',
    description: 'Office-safe funny coworker gift ideas for bad meetings, desk jokes, and low-risk Secret Santa chaos.',
    guideSlug: 'funny-gifts-for-coworkers',
    publicBoard: 'Funny Gifts for Coworkers',
    trialBoard: 'API Trial - Funny Gifts for Coworkers',
  },
  {
    asset: '03-weird-kitchen-gadgets.png',
    title: 'Weird Kitchen Gadgets That Look Fake But Are Real',
    description: 'A catalog-backed goose.gifts guide to odd kitchen tools, food gifts, and funny gadgets for cooks.',
    guideSlug: 'weird-kitchen-gadgets',
    publicBoard: 'Weird Kitchen Gadgets',
    trialBoard: 'API Trial - Weird Kitchen Gadgets',
  },
  {
    asset: '04-novelty-desk-toys.png',
    title: 'Novelty Desk Toys for Meetings That Should Have Ended',
    description: 'Tiny desk distractions and funny office gift ideas picked from the goose.gifts catalog.',
    guideSlug: 'novelty-desk-toys',
    publicBoard: 'Novelty Desk Toys',
    trialBoard: 'API Trial - Novelty Desk Toys',
  },
  {
    asset: '05-weird-home-decor.png',
    title: 'Weird Home Decor That Makes People Stare',
    description: 'Odd shelf pieces, room jokes, and conversation-starting home decor gifts from goose.gifts.',
    guideSlug: 'weird-home-decor-gifts',
    publicBoard: 'Weird Home Decor',
    trialBoard: 'API Trial - Weird Home Decor',
  },
];

const boards = await apiGet('/boards?page_size=100');
const boardByName = new Map((boards.items || []).map((board) => [board.name, board]));

const manifest = {
  generatedAt: new Date().toISOString(),
  mode: shouldCreateTrialPins ? 'create-trial-pins' : 'dry-run',
  campaign,
  note: shouldCreateTrialPins
    ? 'Created only on API Trial boards for Pinterest Standard-access demo evidence.'
    : 'Dry run only. No pins were created.',
  pins: drafts.map((draft) => buildManifestPin(draft, boardByName)),
};

for (const pin of manifest.pins) {
  if (!pin.assetExists) {
    throw new Error(`Missing Pinterest asset: ${pin.assetPath}`);
  }
  if (!pin.trialBoardId) {
    throw new Error(`Missing Pinterest trial board: ${pin.trialBoard}`);
  }
  if (!pin.publicBoardId) {
    throw new Error(`Missing Pinterest public board: ${pin.publicBoard}`);
  }
}

if (shouldCreateTrialPins) {
  for (const pin of manifest.pins) {
    const created = await createPin(pin);
    pin.createdPinId = created.id;
    pin.createdPinLink = created.link;
  }
}

writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({
  manifestPath,
  mode: manifest.mode,
  pins: manifest.pins.length,
  createdPins: manifest.pins.filter((pin) => pin.createdPinId).length,
  campaign,
}, null, 2));

function buildManifestPin(draft, boardByName) {
  const assetPath = path.join(assetDir, draft.asset);
  const publicBoard = boardByName.get(draft.publicBoard);
  const trialBoard = boardByName.get(draft.trialBoard);
  const link = new URL(`/gift-guides/${draft.guideSlug}`, siteUrl);
  link.searchParams.set('utm_source', 'pinterest');
  link.searchParams.set('utm_medium', 'social');
  link.searchParams.set('utm_campaign', campaign);
  link.searchParams.set('utm_content', draft.asset.replace(/\.png$/, ''));

  return {
    title: draft.title,
    description: draft.description,
    link: link.toString(),
    guideSlug: draft.guideSlug,
    asset: draft.asset,
    assetPath,
    assetExists: existsSync(assetPath),
    trialBoard: draft.trialBoard,
    trialBoardId: trialBoard?.id || null,
    publicBoard: draft.publicBoard,
    publicBoardId: publicBoard?.id || null,
  };
}

async function createPin(pin) {
  const image = readFileSync(pin.assetPath).toString('base64');
  return apiPost('/pins', {
    board_id: pin.trialBoardId,
    title: pin.title,
    description: pin.description,
    link: pin.link,
    media_source: {
      source_type: 'image_base64',
      content_type: 'image/png',
      data: image,
    },
  });
}

async function apiGet(pathname) {
  const response = await fetch(`${apiBase}${pathname}`, {
    headers: {
      Authorization: `Bearer ${await getAccessToken()}`,
    },
  });

  if (response.status === 401) {
    await refreshAccessToken();
    return apiGet(pathname);
  }

  if (!response.ok) {
    throw new Error(`${pathname} failed: HTTP ${response.status}: ${await response.text()}`);
  }

  return response.json();
}

async function apiPost(pathname, body) {
  const response = await fetch(`${apiBase}${pathname}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${await getAccessToken()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (response.status === 401) {
    await refreshAccessToken();
    return apiPost(pathname, body);
  }

  if (!response.ok) {
    throw new Error(`${pathname} failed: HTTP ${response.status}: ${await response.text()}`);
  }

  return response.json();
}

async function getAccessToken() {
  const token = process.env.PINTEREST_ACCESS_TOKEN || readKeychain('goose.gifts.PINTEREST_ACCESS_TOKEN');
  if (token) return token;

  await refreshAccessToken();
  const refreshed = readKeychain('goose.gifts.PINTEREST_ACCESS_TOKEN');
  if (!refreshed) throw new Error('Missing goose.gifts.PINTEREST_ACCESS_TOKEN after refresh');
  return refreshed;
}

async function refreshAccessToken() {
  const refreshToken = process.env.PINTEREST_REFRESH_TOKEN || readKeychain('goose.gifts.PINTEREST_REFRESH_TOKEN');
  if (!refreshToken) {
    throw new Error('Missing refresh token. Run scripts/ops/pinterest-oauth.mjs first.');
  }

  const response = await fetch('https://api.pinterest.com/v5/oauth/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${appId}:${appSecret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    throw new Error(`Pinterest refresh failed: HTTP ${response.status}: ${await response.text()}`);
  }

  const token = await response.json();
  writeKeychain('goose.gifts.PINTEREST_ACCESS_TOKEN', token.access_token);
  if (token.refresh_token) {
    writeKeychain('goose.gifts.PINTEREST_REFRESH_TOKEN', token.refresh_token);
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
