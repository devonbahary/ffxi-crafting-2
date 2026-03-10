import { and, desc, eq, ilike, inArray, max } from 'drizzle-orm';
import { db } from '@ffxi-crafting/db';
import {
    synthesisCraftRequirements,
    synthesisYieldItems,
    synthesisIngredientItems,
    items,
    itemAuctionPrices,
    itemVendorPrices,
} from '@ffxi-crafting/db';
import type { Craft, CraftRequirement } from '@ffxi-crafting/types';

const CRYSTAL_NAMES = new Set([
    'Fire Crystal',
    'Ice Crystal',
    'Wind Crystal',
    'Earth Crystal',
    'Lightning Crystal',
    'Water Crystal',
    'Light Crystal',
    'Dark Crystal',
]);

export type VendorInfo = {
    vendorName: string;
    vendorZone: string | null;
    vendorLocation: string | null;
    price: number;
};

export type ItemWithVendors = {
    itemId: number;
    name: string;
    quantity: number;
    vendors: VendorInfo[];
};

export type SynthesisDetail = {
    id: number;
    mainCraft: CraftRequirement;
    subCrafts: CraftRequirement[];
    crystal: ItemWithVendors;
    ingredients: ItemWithVendors[];
    yields: (ItemWithVendors & { tier: string })[];
};

export type ItemDetail = {
    id: number;
    name: string;
    stackSize: number;
    isExclusive: boolean;
    ffxiId: number | null;
    auctionPrice: number | null;
    auctionSalesPerDay: number | null;
    auctionStackPrice: number | null;
    auctionStackSalesPerDay: number | null;
    vendors: VendorInfo[];
};

export const searchItemsByName = async (name: string): Promise<ItemDetail[]> => {
    const matchingItems = await db
        .select({
            id: items.id,
            name: items.name,
            stackSize: items.stackSize,
            isExclusive: items.isExclusive,
            ffxiId: items.ffxiId,
        })
        .from(items)
        .where(ilike(items.name, `%${name}%`))
        .orderBy(items.name)
        .limit(50);

    if (matchingItems.length === 0) return [];

    const itemIds = matchingItems.map((i) => i.id);

    const latestSub = db
        .select({
            itemId: itemAuctionPrices.itemId,
            maxAt: max(itemAuctionPrices.createdAt).as('max_at'),
        })
        .from(itemAuctionPrices)
        .where(inArray(itemAuctionPrices.itemId, itemIds))
        .groupBy(itemAuctionPrices.itemId)
        .as('latest');

    const [auctionRows, vendorRows] = await Promise.all([
        db
            .select({
                itemId: itemAuctionPrices.itemId,
                price: itemAuctionPrices.price,
                salesPerDay: itemAuctionPrices.salesPerDay,
                stackPrice: itemAuctionPrices.stackPrice,
                stackSalesPerDay: itemAuctionPrices.stackSalesPerDay,
            })
            .from(itemAuctionPrices)
            .innerJoin(
                latestSub,
                and(
                    eq(itemAuctionPrices.itemId, latestSub.itemId),
                    eq(itemAuctionPrices.createdAt, latestSub.maxAt),
                ),
            ),
        db
            .select({
                itemId: itemVendorPrices.itemId,
                vendorName: itemVendorPrices.vendorName,
                vendorZone: itemVendorPrices.vendorZone,
                vendorLocation: itemVendorPrices.vendorLocation,
                price: itemVendorPrices.price,
            })
            .from(itemVendorPrices)
            .where(inArray(itemVendorPrices.itemId, itemIds))
            .orderBy(desc(itemVendorPrices.price)),
    ]);

    const auctionByItemId = new Map(auctionRows.map((r) => [r.itemId, r]));
    const vendorsByItemId = new Map<number, VendorInfo[]>();
    for (const row of vendorRows) {
        if (!vendorsByItemId.has(row.itemId)) vendorsByItemId.set(row.itemId, []);
        vendorsByItemId.get(row.itemId)!.push({
            vendorName: row.vendorName,
            vendorZone: row.vendorZone,
            vendorLocation: row.vendorLocation,
            price: row.price,
        });
    }

    return matchingItems.map((item) => {
        const auction = auctionByItemId.get(item.id);
        return {
            ...item,
            auctionPrice: auction?.price ?? null,
            auctionSalesPerDay: auction?.salesPerDay ?? null,
            auctionStackPrice: auction?.stackPrice ?? null,
            auctionStackSalesPerDay: auction?.stackSalesPerDay ?? null,
            vendors: vendorsByItemId.get(item.id) ?? [],
        };
    });
};

