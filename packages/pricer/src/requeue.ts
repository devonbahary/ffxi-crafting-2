import { boss, closeDb, getItemByFfxiId } from '@ffxi-crafting/db';

const ffxiId = Number(process.argv[2]);

await boss.start();

if (ffxiId) {
    const payload = await getItemByFfxiId(ffxiId);
    if (!payload) throw new Error(`No item found with ffxiId=${ffxiId}`);

    await boss.send('item-auction-price.update', payload);
    console.log(`Queued ffxiId=${ffxiId} (itemId=${payload.id}) for price update`);
} else {
    await boss.send('item-auction-prices.update', {});
    console.log(`Queueing all items for price update`);
}

await boss.stop();
await closeDb();
