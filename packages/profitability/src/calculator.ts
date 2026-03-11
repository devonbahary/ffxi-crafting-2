import { logger } from './logger.js';

const HQ_RATES: Record<0 | 1 | 2 | 3, number> = {
    0: 1 / 64,
    1: 1 / 16,
    2: 1 / 4,
    3: 1 / 2,
};
const HQ_DIST_T0 = { HQ1: 1, HQ2: 0, HQ3: 0 };
const HQ_DIST_T1_PLUS = { HQ1: 12 / 16, HQ2: 3 / 16, HQ3: 1 / 16 };

export type YieldPricing = {
    itemId: number;
    name: string;
    tier: string;
    quantity: number;
    auctionPrice: number | null;
    auctionStackPrice: number | null;
    salesPerDay: number | null;
    stackSalesPerDay: number | null;
    stackSize: number;
};

export type IngredientPricing = {
    itemId: number;
    name: string;
    quantity: number;
    auctionPrice: number | null;
    auctionStackPrice: number | null;
    stackSize: number;
    vendorPrice: number | null;
};

export type IngredientSnapshot = {
    itemId: number;
    name: string;
    quantity: number;
    auctionSinglePerUnit: number | null;
    auctionStackPerUnit: number | null;
    vendorPerUnit: number | null;
    unitCost: number;
    priceSource: 'ah_single' | 'ah_stack' | 'vendor';
    totalCost: number;
};

export type YieldTierSnapshot = {
    tier: string;
    itemId: number;
    name: string;
    quantity: number;
    stackSize: number;
    auctionSinglePerUnit: number | null;
    auctionStackPerUnit: number | null;
    revenue: number;
    revenueSource: 'single' | 'stack';
};

export type ProfitResult = {
    totalIngredientCost: number;
    profitPerSingle: number;
    profitPerStack: number | null;
    dailyProfitSingle: number | null;
    dailyProfitStack: number | null;
    profitHQ1: number | null;
    profitHQ2: number | null;
    profitHQ3: number | null;
    expectedProfitT0: number;
    expectedProfitT1: number;
    expectedProfitT2: number;
    expectedProfitT3: number;
    expectedProfitStackT0: number | null;
    expectedProfitStackT1: number | null;
    expectedProfitStackT2: number | null;
    expectedProfitStackT3: number | null;
    salesPerDay: number;
    stackSalesPerDay: number | null;
    ingredientSnapshot: IngredientSnapshot[];
    yieldTierSnapshot: YieldTierSnapshot[];
};

const calcExpected = (
    hqRate: number,
    dist: { HQ1: number; HQ2: number; HQ3: number },
    revenues: { nq: number; hq1: number; hq2: number; hq3: number },
    cost: number,
): number => {
    const eRev =
        (1 - hqRate) * revenues.nq +
        hqRate * dist.HQ1 * revenues.hq1 +
        hqRate * dist.HQ2 * revenues.hq2 +
        hqRate * dist.HQ3 * revenues.hq3;
    return Math.round(eRev - cost);
};

