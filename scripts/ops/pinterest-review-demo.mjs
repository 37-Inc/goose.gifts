#!/usr/bin/env node
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const oauthScript = path.join(root, 'scripts/ops/pinterest-oauth.mjs');
const apiScript = path.join(root, 'scripts/ops/pinterest-api.mjs');
const draftId = process.env.PINTEREST_REVIEW_DEMO_DRAFT || 'editorial-ceramic-eye-interior';
const prompt = createInterface({ input: process.stdin, output: process.stdout });

if (!process.stdin.isTTY) {
  throw new Error('The Pinterest review demo must be run in an interactive Terminal.');
}

try {
  section('Pinterest Standard-access review demo');
  reviewer([
    'This recording demonstrates the real, first-party goose.gifts integration',
    'with our self-owned Pinterest business account.',
    '',
    'The integration uses Pinterest OAuth and the Pinterest API v5. It never',
    'collects Pinterest passwords or session cookies, and this recording will',
    'not display access tokens, refresh tokens, or the app secret.',
  ]);
  await continueWhenReady('Start your screen recording, then press Enter.');

  await demonstrate({
    title: '1. Pinterest OAuth authorization-code flow',
    explanation: [
      'We first send the account owner through Pinterest’s own OAuth consent',
      'screen. Pinterest displays the exact scopes requested and redirects back',
      'to our registered localhost callback after authorization.',
      '',
      'The returned OAuth tokens are stored in macOS Keychain. Their values are',
      'never printed, committed to source control, or exposed to the browser.',
    ],
    displayCommand: 'npm run pinterest:oauth -- --sandbox --open',
    script: oauthScript,
    args: ['--sandbox', '--open'],
  });

  await demonstrate({
    title: '2. Confirm the connected Pinterest account',
    explanation: [
      'Before publishing, the integration calls Pinterest API v5 to verify the',
      'connected identity. This safety check confirms that automation is acting',
      'only on our own goosegifts business account.',
    ],
    displayCommand: 'npm run pinterest:whoami -- --sandbox',
    script: apiScript,
    args: ['whoami', '--sandbox'],
  });

  await demonstrate({
    title: '3. Preview the approved Pin payload',
    explanation: [
      'The integration loads an owner-approved editorial draft and resolves its',
      'Sandbox board. This dry run displays the title, description, alt text,',
      'tracked goose.gifts link, and media metadata without creating anything.',
      '',
      `Approved draft: ${draftId}`,
    ],
    displayCommand: `npm run pinterest:create-pin -- --draft ${draftId} --sandbox --dry-run`,
    script: apiScript,
    args: ['create-pin', '--draft', draftId, '--sandbox', '--dry-run'],
  });

  await demonstrate({
    title: '4. Create a real Sandbox Pin through Pinterest API v5',
    explanation: [
      'Finally, the integration sends the approved payload to the live Pinterest',
      'API. Because this app currently has Trial access, Pinterest creates a real',
      'Sandbox Pin visible only to the account owner. Standard access will allow',
      'the same reviewed integration to publish public Pins.',
    ],
    displayCommand: `npm run pinterest:create-pin -- --draft ${draftId} --sandbox`,
    script: apiScript,
    args: ['create-pin', '--draft', draftId, '--sandbox'],
    openCreatedPin: true,
  });

  section('Demo complete');
  reviewer([
    'goose.gifts uses Pinterest OAuth for one self-owned business account.',
    'OAuth tokens are stored in macOS Keychain; Pinterest credentials and',
    'session cookies are never collected or stored.',
    '',
    'This completes the live Pinterest integration demonstration.',
    'Stop the screen recording now.',
  ]);
} catch (error) {
  if (error.code === 'ABORT_ERR') {
    console.error('\nDemo cancelled. No additional API action was taken.');
    process.exitCode = 130;
  } else {
    console.error(`\nDemo stopped: ${error.message}`);
    console.error('Fix the reported issue, then restart the demo from the beginning.');
    process.exitCode = 1;
  }
} finally {
  prompt.close();
}

function run(script, args, { captureOutput = false } = {}) {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: root,
    encoding: captureOutput ? 'utf8' : undefined,
    stdio: captureOutput ? ['inherit', 'pipe', 'inherit'] : 'inherit',
  });
  if (result.status !== 0) {
    throw new Error(`${path.basename(script)} exited with status ${result.status ?? 'unknown'}.`);
  }
  if (captureOutput) {
    process.stdout.write(result.stdout);
    return result.stdout;
  }
  return null;
}

async function continueWhenReady(message = 'Press Enter to continue.') {
  await prompt.question(`\n${message} `);
}

async function demonstrate({
  title,
  explanation,
  displayCommand,
  script,
  args,
  openCreatedPin = false,
}) {
  section(title);
  reviewer(explanation);
  await silentPause();
  console.log(`\n$ ${displayCommand}`);
  await silentPause();
  const output = run(script, args, { captureOutput: openCreatedPin });
  if (openCreatedPin) {
    openPinFromCreateResponse(output);
  }
}

function reviewer(lines) {
  console.log(lines.join('\n'));
}

async function silentPause() {
  await prompt.question('');
}

function openPinFromCreateResponse(output) {
  let parsed;
  try {
    parsed = JSON.parse(output);
  } catch {
    throw new Error('The Pin was created, but its API response could not be parsed.');
  }

  const pinId = parsed?.response?.id;
  if (!pinId) {
    throw new Error('Pinterest created the Pin without returning a Pin ID to open.');
  }

  const pinUrl = `https://www.pinterest.com/pin/${pinId}/`;
  console.log(`\nOpening the created Sandbox Pin in Pinterest:\n${pinUrl}`);
  const opened = spawnSync('open', [pinUrl], { stdio: 'ignore' });
  if (opened.status !== 0) {
    throw new Error(`Could not open the created Pin automatically. Open ${pinUrl}`);
  }
}

function section(title) {
  console.log(`\n${'='.repeat(68)}\n${title}\n${'='.repeat(68)}\n`);
}
