/**
 * Enable pgvector extension in database
 * Run: npx tsx enable-vector.ts
 */

import { db } from './lib/db/index';
import { sql } from 'drizzle-orm';

async function enableVector() {
  console.log('🔧 Enabling pgvector extension...');

  try {
    await db.execute(sql`CREATE EXTENSION IF NOT EXISTS vector;`);
    console.log('✅ pgvector extension enabled successfully!');
  } catch (error) {
    console.error('❌ Failed to enable pgvector extension:', error);
    process.exit(1);
  }

  process.exit(0);
}

enableVector();
