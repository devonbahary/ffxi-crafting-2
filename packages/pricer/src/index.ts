import {
    boss,
    closeDb,
    getItemForPricing,
    getAuctionableItems,
    insertAuctionPrice,
} from '@ffxi-crafting/db';
import type { PriceJob, ProfitJob } from '@ffxi-crafting/types';
import { fetchItemPrices } from './parsers/ffxiah-price-parser.js';
import { logger } from './logger.js';

logger.info('Starting pricer...');

await boss.start();

await boss.createQueue('item-auction-prices.update');
await boss.createQueue('item-auction-price.update');
await boss.createQueue('synthesis-profit.update');

// schedule a midnight job for 'item-auction-prices.update'
await boss.schedule('item-auction-prices.update', '0 0 * * *', {});

await boss.work('item-auction-prices.update', async () => {
    const items = await getAuctionableItems();
    logger.info(`Enqueueing price updates for ${items.length} items...`);

    await boss.insert(
        items.map((item) => ({
            name: 'item-auction-price.update',
            data: { itemId: item.id },
        })),
    );
});

await boss.work<PriceJob>('item-auction-price.update', { batchSize: 5 }, async (jobs) => {
    const remaining = await boss.getQueueSize('item-auction-price.update');
    logger.info(`Processing ${jobs.length} jobs (${remaining} remaining in queue)...`);

    await Promise.all(
        jobs.map(async (job) => {
            const { itemId } = job.data;
            const item = await getItemForPricing(itemId);

            if (!item) throw new Error(`No priceable item found for itemId=${itemId}`);

            const { name, ffxiId, stackSize } = item;
            logger.debug(`Fetching price for ${name} | itemId=${itemId} ffxiId=${ffxiId}`);

            const hasStack = stackSize > 1;

            try {
                const { price, salesPerDay, stackPrice, stackSalesPerDay } = await fetchItemPrices(
                    ffxiId,
                    hasStack,
                );

                if (price === null || salesPerDay === null) {
                    logger.warn(
                        `Could not find price data for ${name} | itemId=${itemId} ffxiId=${ffxiId}`,
                    );
                    return
                }

                if (hasStack && (stackPrice === null || stackSalesPerDay === null)) {
                    // some stackable items have so little ffxiah data that there's no elements on the page to grab data from
                    // TODO: how can we flag when we EXPECT to find the data vs. when it's reasonable that an item doesn't have it
                    logger.warn(
                        `Could not find stack price data for ${name} | itemId=${itemId} ffxiId=${ffxiId}`,
                    );
                }

                await insertAuctionPrice({
                    itemId,
                    price,
                    salesPerDay,
                    stackPrice,
                    stackSalesPerDay,
                });

                await boss.send('synthesis-profit.update', { itemId } satisfies ProfitJob);

                logger.debug(
                    `${name} | price=${price} salesPerDay=${salesPerDay} stackPrice=${stackPrice} stackSalesPerDay=${stackSalesPerDay}`,
                );
            } catch (err) {
                logger.error({ err }, `Error fetching price for ${name} | ffxiId=${ffxiId}`);
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
