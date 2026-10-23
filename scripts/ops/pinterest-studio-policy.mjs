import fs from 'node:fs';
import path from 'node:path';

/** Fail closed until a separately reviewed owner-authorized experiment replaces this freeze. */
export function assertStudioCommandAllowed(command, { root, dryRun = false, preview = false }) {
  const policy = JSON.parse(fs.readFileSync(path.join(root, 'docs/ops/pinterest-studio-policy.json'), 'utf8'));
  if (policy.schemaVersion !== 1 || policy.mode !== 'measurement_only'
    || policy.generation !== false || policy.publicPosting !== false)
    throw new Error('Pinterest studio policy missing or unreviewed; refusing execution.');
  if (preview && (!dryRun || command !== 'create-pin')) throw new Error('Destination preview is dry-run only.');
  if (['delete-pin', 'delete-board', 'generate', 'prepare', 'trial-post'].includes(command) || command === 'create-pin' && !dryRun)
    throw new Error('Pinterest is measurement-only: no production or Sandbox writes. Review and new experiment approval required.');
  return policy;
}

export function publicMetric(value) {
  // Missing metrics are unknown, never coerced to zero; a measured zero remains zero.
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

export function sumPublicMetric(pins, name) {
  return pins.every(pin => pin[name] !== null) ? pins.reduce((sum, pin) => sum + pin[name], 0) : null;
}
