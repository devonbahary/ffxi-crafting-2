import { boss, closeDb } from '@ffxi-crafting/db';
import type { ItemPageJob } from '@ffxi-crafting/types';
import { parseBgWikiCrafts } from './parsers/bg-wiki-craft-parser.js';

console.log('Starting discovery...');

await boss.start();
await boss.createQueue('item.page.requested');

console.log('Parsing recipes from bg-wiki...');
const recipes = await parseBgWikiCrafts();
console.log(`Parsed ${recipes.length} recipes.`);

const seenHrefs = new Set<string>();

for (const recipe of recipes) {
    const items = [
        recipe.crystal,
        ...recipe.ingredients,
        ...recipe.yields.map((y) => ({ href: y.href, name: y.name })),
    ];

    for (const item of items) {
        if (seenHrefs.has(item.href)) continue;
        seenHrefs.add(item.href);

        const payload: ItemPageJob = { href: item.href, itemName: item.name };
        console.log(`  Queuing item: ${item.name} (${item.href})`);
        await boss.send('item.page.requested', payload, { singletonKey: item.href });
    }
}

console.log(`Queued ${seenHrefs.size} unique items.`);

await boss.stop();
await closeDb();
