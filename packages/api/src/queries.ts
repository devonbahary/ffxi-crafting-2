import { and, count, desc, eq, gte, ilike, inArray, max, sql } from 'drizzle-orm';
import { getSynthesisHqResult } from './hq.js';
import type { PlayerSkills } from './hq.js';
import { db } from '@ffxi-crafting/db';
import {
    synthesisCraftRequirements,
    synthesisYieldItems,
    synthesisIngredientItems,
    synthesisProfits,
    synthesisProfitIngredients,
    synthesisProfitYieldTiers,
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
    auctionUpdatedAt: Date | null;
    vendors: VendorInfo[];
};

export const searchItemsByName = async ({
    name,
    page = 1,
    perPage = 50,
}: {
    name?: string;
    page?: number;
    perPage?: number;
}): Promise<{ items: ItemDetail[]; total: number }> => {
    const nameFilter = name ? ilike(items.name, `%${name}%`) : undefined;

    const [matchingItems, [{ total }]] = await Promise.all([
        db
            .select({
                id: items.id,
                name: items.name,
                stackSize: items.stackSize,
                isExclusive: items.isExclusive,
                ffxiId: items.ffxiId,
            })
            .from(items)
            .where(nameFilter)
            .orderBy(items.name)
            .limit(perPage)
            .offset((page - 1) * perPage),
        db.select({ total: count() }).from(items).where(nameFilter),
    ]);

    if (matchingItems.length === 0) return { items: [], total };

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
                createdAt: itemAuctionPrices.createdAt,
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

    return {
        total,
        items: matchingItems.map((item) => {
            const auction = auctionByItemId.get(item.id);
            return {
                ...item,
                auctionPrice: auction?.price ?? null,
                auctionSalesPerDay: auction?.salesPerDay ?? null,
                auctionStackPrice: auction?.stackPrice ?? null,
                auctionStackSalesPerDay: auction?.stackSalesPerDay ?? null,
                auctionUpdatedAt: auction?.createdAt ?? null,
                vendors: vendorsByItemId.get(item.id) ?? [],
            };
        }),
    };
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

export type HqYieldTier = {
    tier: 'HQ1' | 'HQ2' | 'HQ3';
    items: {
        itemId: number;
        name: string;
        quantity: number;
        stackSize: number;
        auctionPrice: number | null;
        auctionStackPrice: number | null;
        revenueSource: 'single' | 'stack';
        revenue: number;
    }[];
};

export type IngredientCost = {
    itemId: number;
    name: string;
    quantity: number;
    stackSize: number;
    auctionSinglePerUnit: number | null;
    auctionStackPerUnit: number | null;
    vendorPerUnit: number | null;
    priceSource: 'ah_single' | 'ah_stack' | 'vendor';
    unitCost: number;
    totalCost: number;
};

export type ProfitableSynthesis = {
    id: number;
    mainCraft: CraftRequirement;
    subCrafts: CraftRequirement[];
    crystal: string;
    unitProfitAsSingle: number;
    unitProfitAsStack: number | null;
    profitPerDayAsSingle: number | null;
    profitPerDayAsStack: number | null;
    salesPerDay: number | null;
    stackSalesPerDay: number | null;
    expectedUnitProfitAsSingle: number | null;
    expectedUnitProfitAsStack: number | null;
    stackProfit: number | null;
    expectedStackProfit: number | null;
    priceUpdatedAt: Date | null;
    hqYields: HqYieldTier[];
    nqYield: {
        itemId: number;
        name: string;
        quantity: number;
        stackSize: number;
        auctionPrice: number | null;
        auctionStackPrice: number | null;
        revenueSource: 'single' | 'stack';
        revenue: number;
    };
    ingredients: IngredientCost[];
};

export const RATE_THRESHOLDS = {
    'very-fast': 8,
    fast: 4,
    average: 1,
    slow: 1 / 7,
    'very-slow': 1 / 30,
} as const;

export type RateFilter = keyof typeof RATE_THRESHOLDS;

export const getProfitableSyntheses = async ({
    sortBy = 'single',
    page = 1,
    perPage = 25,
    skills,
    yieldName,
    minRate,
}: {
    sortBy?: 'single' | 'stack' | 'ah-slot' | 'daily' | 'stack-total';
    page?: number;
    perPage?: number;
    skills?: PlayerSkills;
    yieldName?: string;
    minRate?: number;
}): Promise<{ syntheses: ProfitableSynthesis[]; total: number }> => {
    const hasSkills = skills && Object.keys(skills).length > 0;

    // Pre-filter by NQ yield name if provided
    let nameFilteredIds: Set<number> | null = null;
    if (yieldName) {
        const rows = await db
            .selectDistinct({ synthesisId: synthesisYieldItems.synthesisId })
            .from(synthesisYieldItems)
            .innerJoin(items, eq(synthesisYieldItems.itemId, items.id))
            .where(and(eq(synthesisYieldItems.tier, 'NQ'), ilike(items.name, `%${yieldName}%`)));
        if (rows.length === 0) return { syntheses: [], total: 0 };
        nameFilteredIds = new Set(rows.map((r) => r.synthesisId));
    }

    const latestProfitSub = db
        .select({
            synthesisId: synthesisProfits.synthesisId,
            maxAt: max(synthesisProfits.createdAt).as('max_profit_at'),
        })
        .from(synthesisProfits)
        .groupBy(synthesisProfits.synthesisId)
        .as('latest_profit');

    const profitJoin = and(
        eq(synthesisProfits.synthesisId, latestProfitSub.synthesisId),
        eq(synthesisProfits.createdAt, latestProfitSub.maxAt),
    );

    const rateFilter =
        minRate === undefined
            ? undefined
            : sortBy === 'single'
              ? gte(synthesisProfits.salesPerDay, minRate)
              : sortBy === 'stack' || sortBy === 'stack-total'
                ? gte(synthesisProfits.stackSalesPerDay, minRate)
                : sql`(${synthesisProfits.salesPerDay} >= ${minRate} OR ${synthesisProfits.stackSalesPerDay} >= ${minRate})`;

    // Shared helper: build craft requirements map from DB rows
    type CraftRow = {
        synthesisId: number;
        craft: string;
        craftLevel: number;
        isMain: boolean;
    };
    const buildCraftsBySynthesis = (craftRows: CraftRow[]) => {
        const map = new Map<
            number,
            { mainCraft: CraftRequirement; subCrafts: CraftRequirement[] }
        >();
        for (const row of craftRows) {
            if (!map.has(row.synthesisId)) {
                map.set(row.synthesisId, {
                    mainCraft: { craft: row.craft as Craft, craftLevel: row.craftLevel },
                    subCrafts: [],
                });
            }
            const entry = map.get(row.synthesisId)!;
            if (row.isMain) {
                entry.mainCraft = { craft: row.craft as Craft, craftLevel: row.craftLevel };
            } else {
                entry.subCrafts.push({ craft: row.craft as Craft, craftLevel: row.craftLevel });
            }
        }
        return map;
    };

    // Shared helper: assemble ProfitableSynthesis from snapshot rows + crystal name lookup
    const assembleSynthesisFromSnapshot = (
        sid: number,
        snapshotId: number,
        profit: {
            unitProfitAsSingle: number;
            unitProfitAsStack: number | null;
            profitPerDayAsSingle: number | null;
            profitPerDayAsStack: number | null;
            salesPerDay: number | null;
            stackSalesPerDay: number | null;
            expectedUnitProfitAsSingleT0: number;
            expectedUnitProfitAsSingleT1: number;
            expectedUnitProfitAsSingleT2: number;
            expectedUnitProfitAsSingleT3: number;
            expectedUnitProfitAsStackT0: number | null;
            expectedUnitProfitAsStackT1: number | null;
            expectedUnitProfitAsStackT2: number | null;
            expectedUnitProfitAsStackT3: number | null;
            stackProfit: number | null;
            expectedStackProfitT0: number | null;
            expectedStackProfitT1: number | null;
            expectedStackProfitT2: number | null;
            expectedStackProfitT3: number | null;
            createdAt: Date;
        },
        crafts: { mainCraft: CraftRequirement; subCrafts: CraftRequirement[] },
        crystalName: string,
        expectedUnitProfitAsSingle: number | null,
        expectedUnitProfitAsStack: number | null,
        expectedStackProfit: number | null,
        snapshotIngredients: typeof allSnapshotIngredients,
        snapshotYieldTiers: typeof allSnapshotYieldTiers,
    ): ProfitableSynthesis | null => {
        const ingRows = snapshotIngredients.filter((r) => r.snapshotId === snapshotId);
        const yieldRows = snapshotYieldTiers.filter((r) => r.snapshotId === snapshotId);

        const nqYieldRow = yieldRows.find((r) => r.tier === 'NQ');
        if (!nqYieldRow) return null;

        const ingredients: IngredientCost[] = ingRows.map((r) => ({
            itemId: r.itemId,
            name: r.name,
            quantity: r.quantity,
            stackSize: r.stackSize,
            auctionSinglePerUnit: r.auctionSinglePerUnit,
            auctionStackPerUnit: r.auctionStackPerUnit,
            vendorPerUnit: r.vendorPerUnit,
            priceSource: r.priceSource,
            unitCost: r.unitCost,
            totalCost: r.totalCost,
        }));

        const hqYields: HqYieldTier[] = (['HQ1', 'HQ2', 'HQ3'] as const)
            .map((tier) => ({
                tier,
                items: yieldRows
                    .filter((r) => r.tier === tier)
                    .map((r) => ({
                        itemId: r.itemId,
                        name: r.name,
                        quantity: r.quantity,
                        stackSize: r.stackSize,
                        auctionPrice: r.auctionSinglePerUnit,
                        auctionStackPrice:
                            r.auctionStackPerUnit !== null
                                ? r.auctionStackPerUnit * r.stackSize
                                : null,
                        revenueSource: r.revenueSource,
                        revenue: r.revenue,
                    })),
            }))
            .filter((t) => t.items.length > 0);

        return {
            id: sid,
            mainCraft: crafts.mainCraft,
            subCrafts: crafts.subCrafts,
            crystal: crystalName,
            unitProfitAsSingle: profit.unitProfitAsSingle,
            unitProfitAsStack: profit.unitProfitAsStack,
            profitPerDayAsSingle: profit.profitPerDayAsSingle,
            profitPerDayAsStack: profit.profitPerDayAsStack,
            salesPerDay: profit.salesPerDay,
            stackSalesPerDay: profit.stackSalesPerDay,
            expectedUnitProfitAsSingle,
            expectedUnitProfitAsStack,
            stackProfit: profit.stackProfit,
            expectedStackProfit,
            priceUpdatedAt: profit.createdAt,
            hqYields,
            nqYield: {
                itemId: nqYieldRow.itemId,
                name: nqYieldRow.name,
                quantity: nqYieldRow.quantity,
                stackSize: nqYieldRow.stackSize,
                auctionPrice: nqYieldRow.auctionSinglePerUnit,
                auctionStackPrice:
                    nqYieldRow.auctionStackPerUnit !== null
                        ? nqYieldRow.auctionStackPerUnit * nqYieldRow.stackSize
                        : null,
                revenueSource: nqYieldRow.revenueSource,
                revenue: nqYieldRow.revenue,
            },
            ingredients,
        };
    };

    // These are declared outside the paths so assembleSynthesisFromSnapshot can reference them
    let allSnapshotIngredients: {
        snapshotId: number;
        itemId: number;
        name: string;
        quantity: number;
        stackSize: number;
        auctionSinglePerUnit: number | null;
        auctionStackPerUnit: number | null;
        vendorPerUnit: number | null;
        unitCost: number;
        priceSource: 'ah_single' | 'ah_stack' | 'vendor';
        totalCost: number;
    }[] = [];
    let allSnapshotYieldTiers: {
        snapshotId: number;
        tier: 'NQ' | 'HQ1' | 'HQ2' | 'HQ3';
        itemId: number;
        name: string;
        quantity: number;
        stackSize: number;
        auctionSinglePerUnit: number | null;
        auctionStackPerUnit: number | null;
        revenue: number;
        revenueSource: 'single' | 'stack';
    }[] = [];

    // ── HQ path ──────────────────────────────────────────────────────────────
    if (hasSkills) {
        // Fetch all eligible syntheses (no pagination — we sort in memory)
        const rawProfitRows = await db
            .select({
                id: synthesisProfits.id,
                synthesisId: synthesisProfits.synthesisId,
                unitProfitAsSingle: synthesisProfits.unitProfitAsSingle,
                unitProfitAsStack: synthesisProfits.unitProfitAsStack,
                profitPerDayAsSingle: synthesisProfits.profitPerDayAsSingle,
                profitPerDayAsStack: synthesisProfits.profitPerDayAsStack,
                salesPerDay: synthesisProfits.salesPerDay,
                stackSalesPerDay: synthesisProfits.stackSalesPerDay,
                expectedUnitProfitAsSingleT0: synthesisProfits.expectedUnitProfitAsSingleT0,
                expectedUnitProfitAsSingleT1: synthesisProfits.expectedUnitProfitAsSingleT1,
                expectedUnitProfitAsSingleT2: synthesisProfits.expectedUnitProfitAsSingleT2,
                expectedUnitProfitAsSingleT3: synthesisProfits.expectedUnitProfitAsSingleT3,
                expectedUnitProfitAsStackT0: synthesisProfits.expectedUnitProfitAsStackT0,
                expectedUnitProfitAsStackT1: synthesisProfits.expectedUnitProfitAsStackT1,
                expectedUnitProfitAsStackT2: synthesisProfits.expectedUnitProfitAsStackT2,
                expectedUnitProfitAsStackT3: synthesisProfits.expectedUnitProfitAsStackT3,
                stackProfit: synthesisProfits.stackProfit,
                expectedStackProfitT0: synthesisProfits.expectedStackProfitT0,
                expectedStackProfitT1: synthesisProfits.expectedStackProfitT1,
                expectedStackProfitT2: synthesisProfits.expectedStackProfitT2,
                expectedStackProfitT3: synthesisProfits.expectedStackProfitT3,
                createdAt: synthesisProfits.createdAt,
            })
            .from(synthesisProfits)
            .innerJoin(latestProfitSub, profitJoin)
            .where(rateFilter);

        const allProfitRows = nameFilteredIds
            ? rawProfitRows.filter((r) => nameFilteredIds!.has(r.synthesisId))
            : rawProfitRows;

        if (allProfitRows.length === 0) return { syntheses: [], total: 0 };

        const allSynthesisIds = allProfitRows.map((r) => r.synthesisId);
        const profitBySynthesisId = new Map(allProfitRows.map((r) => [r.synthesisId, r]));

        // Fetch craft requirements for tier determination
        const craftRows = await db
            .select({
                synthesisId: synthesisCraftRequirements.synthesisId,
                craft: synthesisCraftRequirements.craft,
                craftLevel: synthesisCraftRequirements.craftLevel,
                isMain: synthesisCraftRequirements.isMain,
            })
            .from(synthesisCraftRequirements)
            .where(inArray(synthesisCraftRequirements.synthesisId, allSynthesisIds));

        const craftsBySynthesis = buildCraftsBySynthesis(craftRows);

        // Compute expected profit per synthesis using pre-computed columns
        type WithExpected = {
            sid: number;
            snapshotId: number;
            expectedUnitProfitAsSingle: number;
            expectedUnitProfitAsStack: number | null;
            expectedStackProfit: number | null;
            sortValue: number;
        };
        const withExpected: WithExpected[] = [];
        const hqResultBySynthesis = new Map<number, ReturnType<typeof getSynthesisHqResult>>();

        for (const row of allProfitRows) {
            const crafts = craftsBySynthesis.get(row.synthesisId);
            if (!crafts) continue;

            const allCrafts = [crafts.mainCraft, ...crafts.subCrafts];
            const hqResult = getSynthesisHqResult(allCrafts, skills!);
            hqResultBySynthesis.set(row.synthesisId, hqResult);

            const tier = hqResult.tier;
            if (tier === -1) continue;

            let expectedUnitProfitAsSingle: number;
            if (tier === 0) {
                expectedUnitProfitAsSingle = row.expectedUnitProfitAsSingleT0;
            } else if (tier === 1) {
                expectedUnitProfitAsSingle = row.expectedUnitProfitAsSingleT1;
            } else if (tier === 2) {
                expectedUnitProfitAsSingle = row.expectedUnitProfitAsSingleT2;
            } else {
                expectedUnitProfitAsSingle = row.expectedUnitProfitAsSingleT3;
            }

            const stackT =
                tier === 0
                    ? row.expectedUnitProfitAsStackT0
                    : tier === 1
                      ? row.expectedUnitProfitAsStackT1
                      : tier === 2
                        ? row.expectedUnitProfitAsStackT2
                        : row.expectedUnitProfitAsStackT3;
            const expectedUnitProfitAsStack = stackT ?? null;

            const stackProfitT =
                tier === 0
                    ? row.expectedStackProfitT0
                    : tier === 1
                      ? row.expectedStackProfitT1
                      : tier === 2
                        ? row.expectedStackProfitT2
                        : row.expectedStackProfitT3;
            const expectedStackProfit = stackProfitT ?? null;

            const sortValue =
                sortBy === 'daily'
                    ? expectedUnitProfitAsSingle * (row.salesPerDay ?? 0)
                    : sortBy === 'stack-total'
                      ? (expectedStackProfit ?? 0)
                      : sortBy === 'ah-slot'
                        ? Math.max(
                              expectedUnitProfitAsSingle,
                              expectedUnitProfitAsStack ?? expectedUnitProfitAsSingle,
                          )
                        : expectedUnitProfitAsSingle;

            withExpected.push({
                sid: row.synthesisId,
                snapshotId: row.id,
                expectedUnitProfitAsSingle,
                expectedUnitProfitAsStack,
                expectedStackProfit,
                sortValue,
            });
        }

        withExpected.sort((a, b) => b.sortValue - a.sortValue);
        const total = withExpected.length;
        const pageItems = withExpected.slice((page - 1) * perPage, page * perPage);
        const expectedBySid = new Map(withExpected.map((r) => [r.sid, r]));

        const snapshotIds = pageItems.map((r) => r.snapshotId);
        const pageSids = pageItems.map((r) => r.sid);

        // Fetch crystal names for page syntheses
        const crystalRows = await db
            .select({
                synthesisId: synthesisIngredientItems.synthesisId,
                name: items.name,
            })
            .from(synthesisIngredientItems)
            .innerJoin(items, eq(synthesisIngredientItems.itemId, items.id))
            .where(inArray(synthesisIngredientItems.synthesisId, pageSids));

        const crystalBySynthesisId = new Map<number, string>();
        for (const row of crystalRows) {
            if (CRYSTAL_NAMES.has(row.name)) {
                crystalBySynthesisId.set(row.synthesisId, row.name);
            }
        }

        // Fetch snapshot data for page
        [allSnapshotIngredients, allSnapshotYieldTiers] = await Promise.all([
            db
                .select()
                .from(synthesisProfitIngredients)
                .where(inArray(synthesisProfitIngredients.snapshotId, snapshotIds)),
            db
                .select()
                .from(synthesisProfitYieldTiers)
                .where(inArray(synthesisProfitYieldTiers.snapshotId, snapshotIds)),
        ]);

        const syntheses: ProfitableSynthesis[] = [];
        for (const item of pageItems) {
            const profit = profitBySynthesisId.get(item.sid);
            const crafts = craftsBySynthesis.get(item.sid);
            const crystalName = crystalBySynthesisId.get(item.sid);
            if (!profit || !crafts || !crystalName) continue;

            const assembled = assembleSynthesisFromSnapshot(
                item.sid,
                item.snapshotId,
                profit,
                crafts,
                crystalName,
                expectedBySid.get(item.sid)?.expectedUnitProfitAsSingle ?? null,
                expectedBySid.get(item.sid)?.expectedUnitProfitAsStack ?? null,
                expectedBySid.get(item.sid)?.expectedStackProfit ?? null,
                allSnapshotIngredients,
                allSnapshotYieldTiers,
            );
            if (assembled) syntheses.push(assembled);
        }

        return { syntheses, total };
    }

    // ── No-skills path: DB-side sort and pagination ───────────────────────────
    const sortExpr =
        sortBy === 'single'
            ? desc(synthesisProfits.unitProfitAsSingle)
            : sortBy === 'stack'
              ? desc(synthesisProfits.unitProfitAsStack)
              : sortBy === 'stack-total'
                ? sql`${synthesisProfits.stackProfit} DESC NULLS LAST`
                : sortBy === 'daily'
                  ? desc(
                        sql`GREATEST(${synthesisProfits.profitPerDayAsSingle}, COALESCE(${synthesisProfits.profitPerDayAsStack}, ${synthesisProfits.profitPerDayAsSingle}))`,
                    )
                  : desc(
                        sql`GREATEST(${synthesisProfits.unitProfitAsSingle}, COALESCE(${synthesisProfits.unitProfitAsStack}, ${synthesisProfits.unitProfitAsSingle}))`,
                    );

    const nameIdFilter = nameFilteredIds
        ? inArray(synthesisProfits.synthesisId, [...nameFilteredIds])
        : undefined;
    const noSkillsFilter = and(rateFilter, nameIdFilter);

    const [profitRows, [{ total }]] = await Promise.all([
        db
            .select({
                id: synthesisProfits.id,
                synthesisId: synthesisProfits.synthesisId,
                unitProfitAsSingle: synthesisProfits.unitProfitAsSingle,
                unitProfitAsStack: synthesisProfits.unitProfitAsStack,
                profitPerDayAsSingle: synthesisProfits.profitPerDayAsSingle,
                profitPerDayAsStack: synthesisProfits.profitPerDayAsStack,
                salesPerDay: synthesisProfits.salesPerDay,
                stackSalesPerDay: synthesisProfits.stackSalesPerDay,
                expectedUnitProfitAsSingleT0: synthesisProfits.expectedUnitProfitAsSingleT0,
                expectedUnitProfitAsSingleT1: synthesisProfits.expectedUnitProfitAsSingleT1,
                expectedUnitProfitAsSingleT2: synthesisProfits.expectedUnitProfitAsSingleT2,
                expectedUnitProfitAsSingleT3: synthesisProfits.expectedUnitProfitAsSingleT3,
                expectedUnitProfitAsStackT0: synthesisProfits.expectedUnitProfitAsStackT0,
                expectedUnitProfitAsStackT1: synthesisProfits.expectedUnitProfitAsStackT1,
                expectedUnitProfitAsStackT2: synthesisProfits.expectedUnitProfitAsStackT2,
                expectedUnitProfitAsStackT3: synthesisProfits.expectedUnitProfitAsStackT3,
                stackProfit: synthesisProfits.stackProfit,
                expectedStackProfitT0: synthesisProfits.expectedStackProfitT0,
                expectedStackProfitT1: synthesisProfits.expectedStackProfitT1,
                expectedStackProfitT2: synthesisProfits.expectedStackProfitT2,
                expectedStackProfitT3: synthesisProfits.expectedStackProfitT3,
                createdAt: synthesisProfits.createdAt,
            })
            .from(synthesisProfits)
            .innerJoin(latestProfitSub, profitJoin)
            .where(noSkillsFilter)
            .orderBy(sortExpr)
            .limit(perPage)
            .offset((page - 1) * perPage),
        db
            .select({ total: count() })
            .from(synthesisProfits)
            .innerJoin(latestProfitSub, profitJoin)
            .where(noSkillsFilter),
    ]);

    if (profitRows.length === 0) return { syntheses: [], total };

    const synthesisIds = profitRows.map((r) => r.synthesisId);
    const snapshotIds = profitRows.map((r) => r.id);
    const profitBySynthesisId = new Map(profitRows.map((r) => [r.synthesisId, r]));
    const snapshotIdBySynthesisId = new Map(profitRows.map((r) => [r.synthesisId, r.id]));

    const [craftRows, crystalRows] = await Promise.all([
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
                synthesisId: synthesisIngredientItems.synthesisId,
                name: items.name,
            })
            .from(synthesisIngredientItems)
            .innerJoin(items, eq(synthesisIngredientItems.itemId, items.id))
            .where(inArray(synthesisIngredientItems.synthesisId, synthesisIds)),
    ]);

    const craftsBySynthesis = buildCraftsBySynthesis(craftRows);

    const crystalBySynthesisId = new Map<number, string>();
    for (const row of crystalRows) {
        if (CRYSTAL_NAMES.has(row.name)) {
            crystalBySynthesisId.set(row.synthesisId, row.name);
        }
    }

    [allSnapshotIngredients, allSnapshotYieldTiers] = await Promise.all([
        db
            .select()
            .from(synthesisProfitIngredients)
            .where(inArray(synthesisProfitIngredients.snapshotId, snapshotIds)),
        db
            .select()
            .from(synthesisProfitYieldTiers)
            .where(inArray(synthesisProfitYieldTiers.snapshotId, snapshotIds)),
    ]);

    const syntheses: ProfitableSynthesis[] = [];
    for (const sid of synthesisIds) {
        const profit = profitBySynthesisId.get(sid);
        const crafts = craftsBySynthesis.get(sid);
        const crystalName = crystalBySynthesisId.get(sid);
        const snapshotId = snapshotIdBySynthesisId.get(sid);
        if (!profit || !crafts || !crystalName || snapshotId === undefined) continue;

        const assembled = assembleSynthesisFromSnapshot(
            sid,
            snapshotId,
            profit,
            crafts,
            crystalName,
            null,
            null,
            null,
            allSnapshotIngredients,
            allSnapshotYieldTiers,
        );
        if (assembled) syntheses.push(assembled);
    }

    return { syntheses, total };
};
