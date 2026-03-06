import { boss, upsertItem, upsertVendorPrice } from '@ffxi-crafting/db';
import type { ItemPageJob } from '@ffxi-crafting/types';
import { extractItem } from './parsers/bg-wiki-item-parser.js';

console.log('Starting ingestor...');

await boss.start();

await boss.work<ItemPageJob>('item.page.requested', async ([job]) => {
    const { href, itemName } = job.data;
    console.log(`Processing item: ${itemName} (${href})`);

    try {
        const parsed = await extractItem(href);
        if (!parsed) {
            console.warn(`  Could not parse item page for ${href}`);
            return;
        }

        const { itemId, stackSize, isExclusive, vendors } = parsed;
        console.log(
            `    itemId=${itemId} stackSize=${stackSize}${isExclusive ? ' Ex' : ''} vendors=${vendors.length}`,
        );

        const id = await upsertItem({ href, itemId, name: itemName, stackSize, isExclusive });

        for (const vendor of vendors) {
            await upsertVendorPrice({ itemId: id, ...vendor });
        }
    } catch (err) {
        console.error(`  Error parsing item page for ${href}:`, err);
        throw err;
    }
});

process.on('SIGTERM', () => boss.stop());
process.on('SIGINT', () => boss.stop());
