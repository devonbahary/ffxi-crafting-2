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
    stackSize: number;
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
    unitMarginAsSingle: number; // (nqSingleRevenue - cost) / nqQuantity — per item sold as single
    unitMarginAsStack: number | null; // (nqStackRevenue - cost) / nqQuantity — per item sold as stack
    dailyProfitSingle: number | null;
    dailyProfitStack: number | null;
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
    quantity: number,
): number => {
    const eRev =
        (1 - hqRate) * revenues.nq +
        hqRate * dist.HQ1 * revenues.hq1 +
        hqRate * dist.HQ2 * revenues.hq2 +
        hqRate * dist.HQ3 * revenues.hq3;
    return Math.round((eRev - cost) / quantity);
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
            stackSize: ingredient.stackSize,
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

    // NQ quantity and per-item margins
    const nqQuantity = nqYields.reduce((sum, y) => sum + y.quantity, 0);

    const nqSingleRevenue = yieldTierSnapshot
        .filter((y) => y.tier === 'NQ')
        .reduce((sum, y) => sum + (y.auctionSinglePerUnit ?? 0) * y.quantity, 0);
    const unitMarginAsSingle = Math.round((nqSingleRevenue - totalIngredientCost) / nqQuantity);

    const nqItems = yieldTierSnapshot.filter((y) => y.tier === 'NQ');
    const hasNqStack = nqItems.some((y) => y.auctionStackPerUnit !== null && y.stackSize > 1);
    const nqStackRevenue = nqItems.reduce(
        (sum, y) => sum + (y.auctionStackPerUnit ?? 0) * y.quantity,
        0,
    );
    const unitMarginAsStack = hasNqStack
        ? Math.round((nqStackRevenue - totalIngredientCost) / nqQuantity)
        : null;

    // When a synthesis has no yield defined for a given HQ tier, an HQ result at that
    // tier still occurs — it just produces the next-lower defined tier's item. Fall back
    // cascading so that missing tiers don't contribute zero revenue to the expected value.
    const hasHq1 = yields.some((y) => y.tier === 'HQ1');
    const hasHq2 = yields.some((y) => y.tier === 'HQ2');
    const hasHq3 = yields.some((y) => y.tier === 'HQ3');
    const effHq1Revenue = hasHq1 ? hq1Revenue : nqRevenue;
    const effHq2Revenue = hasHq2 ? hq2Revenue : effHq1Revenue;
    const effHq3Revenue = hasHq3 ? hq3Revenue : effHq2Revenue;

    // Expected margin per item (normalized by nqQuantity)
    const revenues = { nq: nqRevenue, hq1: effHq1Revenue, hq2: effHq2Revenue, hq3: effHq3Revenue };
    const expectedProfitT0 = calcExpected(
        HQ_RATES[0],
        HQ_DIST_T0,
        revenues,
        totalIngredientCost,
        nqQuantity,
    );
    const expectedProfitT1 = calcExpected(
        HQ_RATES[1],
        HQ_DIST_T1_PLUS,
        revenues,
        totalIngredientCost,
        nqQuantity,
    );
    const expectedProfitT2 = calcExpected(
        HQ_RATES[2],
        HQ_DIST_T1_PLUS,
        revenues,
        totalIngredientCost,
        nqQuantity,
    );
    const expectedProfitT3 = calcExpected(
        HQ_RATES[3],
        HQ_DIST_T1_PLUS,
        revenues,
        totalIngredientCost,
        nqQuantity,
    );

    // Expected margin per item — stack pricing (normalized by nqQuantity)
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
        const effHq1StackRevenue = hasHq1 ? hq1StackRevenue : nqStackRevenue;
        const effHq2StackRevenue = hasHq2 ? hq2StackRevenue : effHq1StackRevenue;
        const effHq3StackRevenue = hasHq3 ? hq3StackRevenue : effHq2StackRevenue;
        const stackRevenues = {
            nq: nqStackRevenue,
            hq1: effHq1StackRevenue,
            hq2: effHq2StackRevenue,
            hq3: effHq3StackRevenue,
        };
        expectedProfitStackT0 = calcExpected(
            HQ_RATES[0],
            HQ_DIST_T0,
            stackRevenues,
            totalIngredientCost,
            nqQuantity,
        );
        expectedProfitStackT1 = calcExpected(
            HQ_RATES[1],
            HQ_DIST_T1_PLUS,
            stackRevenues,
            totalIngredientCost,
            nqQuantity,
        );
        expectedProfitStackT2 = calcExpected(
            HQ_RATES[2],
            HQ_DIST_T1_PLUS,
            stackRevenues,
            totalIngredientCost,
            nqQuantity,
        );
        expectedProfitStackT3 = calcExpected(
            HQ_RATES[3],
            HQ_DIST_T1_PLUS,
            stackRevenues,
            totalIngredientCost,
            nqQuantity,
        );
    }

    // Sales metrics from first NQ yield item with auction data
    const nqYieldWithAuction = nqYields.find((y) => y.auctionPrice !== null);
    const salesPerDay = nqYieldWithAuction?.salesPerDay ?? 0;
    const stackSalesPerDay = nqYieldWithAuction?.stackSalesPerDay ?? null;
    // stackSalesPerDay is stack transactions/day; multiply by stackSize to get items/day
    const nqStackSize = nqYieldWithAuction?.stackSize ?? 1;

    const dailyProfitSingle = salesPerDay > 0 ? Math.round(unitMarginAsSingle * salesPerDay) : null;
    const dailyProfitStack =
        unitMarginAsStack !== null && stackSalesPerDay !== null && stackSalesPerDay > 0
            ? Math.round(unitMarginAsStack * stackSalesPerDay * nqStackSize)
            : null;

    return {
        totalIngredientCost,
        unitMarginAsSingle,
        unitMarginAsStack,
        dailyProfitSingle,
        dailyProfitStack,
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
