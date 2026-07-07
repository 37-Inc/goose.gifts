#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';

const DEFAULT_APP_ID = '1588384';
const DEFAULT_REDIRECT_URI = 'http://localhost:3737/oauth/pinterest/callback';
const DEFAULT_SCOPES = [
  'boards:read',
  'boards:write',
  'pins:read',
  'pins:write',
  'user_accounts:read',
];

const args = new Set(process.argv.slice(2));
const sandbox = args.has('--sandbox');
const noStore = args.has('--no-store');
const redirectUri = process.env.PINTEREST_REDIRECT_URI || DEFAULT_REDIRECT_URI;
const scopes = (process.env.PINTEREST_SCOPES || DEFAULT_SCOPES.join(','))
  .split(/[,\s]+/)
  .map((scope) => scope.trim())
  .filter(Boolean);
const appId = process.env.PINTEREST_APP_ID || readKeychain('goose.gifts.PINTEREST_APP_ID') || DEFAULT_APP_ID;
const appSecret = process.env.PINTEREST_APP_SECRET || readKeychain('goose.gifts.PINTEREST_APP_SECRET');

if (!appSecret) {
  throw new Error('Missing Pinterest app secret in PINTEREST_APP_SECRET or Keychain service goose.gifts.PINTEREST_APP_SECRET');
}

const redirectUrl = new URL(redirectUri);
if (redirectUrl.hostname !== 'localhost') {
  throw new Error(`This helper expects a localhost redirect URI, got: ${redirectUri}`);
}

const state = randomBytes(18).toString('hex');
const authUrl = new URL('https://www.pinterest.com/oauth/');
authUrl.searchParams.set('client_id', appId);
authUrl.searchParams.set('redirect_uri', redirectUri);
authUrl.searchParams.set('response_type', 'code');
authUrl.searchParams.set('scope', scopes.join(','));
authUrl.searchParams.set('state', state);

const callback = waitForCallback(Number(redirectUrl.port || 80), redirectUrl.pathname);
console.error('Open this URL in the logged-in Pinterest browser session:');
console.error(authUrl.toString());

const code = await callback;
const token = await exchangeCode({ appId, appSecret, code, redirectUri, sandbox });

if (!noStore) {
  const suffix = sandbox ? 'SANDBOX_' : '';
  writeKeychain(`goose.gifts.PINTEREST_${suffix}ACCESS_TOKEN`, token.access_token);
  if (token.refresh_token) {
    writeKeychain(`goose.gifts.PINTEREST_${suffix}REFRESH_TOKEN`, token.refresh_token);
  }
}

console.log(JSON.stringify({
  environment: sandbox ? 'sandbox' : 'production-limited',
  tokenType: token.token_type,
  responseType: token.response_type,
  expiresIn: token.expires_in,
  refreshTokenExpiresIn: token.refresh_token_expires_in,
  refreshTokenExpiresAt: token.refresh_token_expires_at,
  scope: token.scope,
  stored: noStore
    ? false
    : [
        `goose.gifts.PINTEREST_${sandbox ? 'SANDBOX_' : ''}ACCESS_TOKEN`,
        token.refresh_token ? `goose.gifts.PINTEREST_${sandbox ? 'SANDBOX_' : ''}REFRESH_TOKEN` : null,
    ].filter(Boolean),
}, null, 2));

process.exit(0);

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

function waitForCallback(port, pathname) {
  let resolveCode;
  let rejectCode;
  const codePromise = new Promise((resolve, reject) => {
    resolveCode = resolve;
    rejectCode = reject;
  });

  const server = createServer((req, res) => {
    const requestUrl = new URL(req.url || '/', `http://localhost:${port}`);

    if (requestUrl.pathname !== pathname) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }

    const returnedState = requestUrl.searchParams.get('state');
    const code = requestUrl.searchParams.get('code');
    const error = requestUrl.searchParams.get('error');

    if (error) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('Pinterest authorization failed. You can close this tab.');
      rejectCode(new Error(`Pinterest OAuth error: ${error}`));
      server.close();
      return;
    }

    if (!code || returnedState !== state) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('Pinterest authorization response was invalid. You can close this tab.');
      rejectCode(new Error('Pinterest OAuth callback missing code or state mismatch'));
      server.close();
      return;
    }

    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<!doctype html><title>goose.gifts Pinterest connected</title><p>Pinterest OAuth complete. You can close this tab.</p>');
    resolveCode(code);
    server.close();
  });

  server.listen(port, () => {
    console.error(`Listening for Pinterest OAuth callback on ${redirectUri}`);
  });

  server.on('error', rejectCode);

  return codePromise;
}

async function exchangeCode({ appId, appSecret, code, redirectUri, sandbox }) {
  const endpoint = sandbox
    ? 'https://api-sandbox.pinterest.com/v5/oauth/token'
    : 'https://api.pinterest.com/v5/oauth/token';
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
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
    throw new Error(`Pinterest token exchange failed: HTTP ${response.status}: ${await response.text()}`);
  }

  return response.json();
}
