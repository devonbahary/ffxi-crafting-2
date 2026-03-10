import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { CRAFTS } from '@ffxi-crafting/types';
import { getSynthesesByCraft, searchItemsByName } from './queries.js';
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
    });

export type AppType = typeof app;

const port = parseInt(process.env.PORT ?? '3000', 10);
console.log(`API server starting on port ${port}`);

serve({ fetch: app.fetch, port });

process.on('SIGTERM', () => closeDb());
process.on('SIGINT', () => closeDb());