const assembleSynthesesByIds = async (synthesisIds: number[]): Promise<SynthesisDetail[]> => {
    if (synthesisIds.length === 0) return [];

    const [allCraftRows, yieldRows, ingredientRows] = await Promise.all([
        db
            .select({
                synthesisId: synthesisCraftRequirements.synthesisId,
                craft: synthesisCraftRequirements.craft,
                craftLevel: synthesisCraftRequirements.craftLevel,
                isMain: synthesisCraftRequirements.isMain,
            })
            .from(synthesisCraftRequirements)
            .where(inArray(synthesisCraftRequirements.synthesisId, synthesisIds)),
        db
            .select({
                synthesisId: synthesisYieldItems.synthesisId,
                tier: synthesisYieldItems.tier,
                quantity: synthesisYieldItems.quantity,
                name: items.name,
                itemId: items.id,
                vendorName: itemVendorPrices.vendorName,
                vendorZone: itemVendorPrices.vendorZone,
                vendorLocation: itemVendorPrices.vendorLocation,
                price: itemVendorPrices.price,
            })
            .from(synthesisYieldItems)
            .innerJoin(items, eq(synthesisYieldItems.itemId, items.id))
            .leftJoin(itemVendorPrices, eq(itemVendorPrices.itemId, items.id))
            .where(inArray(synthesisYieldItems.synthesisId, synthesisIds)),
        db
            .select({
                synthesisId: synthesisIngredientItems.synthesisId,
                quantity: synthesisIngredientItems.quantity,
                name: items.name,
                itemId: items.id,
                vendorName: itemVendorPrices.vendorName,
                vendorZone: itemVendorPrices.vendorZone,
                vendorLocation: itemVendorPrices.vendorLocation,
                price: itemVendorPrices.price,
            })
            .from(synthesisIngredientItems)
            .innerJoin(items, eq(synthesisIngredientItems.itemId, items.id))
            .leftJoin(itemVendorPrices, eq(itemVendorPrices.itemId, items.id))
            .where(inArray(synthesisIngredientItems.synthesisId, synthesisIds)),
    ]);

    // Group craft rows by synthesisId
    const craftsBySynthesis = new Map<
        number,
        { mainCraft: CraftRequirement; subCrafts: CraftRequirement[] }
    >();
    for (const row of allCraftRows) {
        if (!craftsBySynthesis.has(row.synthesisId)) {
            craftsBySynthesis.set(row.synthesisId, {
                mainCraft: { craft: row.craft as Craft, craftLevel: row.craftLevel },
                subCrafts: [],
            });
        }
        const entry = craftsBySynthesis.get(row.synthesisId)!;
        if (row.isMain) {
            entry.mainCraft = { craft: row.craft as Craft, craftLevel: row.craftLevel };
        } else {
            entry.subCrafts.push({ craft: row.craft as Craft, craftLevel: row.craftLevel });
        }
    }

    // Group ingredient rows by synthesisId + itemId (collapse vendor rows)
    type ItemKey = `${number}-${string}`;
    const groupIngredients = (
        rows: typeof ingredientRows,
    ): Map<number, Map<ItemKey, ItemWithVendors>> => {
        const map = new Map<number, Map<ItemKey, ItemWithVendors>>();
        for (const row of rows) {
            if (!map.has(row.synthesisId)) map.set(row.synthesisId, new Map());
            const itemMap = map.get(row.synthesisId)!;
            const key: ItemKey = `${row.itemId}-${row.name}`;
            if (!itemMap.has(key)) {
                itemMap.set(key, {
                    itemId: row.itemId,
                    name: row.name,
                    quantity: row.quantity,
                    vendors: [],
                });
            }
            if (row.vendorName && row.price !== null) {
                itemMap.get(key)!.vendors.push({
                    vendorName: row.vendorName,
                    vendorZone: row.vendorZone,
                    vendorLocation: row.vendorLocation,
                    price: row.price,
                });
            }
        }
        return map;
    };

    // Group yield rows by synthesisId + itemId + tier
    type YieldKey = `${number}-${string}-${string}`;
    const groupYields = (
        rows: typeof yieldRows,
    ): Map<number, Map<YieldKey, ItemWithVendors & { tier: string }>> => {
        const map = new Map<number, Map<YieldKey, ItemWithVendors & { tier: string }>>();
        for (const row of rows) {
            if (!map.has(row.synthesisId)) map.set(row.synthesisId, new Map());
            const itemMap = map.get(row.synthesisId)!;
            const key: YieldKey = `${row.itemId}-${row.name}-${row.tier}`;
            if (!itemMap.has(key)) {
                itemMap.set(key, {
                    itemId: row.itemId,
                    name: row.name,
                    quantity: row.quantity,
                    tier: row.tier,
                    vendors: [],
                });
            }
            if (row.vendorName && row.price !== null) {
                itemMap.get(key)!.vendors.push({
                    vendorName: row.vendorName,
                    vendorZone: row.vendorZone,
                    vendorLocation: row.vendorLocation,
                    price: row.price,
                });
            }
        }
        return map;
    };

    const ingredientsBySynthesis = groupIngredients(ingredientRows);
    const yieldsBySynthesis = groupYields(yieldRows);

    const results: SynthesisDetail[] = [];
    for (const sid of synthesisIds) {
        const crafts = craftsBySynthesis.get(sid);
        if (!crafts) continue;

        const ingredientMap = ingredientsBySynthesis.get(sid) ?? new Map();
        const yieldMap = yieldsBySynthesis.get(sid) ?? new Map();

        const allIngredients = [...ingredientMap.values()];
        const crystal = allIngredients.find((i) => CRYSTAL_NAMES.has(i.name));
        const nonCrystalIngredients = allIngredients.filter((i) => !CRYSTAL_NAMES.has(i.name));

        if (!crystal) continue;

        results.push({
            id: sid,
            mainCraft: crafts.mainCraft,
            subCrafts: crafts.subCrafts,
            crystal,
            ingredients: nonCrystalIngredients,
            yields: [...yieldMap.values()],
        });
    }

    return results;
};

