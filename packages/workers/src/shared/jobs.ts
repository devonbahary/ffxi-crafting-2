export type EnrichJob = {
    href: string; // e.g. "/ffxi/Distilled_Water"
    itemName: string;
};

export type PriceJob = {
    itemId: number;
};

export type ProfitJob = { itemId: number } | { synthesisId: number };
