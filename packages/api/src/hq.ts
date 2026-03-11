import type { Craft } from '@ffxi-crafting/types';

export type PlayerSkills = Partial<Record<Craft, number>>;

type Tier = -1 | 0 | 1 | 2 | 3;

const HQ_RATE: Record<Tier, number> = {
    [-1]: 0,
    0: 1 / 64,
    1: 1 / 16,
    2: 1 / 4,
    3: 1 / 2,
};

// At T0 all HQ results are HQ1; at T1/T2/T3 the distribution is 12/3/1 out of 16
const HQ_DIST: Record<Exclude<Tier, -1>, { HQ1: number; HQ2: number; HQ3: number }> = {
    0: { HQ1: 1, HQ2: 0, HQ3: 0 },
    1: { HQ1: 12 / 16, HQ2: 3 / 16, HQ3: 1 / 16 },
    2: { HQ1: 12 / 16, HQ2: 3 / 16, HQ3: 1 / 16 },
    3: { HQ1: 12 / 16, HQ2: 3 / 16, HQ3: 1 / 16 },
};

const getTier = (overshoot: number): Tier => {
    if (overshoot < 0) return -1;
    if (overshoot <= 10) return 0;
    if (overshoot <= 30) return 1;
    if (overshoot <= 50) return 2;
    return 3;
};

type SynthesisHqResult = { hqRate: number; tier: Tier };

export const getSynthesisHqResult = (
    craftRequirements: { craft: Craft; craftLevel: number }[],
    playerSkills: PlayerSkills,
): SynthesisHqResult => {
    let minOvershoot = Infinity;
    for (const req of craftRequirements) {
        const playerLevel = playerSkills[req.craft];
        if (playerLevel === undefined) return { hqRate: 0, tier: -1 };
        minOvershoot = Math.min(minOvershoot, playerLevel - req.craftLevel);
    }
    const tier = getTier(minOvershoot);
    return { hqRate: HQ_RATE[tier], tier };
};

export type TierRevenues = { NQ: number; HQ1: number; HQ2: number; HQ3: number };

export const calcExpectedProfit = (
    { hqRate, tier }: SynthesisHqResult,
    revenues: TierRevenues,
    ingredientCost: number,
): number => {
    if (tier === -1) return Math.round(revenues.NQ - ingredientCost);
    const dist = HQ_DIST[tier];
    const eRevenue =
        (1 - hqRate) * revenues.NQ +
        hqRate * dist.HQ1 * revenues.HQ1 +
        hqRate * dist.HQ2 * revenues.HQ2 +
        hqRate * dist.HQ3 * revenues.HQ3;
    return Math.round(eRevenue - ingredientCost);
};
