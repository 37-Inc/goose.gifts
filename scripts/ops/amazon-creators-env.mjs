import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function parseCsvRows(input) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    const next = input[index + 1];

    if (character === '"' && quoted && next === '"') {
      field += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === ',' && !quoted) {
      row.push(field);
      field = '';
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && next === '\n') index += 1;
      row.push(field);
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
      field = '';
    } else {
      field += character;
    }
  }

  row.push(field);
  if (row.some((value) => value.length > 0)) rows.push(row);
  return rows;
}

function readCredentialFile(filePath) {
  const rows = parseCsvRows(fs.readFileSync(filePath, 'utf8'));
  const headers = rows[0] || [];
  const values = rows[1] || [];
  const record = Object.fromEntries(headers.map((header, index) => [header.trim(), values[index]?.trim()]));

  return {
    AMAZON_CREATORS_CREDENTIAL_ID: record['Credential Id'],
    AMAZON_CREATORS_CREDENTIAL_SECRET: record.Secret,
    AMAZON_CREATORS_CREDENTIAL_VERSION: record.Version,
  };
}

export function hydrateLocalAmazonCreatorsEnv(env = process.env) {
  if (
    env.AMAZON_CREATORS_CREDENTIAL_ID
    && env.AMAZON_CREATORS_CREDENTIAL_SECRET
    && env.AMAZON_CREATORS_CREDENTIAL_VERSION
  ) {
    return false;
  }

  const filePath = env.AMAZON_CREATORS_CREDENTIALS_FILE
    || path.join(os.homedir(), '.codex/secrets/goose.gifts/amazon-creators-api-credentials.csv');
  if (!fs.existsSync(filePath)) return false;

  const credentials = readCredentialFile(filePath);
  for (const [key, value] of Object.entries(credentials)) {
    if (!env[key] && value) env[key] = value;
  }

  return Boolean(
    env.AMAZON_CREATORS_CREDENTIAL_ID
    && env.AMAZON_CREATORS_CREDENTIAL_SECRET
    && env.AMAZON_CREATORS_CREDENTIAL_VERSION
  );
}

export { parseCsvRows, readCredentialFile };
