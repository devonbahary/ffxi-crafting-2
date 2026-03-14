import {
    boss,
    closeDb,
    getAuctionableSynthesisIds,
    getSynthesisDebugInfo,
    getSynthesisProfitabilityData,
    upsertSynthesisProfit,
} from '@ffxi-crafting/db';
import type { ProfitJob } from '../shared/jobs.js';
import { calculateProfit } from './calculator.js';
import { logger } from '../shared/logger.js';

logger.info('Starting profitability worker...');

await boss.start();
await boss.createQueue('synthesis-profit.update');

const processSynthesis = async (synthesisId: number) => {
    const data = await getSynthesisProfitabilityData(synthesisId);
    if (!data) {
        logger.warn(`Could not find synthesis data for synthesisId=${synthesisId}`);
        return;
    }
    const result = calculateProfit(synthesisId, data.yields, data.ingredients);
    if (!result) return;
    logger.debug(
        `synthesisId=${synthesisId} unitProfitAsSingle=${result.unitProfitAsSingle} unitProfitAsStack=${result.unitProfitAsStack}`,
    );
    await upsertSynthesisProfit({ synthesisId, pricesAsOf: data.pricesAsOf, ...result });
};

await boss.work<ProfitJob>('synthesis-profit.update', { batchSize: 5 }, async (jobs) => {
    const remaining = await boss.getQueueSize('synthesis-profit.update');
    logger.info(`Processing ${jobs.length} jobs (${remaining} remaining in queue)...`);

    await Promise.all(
        jobs.map(async (job) => {
            try {
                if ('synthesisId' in job.data) {
                    await processSynthesis(job.data.synthesisId);
                } else {
                    const { itemId } = job.data;
                    const synthesisIds = await getAuctionableSynthesisIds(itemId);
                    logger.info(
                        `Found ${synthesisIds.length} syntheses involving itemId=${itemId}...`,
                    );
                    await Promise.all(synthesisIds.map(processSynthesis));
                }
            } catch (err) {
                const synthesisId = 'synthesisId' in job.data ? job.data.synthesisId : undefined;
                if (synthesisId !== undefined) {
                    const debug = await getSynthesisDebugInfo(synthesisId).catch(() => null);
                    logger.error(
                        { err, yields: debug?.yields, craftRequirements: debug?.craftRequirements },
                        `Error processing job data=${JSON.stringify(job.data)}`,
                    );
                } else {
                    logger.error({ err }, `Error processing job data=${JSON.stringify(job.data)}`);
                }
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
