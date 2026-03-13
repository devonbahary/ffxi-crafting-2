import { and, desc, eq, gt, sql, type InferInsertModel } from 'drizzle-orm';
import { db } from './index.js';
import {
    tierEnum,
    items,
    itemAuctionPrices,
    itemVendorPrices,
    syntheses,
    synthesisCraftRequirements,
    synthesisYieldItems,
    synthesisIngredientItems,
    synthesisProfits,
    synthesisProfitIngredients,
    synthesisProfitYieldTiers,
} from './schema.js';
import type { CraftRequirement } from '@ffxi-crafting/types';

export type Tier = (typeof tierEnum.enumValues)[number];

const CAP = 999_999_999;
const capInt = (n: number): number => Math.max(-CAP, Math.min(CAP, n));
const capIntN = (n: number | null): number | null => (n === null ? null : capInt(n));

export type SynthesisCraftRequirementInsert = InferInsertModel<typeof synthesisCraftRequirements>;

export const upsertItemStub = async ({
    href,
    name,
}: {
    href: string;
    name: string;
}): Promise<number> => {
    const [row] = await db
        .insert(items)
        .values({ href, name })
        .onConflictDoUpdate({
            target: items.href,
            set: { name: sql`excluded.name` },
        })
        .returning({ id: items.id });
    return row.id;
};

export const upsertItem = async ({
    href,
    ffxiId,
    name,
    stackSize,
    isExclusive,
}: {
    href: string;
    ffxiId: number;
    name: string;
    stackSize?: number;
    isExclusive?: boolean;
}): Promise<number> => {
    const [row] = await db
        .insert(items)
        .values({ href, ffxiId, name, stackSize, isExclusive })
        .onConflictDoUpdate({
            target: items.href,
            set: {
                ffxiId: sql`excluded.ffxi_id`,
                name: sql`excluded.name`,
                stackSize: sql`excluded.stack_size`,
                isExclusive: sql`excluded.is_exclusive`,
            },
        })
        .returning({ id: items.id });
    return row.id;
};

export const insertAuctionPrice = async ({
    itemId,
    price,
    salesPerDay,
    stackPrice,
    stackSalesPerDay,
}: {
    itemId: number;
    price: number;
    salesPerDay: number;
    stackPrice: number | null;
    stackSalesPerDay: number | null;
}): Promise<void> => {
    await db.insert(itemAuctionPrices).values({
        itemId,
        price: capInt(price),
        salesPerDay,
        stackPrice: capIntN(stackPrice),
        stackSalesPerDay,
    });
};

export const upsertVendorPrice = async (vendor: {
    itemId: number;
    price: number;
    vendorName: string;
    vendorZone?: string | null;
    vendorLocation?: string | null;
}): Promise<void> => {
    await db
        .insert(itemVendorPrices)
        .values({ ...vendor, price: capInt(vendor.price) })
        .onConflictDoUpdate({
            target: [itemVendorPrices.itemId, itemVendorPrices.vendorName],
            set: {
                price: sql`excluded.price`,
                vendorZone: sql`excluded.vendor_zone`,
                vendorLocation: sql`excluded.vendor_location`,
            },
        });
};

const PROFIT_WINDOW_HOURS = 24;

