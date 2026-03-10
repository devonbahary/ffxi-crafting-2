import { boss, closeDb, upsertItemStub, upsertSynthesis } from '@ffxi-crafting/db';
import type { Craft } from '@ffxi-crafting/types';
import type { EnrichJob } from '@ffxi-crafting/types';
import { extractSyntheses } from './parsers/bg-wiki-craft-parser.js';
import { logger } from './logger.js';

logger.info('Starting discovery...');

await boss.start();
await boss.createQueue('item.enrich');

logger.info('Parsing syntheses from bg-wiki...');
const syntheses = await extractSyntheses();
logger.info(`Parsed ${syntheses.length} syntheses.`);

const seenHrefs = new Set<string>();
const hrefToId = new Map<string, number>();

const getOrUpsertItemId = async (href: string, name: string): Promise<number> => {
    if (!hrefToId.has(href)) {
        logger.info(`Upserting item stub: ${name}`);
        const id = await upsertItemStub({ href, name });
        hrefToId.set(href, id);

        if (!seenHrefs.has(href)) {
            seenHrefs.add(href);
            const payload: EnrichJob = { href, itemName: name };
            await boss.send('item.enrich', payload, { singletonKey: href });
        }
    }
    return hrefToId.get(href)!;
};

for (const synthesis of syntheses) {
    const { mainCraft } = synthesis;

    logger.info(
        `Upserting synthesis data for ${mainCraft.name} ${mainCraft.level} - ${synthesis.yields[0].name}`,
    );

    // transform synthesis items (yields + ingredients) into item references in the database
    const ingredients = await Promise.all(
        synthesis.ingredients.map(async (i) => ({
            itemId: await getOrUpsertItemId(i.href, i.name),
            quantity: i.quantity,
        })),
    );

    const yields = await Promise.all(
        synthesis.yields.map(async (y) => ({
            itemId: await getOrUpsertItemId(y.href, y.name),
            tier: y.tier,
            quantity: y.quantity,
        })),
    );

    // upsert the synthesis with the item references
    await upsertSynthesis({
        mainCraft: {
            craft: synthesis.mainCraft.name as Craft,
            craftLevel: synthesis.mainCraft.level,
        },
        subCrafts: synthesis.subCrafts.map((sc) => ({
            craft: sc.name as Craft,
            craftLevel: sc.level,
        })),
        yields,
        ingredients,
    });
}

logger.info(`Queued ${seenHrefs.size} unique items for enrichment.`);

await boss.stop();
await closeDb();
