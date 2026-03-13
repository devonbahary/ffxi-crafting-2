import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { hc } from 'hono/client';
import type { AppType, ProfitableSynthesis } from '@ffxi-crafting/api';
import { CRAFTS } from '@ffxi-crafting/types';
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
    isCheapest,
}: {
    value: number | null;
    isCheapest: boolean;
}) => (
    <td className={`text-right pr-4 ${isCheapest ? 'text-green-500 font-medium' : 'text-muted-foreground'}`}>
        {value !== null ? formatGil(value) : '—'}
    </td>
);

const ExpandedRow = ({
    synthesis,
    playerSkills,
}: {
    synthesis: ProfitableSynthesis;
    playerSkills: PlayerSkills;
}) => {
    const totalCost = synthesis.ingredients.reduce((sum, i) => sum + i.totalCost, 0);
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
            <TableCell colSpan={10} className="p-4 space-y-4">
                <div>
                    <p className="text-sm font-semibold mb-2">Sale prices</p>
                    <table className="text-sm">
                        <thead>
                            <tr className="text-muted-foreground">
                                <th className="text-left pr-4 font-normal">Tier</th>
                                <th className="text-left pr-8 font-normal">Item</th>
                                <th className="text-right pr-4 font-normal">Qty</th>
                                <th className="text-right pr-4 font-normal">Stack</th>
                                <th className="text-right pr-4 font-normal">AH Single</th>
                                <th className="text-right pr-4 font-normal">AH Stack/unit</th>
                                <th className="text-right pr-4 font-normal">Revenue</th>
                                <th className="w-16 text-right pr-6 font-normal">Δ%</th>
                                {showChance && <th className="text-right pr-4 font-normal">Chance</th>}
                                <th className="text-right pr-4 font-normal">Unit Profit (Single)</th>
                                <th className="text-right font-normal">Unit Profit (Stack)</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td className="pr-4"><TierBadge tier="NQ" /></td>
                                <td className="pr-8">{nqYield.name}</td>
                                <td className="text-right pr-4">{nqYield.quantity}</td>
                                <td className="text-right pr-4 text-muted-foreground">{nqYield.stackSize > 1 ? `×${nqYield.stackSize}` : '—'}</td>
                                <td className={`text-right pr-4 ${nqYield.revenueSource === 'single' ? 'text-green-500 font-medium' : 'text-muted-foreground'}`}>
                                    {nqYield.auctionPrice !== null ? formatGil(nqYield.auctionPrice) : '—'}
                                </td>
                                <td className={`text-right pr-4 ${nqYield.revenueSource === 'stack' ? 'text-green-500 font-medium' : 'text-muted-foreground'}`}>
                                    {nqYield.auctionStackPrice !== null ? formatGil(Math.round(nqYield.auctionStackPrice / nqYield.stackSize)) : '—'}
                                </td>
                                <td className="text-right pr-4">{formatGil(nqYield.revenue)}</td>
                                <td className="w-16 pr-6" />
                                {showChance && <td className="text-right pr-4 text-muted-foreground">{formatChance(probs.NQ)}</td>}
                                {(() => {
                                    const qty = nqYield.quantity;
                                    const singleRev = nqYield.auctionPrice !== null ? nqYield.auctionPrice * qty : null;
                                    const stackRev = nqYield.auctionStackPrice !== null ? Math.round(nqYield.auctionStackPrice / nqYield.stackSize) * qty : null;
                                    const marginSingle = singleRev !== null ? Math.round((singleRev - totalCost) / qty) : null;
                                    const marginStack = stackRev !== null ? Math.round((stackRev - totalCost) / qty) : null;
                                    return (
                                        <>
                                            <td className={`text-right pr-4 font-medium ${marginSingle !== null ? (marginSingle >= 0 ? 'text-green-500' : 'text-red-500') : 'text-muted-foreground'}`}>
                                                {marginSingle !== null ? formatGil(marginSingle) : '—'}
                                            </td>
                                            <td className={`text-right font-medium ${marginStack !== null ? (marginStack >= 0 ? 'text-green-500' : 'text-red-500') : 'text-muted-foreground'}`}>
                                                {marginStack !== null ? formatGil(marginStack) : '—'}
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
                                    const marginStack = tierStackRev !== null && tier.items.some((it) => it.auctionStackPrice !== null) ? Math.round((tierStackRev - totalCost) / tierQty) : null;
                                    return (
                                        <tr key={`${tier.tier}-${item.itemId}`}>
                                            <td className="pr-4"><TierBadge tier={tier.tier} /></td>
                                            <td className="pr-8">{item.name}</td>
                                            <td className="text-right pr-4">{item.quantity}</td>
                                            <td className="text-right pr-4 text-muted-foreground">{item.stackSize > 1 ? `×${item.stackSize}` : '—'}</td>
                                            <td className={`text-right pr-4 ${item.revenueSource === 'single' ? 'text-green-500 font-medium' : 'text-muted-foreground'}`}>
                                                {item.auctionPrice !== null ? formatGil(item.auctionPrice) : '—'}
                                            </td>
                                            <td className={`text-right pr-4 ${item.revenueSource === 'stack' ? 'text-green-500 font-medium' : 'text-muted-foreground'}`}>
                                                {item.auctionStackPrice !== null ? formatGil(Math.round(item.auctionStackPrice / item.stackSize)) : '—'}
                                            </td>
                                            <td className="text-right pr-4">{revenue !== null ? formatGil(revenue) : '—'}</td>
                                            <td className={`w-16 pr-6 text-right text-xs ${pct !== undefined && pct >= 0 ? 'text-green-500' : 'text-red-500'}`}>
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
                                            <td className={`text-right font-medium ${marginStack !== null ? (marginStack >= 0 ? 'text-green-500' : 'text-red-500') : 'text-muted-foreground'}`}>
                                                {itemIdx === 0 ? (marginStack !== null ? formatGil(marginStack) : '—') : ''}
                                            </td>
                                        </tr>
                                    );
                                }),
                            )}
                        </tbody>
                    </table>
                    {showChance && (() => {
                        const tierContribs: { label: string; revenue: number; prob: number }[] = [
                            { label: 'NQ', revenue: nqRevenue, prob: probs.NQ },
                            ...synthesis.hqYields.map((tier, i) => ({
                                label: tier.tier,
                                revenue: tierRevenueSeq[i + 1],
                                prob: probs[tier.tier],
                            })),
                        ];
                        const expectedRevenue = tierContribs.reduce((sum, t) => sum + t.revenue * t.prob, 0);
                        const expectedProfit = Math.round(expectedRevenue - totalCost);
                        return (
                            <div className="mt-3 text-sm">
                                <p className="text-muted-foreground font-medium mb-1">Expected Profit</p>
                                <table className="text-xs text-muted-foreground">
                                    <tbody>
                                        {tierContribs.map((t) => (
                                            <tr key={t.label}>
                                                <td className="pr-3"><TierBadge tier={t.label} /></td>
                                                <td className="pr-2 text-right">{formatGil(Math.round(t.revenue))}</td>
                                                <td className="pr-2">×</td>
                                                <td className="pr-3 w-12">{formatChance(t.prob)}</td>
                                                <td className="pr-2">=</td>
                                                <td className="text-right">{formatGil(Math.round(t.revenue * t.prob))}</td>
                                            </tr>
                                        ))}
                                        <tr className="border-t">
                                            <td colSpan={5} className="pr-2 pt-1">Expected revenue</td>
                                            <td className="text-right pt-1">{formatGil(Math.round(expectedRevenue))}</td>
                                        </tr>
                                        <tr>
                                            <td colSpan={5} className="pr-2">− Cost</td>
                                            <td className="text-right">{formatGil(totalCost)}</td>
                                        </tr>
                                        <tr className="border-t">
                                            <td colSpan={5} className="pr-2 pt-1 font-medium text-foreground">Profit</td>
                                            <td className={`text-right pt-1 font-medium ${expectedProfit >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                                {formatGil(expectedProfit)}
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        );
                    })()}
                </div>

                <div>
                    <p className="text-sm font-semibold mb-2">Ingredients</p>
                    <table className="text-sm">
                        <thead>
                            <tr className="text-muted-foreground">
                                <th className="text-left pr-8 font-normal">Item</th>
                                <th className="text-right pr-4 font-normal">Qty</th>
                                <th className="text-right pr-4 font-normal">Stack</th>
                                <th className="text-right pr-4 font-normal">AH Single</th>
                                <th className="text-right pr-4 font-normal">AH Stack/unit</th>
                                <th className="text-right pr-4 font-normal">Vendor</th>
                                <th className="text-right font-normal">Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            {synthesis.ingredients.map((ing) => (
                                <tr key={ing.itemId}>
                                    <td className="pr-8">{ing.name}</td>
                                    <td className="text-right pr-4">{ing.quantity}</td>
                                    <td className="text-right pr-4 text-muted-foreground">{ing.stackSize > 1 ? `×${ing.stackSize}` : '—'}</td>
                                    <PriceCell
                                        value={ing.auctionSinglePerUnit}
                                        isCheapest={ing.priceSource === 'ah_single'}
                                    />
                                    <PriceCell
                                        value={ing.auctionStackPerUnit}
                                        isCheapest={ing.priceSource === 'ah_stack'}
                                    />
                                    <PriceCell
                                        value={ing.vendorPerUnit}
                                        isCheapest={ing.priceSource === 'vendor'}
                                    />
                                    <td className="text-right font-medium">{formatGil(ing.totalCost)}</td>
                                </tr>
                            ))}
                            <tr className="border-t text-muted-foreground">
                                <td colSpan={6} className="pr-4 pt-1">Total cost</td>
                                <td className="text-right pt-1">{formatGil(totalCost)}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                {synthesis.subCrafts.length > 0 && (
                    <div>
                        <p className="text-sm font-semibold mb-2">Sub-crafts</p>
                        <ul className="text-sm space-y-0.5">
                            {synthesis.subCrafts.map((sc) => (
                                <li key={sc.craft}>
                                    {sc.craft} {sc.craftLevel}
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
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
    const sortBy = (searchParams.get('sortBy') ?? 'single') as 'single' | 'stack' | 'best' | 'daily';
    const page = parseInt(searchParams.get('page') ?? '1', 10);
    const yieldName = searchParams.get('yieldName') ?? '';

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
    }, [sortBy, page, yieldName, apiSkillsKey]);

    const totalPages = data ? Math.ceil(data.total / PER_PAGE) : 1;

    const setSort = (value: 'single' | 'stack' | 'best' | 'daily') =>
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
                <Select value={sortBy} onValueChange={(v) => setSort(v as 'single' | 'stack' | 'best')}>
                    <SelectTrigger className="w-48">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="single">By Unit Profit (Single)</SelectItem>
                        <SelectItem value="stack">By Unit Profit (Stack)</SelectItem>
                        <SelectItem value="best">Best of Either</SelectItem>
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
                <label className="flex items-center gap-2 text-sm">
                    <input
                        type="checkbox"
                        checked={skillsEnabled}
                        onChange={(e) => setSkillsEnabled(e.target.checked)}
                    />
                    Crafting Skills
                </label>
                {data && (
                    <span className="text-sm text-muted-foreground">{data.total} syntheses</span>
                )}
            </div>

            <details className="mb-4">
                <summary className="cursor-pointer text-sm text-muted-foreground select-none">
                    Crafting Skills{' '}
                    {Object.keys(skillValues).length > 0 && (skillsEnabled ? '(active)' : '(saved)')}
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
                                <TableHead className="text-right">Rate</TableHead>
                                <TableHead className="text-right">Unit Profit (Stack)</TableHead>
                                <TableHead className="text-right">Rate</TableHead>
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
                                                {hqRate !== null && probs !== null && (
                                                    <HqTierBadge tier={probs.tier} hqRate={hqRate} />
                                                )}
                                            </div>
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
                                                    {s.nqYield.name}
                                                    {s.nqYield.quantity > 1
                                                        ? ` ×${s.nqYield.quantity}`
                                                        : ''}
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
                                        <RateCell salesPerDay={s.stackSalesPerDay} />
                                        <TableCell className="text-right text-muted-foreground text-xs">
                                            {formatUpdatedAt(s.priceUpdatedAt)}
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
