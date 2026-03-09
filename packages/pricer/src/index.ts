import {
    boss,
    closeDb,
    getItemForPricing,
    getAuctionableItems,
    insertAuctionPrice,
} from '@ffxi-crafting/db';
import type { PriceJob } from '@ffxi-crafting/types';
import { fetchItemPrices } from './parsers/ffxiah-price-parser.js';

console.log('Starting pricer...');

await boss.start();

await boss.createQueue('item-auction-prices.update');
await boss.createQueue('item-auction-price.update');

// schedule a midnight job for 'item-auction-prices.update'
await boss.schedule('item-auction-prices.update', '0 0 * * *', {});

await boss.work('item-auction-prices.update', async () => {
    const items = await getAuctionableItems();
    console.log(`Enqueueing price updates for ${items.length} items...`);

    await boss.insert(
        items.map((item) => ({
            name: 'item-auction-price.update',
            data: { itemId: item.id },
        })),
    );
});

await boss.work<PriceJob>('item-auction-price.update', { batchSize: 5 }, async (jobs) => {
    await Promise.all(
        jobs.map(async (job) => {
            const { itemId } = job.data;
            const item = await getItemForPricing(itemId);

            if (!item) throw new Error(`No priceable item found for itemId=${itemId}`);

            const { name, ffxiId, stackSize } = item;
            console.log(`Fetching price for ${name} | itemId=${itemId} ffxiId=${ffxiId}`);

            const hasStack = stackSize > 1;

            try {
                const { price, salesPerDay, stackPrice, stackSalesPerDay } = await fetchItemPrices(
                    ffxiId,
                    hasStack,
                );

                if (price === null || salesPerDay === null) {
                    throw new Error(`Could not find price data for ${name} | itemId=${itemId} ffxiId=${ffxiId}`);
                }

                if (hasStack && (stackPrice === null || stackSalesPerDay === null)) {
                    // some stackable items have so little ffxiah data that there's no elements on the page to grab data from
                    // TODO: how can we flag when we EXPECT to find the data vs. when it's reasonable that an item doesn't have it
                    console.warn(`Could not find stack price data for ${name} | itemId=${itemId} ffxiId=${ffxiId}`);
                }

                await insertAuctionPrice({
                    itemId,
                    price,
                    salesPerDay,
                    stackPrice,
                    stackSalesPerDay,
                });

                console.log(
                    `  ${name} | price=${price} salesPerDay=${salesPerDay} stackPrice=${stackPrice} stackSalesPerDay=${stackSalesPerDay}`,
                );
            } catch (err) {
                console.error(`  Error fetching price for ${name} | ffxiId=${ffxiId}:`, err);
                throw err;
            }
        }),
    );
});

const shutdown = async () => {
    await boss.stop();
    await closeDb();
};

process.on('SIGTERM', () => void shutdown());
process.on('SIGINT', () => void shutdown());
