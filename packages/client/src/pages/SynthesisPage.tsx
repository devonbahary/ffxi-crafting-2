import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { hc } from 'hono/client';
import type { AppType, ProfitableSynthesis } from '@ffxi-crafting/api';
import { CRAFTS } from '@ffxi-crafting/api';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';

const TIER_BADGE_CLASS: Record<string, string> = {
    NQ: 'bg-secondary text-secondary-foreground',
    HQ1: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200',
    HQ2: 'bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-200',
    HQ3: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
};

const TierBadge = ({ tier }: { tier: string }) => (
    <Badge className={TIER_BADGE_CLASS[tier] ?? TIER_BADGE_CLASS.NQ}>{tier}</Badge>
);

const HQ_RATE_BADGE_CLASS: Record<number, string> = {
    0: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
    1: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
    2: 'bg-violet-100 text-violet-800 dark:bg-violet-900 dark:text-violet-200',
    3: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
};

const HqTierBadge = ({ tier, hqRate }: { tier: number; hqRate: number }) => (
    <Badge className={HQ_RATE_BADGE_CLASS[tier]}>
        T{tier} {formatChance(hqRate)}
    </Badge>
);
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatGil, formatUpdatedAt } from '@/lib/utils';
import { getCraftColor, getCrystalColor } from '@/lib/craft-colors';
import {
    getSynthesisTierProbabilities,
    formatChance,
    type PlayerSkills,
} from '@/lib/hq';

const client = hc<AppType>('/');

const PER_PAGE = 25;

const RATE_THRESHOLDS: [number, string][] = [
    [8, 'Very Fast'],
    [4, 'Fast'],
    [1, 'Average'],
    [1 / 7, 'Slow'],
    [1 / 30, 'Very Slow'],
];

const RATE_FILTER_OPTIONS: { label: string; value: string }[] = [
    { label: 'Any rate', value: 'any' },
    { label: 'Very Fast', value: 'very-fast' },
    { label: 'Fast', value: 'fast' },
    { label: 'Average', value: 'average' },
    { label: 'Slow', value: 'slow' },
    { label: 'Very Slow', value: 'very-slow' },
];

const getSalesRateLabel = (salesPerDay: number | null): string => {
    const rate = salesPerDay ?? 0;
    for (const [threshold, label] of RATE_THRESHOLDS) {
        if (rate >= threshold) return label;
    }
    return 'Dead Slow';
};

const RATE_COLOR: Record<string, string> = {
    'Very Fast': 'text-green-500',
    'Fast': 'text-green-400',
    'Average': 'text-yellow-500',
    'Slow': 'text-orange-400',
    'Very Slow': 'text-orange-500',
    'Dead Slow': 'text-red-500',
};

const RateCell = ({ salesPerDay }: { salesPerDay: number | null }) => {
    if (salesPerDay === null)
        return <TableCell className="text-right text-muted-foreground">—</TableCell>;
    const label = getSalesRateLabel(salesPerDay);
    return (
        <TableCell className="text-right">
            <span className={`font-medium ${RATE_COLOR[label]}`}>{label}</span>
            <div className="text-xs text-muted-foreground">{salesPerDay.toFixed(1)}/d</div>
        </TableCell>
    );
};

const ProfitCell = ({ value }: { value: number | null }) => {
    if (value === null) return <TableCell className="text-right text-muted-foreground">—</TableCell>;
    const color = value >= 0 ? 'text-green-500' : 'text-red-500';
    return <TableCell className={`text-right font-medium ${color}`}>{formatGil(value)}</TableCell>;
};

const PriceCell = ({
    value,
    isSelected,
    isCheapest,
    onClick,
}: {
    value: number | null;
    isSelected: boolean;
    isCheapest: boolean;
    onClick?: () => void;
}) => (
    <td className="pr-4 text-center">
        {value !== null ? (
            <span
                className={`inline-block rounded-full px-3 py-0.5 transition-colors cursor-pointer ${
                    isCheapest ? 'text-green-600 dark:text-green-400' : ''
                } ${
                    isSelected
                        ? 'bg-accent font-medium'
                        : 'border border-accent hover:bg-accent'
                }`}
                onClick={!isSelected ? onClick : undefined}
            >
                {formatGil(value)}
            </span>
        ) : (
            <span className="text-muted-foreground">—</span>
        )}
    </td>
);

