import { and, eq, isNotNull } from 'drizzle-orm';
import { db } from './index.js';
import { items } from './schema.js';
import type { Item } from './types.js';

type ItemPricingRow = {
    [K in 'id' | 'name' | 'ffxiId' | 'stackSize']: NonNullable<Item[K]>;
};

export const getItemByFfxiId = async (ffxiId: number): Promise<{ id: number } | null> => {
    const row = await db
        .select({ id: items.id })
        .from(items)
        .where(eq(items.ffxiId, ffxiId))
        .limit(1)
        .then((r) => r[0]);

    return row ?? null;
};

export const getAuctionableItems = async (): Promise<{ id: number }[]> => {
    const rows = await db
        .select({ id: items.id })
        .from(items)
        .where(and(isNotNull(items.ffxiId), eq(items.isExclusive, false)));

    return rows;
};

export const getItemForPricing = async (itemId: number): Promise<ItemPricingRow | null> => {
    const row = await db
        .select({
            id: items.id,
            // PostgresSQL's name is an internal type, so we need to use an alias
            itemName: items.name,
            ffxiId: items.ffxiId,
            stackSize: items.stackSize,
        })
        .from(items)
        .where(and(eq(items.id, itemId), isNotNull(items.ffxiId)))
        .limit(1)
        .then((r) => r[0]);

    if (!row || row.ffxiId === null) return null;

    return {
        id: row.id,
        name: row.itemName,
        ffxiId: row.ffxiId,
        stackSize: row.stackSize,
    };
};
