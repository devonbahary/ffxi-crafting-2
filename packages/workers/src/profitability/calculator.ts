import { logger } from '../shared/logger.js';

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
    unitProfitAsSingle: number; // (nqSingleRevenue - cost) / nqQuantity — per item sold as single
    unitProfitAsStack: number | null; // (nqStackRevenue - cost) / nqQuantity — per item sold as stack
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
    stackProfit: number | null;
    expectedStackProfitT0: number | null;
    expectedStackProfitT1: number | null;
    expectedStackProfitT2: number | null;
    expectedStackProfitT3: number | null;
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
    const unitProfitAsSingle = Math.round((nqSingleRevenue - totalIngredientCost) / nqQuantity);

    const nqItems = yieldTierSnapshot.filter((y) => y.tier === 'NQ');
    const hasNqStack = nqItems.some((y) => y.auctionStackPerUnit !== null && y.stackSize > 1);
    const nqStackRevenue = nqItems.reduce(
        (sum, y) => sum + (y.auctionStackPerUnit ?? 0) * y.quantity,
        0,
    );
    const unitProfitAsStack = hasNqStack
        ? Math.round((nqStackRevenue - totalIngredientCost) / nqQuantity)
        : null;

    // Sales metrics from first NQ yield item with auction data
    const nqYieldWithAuction = nqYields.find((y) => y.auctionPrice !== null);
    const salesPerDay = nqYieldWithAuction?.salesPerDay ?? 0;
    const stackSalesPerDay = nqYieldWithAuction?.stackSalesPerDay ?? null;
    // stackSalesPerDay is stack transactions/day; multiply by stackSize to get items/day
    const nqStackSize = nqYieldWithAuction?.stackSize ?? 1;

    const stackProfit = hasNqStack ? Math.round(unitProfitAsStack! * nqStackSize) : null;

    // When a synthesis has no yield defined for a given HQ tier, an HQ result at that
    // tier still occurs — it just produces the next-lower defined tier's item. Fall back
    // cascading so that missing tiers don't contribute zero revenue to the expected value.
    const hasHq1 = yields.some((y) => y.tier === 'HQ1');
    const hasHq2 = yields.some((y) => y.tier === 'HQ2');
    const hasHq3 = yields.some((y) => y.tier === 'HQ3');
    const effHq1Revenue = hasHq1 ? hq1Revenue : nqRevenue;
    const effHq2Revenue = hasHq2 ? hq2Revenue : effHq1Revenue;
    const effHq3Revenue = hasHq3 ? hq3Revenue : effHq2Revenue;

    // HQ quantities with same cascade fallback as revenues (for expectedStackProfit)
    const hq1TotalQuantity = yields
        .filter((y) => y.tier === 'HQ1')
        .reduce((sum, y) => sum + y.quantity, 0);
    const hq2TotalQuantity = yields
        .filter((y) => y.tier === 'HQ2')
        .reduce((sum, y) => sum + y.quantity, 0);
    const hq3TotalQuantity = yields
        .filter((y) => y.tier === 'HQ3')
        .reduce((sum, y) => sum + y.quantity, 0);
    const effHq1Quantity = hasHq1 ? hq1TotalQuantity : nqQuantity;
    const effHq2Quantity = hasHq2 ? hq2TotalQuantity : effHq1Quantity;
    const effHq3Quantity = hasHq3 ? hq3TotalQuantity : effHq2Quantity;

    // Expected margin per item (normalized by nqQuantity)
    const revenues = { nq: nqRevenue, hq1: effHq1Revenue, hq2: effHq2Revenue, hq3: effHq3Revenue };
    const expectedUnitProfitAsSingleT0 = calcExpected(
        HQ_RATES[0],
        HQ_DIST_T0,
        revenues,
        totalIngredientCost,
        nqQuantity,
    );
    const expectedUnitProfitAsSingleT1 = calcExpected(
        HQ_RATES[1],
        HQ_DIST_T1_PLUS,
        revenues,
        totalIngredientCost,
        nqQuantity,
    );
    const expectedUnitProfitAsSingleT2 = calcExpected(
        HQ_RATES[2],
        HQ_DIST_T1_PLUS,
        revenues,
        totalIngredientCost,
        nqQuantity,
    );
    const expectedUnitProfitAsSingleT3 = calcExpected(
        HQ_RATES[3],
        HQ_DIST_T1_PLUS,
        revenues,
        totalIngredientCost,
        nqQuantity,
    );

    // Expected margin per item — stack pricing (normalized by nqQuantity)
    let expectedUnitProfitAsStackT0: number | null = null;
    let expectedUnitProfitAsStackT1: number | null = null;
    let expectedUnitProfitAsStackT2: number | null = null;
    let expectedUnitProfitAsStackT3: number | null = null;
    let expectedStackProfitT0: number | null = null;
    let expectedStackProfitT1: number | null = null;
    let expectedStackProfitT2: number | null = null;
    let expectedStackProfitT3: number | null = null;
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
        expectedUnitProfitAsStackT0 = calcExpected(
            HQ_RATES[0],
            HQ_DIST_T0,
            stackRevenues,
            totalIngredientCost,
            nqQuantity,
        );
        expectedUnitProfitAsStackT1 = calcExpected(
            HQ_RATES[1],
            HQ_DIST_T1_PLUS,
            stackRevenues,
            totalIngredientCost,
            nqQuantity,
        );
        expectedUnitProfitAsStackT2 = calcExpected(
            HQ_RATES[2],
            HQ_DIST_T1_PLUS,
            stackRevenues,
            totalIngredientCost,
            nqQuantity,
        );
        expectedUnitProfitAsStackT3 = calcExpected(
            HQ_RATES[3],
            HQ_DIST_T1_PLUS,
            stackRevenues,
            totalIngredientCost,
            nqQuantity,
        );

        const calcExpectedItemsPerSynth = (
            hqRate: number,
            dist: { HQ1: number; HQ2: number; HQ3: number },
        ) =>
            (1 - hqRate) * nqQuantity +
            hqRate *
                (dist.HQ1 * effHq1Quantity + dist.HQ2 * effHq2Quantity + dist.HQ3 * effHq3Quantity);

        const stackPricePerUnit = nqStackRevenue / nqQuantity;
        const calcStackProfit = (expectedItems: number) =>
            Math.round(
                stackPricePerUnit * nqStackSize -
                    (totalIngredientCost * nqStackSize) / expectedItems,
            );

        expectedStackProfitT0 = calcStackProfit(calcExpectedItemsPerSynth(HQ_RATES[0], HQ_DIST_T0));
        expectedStackProfitT1 = calcStackProfit(
            calcExpectedItemsPerSynth(HQ_RATES[1], HQ_DIST_T1_PLUS),
        );
        expectedStackProfitT2 = calcStackProfit(
            calcExpectedItemsPerSynth(HQ_RATES[2], HQ_DIST_T1_PLUS),
        );
        expectedStackProfitT3 = calcStackProfit(
            calcExpectedItemsPerSynth(HQ_RATES[3], HQ_DIST_T1_PLUS),
        );
    }

    const profitPerDayAsSingle =
        salesPerDay > 0 ? Math.round(unitProfitAsSingle * salesPerDay) : null;
    const profitPerDayAsStack =
        unitProfitAsStack !== null && stackSalesPerDay !== null && stackSalesPerDay > 0
            ? Math.round(unitProfitAsStack * stackSalesPerDay * nqStackSize)
            : null;

    return {
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
        stackProfit,
        expectedStackProfitT0,
        expectedStackProfitT1,
        expectedStackProfitT2,
        expectedStackProfitT3,
        salesPerDay,
        stackSalesPerDay,
        ingredientSnapshot,
        yieldTierSnapshot,
    };
};
