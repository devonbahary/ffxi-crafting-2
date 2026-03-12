import { and, eq, exists, inArray, isNotNull, max, min } from 'drizzle-orm';
import { db } from './index.js';
import {
    itemAuctionPrices,
    itemVendorPrices,
    items,
    synthesisIngredientItems,
    synthesisCraftRequirements,
    synthesisYieldItems,
} from './schema.js';
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

// for a given itemId, find all syntheses where the item is involved as a yield or an ingredient
// whose yield is auctionable
export const getAuctionableSynthesisIds = async (itemId: number): Promise<number[]> => {
    // find all involved syntheses (yield or ingredient)
    const [yieldRows, ingredientRows] = await Promise.all([
        db
            .select({ synthesisId: synthesisYieldItems.synthesisId })
            .from(synthesisYieldItems)
            .where(eq(synthesisYieldItems.itemId, itemId)),
        db
            .select({ synthesisId: synthesisIngredientItems.synthesisId })
            .from(synthesisIngredientItems)
            .where(eq(synthesisIngredientItems.itemId, itemId)),
    ]);

    const allSynthesisIds = [
        ...new Set([...yieldRows, ...ingredientRows].map((r) => r.synthesisId)),
    ];

    if (allSynthesisIds.length === 0) return [];

    // Filter to syntheses that have at least one non-exclusive yield with auction price data
    const auctionable = await db
        .selectDistinct({ synthesisId: synthesisYieldItems.synthesisId })
        .from(synthesisYieldItems)
        .innerJoin(items, eq(synthesisYieldItems.itemId, items.id))
        .where(
            and(
                inArray(synthesisYieldItems.synthesisId, allSynthesisIds),
                eq(items.isExclusive, false), // exclusive items cannot be sold
                exists(
                    db
                        .select()
                        .from(itemAuctionPrices)
                        .where(eq(itemAuctionPrices.itemId, items.id)),
                ),
            ),
        );

    return auctionable.map((r) => r.synthesisId);
};

type SynthesisProfitabilityData = {
    yields: {
        itemId: number;
        name: string;
        tier: string;
        quantity: number;
        auctionPrice: number | null;
        auctionStackPrice: number | null;
        salesPerDay: number | null;
        stackSalesPerDay: number | null;
        stackSize: number;
    }[];
    ingredients: {
        itemId: number;
        name: string;
        quantity: number;
        auctionPrice: number | null;
        auctionStackPrice: number | null;
        stackSize: number;
        vendorPrice: number | null;
    }[];
};

export const getSynthesisProfitabilityData = async (
    synthesisId: number,
): Promise<SynthesisProfitabilityData | null> => {
    const [yieldRows, ingredientRows] = await Promise.all([
        db
            .select({
                itemId: synthesisYieldItems.itemId,
                name: items.name,
                tier: synthesisYieldItems.tier,
                quantity: synthesisYieldItems.quantity,
                stackSize: items.stackSize,
            })
            .from(synthesisYieldItems)
            .innerJoin(items, eq(synthesisYieldItems.itemId, items.id))
            .where(eq(synthesisYieldItems.synthesisId, synthesisId)),
        db
            .select({
                itemId: synthesisIngredientItems.itemId,
                name: items.name,
                quantity: synthesisIngredientItems.quantity,
                stackSize: items.stackSize,
            })
            .from(synthesisIngredientItems)
            .innerJoin(items, eq(synthesisIngredientItems.itemId, items.id))
            .where(eq(synthesisIngredientItems.synthesisId, synthesisId)),
    ]);

    if (yieldRows.length === 0) return null;

    const itemIds = [
        ...new Set([...yieldRows.map((r) => r.itemId), ...ingredientRows.map((r) => r.itemId)]),
    ];

    const mostRecentItemAuctionPriceSubquery = db
        .select({
            itemId: itemAuctionPrices.itemId,
            maxAt: max(itemAuctionPrices.createdAt).as('max_at'),
        })
        .from(itemAuctionPrices)
        .where(inArray(itemAuctionPrices.itemId, itemIds))
        .groupBy(itemAuctionPrices.itemId)
        .as('latest');

    const [auctionPrices, vendorPrices] = await Promise.all([
        db
            .select({
                itemId: itemAuctionPrices.itemId,
                price: itemAuctionPrices.price,
                stackPrice: itemAuctionPrices.stackPrice,
                salesPerDay: itemAuctionPrices.salesPerDay,
                stackSalesPerDay: itemAuctionPrices.stackSalesPerDay,
            })
            .from(itemAuctionPrices)
            .innerJoin(
                mostRecentItemAuctionPriceSubquery,
                and(
                    eq(itemAuctionPrices.itemId, mostRecentItemAuctionPriceSubquery.itemId),
                    eq(itemAuctionPrices.createdAt, mostRecentItemAuctionPriceSubquery.maxAt),
                ),
            ),
        db
            .select({
                itemId: itemVendorPrices.itemId,
                minPrice: min(itemVendorPrices.price),
            })
            .from(itemVendorPrices)
            .where(inArray(itemVendorPrices.itemId, itemIds))
            .groupBy(itemVendorPrices.itemId),
    ]);

    const priceByItemId = new Map(auctionPrices.map((p) => [p.itemId, p]));
    const vendorPriceByItemId = new Map(vendorPrices.map((v) => [v.itemId, v.minPrice]));

    // Guard: at least one NQ yield must have auction price data
    const nqYieldsWithAuction = yieldRows.filter(
        (r) => r.tier === 'NQ' && priceByItemId.has(r.itemId),
    );
    if (nqYieldsWithAuction.length === 0) return null;

    return {
        yields: yieldRows.map((r) => {
            const pricing = priceByItemId.get(r.itemId);
            return {
                itemId: r.itemId,
                name: r.name,
                tier: r.tier,
                quantity: r.quantity,
                auctionPrice: pricing?.price ?? null,
                auctionStackPrice: pricing?.stackPrice ?? null,
                salesPerDay: pricing?.salesPerDay ?? null,
                stackSalesPerDay: pricing?.stackSalesPerDay ?? null,
                stackSize: r.stackSize,
            };
        }),
        ingredients: ingredientRows.map((r) => ({
            itemId: r.itemId,
            name: r.name,
            quantity: r.quantity,
            auctionPrice: priceByItemId.get(r.itemId)?.price ?? null,
            auctionStackPrice: priceByItemId.get(r.itemId)?.stackPrice ?? null,
            stackSize: r.stackSize,
            vendorPrice: vendorPriceByItemId.get(r.itemId) ?? null,
        })),
    };
};

export const getSynthesisDebugInfo = async (synthesisId: number) => {
    const [yields, craftRequirements] = await Promise.all([
        db
            .select({
                tier: synthesisYieldItems.tier,
                quantity: synthesisYieldItems.quantity,
                name: items.name,
            })
            .from(synthesisYieldItems)
            .innerJoin(items, eq(synthesisYieldItems.itemId, items.id))
            .where(eq(synthesisYieldItems.synthesisId, synthesisId)),
        db
            .select({
                craft: synthesisCraftRequirements.craft,
                craftLevel: synthesisCraftRequirements.craftLevel,
                isMain: synthesisCraftRequirements.isMain,
            })
            .from(synthesisCraftRequirements)
            .where(eq(synthesisCraftRequirements.synthesisId, synthesisId)),
    ]);
    return { yields, craftRequirements };
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
