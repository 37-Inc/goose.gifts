import { drizzle } from 'drizzle-orm/vercel-postgres';
import * as schema from './schema';

// Use the Vercel/Neon serverless driver so DB access works over HTTPS in
// operator sandboxes and Vercel runtimes.
export const db = drizzle({ schema });

// Export schema for convenience
export { schema };
