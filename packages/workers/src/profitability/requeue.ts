import { boss, closeDb, db, syntheses } from '@ffxi-crafting/db';
import type { ProfitJob } from '../shared/jobs.js';

await boss.start();
await boss.createQueue('synthesis-profit.update');

const rows = await db.select({ id: syntheses.id }).from(syntheses);

await boss.insert(
    rows.map((r) => ({
        name: 'synthesis-profit.update',
        data: { synthesisId: r.id } satisfies ProfitJob,
    })),
);

console.log(`Queued ${rows.length} syntheses for profitability update`);

await boss.stop();
await closeDb();
