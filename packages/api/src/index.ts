import { serve } from '@hono/node-server';
import { closeDb } from '@ffxi-crafting/db';
import app from './app.js';

const port = parseInt(process.env.PORT ?? '3000', 10);
console.log(`API server starting on port ${port}`);

const server = serve({ fetch: app.fetch, port });

const shutdown = async () => {
    server.close();
    await closeDb();
    process.exit(0);
};

process.on('SIGTERM', () => void shutdown());
process.on('SIGINT', () => void shutdown());