const ExpandedRow = ({
    synthesis,
    playerSkills,
}: {
    synthesis: ProfitableSynthesis;
    playerSkills: PlayerSkills;
}) => {
    const [overrides, setOverrides] = useState<Record<number, 'ah_single' | 'ah_stack' | 'vendor'>>(
        {},
    );

    const effectiveIngredients = synthesis.ingredients.map((ing) => {
        const source = overrides[ing.itemId] ?? ing.priceSource;
        const unitCost =
            source === 'ah_single' && ing.auctionSinglePerUnit !== null
                ? ing.auctionSinglePerUnit
                : source === 'ah_stack' && ing.auctionStackPerUnit !== null
                  ? ing.auctionStackPerUnit
                  : source === 'vendor' && ing.vendorPerUnit !== null
                    ? ing.vendorPerUnit
                    : ing.unitCost;
        return { ...ing, priceSource: source as 'ah_single' | 'ah_stack' | 'vendor', unitCost, totalCost: unitCost * ing.quantity };
    });

    const setOverride = (itemId: number, source: 'ah_single' | 'ah_stack' | 'vendor') =>
        setOverrides((prev) => ({ ...prev, [itemId]: source }));

    const totalCost = effectiveIngredients.reduce((sum, i) => sum + i.totalCost, 0);
    const { nqYield } = synthesis;
    const craftReqs = [synthesis.mainCraft, ...synthesis.subCrafts];
    const probs = getSynthesisTierProbabilities(craftReqs, playerSkills);
    const showChance = probs !== null;

    // Revenue per tier — use pre-computed snapshot values
    const tierRevenueSeq: number[] = [
        nqYield.revenue,
        ...synthesis.hqYields.map((tier) => tier.items.reduce((sum, item) => sum + item.revenue, 0)),
    ];
    const pctByTier = new Map<string, number>();
    const nqRevenue = tierRevenueSeq[0];
    if (nqRevenue !== 0) {
        synthesis.hqYields.forEach((tier, i) => {
            pctByTier.set(tier.tier, ((tierRevenueSeq[i + 1] - nqRevenue) / nqRevenue) * 100);
        });
    }

    return (
        <TableRow className="bg-muted/40 hover:bg-muted/40">
            <TableCell colSpan={11} className="p-4">
                <div className="divide-y divide-border">
                    <div className="pb-4">
                        <div>
                            <p className="text-sm font-semibold mb-2">Revenue (by HQ Tier)</p>
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-muted-foreground">
                                        <th className="text-left pr-4 font-normal">Tier</th>
                                        <th className="text-left pr-4 font-normal">Item</th>
                                        <th className="text-right pr-4 font-normal">Qty</th>
                                        <th className="text-right pr-4 font-normal">Stack</th>
                                        <th className="text-right pr-4 font-normal">AH Single</th>
                                        <th className="text-right pr-4 font-normal">AH Stack/unit</th>
                                        <th className="text-right pr-4 font-normal">Revenue</th>
                                        <th className="text-right pr-4 font-normal">Δ%</th>
                                        {showChance && <th className="text-right pr-4 font-normal">Chance</th>}
                                        <th className="text-right pr-4 font-normal">Unit Profit (Single)</th>
                                        <th className="text-right pr-4 font-normal">Unit Profit (Stack)</th>
                                        <th className="text-right font-normal">Stack Profit</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr>
                                        <td className="pr-4"><TierBadge tier="NQ" /></td>
                                        <td className="pr-4">{nqYield.name}</td>
                                        <td className="text-right pr-4">{nqYield.quantity}</td>
                                        <td className="text-right pr-4 text-muted-foreground">{nqYield.stackSize > 1 ? `×${nqYield.stackSize}` : '—'}</td>
                                        <td className={`text-right pr-4 ${nqYield.revenueSource === 'single' ? 'text-green-500 font-medium' : 'text-muted-foreground'}`}>
                                            {nqYield.auctionPrice !== null ? formatGil(nqYield.auctionPrice) : '—'}
                                        </td>
                                        <td className={`text-right pr-4 ${nqYield.revenueSource === 'stack' ? 'text-green-500 font-medium' : 'text-muted-foreground'}`}>
                                            {nqYield.auctionStackPrice !== null ? formatGil(Math.round(nqYield.auctionStackPrice / nqYield.stackSize)) : '—'}
                                        </td>
                                        <td className="text-right pr-4">{formatGil(nqYield.revenue)}</td>
                                        <td className="pr-4 text-right text-xs text-muted-foreground">—</td>
                                        {showChance && <td className="text-right pr-4 text-muted-foreground">{formatChance(probs.NQ)}</td>}
                                        {(() => {
                                            const qty = nqYield.quantity;
                                            const singleRev = nqYield.auctionPrice !== null ? nqYield.auctionPrice * qty : null;
                                            const stackRev = nqYield.auctionStackPrice !== null ? Math.round(nqYield.auctionStackPrice / nqYield.stackSize) * qty : null;
                                            const marginSingle = singleRev !== null ? Math.round((singleRev - totalCost) / qty) : null;
                                            const marginStack = stackRev !== null ? Math.round((stackRev - totalCost) / qty) : null;
                                            const stackProfit = stackRev !== null ? Math.round(stackRev - totalCost) : null;
                                            return (
                                                <>
                                                    <td className={`text-right pr-4 font-medium ${marginSingle !== null ? (marginSingle >= 0 ? 'text-green-500' : 'text-red-500') : 'text-muted-foreground'}`}>
                                                        {marginSingle !== null ? formatGil(marginSingle) : '—'}
                                                    </td>
                                                    <td className={`text-right pr-4 font-medium ${marginStack !== null ? (marginStack >= 0 ? 'text-green-500' : 'text-red-500') : 'text-muted-foreground'}`}>
                                                        {marginStack !== null ? formatGil(marginStack) : '—'}
                                                    </td>
                                                    <td className={`text-right font-medium ${stackProfit !== null ? (stackProfit >= 0 ? 'text-green-500' : 'text-red-500') : 'text-muted-foreground'}`}>
                                                        {stackProfit !== null ? formatGil(stackProfit) : '—'}
                                                    </td>
                                                </>
                                            );
                                        })()}
                                    </tr>
                                    {synthesis.hqYields.map((tier) =>
                                        tier.items.map((item, itemIdx) => {
                                            const pct = itemIdx === 0 ? pctByTier.get(tier.tier) : undefined;
                                            const revenue = item.revenue > 0 ? item.revenue : null;
                                            const tierQty = tier.items.reduce((sum, it) => sum + it.quantity, 0);
                                            const tierSingleRev = itemIdx === 0 ? tier.items.reduce((sum, it) => sum + (it.auctionPrice !== null ? it.auctionPrice * it.quantity : 0), 0) : null;
                                            const tierStackRev = itemIdx === 0 ? tier.items.reduce((sum, it) => sum + (it.auctionStackPrice !== null ? Math.round(it.auctionStackPrice / it.stackSize) * it.quantity : 0), 0) : null;
                                            const marginSingle = tierSingleRev !== null ? Math.round((tierSingleRev - totalCost) / tierQty) : null;
                                            const hasStack = tier.items.some((it) => it.auctionStackPrice !== null);
                                            const marginStack = tierStackRev !== null && hasStack ? Math.round((tierStackRev - totalCost) / tierQty) : null;
                                            const tierStackProfit = tierStackRev !== null && hasStack ? Math.round(tierStackRev - totalCost) : null;
                                            return (
                                                <tr key={`${tier.tier}-${item.itemId}`}>
                                                    <td className="pr-4"><TierBadge tier={tier.tier} /></td>
                                                    <td className="pr-4">{item.name}</td>
                                                    <td className="text-right pr-4">{item.quantity}</td>
                                                    <td className="text-right pr-4 text-muted-foreground">{item.stackSize > 1 ? `×${item.stackSize}` : '—'}</td>
                                                    <td className={`text-right pr-4 ${item.revenueSource === 'single' ? 'text-green-500 font-medium' : 'text-muted-foreground'}`}>
                                                        {item.auctionPrice !== null ? formatGil(item.auctionPrice) : '—'}
                                                    </td>
                                                    <td className={`text-right pr-4 ${item.revenueSource === 'stack' ? 'text-green-500 font-medium' : 'text-muted-foreground'}`}>
                                                        {item.auctionStackPrice !== null ? formatGil(Math.round(item.auctionStackPrice / item.stackSize)) : '—'}
                                                    </td>
                                                    <td className="text-right pr-4">{revenue !== null ? formatGil(revenue) : '—'}</td>
                                                    <td className={`pr-4 text-right text-xs ${pct !== undefined && pct >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                                        {pct !== undefined ? `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%` : ''}
                                                    </td>
                                                    {showChance && (
                                                        <td className="text-right pr-4 text-muted-foreground">
                                                            {itemIdx === 0 ? formatChance(probs[tier.tier]) : ''}
                                                        </td>
                                                    )}
                                                    <td className={`text-right pr-4 font-medium ${marginSingle !== null ? (marginSingle >= 0 ? 'text-green-500' : 'text-red-500') : ''}`}>
                                                        {itemIdx === 0 && marginSingle !== null ? formatGil(marginSingle) : ''}
                                                    </td>
                                                    <td className={`text-right pr-4 font-medium ${marginStack !== null ? (marginStack >= 0 ? 'text-green-500' : 'text-red-500') : 'text-muted-foreground'}`}>
                                                        {itemIdx === 0 ? (marginStack !== null ? formatGil(marginStack) : '—') : ''}
                                                    </td>
                                                    <td className={`text-right font-medium ${tierStackProfit !== null ? (tierStackProfit >= 0 ? 'text-green-500' : 'text-red-500') : 'text-muted-foreground'}`}>
                                                        {itemIdx === 0 ? (tierStackProfit !== null ? formatGil(tierStackProfit) : '—') : ''}
                                                    </td>
                                                </tr>
                                            );
                                        }),
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                    <div className="py-4">
                        <p className="text-sm font-semibold mb-2">Cost (Ingredients)</p>
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-muted-foreground">
                                    <th className="text-left pr-4 font-normal">Item</th>
                                    <th className="text-right pr-4 font-normal">Qty</th>
                                    <th className="text-right pr-4 font-normal">Stack</th>
                                    <th className="text-center pr-4 font-normal">AH Single</th>
                                    <th className="text-center pr-4 font-normal">AH Stack/unit</th>
                                    <th className="text-center pr-4 font-normal">Vendor</th>
                                    <th className="text-right font-normal">Total</th>
                                </tr>
                            </thead>
                            <tbody>
                                {effectiveIngredients.map((ing) => {
                                    const available = [
                                        ing.auctionSinglePerUnit,
                                        ing.auctionStackPerUnit,
                                        ing.vendorPerUnit,
                                    ].filter((v): v is number => v !== null);
                                    const cheapest = available.length > 0 ? Math.min(...available) : null;
                                    return (
                                        <tr key={ing.itemId}>
                                            <td className="pr-4">{ing.name}</td>
                                            <td className="text-right pr-4">{ing.quantity}</td>
                                            <td className="text-right pr-4 text-muted-foreground">{ing.stackSize > 1 ? `×${ing.stackSize}` : '—'}</td>
                                            <PriceCell
                                                value={ing.auctionSinglePerUnit}
                                                isSelected={ing.priceSource === 'ah_single'}
                                                isCheapest={ing.auctionSinglePerUnit === cheapest}
                                                onClick={() => setOverride(ing.itemId, 'ah_single')}
                                            />
                                            <PriceCell
                                                value={ing.auctionStackPerUnit}
                                                isSelected={ing.priceSource === 'ah_stack'}
                                                isCheapest={ing.auctionStackPerUnit === cheapest}
                                                onClick={() => setOverride(ing.itemId, 'ah_stack')}
                                            />
                                            <PriceCell
                                                value={ing.vendorPerUnit}
                                                isSelected={ing.priceSource === 'vendor'}
                                                isCheapest={ing.vendorPerUnit === cheapest}
                                                onClick={() => setOverride(ing.itemId, 'vendor')}
                                            />
                                            <td className="text-right">{formatGil(ing.totalCost)}</td>
                                        </tr>
                                    );
                                })}
                                {Object.keys(overrides).length > 0 && (
                                    <tr>
                                        <td colSpan={3} />
                                        <td colSpan={3} className="text-center pt-1">
                                            <button
                                                className="text-xs rounded border px-2 py-0.5 text-muted-foreground hover:text-foreground cursor-pointer"
                                                onClick={() => setOverrides({})}
                                            >
                                                Reset to lowest
                                            </button>
                                        </td>
                                        <td />
                                    </tr>
                                )}
                                <tr className="border-t">
                                    <td colSpan={5} />
                                    <td className="text-muted-foreground pr-2 pt-1 text-right">Total cost</td>
                                    <td className="text-right pt-1 font-medium">{formatGil(totalCost)}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                    {showChance && (() => {
                            const nqQty = nqYield.quantity;

                            // Per-tier revenues using single prices, with cascade fallback for missing HQ tiers
                            const hq1Yield = synthesis.hqYields.find((t) => t.tier === 'HQ1');
                            const hq2Yield = synthesis.hqYields.find((t) => t.tier === 'HQ2');
                            const hq3Yield = synthesis.hqYields.find((t) => t.tier === 'HQ3');
                            const tierSingleRev = (tier: typeof hq1Yield) =>
                                tier
                                    ? tier.items.reduce((sum, item) => sum + (item.auctionPrice ?? 0) * item.quantity, 0)
                                    : null;
                            const nqSingleRev = nqYield.auctionPrice !== null ? nqYield.auctionPrice * nqQty : 0;
                            const effHq1Single = tierSingleRev(hq1Yield) ?? nqSingleRev;
                            const effHq2Single = tierSingleRev(hq2Yield) ?? effHq1Single;
                            const effHq3Single = tierSingleRev(hq3Yield) ?? effHq2Single;
                            const tierSingleRevenues = [nqSingleRev, effHq1Single, effHq2Single, effHq3Single];

                            // Same with stack prices
                            const hasStackPrices =
                                nqYield.auctionStackPrice !== null ||
                                synthesis.hqYields.some((tier) =>
                                    tier.items.some((item) => item.auctionStackPrice !== null),
                                );
                            const tierStackRev = (tier: typeof hq1Yield) =>
                                tier
                                    ? tier.items.reduce(
                                          (sum, item) =>
                                              sum +
                                              (item.auctionStackPrice !== null
                                                  ? Math.round(item.auctionStackPrice / item.stackSize) * item.quantity
                                                  : 0),
                                          0,
                                      )
                                    : null;
                            const nqStackRev =
                                nqYield.auctionStackPrice !== null
                                    ? Math.round(nqYield.auctionStackPrice / nqYield.stackSize) * nqQty
                                    : 0;
                            const tierStackRevenues = hasStackPrices
                                ? (() => {
                                      const effHq1Stack = tierStackRev(hq1Yield) ?? nqStackRev;
                                      const effHq2Stack = tierStackRev(hq2Yield) ?? effHq1Stack;
                                      const effHq3Stack = tierStackRev(hq3Yield) ?? effHq2Stack;
                                      return [nqStackRev, effHq1Stack, effHq2Stack, effHq3Stack];
                                  })()
                                : null;

                            // Cascade-resolve each HQ tier to the nearest lower existing tier,
                            // then accumulate probabilities into the tier they resolve to.
                            const hasHq1 = !!hq1Yield;
                            const hasHq2 = !!hq2Yield;
                            const hasHq3 = !!hq3Yield;
                            const resolveHq1 = hasHq1 ? 'HQ1' : 'NQ';
                            const resolveHq2 = hasHq2 ? 'HQ2' : resolveHq1;
                            const resolveHq3 = hasHq3 ? 'HQ3' : resolveHq2;
                            const effectiveProbs: Record<string, number> = {
                                NQ: probs.NQ,
                                HQ1: 0,
                                HQ2: 0,
                                HQ3: 0,
                            };
                            effectiveProbs[resolveHq1] += probs.HQ1;
                            effectiveProbs[resolveHq2] += probs.HQ2;
                            effectiveProbs[resolveHq3] += probs.HQ3;

                            const allProbs = [probs.NQ, probs.HQ1, probs.HQ2, probs.HQ3];
                            const expectedSingleRevenue = tierSingleRevenues.reduce(
                                (sum, rev, i) => sum + rev * allProbs[i],
                                0,
                            );
                            const expectedStackRevenue = tierStackRevenues
                                ? tierStackRevenues.reduce((sum, rev, i) => sum + rev * allProbs[i], 0)
                                : null;
                            const useStack =
                                expectedStackRevenue !== null && expectedStackRevenue > expectedSingleRevenue;
                            const tierRevenues = useStack ? tierStackRevenues! : tierSingleRevenues;
                            const expectedRevenue = useStack ? expectedStackRevenue! : expectedSingleRevenue;
                            const tierContribs = [
                                { label: 'NQ', revenue: tierRevenues[0], prob: effectiveProbs.NQ },
                                ...(hasHq1 ? [{ label: 'HQ1', revenue: tierRevenues[1], prob: effectiveProbs.HQ1 }] : []),
                                ...(hasHq2 ? [{ label: 'HQ2', revenue: tierRevenues[2], prob: effectiveProbs.HQ2 }] : []),
                                ...(hasHq3 ? [{ label: 'HQ3', revenue: tierRevenues[3], prob: effectiveProbs.HQ3 }] : []),
                            ].filter((t) => t.prob > 0);
                            const expectedProfit = Math.round((expectedRevenue - totalCost) / nqQty);
                            return (
                                <div className="pt-4">
                                    <p className="text-sm font-semibold mb-2">Expected Profit</p>
                                    <table className="text-sm w-1/2">
                                        <thead>
                                            <tr className="text-muted-foreground">
                                                <th className="text-left pr-4 font-normal">Tier</th>
                                                <th className="text-right pr-4 font-normal">Revenue</th>
                                                <th className="text-right pr-4 font-normal">Chance</th>
                                                <th className="text-right font-normal">Weighted</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {tierContribs.map((t) => (
                                                <tr key={t.label}>
                                                    <td className="pr-4"><TierBadge tier={t.label} /></td>
                                                    <td className="text-right pr-4 text-muted-foreground">{formatGil(Math.round(t.revenue))}</td>
                                                    <td className="text-right pr-4 text-muted-foreground">{formatChance(t.prob)}</td>
                                                    <td className="text-right">{formatGil(Math.round(t.revenue * t.prob))}</td>
                                                </tr>
                                            ))}
                                            <tr className="border-t text-muted-foreground">
                                                <td colSpan={3} className="pr-4 pt-1">Expected revenue</td>
                                                <td className="text-right pt-1">{formatGil(Math.round(expectedRevenue))}</td>
                                            </tr>
                                            <tr className="text-muted-foreground">
                                                <td colSpan={3} className="pr-4">− Cost</td>
                                                <td className="text-right">{formatGil(totalCost)}</td>
                                            </tr>
                                            {nqQty > 1 && (
                                                <tr className="text-muted-foreground">
                                                    <td colSpan={3} className="pr-4">÷ Quantity</td>
                                                    <td className="text-right">{nqQty}</td>
                                                </tr>
                                            )}
                                            <tr className="border-t font-medium">
                                                <td colSpan={3} className="pr-4 pt-1">
                                                    {nqQty > 1 ? 'Profit / item' : 'Profit'}
                                                </td>
                                                <td className={`text-right pt-1 ${expectedProfit >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                                    {formatGil(expectedProfit)}
                                                </td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            );
                        })()}
                </div>
            </TableCell>
        </TableRow>
    );
};

const CRAFT_PARAMS = {
    Alchemy: 'alchemy',
    Bonecraft: 'bonecraft',
    Clothcraft: 'clothcraft',
    Cooking: 'cooking',
    Goldsmithing: 'goldsmithing',
    Leathercraft: 'leathercraft',
    Smithing: 'smithing',
    Woodworking: 'woodworking',
} as const;

const SKILLS_STORAGE_KEY = 'ffxi-crafting-skills';

const loadSkillsFromStorage = (): Partial<Record<string, number>> => {
    try {
        const raw = localStorage.getItem(SKILLS_STORAGE_KEY);
        return raw ? (JSON.parse(raw) as Partial<Record<string, number>>) : {};
    } catch {
        return {};
    }
};

const SynthesisPage = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const sortBy = (searchParams.get('sortBy') ?? 'single') as 'single' | 'stack' | 'ah-slot' | 'daily' | 'stack-total';
    const page = parseInt(searchParams.get('page') ?? '1', 10);
    const yieldName = searchParams.get('yieldName') ?? '';
    const minRate = searchParams.get('minRate') ?? 'average';

    const [skillValues, setSkillValues] = useState<Partial<Record<string, number>>>(
        loadSkillsFromStorage,
    );
    const [skillsEnabled, setSkillsEnabled] = useState(false);

    const hasSkills = skillsEnabled && Object.keys(skillValues).length > 0;

    const playerSkills: PlayerSkills = hasSkills
        ? (Object.fromEntries(
              CRAFTS.flatMap((craft) => {
                  const v = skillValues[craft];
                  return v !== undefined ? [[craft, v]] : [];
              }),
          ) as PlayerSkills)
        : {};

    const apiSkills: Record<string, string> = hasSkills
        ? Object.fromEntries(
              CRAFTS.flatMap((craft) => {
                  const v = skillValues[craft];
                  return v !== undefined ? [[CRAFT_PARAMS[craft], String(v)]] : [];
              }),
          )
        : {};

    const apiSkillsKey = hasSkills ? JSON.stringify(apiSkills) : '';

    const [data, setData] = useState<{ syntheses: ProfitableSynthesis[]; total: number } | null>(
        null,
    );
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [expandedId, setExpandedId] = useState<number | null>(null);

    useEffect(() => {
        setExpandedId(null);
        const load = async () => {
            setLoading(true);
            setError(null);
            try {
                const res = await client.api.syntheses.profitable.$get({
                    query: {
                        sortBy,
                        page: String(page),
                        perPage: String(PER_PAGE),
                        ...(yieldName ? { yieldName } : {}),
                        ...(minRate && minRate !== 'any' ? { minRate: minRate as 'very-fast' | 'fast' | 'average' | 'slow' | 'very-slow' } : {}),
                        ...apiSkills,
                    },
                });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                setData(await res.json());
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Unknown error');
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [sortBy, page, yieldName, minRate, apiSkillsKey]);

    const totalPages = data ? Math.ceil(data.total / PER_PAGE) : 1;

    const setSort = (value: 'single' | 'stack' | 'ah-slot' | 'daily' | 'stack-total') =>
        setSearchParams({ ...Object.fromEntries(searchParams), sortBy: value, page: '1' });
    const setPage = (p: number) =>
        setSearchParams({ ...Object.fromEntries(searchParams), page: String(p) });
    const setYieldName = (value: string) => {
        const next = new URLSearchParams(searchParams);
        if (value) {
            next.set('yieldName', value);
        } else {
            next.delete('yieldName');
        }
        next.set('page', '1');
        setSearchParams(next);
    };
    const setMinRate = (value: string) => {
        const next = new URLSearchParams(searchParams);
        next.set('minRate', value);
        next.set('page', '1');
        setSearchParams(next);
    };
    const setSkill = (craft: string, value: string) => {
        const parsed = parseInt(value, 10);
        const next = { ...skillValues };
        if (isNaN(parsed) || parsed === 0) {
            delete next[craft];
        } else {
            next[craft] = parsed;
        }
        setSkillValues(next);
        localStorage.setItem(SKILLS_STORAGE_KEY, JSON.stringify(next));
    };

    return (
        <div className="p-6">
            <h1 className="mb-6 text-2xl font-bold">Profitable Syntheses</h1>

            <div className="mb-4 flex items-center gap-4">
                <Select value={sortBy} onValueChange={(v) => setSort(v as 'single' | 'stack' | 'ah-slot' | 'daily' | 'stack-total')}>
                    <SelectTrigger className="w-48">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="single">By Unit Profit (Single)</SelectItem>
                        <SelectItem value="stack">By Unit Profit (Stack)</SelectItem>
                        <SelectItem value="stack-total">By Stack Profit</SelectItem>
                        <SelectItem value="ah-slot">By Most Profitable AH Slot</SelectItem>
                        <SelectItem value="daily">By Daily Profit</SelectItem>
                    </SelectContent>
                </Select>
                <input
                    type="search"
                    placeholder="Search yield item…"
                    value={yieldName}
                    onChange={(e) => setYieldName(e.target.value)}
                    className="rounded-md border px-3 py-1.5 text-sm w-52"
                />
                <Select value={minRate} onValueChange={setMinRate}>
                    <SelectTrigger className="w-36">
                        <SelectValue placeholder="Any rate" />
                    </SelectTrigger>
                    <SelectContent>
                        {RATE_FILTER_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                                {opt.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            <details className="mb-4">
                <summary className="cursor-pointer text-sm text-muted-foreground select-none">
                    Crafting Skills{' '}
                    {Object.keys(skillValues).length > 0 && (skillsEnabled ? '(active)' : '(saved)')}
                    <label className="inline-flex items-center gap-2 ml-3" onClick={(e) => e.stopPropagation()}>
                        <input
                            type="checkbox"
                            checked={skillsEnabled}
                            onChange={(e) => setSkillsEnabled(e.target.checked)}
                        />
                        Include Crafting Skills in Filter
                    </label>
                </summary>
                <div className="mt-2">
                    <div className="grid grid-cols-2 gap-x-8 gap-y-1.5 text-sm sm:grid-cols-4">
                        {CRAFTS.map((craft) => (
                            <label key={craft} className="flex items-center gap-2">
                                <span className="w-28">{craft}</span>
                                <input
                                    type="number"
                                    min={0}
                                    max={110}
                                    value={skillValues[craft] ?? ''}
                                    onChange={(e) => setSkill(craft, e.target.value)}
                                    className="w-16 rounded border px-1 py-0.5"
                                    placeholder="—"
                                />
                            </label>
                        ))}
                    </div>
                </div>
            </details>

            {data && (
                <p className="mb-4 text-sm text-muted-foreground">
                    {data.total} synthes{data.total === 1 ? 'is' : 'es'} found{hasSkills ? ' and profits adjusted matching your Craft Skills' : ' matching filters'}
                </p>
            )}

            {loading && <p className="text-muted-foreground">Loading...</p>}
            {error && <p className="text-destructive">Error: {error}</p>}

            {!loading && !error && data && data.syntheses.length > 0 && (
                <TooltipProvider>
                <>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Craft</TableHead>
                                <TableHead>Crystal</TableHead>
                                <TableHead>NQ Yield</TableHead>
                                <TableHead className="text-right">AH Price</TableHead>
                                <TableHead className="text-right">AH Stack</TableHead>
                                <TableHead className="text-right">Unit Profit (Single)</TableHead>
                                <TableHead className="text-right">Single Rate</TableHead>
                                <TableHead className="text-right">Unit Profit (Stack)</TableHead>
                                <TableHead className="text-right">Stack Profit</TableHead>
                                <TableHead className="text-right">Stack Rate</TableHead>
                                <TableHead className="text-right">Updated</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {data.syntheses.map((s) => {
                                const craftReqs = [s.mainCraft, ...s.subCrafts];
                                const probs = hasSkills
                                    ? getSynthesisTierProbabilities(craftReqs, playerSkills)
                                    : null;
                                const hqRate =
                                    probs !== null && probs.tier >= 0
                                        ? probs.HQ1 + probs.HQ2 + probs.HQ3
                                        : null;
                                return (
                                <>
                                    <TableRow
                                        key={s.id}
                                        className="cursor-pointer"
                                        onClick={() =>
                                            setExpandedId(expandedId === s.id ? null : s.id)
                                        }
                                    >
                                        <TableCell>
                                            <div className="flex flex-wrap items-center gap-1">
                                                <span
                                                    className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${getCraftColor(s.mainCraft.craft)}`}
                                                >
                                                    {s.mainCraft.craft}
                                                </span>
                                                <span className="text-muted-foreground text-xs">
                                                    {s.mainCraft.craftLevel}
                                                </span>
                                            </div>
                                            {s.subCrafts.length > 0 && (
                                                <div className="mt-1 flex flex-col gap-0.5">
                                                    {s.subCrafts.map((sc) => (
                                                        <div key={sc.craft} className="flex items-center gap-1">
                                                            <span className={`inline-block rounded px-1.5 py-0 text-xs font-medium ${getCraftColor(sc.craft)}`}>
                                                                {sc.craft}
                                                            </span>
                                                            <span className="text-muted-foreground text-xs">{sc.craftLevel}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <span
                                                className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${getCrystalColor(s.crystal)}`}
                                            >
                                                {s.crystal}
                                            </span>
                                        </TableCell>
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <TableCell className="cursor-default">
                                                    <span className="flex items-center gap-2">
                                                        <span>
                                                            {s.nqYield.name}
                                                            {s.nqYield.quantity > 1 ? ` ×${s.nqYield.quantity}` : ''}
                                                        </span>
                                                        {hqRate !== null && probs !== null && (
                                                            <HqTierBadge tier={probs.tier} hqRate={hqRate} />
                                                        )}
                                                    </span>
                                                </TableCell>
                                            </TooltipTrigger>
                                                <TooltipContent side="right">
                                                    <div className="space-y-1">
                                                        <div className="flex justify-between gap-4">
                                                            <span className="flex items-center gap-1.5">
                                                                <TierBadge tier="NQ" />
                                                                {s.nqYield.name}
                                                                {s.nqYield.quantity > 1 ? ` ×${s.nqYield.quantity}` : ''}
                                                            </span>
                                                            <span className={`font-medium ${s.nqYield.revenue >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                                                {formatGil(s.nqYield.revenue)}
                                                            </span>
                                                        </div>
                                                        {s.hqYields.map((tier) =>
                                                            tier.items.map((item) => (
                                                                <div key={`${tier.tier}-${item.itemId}`} className="flex justify-between gap-4">
                                                                    <span className="flex items-center gap-1.5">
                                                                        <TierBadge tier={tier.tier} />
                                                                        {item.name}
                                                                        {item.quantity > 1 ? ` ×${item.quantity}` : ''}
                                                                    </span>
                                                                    <span className={`font-medium ${item.revenue >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                                                        {formatGil(item.revenue)}
                                                                    </span>
                                                                </div>
                                                            )),
                                                        )}
                                                    </div>
                                                </TooltipContent>
                                            </Tooltip>
                                        <TableCell className="text-right">
                                            {s.nqYield.auctionPrice !== null ? formatGil(s.nqYield.auctionPrice) : '—'}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            {s.nqYield.auctionStackPrice !== null
                                                ? formatGil(s.nqYield.auctionStackPrice)
                                                : '—'}
                                        </TableCell>
                                        <ProfitCell
                                            value={hasSkills ? s.expectedUnitProfitAsSingle : s.unitProfitAsSingle}
                                        />
                                        <RateCell salesPerDay={s.salesPerDay} />
                                        <ProfitCell
                                            value={hasSkills ? s.expectedUnitProfitAsStack : s.unitProfitAsStack}
                                        />
                                        <ProfitCell
                                            value={hasSkills ? s.expectedStackProfit : s.stackProfit}
                                        />
                                        <RateCell salesPerDay={s.stackSalesPerDay} />
                                        <TableCell className="text-right text-muted-foreground text-xs">
                                            {formatUpdatedAt(s.pricesAsOf)}
                                            <div className="text-muted-foreground/60">calc {formatUpdatedAt(s.calculatedAt)}</div>
                                        </TableCell>
                                    </TableRow>
                                    {expandedId === s.id && <ExpandedRow synthesis={s} playerSkills={playerSkills} />}
                                </>
                                );
                            })}
                        </TableBody>
                    </Table>

                    <div className="mt-4 flex items-center justify-between">
                        <button
                            className="rounded-md border px-3 py-1.5 text-sm disabled:opacity-50"
                            disabled={page <= 1}
                            onClick={() => setPage(page - 1)}
                        >
                            Previous
                        </button>
                        <span className="text-sm text-muted-foreground">
                            Page {page} of {totalPages}
                        </span>
                        <button
                            className="rounded-md border px-3 py-1.5 text-sm disabled:opacity-50"
                            disabled={page >= totalPages}
                            onClick={() => setPage(page + 1)}
                        >
                            Next
                        </button>
                    </div>
                </>
                </TooltipProvider>
            )}

            {!loading && !error && data && data.syntheses.length === 0 && (
                <p className="text-muted-foreground">No profitable syntheses found.</p>
            )}
        </div>
    );
};

export default SynthesisPage;
