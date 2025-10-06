import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

// Create postgres connection
const connectionString = process.env.POSTGRES_URL!;

// Disable prefetch as it's not supported for "Transaction" pool mode
const client = postgres(connectionString, { prepare: false });

// Create drizzle instance
export const db = drizzle(client, { schema });

// Export schema for convenience
export { schema };
