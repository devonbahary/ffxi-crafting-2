import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { CRAFTS } from '@ffxi-crafting/types';
import {
    getSynthesesByCraft,
    getSynthesesByIngredientItemId,
    getSynthesesByYieldItemId,
    getProfitableSyntheses,
    searchItemsByName,
} from './queries.js';
export * from './queries.js';
import { closeDb } from '@ffxi-crafting/db';

const app = new Hono()
    .use('/api/*', cors({ origin: 'http://localhost:5173' }))
    .get('/api/syntheses', zValidator('query', z.object({ craft: z.enum(CRAFTS) })), async (c) => {
        const { craft } = c.req.valid('query');
        const syntheses = await getSynthesesByCraft(craft);
        return c.json(syntheses);
    })
    .get('/api/items', zValidator('query', z.object({ name: z.string().min(1) })), async (c) => {
        const { name } = c.req.valid('query');
        const items = await searchItemsByName(name);
        return c.json(items);
    })
    .get('/api/items/:itemId/syntheses', async (c) => {
        const itemId = parseInt(c.req.param('itemId'), 10);
        if (isNaN(itemId)) return c.json({ error: 'Invalid itemId' }, 400);
        const syntheses = await getSynthesesByYieldItemId(itemId);
        return c.json(syntheses);
    })
    .get('/api/items/:itemId/ingredient-syntheses', async (c) => {
        const itemId = parseInt(c.req.param('itemId'), 10);
        if (isNaN(itemId)) return c.json({ error: 'Invalid itemId' }, 400);
        const syntheses = await getSynthesesByIngredientItemId(itemId);
        return c.json(syntheses);
    })
    .get(
        '/api/syntheses/profitable',
        zValidator(
            'query',
            z.object({
                sortBy: z.enum(['single', 'stack', 'best']).optional(),
                page: z.coerce.number().int().positive().optional(),
                perPage: z.coerce.number().int().positive().max(100).optional(),
            }),
        ),
        async (c) => {
            const { sortBy, page, perPage } = c.req.valid('query');
            const result = await getProfitableSyntheses({ sortBy, page, perPage });
            return c.json(result);
        },
    );

export type AppType = typeof app;

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