export const getSynthesesByCraft = async (craft: Craft): Promise<SynthesisDetail[]> => {
    const mainCraftRows = await db
        .select({
            synthesisId: synthesisCraftRequirements.synthesisId,
        })
        .from(synthesisCraftRequirements)
        .where(
            and(
                eq(synthesisCraftRequirements.craft, craft),
                eq(synthesisCraftRequirements.isMain, true),
            ),
        )
        .orderBy(synthesisCraftRequirements.craftLevel);

    return assembleSynthesesByIds(mainCraftRows.map((r) => r.synthesisId));
};

export const getSynthesesByYieldItemId = async (itemId: number): Promise<SynthesisDetail[]> => {
    const rows = await db
        .selectDistinct({ synthesisId: synthesisYieldItems.synthesisId })
        .from(synthesisYieldItems)
        .where(eq(synthesisYieldItems.itemId, itemId));

    return assembleSynthesesByIds(rows.map((r) => r.synthesisId));
};

export const getSynthesesByIngredientItemId = async (
    itemId: number,
): Promise<SynthesisDetail[]> => {
    const rows = await db
        .selectDistinct({ synthesisId: synthesisIngredientItems.synthesisId })
        .from(synthesisIngredientItems)
        .where(eq(synthesisIngredientItems.itemId, itemId));

    return assembleSynthesesByIds(rows.map((r) => r.synthesisId));
};
