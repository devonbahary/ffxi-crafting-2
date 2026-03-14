import type { Craft, CraftRequirement } from '@ffxi-crafting/api';

type Tier = -1 | 0 | 1 | 2 | 3;

const getTier = (overshoot: number): Tier => {
    if (overshoot < 0) return -1;
    if (overshoot <= 10) return 0;
    if (overshoot <= 30) return 1;
    if (overshoot <= 50) return 2;
    return 3;
};

const HQ_RATE: Record<Tier, number> = {
    [-1]: 0,
    0: 1 / 64,
    1: 1 / 16,
    2: 1 / 4,
    3: 1 / 2,
};

// At T0 the HQ is always HQ1; at T1/T2/T3 it's 12:3:1
const HQ_DIST: Record<Exclude<Tier, -1>, { HQ1: number; HQ2: number; HQ3: number }> = {
    0: { HQ1: 1, HQ2: 0, HQ3: 0 },
    1: { HQ1: 12 / 16, HQ2: 3 / 16, HQ3: 1 / 16 },
    2: { HQ1: 12 / 16, HQ2: 3 / 16, HQ3: 1 / 16 },
    3: { HQ1: 12 / 16, HQ2: 3 / 16, HQ3: 1 / 16 },
};

export type PlayerSkills = Partial<Record<Craft, number>>;

export type TierProbabilities = {
    tier: Tier;
    NQ: number;
    HQ1: number;
    HQ2: number;
    HQ3: number;
};

export const getSynthesisTierProbabilities = (
    craftRequirements: CraftRequirement[],
    playerSkills: PlayerSkills,
): TierProbabilities | null => {
    if (Object.keys(playerSkills).length === 0) return null;

    let minOvershoot = Infinity;
    for (const req of craftRequirements) {
        const playerLevel = playerSkills[req.craft];
        if (playerLevel === undefined) return null; // missing required skill
        minOvershoot = Math.min(minOvershoot, playerLevel - req.craftLevel);
    }

    const tier = getTier(minOvershoot);
    if (tier === -1) return { tier, NQ: 1, HQ1: 0, HQ2: 0, HQ3: 0 };

    const hqRate = HQ_RATE[tier];
    const dist = HQ_DIST[tier];
    return {
        tier,
        NQ: 1 - hqRate,
        HQ1: hqRate * dist.HQ1,
        HQ2: hqRate * dist.HQ2,
        HQ3: hqRate * dist.HQ3,
    };
};

export const formatChance = (p: number): string => {
    if (p === 0) return '—';
    const pct = p * 100;
    return `${pct % 1 === 0 ? pct.toFixed(0) : pct.toFixed(1)}%`;
};
