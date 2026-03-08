import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@ffxi-crafting/db';
import {
    synthesisCrafts,
    synthesisYieldItems,
    synthesisIngredientItems,
    items,
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

export const getSynthesesByCraft = async (craft: Craft): Promise<SynthesisDetail[]> => {
    // 1. Ordered synthesis IDs where this craft is the main craft
    const mainCraftRows = await db
        .select({
            synthesisId: synthesisCrafts.synthesisId,
            craftLevel: synthesisCrafts.craftLevel,
        })
        .from(synthesisCrafts)
        .where(and(eq(synthesisCrafts.craft, craft), eq(synthesisCrafts.isMain, true)))
        .orderBy(synthesisCrafts.craftLevel);

    const synthesisIds = mainCraftRows.map((r) => r.synthesisId);
    if (synthesisIds.length === 0) return [];

    // 2. All crafts for those synthesis IDs (to get sub-crafts)
    const allCraftRows = await db
        .select({
            synthesisId: synthesisCrafts.synthesisId,
            craft: synthesisCrafts.craft,
            craftLevel: synthesisCrafts.craftLevel,
            isMain: synthesisCrafts.isMain,
        })
        .from(synthesisCrafts)
        .where(inArray(synthesisCrafts.synthesisId, synthesisIds));

    // 3. Yields with vendor info
    const yieldRows = await db
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
        .where(inArray(synthesisYieldItems.synthesisId, synthesisIds));

    // 4. Ingredients with vendor info
    const ingredientRows = await db
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
        .where(inArray(synthesisIngredientItems.synthesisId, synthesisIds));

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
                itemMap.set(key, { name: row.name, quantity: row.quantity, vendors: [] });
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

    // Build ordered results
    const results: SynthesisDetail[] = [];
    for (const { synthesisId: sid } of mainCraftRows) {
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
