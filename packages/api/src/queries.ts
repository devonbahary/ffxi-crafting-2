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
    unitMarginAsSingle: number;
    unitMarginAsStack: number | null;
    dailyProfitSingle: number | null;
    dailyProfitStack: number | null;
    salesPerDay: number | null;
    stackSalesPerDay: number | null;
    expectedProfitPerSingle: number | null;
    expectedProfitPerStack: number | null;
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

export const getProfitableSyntheses = async ({
    sortBy = 'single',
    page = 1,
    perPage = 25,
    skills,
    yieldName,
}: {
    sortBy?: 'single' | 'stack' | 'best' | 'daily';
    page?: number;
    perPage?: number;
    skills?: PlayerSkills;
    yieldName?: string;
}): Promise<{ syntheses: ProfitableSynthesis[]; total: number }> => {
    const AVERAGE_SALES_RATE = 1;
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

    // Filter: only syntheses where the relevant sale mode meets Average sales rate.
    // When searching by name the user is looking for a specific synthesis, so sales rate is not applied.
    const eligibilityFilter = yieldName
        ? undefined
        : sortBy === 'single'
          ? gte(synthesisProfits.salesPerDay, AVERAGE_SALES_RATE)
          : sortBy === 'stack'
            ? gte(synthesisProfits.stackSalesPerDay, AVERAGE_SALES_RATE)
            : sql`(${synthesisProfits.salesPerDay} >= ${AVERAGE_SALES_RATE} OR ${synthesisProfits.stackSalesPerDay} >= ${AVERAGE_SALES_RATE})`;

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
            unitMarginAsSingle: number;
            unitMarginAsStack: number | null;
            dailyProfitSingle: number | null;
            dailyProfitStack: number | null;
            salesPerDay: number | null;
            stackSalesPerDay: number | null;
            expectedProfitT0: number;
            expectedProfitT1: number;
            expectedProfitT2: number;
            expectedProfitT3: number;
            expectedProfitStackT0: number | null;
            expectedProfitStackT1: number | null;
            expectedProfitStackT2: number | null;
            expectedProfitStackT3: number | null;
            createdAt: Date;
        },
        crafts: { mainCraft: CraftRequirement; subCrafts: CraftRequirement[] },
        crystalName: string,
        expectedProfitPerSingle: number | null,
        expectedProfitPerStack: number | null,
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
            unitMarginAsSingle: profit.unitMarginAsSingle,
            unitMarginAsStack: profit.unitMarginAsStack,
            dailyProfitSingle: profit.dailyProfitSingle,
            dailyProfitStack: profit.dailyProfitStack,
            salesPerDay: profit.salesPerDay,
            stackSalesPerDay: profit.stackSalesPerDay,
            expectedProfitPerSingle,
            expectedProfitPerStack,
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
                unitMarginAsSingle: synthesisProfits.unitMarginAsSingle,
                unitMarginAsStack: synthesisProfits.unitMarginAsStack,
                dailyProfitSingle: synthesisProfits.dailyProfitSingle,
                dailyProfitStack: synthesisProfits.dailyProfitStack,
                salesPerDay: synthesisProfits.salesPerDay,
                stackSalesPerDay: synthesisProfits.stackSalesPerDay,
                expectedProfitT0: synthesisProfits.expectedProfitT0,
                expectedProfitT1: synthesisProfits.expectedProfitT1,
                expectedProfitT2: synthesisProfits.expectedProfitT2,
                expectedProfitT3: synthesisProfits.expectedProfitT3,
                expectedProfitStackT0: synthesisProfits.expectedProfitStackT0,
                expectedProfitStackT1: synthesisProfits.expectedProfitStackT1,
                expectedProfitStackT2: synthesisProfits.expectedProfitStackT2,
                expectedProfitStackT3: synthesisProfits.expectedProfitStackT3,
                createdAt: synthesisProfits.createdAt,
            })
            .from(synthesisProfits)
            .innerJoin(latestProfitSub, profitJoin)
            .where(eligibilityFilter);

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
            expectedProfitPerSingle: number;
            expectedProfitPerStack: number | null;
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

            let expectedProfitPerSingle: number;
            if (tier === 0) {
                expectedProfitPerSingle = row.expectedProfitT0;
            } else if (tier === 1) {
                expectedProfitPerSingle = row.expectedProfitT1;
            } else if (tier === 2) {
                expectedProfitPerSingle = row.expectedProfitT2;
            } else {
                expectedProfitPerSingle = row.expectedProfitT3;
            }

            const stackT =
                tier === 0
                    ? row.expectedProfitStackT0
                    : tier === 1
                      ? row.expectedProfitStackT1
                      : tier === 2
                        ? row.expectedProfitStackT2
                        : row.expectedProfitStackT3;
            const expectedProfitPerStack = stackT ?? null;

            const sortValue =
                sortBy === 'daily'
                    ? expectedProfitPerSingle * (row.salesPerDay ?? 0)
                    : expectedProfitPerSingle;

            withExpected.push({
                sid: row.synthesisId,
                snapshotId: row.id,
                expectedProfitPerSingle,
                expectedProfitPerStack,
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
                expectedBySid.get(item.sid)?.expectedProfitPerSingle ?? null,
                expectedBySid.get(item.sid)?.expectedProfitPerStack ?? null,
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
            ? desc(synthesisProfits.unitMarginAsSingle)
            : sortBy === 'stack'
              ? desc(synthesisProfits.unitMarginAsStack)
              : sortBy === 'daily'
                ? desc(
                      sql`GREATEST(${synthesisProfits.dailyProfitSingle}, COALESCE(${synthesisProfits.dailyProfitStack}, ${synthesisProfits.dailyProfitSingle}))`,
                  )
                : desc(
                      sql`GREATEST(${synthesisProfits.unitMarginAsSingle}, COALESCE(${synthesisProfits.unitMarginAsStack}, ${synthesisProfits.unitMarginAsSingle}))`,
                  );

    const nameIdFilter = nameFilteredIds
        ? inArray(synthesisProfits.synthesisId, [...nameFilteredIds])
        : undefined;
    const noSkillsFilter = and(eligibilityFilter, nameIdFilter);

    const [profitRows, [{ total }]] = await Promise.all([
        db
            .select({
                id: synthesisProfits.id,
                synthesisId: synthesisProfits.synthesisId,
                unitMarginAsSingle: synthesisProfits.unitMarginAsSingle,
                unitMarginAsStack: synthesisProfits.unitMarginAsStack,
                dailyProfitSingle: synthesisProfits.dailyProfitSingle,
                dailyProfitStack: synthesisProfits.dailyProfitStack,
                salesPerDay: synthesisProfits.salesPerDay,
                stackSalesPerDay: synthesisProfits.stackSalesPerDay,
                expectedProfitT0: synthesisProfits.expectedProfitT0,
                expectedProfitT1: synthesisProfits.expectedProfitT1,
                expectedProfitT2: synthesisProfits.expectedProfitT2,
                expectedProfitT3: synthesisProfits.expectedProfitT3,
                expectedProfitStackT0: synthesisProfits.expectedProfitStackT0,
                expectedProfitStackT1: synthesisProfits.expectedProfitStackT1,
                expectedProfitStackT2: synthesisProfits.expectedProfitStackT2,
                expectedProfitStackT3: synthesisProfits.expectedProfitStackT3,
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
            allSnapshotIngredients,
            allSnapshotYieldTiers,
        );
        if (assembled) syntheses.push(assembled);
    }

    return { syntheses, total };
};