export const upsertSynthesisProfit = async ({
    synthesisId,
    totalIngredientCost,
    unitProfitAsSingle,
    unitProfitAsStack,
    profitPerDayAsSingle,
    profitPerDayAsStack,
    expectedUnitProfitAsSingleT0,
    expectedUnitProfitAsSingleT1,
    expectedUnitProfitAsSingleT2,
    expectedUnitProfitAsSingleT3,
    expectedUnitProfitAsStackT0,
    expectedUnitProfitAsStackT1,
    expectedUnitProfitAsStackT2,
    expectedUnitProfitAsStackT3,
    salesPerDay,
    stackSalesPerDay,
    ingredientSnapshot,
    yieldTierSnapshot,
}: {
    synthesisId: number;
    totalIngredientCost: number;
    unitProfitAsSingle: number;
    unitProfitAsStack: number | null;
    profitPerDayAsSingle: number | null;
    profitPerDayAsStack: number | null;
    expectedUnitProfitAsSingleT0: number;
    expectedUnitProfitAsSingleT1: number;
    expectedUnitProfitAsSingleT2: number;
    expectedUnitProfitAsSingleT3: number;
    expectedUnitProfitAsStackT0: number | null;
    expectedUnitProfitAsStackT1: number | null;
    expectedUnitProfitAsStackT2: number | null;
    expectedUnitProfitAsStackT3: number | null;
    salesPerDay: number;
    stackSalesPerDay: number | null;
    ingredientSnapshot: {
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
    }[];
    yieldTierSnapshot: {
        tier: string;
        itemId: number;
        name: string;
        quantity: number;
        stackSize: number;
        auctionSinglePerUnit: number | null;
        auctionStackPerUnit: number | null;
        revenue: number;
        revenueSource: 'single' | 'stack';
    }[];
}): Promise<void> => {
    const recent = await db
        .select({ id: synthesisProfits.id })
        .from(synthesisProfits)
        .where(
            and(
                eq(synthesisProfits.synthesisId, synthesisId),
                gt(
                    synthesisProfits.createdAt,
                    sql`now() - interval '${sql.raw(String(PROFIT_WINDOW_HOURS))} hours'`,
                ),
            ),
        )
        .orderBy(desc(synthesisProfits.createdAt))
        .limit(1)
        .then((r) => r[0]);

    const capped = {
        totalIngredientCost: capInt(totalIngredientCost),
        unitProfitAsSingle: capInt(unitProfitAsSingle),
        unitProfitAsStack: capIntN(unitProfitAsStack),
        profitPerDayAsSingle: capIntN(profitPerDayAsSingle),
        profitPerDayAsStack: capIntN(profitPerDayAsStack),
        expectedUnitProfitAsSingleT0: capInt(expectedUnitProfitAsSingleT0),
        expectedUnitProfitAsSingleT1: capInt(expectedUnitProfitAsSingleT1),
        expectedUnitProfitAsSingleT2: capInt(expectedUnitProfitAsSingleT2),
        expectedUnitProfitAsSingleT3: capInt(expectedUnitProfitAsSingleT3),
        expectedUnitProfitAsStackT0: capIntN(expectedUnitProfitAsStackT0),
        expectedUnitProfitAsStackT1: capIntN(expectedUnitProfitAsStackT1),
        expectedUnitProfitAsStackT2: capIntN(expectedUnitProfitAsStackT2),
        expectedUnitProfitAsStackT3: capIntN(expectedUnitProfitAsStackT3),
    };

    await db.transaction(async (tx) => {
        let snapshotId: number;

        if (recent) {
            await tx
                .update(synthesisProfits)
                .set({ salesPerDay, stackSalesPerDay, ...capped })
                .where(eq(synthesisProfits.id, recent.id));
            snapshotId = recent.id;
            await tx
                .delete(synthesisProfitIngredients)
                .where(eq(synthesisProfitIngredients.snapshotId, snapshotId));
            await tx
                .delete(synthesisProfitYieldTiers)
                .where(eq(synthesisProfitYieldTiers.snapshotId, snapshotId));
        } else {
            const [inserted] = await tx
                .insert(synthesisProfits)
                .values({ synthesisId, salesPerDay, stackSalesPerDay, ...capped })
                .returning({ id: synthesisProfits.id });
            snapshotId = inserted.id;
        }

        if (ingredientSnapshot.length > 0) {
            await tx.insert(synthesisProfitIngredients).values(
                ingredientSnapshot.map((ing) => ({
                    snapshotId,
                    itemId: ing.itemId,
                    name: ing.name,
                    quantity: ing.quantity,
                    stackSize: ing.stackSize,
                    auctionSinglePerUnit: capIntN(ing.auctionSinglePerUnit),
                    auctionStackPerUnit: capIntN(ing.auctionStackPerUnit),
                    vendorPerUnit: capIntN(ing.vendorPerUnit),
                    unitCost: capInt(ing.unitCost),
                    priceSource: ing.priceSource,
                    totalCost: capInt(ing.totalCost),
                })),
            );
        }

        if (yieldTierSnapshot.length > 0) {
            await tx.insert(synthesisProfitYieldTiers).values(
                yieldTierSnapshot.map((y) => ({
                    snapshotId,
                    tier: y.tier as 'NQ' | 'HQ1' | 'HQ2' | 'HQ3',
                    itemId: y.itemId,
                    name: y.name,
                    quantity: y.quantity,
                    stackSize: y.stackSize,
                    auctionSinglePerUnit: capIntN(y.auctionSinglePerUnit),
                    auctionStackPerUnit: capIntN(y.auctionStackPerUnit),
                    revenue: capInt(y.revenue),
                    revenueSource: y.revenueSource,
                })),
            );
        }
    });
};

type SynthesisInput = {
    mainCraft: CraftRequirement;
    subCrafts: CraftRequirement[];
    yields: { itemId: number; tier: Tier; quantity: number }[];
    ingredients: { itemId: number; quantity: number }[];
};

// bg-wiki has no stable per-synthesis IDs, so we compute uniqueness
const buildFingerprint = (
    mainCraft: CraftRequirement,
    ingredients: { itemId: number; quantity: number }[],
): string => {
    // sort so that the order arbitrarily passed in doesn't result in a different fingerprint
    const sorted = [...ingredients].sort((a, b) => a.itemId - b.itemId);
    const ingredientStr = sorted.map((i) => `${i.itemId}:${i.quantity}`).join(',');
    return `${mainCraft.craft}:${mainCraft.craftLevel}|${ingredientStr}`;
};

/**
 * Inserts a new synthesis and its related rows.
 *
 * @param mainCraft - The primary craft skill and level required.
 * @param subCrafts - Any supporting craft skills and levels required.
 * @param yields - NQ/HQ output items with their items.id, tier, and quantity.
 * @param ingredients - All ingredients with their items.id and quantity, in
 *   order. The first element MUST be the crystal.
 */
export const upsertSynthesis = async ({
    mainCraft,
    subCrafts,
    yields,
    ingredients,
}: SynthesisInput): Promise<void> => {
    const fingerprint = buildFingerprint(mainCraft, ingredients);

    await db.transaction(async (tx) => {
        const [synthesis] = await tx
            .insert(syntheses)
            .values({ fingerprint })
            .onConflictDoNothing()
            .returning({ id: syntheses.id });

        const didCreateSynthesis = Boolean(synthesis);
        if (!didCreateSynthesis) return;

        await tx
            .insert(synthesisCraftRequirements)
            .values([
                { synthesisId: synthesis.id, ...mainCraft, isMain: true },
                ...subCrafts.map((sc) => ({ synthesisId: synthesis.id, ...sc, isMain: false })),
            ])
            .onConflictDoNothing();

        await tx
            .insert(synthesisYieldItems)
            .values(yields.map((y) => ({ synthesisId: synthesis.id, ...y })))
            .onConflictDoNothing();

        await tx
            .insert(synthesisIngredientItems)
            .values(ingredients.map((i) => ({ synthesisId: synthesis.id, ...i })))
            .onConflictDoNothing();
    });
};
