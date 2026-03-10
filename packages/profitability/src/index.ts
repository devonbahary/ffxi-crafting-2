import {
    boss,
    closeDb,
    getAuctionableSynthesisIds,
    getSynthesisProfitabilityData,
    upsertSynthesisProfit,
} from '@ffxi-crafting/db';
import type { ProfitJob } from '@ffxi-crafting/types';
import { calculateProfit } from './calculator.js';
import { logger } from './logger.js';

logger.info('Starting profitability worker...');

await boss.start();
await boss.createQueue('synthesis-profit.update');

await boss.work<ProfitJob>('synthesis-profit.update', { batchSize: 5 }, async (jobs) => {
    const remaining = await boss.getQueueSize('synthesis-profit.update');
    logger.info(`Processing ${jobs.length} jobs (${remaining} remaining in queue)...`);

    await Promise.all(
        jobs.map(async (job) => {
            const { itemId } = job.data;

            try {
                const synthesisIds = await getAuctionableSynthesisIds(itemId);

                logger.info(
                    `Found ${synthesisIds.length} syntheses involving item itemId=${itemId}...`,
                );

                await Promise.all(
                    synthesisIds.map(async (synthesisId) => {
                        const data = await getSynthesisProfitabilityData(synthesisId);
                        if (!data) {
                            logger.warn(
                                `Could not find synthesis data for synthesisId=${synthesisId}`,
                            );
                            return;
                        }
                        const result = calculateProfit(synthesisId, data.yields, data.ingredients);
                        if (!result) return;
                        logger.info(
                            `synthesisId=${synthesisId} profitPerSingle=${result.profitPerSingle} profitPerStack=${result.profitPerStack}`,
                        );
                        await upsertSynthesisProfit({ synthesisId, ...result });
                    }),
                );
            } catch (err) {
                logger.error({ err }, `Error considering syntheses for item itemId=${itemId}`);
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
