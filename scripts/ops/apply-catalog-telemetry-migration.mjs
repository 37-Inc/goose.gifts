#!/usr/bin/env node

import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { sql } from '@vercel/postgres';
import { redactTelemetryText } from './catalog-telemetry.mjs';

dotenv.config({ path: '.env.local', quiet: true });
dotenv.config({ quiet: true });

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationPaths = [
  '0007_add_catalog_run_telemetry.sql',
  '0008_catalog_telemetry_timestamptz.sql',
].map((filename) => path.resolve(scriptDirectory, '../../lib/db/migrations', filename));

export function splitMigrationStatements(source) {
  return String(source || '')
    .split('--> statement-breakpoint')
    .map((statement) => statement.trim())
    .filter(Boolean);
}

async function schemaReceipt() {
  const tables = await sql.query(
    `SELECT table_name
     FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_name = ANY($1::text[])
     ORDER BY table_name`,
    [['catalog_run_items', 'catalog_runs']]
  );
  const legacyForeignKeys = await sql.query(
    `SELECT constraint_name
     FROM information_schema.table_constraints
     WHERE table_schema = 'public'
       AND table_name = 'catalog_editorial_events'
       AND constraint_type = 'FOREIGN KEY'`
  );
  const telemetryTimestampColumns = await sql.query(
    `SELECT table_name, column_name, data_type
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND (
         (table_name = 'catalog_runs' AND column_name = ANY($1::text[]))
         OR (table_name = 'catalog_run_items' AND column_name = 'created_at')
       )
     ORDER BY table_name, column_name`,
    [['started_at', 'completed_at', 'created_at', 'updated_at']]
  );
  return {
    tables: tables.rows.map((row) => row.table_name),
    legacyEditorialForeignKeys: legacyForeignKeys.rows.map((row) => row.constraint_name),
    telemetryTimestampColumns: telemetryTimestampColumns.rows,
  };
}

async function main(argv = process.argv.slice(2)) {
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(`Usage: npm run db:migrate:catalog-telemetry -- [--apply]

Without --apply, report whether the two telemetry tables and UTC timestamp
types already exist. With --apply, execute only the reviewed additive 0007 and
0008 migrations over the
@vercel/postgres HTTPS connection. Do not substitute npm run db:migrate until
the historical Drizzle baseline has been repaired separately.
`);
    return;
  }
  if (!process.env.POSTGRES_URL) throw new Error('POSTGRES_URL is required. Run scripts/ops/pull-env.sh first.');

  const before = await schemaReceipt();
  const migrations = migrationPaths.map((migrationPath) => ({
    filename: path.basename(migrationPath),
    statements: splitMigrationStatements(fs.readFileSync(migrationPath, 'utf8')),
  }));
  if (!argv.includes('--apply')) {
    console.log(JSON.stringify({
      dryRun: true,
      migrations: migrations.map(({ filename, statements }) => ({ filename, statements: statements.length })),
      before,
    }, null, 2));
    return { before };
  }

  for (const migration of migrations) {
    for (const statement of migration.statements) await sql.query(statement);
  }
  const after = await schemaReceipt();
  const timestampsUseTimezone = after.telemetryTimestampColumns.length === 5
    && after.telemetryTimestampColumns.every((column) => column.data_type === 'timestamp with time zone');
  const complete = after.tables.length === 2
    && after.legacyEditorialForeignKeys.length === 0
    && timestampsUseTimezone;
  if (!complete) throw new Error(`Catalog telemetry migration postflight failed: ${JSON.stringify(after)}`);
  console.log(JSON.stringify({
    applied: true,
    migrations: migrations.map(({ filename, statements }) => ({ filename, statements: statements.length })),
    before,
    after,
  }, null, 2));
  return { before, after };
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
  main().catch((error) => {
    console.error(redactTelemetryText(error.message));
    process.exitCode = 1;
  });
}

export { main };