export const calculateProfit = (
    synthesisId: number,
    yields: YieldPricing[],
    ingredients: IngredientPricing[],
): ProfitResult | null => {
    const nqYields = yields.filter((y) => y.tier === 'NQ');
    if (nqYields.length === 0) return null;

    // Build ingredient snapshots
    const ingredientSnapshot: IngredientSnapshot[] = [];
    let totalIngredientCost = 0;

    for (const ingredient of ingredients) {
        const auctionSinglePerUnit = ingredient.auctionPrice ?? null;
        const auctionStackPerUnit =
            ingredient.auctionStackPrice !== null && ingredient.stackSize > 1
                ? Math.round(ingredient.auctionStackPrice / ingredient.stackSize)
                : null;
        const vendorPerUnit = ingredient.vendorPrice ?? null;

        const options: { value: number; source: 'ah_single' | 'ah_stack' | 'vendor' }[] = [];
        if (auctionSinglePerUnit !== null)
            options.push({ value: auctionSinglePerUnit, source: 'ah_single' });
        if (auctionStackPerUnit !== null)
            options.push({ value: auctionStackPerUnit, source: 'ah_stack' });
        if (vendorPerUnit !== null) options.push({ value: vendorPerUnit, source: 'vendor' });

        if (options.length === 0) {
            logger.warn(
                `Could not calculate profitability for synthesisId=${synthesisId} (yield: ${nqYields[0]!.name}). No cost found for ingredient "${ingredient.name}" (itemId=${ingredient.itemId}).`,
            );
            return null;
        }

        const best = options.reduce((a, b) => (b.value < a.value ? b : a));
        const unitCost = best.value;
        const priceSource = best.source;
        const totalCost = unitCost * ingredient.quantity;

        ingredientSnapshot.push({
            itemId: ingredient.itemId,
            name: ingredient.name,
            quantity: ingredient.quantity,
            auctionSinglePerUnit,
            auctionStackPerUnit,
            vendorPerUnit,
            unitCost,
            priceSource,
            totalCost,
        });
        totalIngredientCost += totalCost;
    }

    // Build yield tier snapshots
    const yieldTierSnapshot: YieldTierSnapshot[] = [];
    for (const y of yields) {
        const auctionSinglePerUnit = y.auctionPrice ?? null;
        const auctionStackPerUnit =
            y.auctionStackPrice !== null && y.stackSize > 1
                ? Math.round(y.auctionStackPrice / y.stackSize)
                : null;

        let revenue: number;
        let revenueSource: 'single' | 'stack';

        if (auctionSinglePerUnit === null && auctionStackPerUnit === null) {
            revenue = 0;
            revenueSource = 'single';
        } else {
            const single = auctionSinglePerUnit ?? 0;
            const stack = auctionStackPerUnit ?? 0;
            if (auctionStackPerUnit !== null && stack > single) {
                revenue = Math.round(stack * y.quantity);
                revenueSource = 'stack';
            } else {
                revenue = Math.round(single * y.quantity);
                revenueSource = 'single';
            }
        }

        yieldTierSnapshot.push({
            tier: y.tier,
            itemId: y.itemId,
            name: y.name,
            quantity: y.quantity,
            stackSize: y.stackSize,
            auctionSinglePerUnit,
            auctionStackPerUnit,
            revenue,
            revenueSource,
        });
    }

    // Sum revenue per tier
    const nqRevenue = yieldTierSnapshot
        .filter((y) => y.tier === 'NQ')
        .reduce((sum, y) => sum + y.revenue, 0);
    const hq1Revenue = yieldTierSnapshot
        .filter((y) => y.tier === 'HQ1')
        .reduce((sum, y) => sum + y.revenue, 0);
    const hq2Revenue = yieldTierSnapshot
        .filter((y) => y.tier === 'HQ2')
        .reduce((sum, y) => sum + y.revenue, 0);
    const hq3Revenue = yieldTierSnapshot
        .filter((y) => y.tier === 'HQ3')
        .reduce((sum, y) => sum + y.revenue, 0);

    // NQ profits
    const nqSingleRevenue = yieldTierSnapshot
        .filter((y) => y.tier === 'NQ')
        .reduce((sum, y) => sum + (y.auctionSinglePerUnit ?? 0) * y.quantity, 0);
    const profitPerSingle = Math.round(nqSingleRevenue - totalIngredientCost);

    const nqItems = yieldTierSnapshot.filter((y) => y.tier === 'NQ');
    const hasNqStack = nqItems.some((y) => y.auctionStackPerUnit !== null && y.stackSize > 1);
    const nqStackRevenue = nqItems.reduce(
        (sum, y) => sum + (y.auctionStackPerUnit ?? 0) * y.quantity,
        0,
    );
    const profitPerStack = hasNqStack ? Math.round(nqStackRevenue - totalIngredientCost) : null;

    // HQ profits
    const profitHQ1 = hq1Revenue > 0 ? Math.round(hq1Revenue - totalIngredientCost) : null;
    const profitHQ2 = hq2Revenue > 0 ? Math.round(hq2Revenue - totalIngredientCost) : null;
    const profitHQ3 = hq3Revenue > 0 ? Math.round(hq3Revenue - totalIngredientCost) : null;

    // Expected profits (single)
    const revenues = { nq: nqRevenue, hq1: hq1Revenue, hq2: hq2Revenue, hq3: hq3Revenue };
    const expectedProfitT0 = calcExpected(HQ_RATES[0], HQ_DIST_T0, revenues, totalIngredientCost);
    const expectedProfitT1 = calcExpected(
        HQ_RATES[1],
        HQ_DIST_T1_PLUS,
        revenues,
        totalIngredientCost,
    );
    const expectedProfitT2 = calcExpected(
        HQ_RATES[2],
        HQ_DIST_T1_PLUS,
        revenues,
        totalIngredientCost,
    );
    const expectedProfitT3 = calcExpected(
        HQ_RATES[3],
        HQ_DIST_T1_PLUS,
        revenues,
        totalIngredientCost,
    );

    // Expected profits (stack)
    let expectedProfitStackT0: number | null = null;
    let expectedProfitStackT1: number | null = null;
    let expectedProfitStackT2: number | null = null;
    let expectedProfitStackT3: number | null = null;
    if (hasNqStack) {
        const hq1StackRevenue = yieldTierSnapshot
            .filter((y) => y.tier === 'HQ1')
            .reduce((sum, y) => sum + (y.auctionStackPerUnit ?? 0) * y.quantity, 0);
        const hq2StackRevenue = yieldTierSnapshot
            .filter((y) => y.tier === 'HQ2')
            .reduce((sum, y) => sum + (y.auctionStackPerUnit ?? 0) * y.quantity, 0);
        const hq3StackRevenue = yieldTierSnapshot
            .filter((y) => y.tier === 'HQ3')
            .reduce((sum, y) => sum + (y.auctionStackPerUnit ?? 0) * y.quantity, 0);
        const stackRevenues = {
            nq: nqStackRevenue,
            hq1: hq1StackRevenue,
            hq2: hq2StackRevenue,
            hq3: hq3StackRevenue,
        };
        expectedProfitStackT0 = calcExpected(
            HQ_RATES[0],
            HQ_DIST_T0,
            stackRevenues,
            totalIngredientCost,
        );
        expectedProfitStackT1 = calcExpected(
            HQ_RATES[1],
            HQ_DIST_T1_PLUS,
            stackRevenues,
            totalIngredientCost,
        );
        expectedProfitStackT2 = calcExpected(
            HQ_RATES[2],
            HQ_DIST_T1_PLUS,
            stackRevenues,
            totalIngredientCost,
        );
        expectedProfitStackT3 = calcExpected(
            HQ_RATES[3],
            HQ_DIST_T1_PLUS,
            stackRevenues,
            totalIngredientCost,
        );
    }

    // Sales metrics from first NQ yield item with auction data
    const nqYieldWithAuction = nqYields.find((y) => y.auctionPrice !== null);
    const salesPerDay = nqYieldWithAuction?.salesPerDay ?? 0;
    const stackSalesPerDay = nqYieldWithAuction?.stackSalesPerDay ?? null;

    const dailyProfitSingle = salesPerDay > 0 ? Math.round(profitPerSingle * salesPerDay) : null;
    const dailyProfitStack =
        profitPerStack !== null && stackSalesPerDay !== null && stackSalesPerDay > 0
            ? Math.round(profitPerStack * stackSalesPerDay)
            : null;

    return {
        totalIngredientCost,
        profitPerSingle,
        profitPerStack,
        dailyProfitSingle,
        dailyProfitStack,
        profitHQ1,
        profitHQ2,
        profitHQ3,
        expectedProfitT0,
        expectedProfitT1,
        expectedProfitT2,
        expectedProfitT3,
        expectedProfitStackT0,
        expectedProfitStackT1,
        expectedProfitStackT2,
        expectedProfitStackT3,
        salesPerDay,
        stackSalesPerDay,
        ingredientSnapshot,
        yieldTierSnapshot,
    };
};
