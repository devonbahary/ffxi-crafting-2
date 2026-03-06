import { boss, closeDb, upsertItemStub, upsertSynthesis } from '@ffxi-crafting/db';
import type { Craft } from '@ffxi-crafting/types';
import type { ItemPageJob } from '@ffxi-crafting/types';
import { extractSyntheses } from './parsers/bg-wiki-craft-parser.js';

console.log('Starting discovery...');

await boss.start();
await boss.createQueue('item.page.requested');

console.log('Parsing syntheses from bg-wiki...');
const syntheses = await extractSyntheses();
console.log(`Parsed ${syntheses.length} syntheses.`);

const seenHrefs = new Set<string>();
const hrefToId = new Map<string, number>();

const getOrUpsertItemId = async (href: string, name: string): Promise<number> => {
    if (!hrefToId.has(href)) {
        const id = await upsertItemStub({ href, name });
        hrefToId.set(href, id);

        if (!seenHrefs.has(href)) {
            seenHrefs.add(href);
            const payload: ItemPageJob = { href, itemName: name };
            await boss.send('item.page.requested', payload, { singletonKey: href });
        }
    }
    return hrefToId.get(href)!;
};

for (const synthesis of syntheses) {
    const { mainCraft } = synthesis;

    console.log(
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

console.log(`Queued ${seenHrefs.size} unique items.`);

await boss.stop();
await closeDb();
