import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './schema.js';

const client = postgres(
    process.env.DATABASE_URL ?? 'postgres://ffxi:ffxi@127.0.0.1:5432/ffxi_crafting',
);

export const db = drizzle(client, { schema });
export const closeDb = () => client.end();
export * from './schema.js';
export * from './boss.js';
export * from './upserts.js';
export * from './queries.js';
