import { boss, closeDb, upsertItem, upsertVendorPrice } from '@ffxi-crafting/db';
import type { EnrichJob } from '@ffxi-crafting/types';
import { extractItem } from './parsers/bg-wiki-item-parser.js';

console.log('Starting enricher...');

await boss.start();

await boss.work<EnrichJob>('item.enrich', async ([job]) => {
    const { href, itemName } = job.data;
    console.log(`Processing item: ${itemName} (${href})`);

    try {
        const parsed = await extractItem(href);
        if (!parsed) {
            console.warn(`  Could not parse item page for ${href}`);
            return;
        }

        const { ffxiId, stackSize, isExclusive, vendors } = parsed;
        console.log(
            `    ffxiId=${ffxiId} stackSize=${stackSize}${isExclusive ? ' Ex' : ''} vendors=${vendors.length}`,
        );

        const id = await upsertItem({ href, ffxiId, name: itemName, stackSize, isExclusive });

        for (const vendor of vendors) {
            await upsertVendorPrice({ itemId: id, ...vendor });
        }
    } catch (err) {
        console.error(`  Error parsing item page for ${href}:`, err);
        throw err;
    }
});

const shutdown = async () => {
    await boss.stop();
    await closeDb();
};

process.on('SIGTERM', () => void shutdown());
process.on('SIGINT', () => void shutdown());
