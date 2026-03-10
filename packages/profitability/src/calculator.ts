export type YieldPricing = {
    itemId: number;
    name: string;
    quantity: number;
    price: number;
    stackPrice: number | null;
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

export type ProfitResult = {
    profitPerSingle: number;
    profitPerStack: number | null;
};

const getMinPerUnitCost = (ingredient: IngredientPricing): number | null => {
    const options: number[] = [];
    if (ingredient.auctionPrice !== null) options.push(ingredient.auctionPrice);
    if (ingredient.auctionStackPrice !== null && ingredient.stackSize > 1) {
        options.push(ingredient.auctionStackPrice / ingredient.stackSize);
    }
    if (ingredient.vendorPrice !== null) options.push(ingredient.vendorPrice);
    if (options.length === 0) return null;
    return Math.min(...options);
};

export const calculateProfit = (
    synthesisId: number,
    yields: YieldPricing[],
    ingredients: IngredientPricing[],
): ProfitResult | null => {
    const nqYield = yields[0];
    if (!nqYield) return null;

    let totalCost = 0;
    for (const ingredient of ingredients) {
        const minPerUnit = getMinPerUnitCost(ingredient);

        if (minPerUnit === null) {
            console.warn(
                `Could not calculate profitability for synthesisId=${synthesisId} (yield: ${nqYield.name}). No cost found for ingredient "${ingredient.name}" (itemId=${ingredient.itemId}).`,
            );
            return null;
        }

        totalCost += minPerUnit * ingredient.quantity;
    }

    const profitPerSingle = Math.round(nqYield.price * nqYield.quantity - totalCost);
    const profitPerStack =
        nqYield.stackSize > 1 && nqYield.stackPrice !== null
            ? Math.round((nqYield.stackPrice / nqYield.stackSize) * nqYield.quantity - totalCost)
            : null;

    return { profitPerSingle, profitPerStack };
};
