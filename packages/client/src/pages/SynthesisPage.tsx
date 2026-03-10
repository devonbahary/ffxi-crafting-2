import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { hc } from 'hono/client';
import type { AppType, ProfitableSynthesis } from '@ffxi-crafting/api';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatGil } from '@/lib/utils';
import { getCraftColor, getCrystalColor } from '@/lib/craft-colors';

const client = hc<AppType>('/');

const PER_PAGE = 25;

const ProfitCell = ({ value }: { value: number | null }) => {
    if (value === null) return <TableCell className="text-right text-muted-foreground">—</TableCell>;
    const color = value >= 0 ? 'text-green-500' : 'text-red-500';
    return <TableCell className={`text-right font-medium ${color}`}>{formatGil(value)}</TableCell>;
};

const ExpandedRow = ({ synthesis }: { synthesis: ProfitableSynthesis }) => {
    const totalCost = synthesis.ingredients.reduce((sum, i) => sum + i.totalCost, 0);
    return (
        <TableRow className="bg-muted/40 hover:bg-muted/40">
            <TableCell colSpan={7} className="p-4">
                <div className="flex gap-8">
                    <div>
                        <p className="text-sm font-semibold mb-2">Ingredients</p>
                        <table className="text-sm">
                            <thead>
                                <tr className="text-muted-foreground">
                                    <th className="text-left pr-6 font-normal">Item</th>
                                    <th className="text-right pr-6 font-normal">Qty</th>
                                    <th className="text-right pr-6 font-normal">Unit Cost</th>
                                    <th className="text-right font-normal">Total</th>
                                </tr>
                            </thead>
                            <tbody>
                                {synthesis.ingredients.map((ing) => (
                                    <tr key={ing.itemId}>
                                        <td className="pr-6">{ing.name}</td>
                                        <td className="text-right pr-6">{ing.quantity}</td>
                                        <td className="text-right pr-6">{formatGil(ing.unitCost)}</td>
                                        <td className="text-right">{formatGil(ing.totalCost)}</td>
                                    </tr>
                                ))}
                                <tr className="border-t text-muted-foreground">
                                    <td colSpan={3} className="pr-6 pt-1">Total cost</td>
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
                </div>
            </TableCell>
        </TableRow>
    );
};

const SynthesisPage = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const sortBy = (searchParams.get('sortBy') ?? 'single') as 'single' | 'stack' | 'best';
    const page = parseInt(searchParams.get('page') ?? '1', 10);

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
                    query: { sortBy, page: String(page), perPage: String(PER_PAGE) },
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
    }, [sortBy, page]);

    const totalPages = data ? Math.ceil(data.total / PER_PAGE) : 1;

    const setSort = (value: 'single' | 'stack' | 'best') =>
        setSearchParams({ sortBy: value, page: '1' });
    const setPage = (p: number) => setSearchParams({ sortBy, page: String(p) });

    return (
        <div className="p-6">
            <h1 className="mb-6 text-2xl font-bold">Profitable Syntheses</h1>

            <div className="mb-4 flex items-center gap-4">
                <Select value={sortBy} onValueChange={(v) => setSort(v as 'single' | 'stack' | 'best')}>
                    <SelectTrigger className="w-48">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="single">By Single Profit</SelectItem>
                        <SelectItem value="stack">By Stack Profit</SelectItem>
                        <SelectItem value="best">Best of Either</SelectItem>
                    </SelectContent>
                </Select>
                {data && (
                    <span className="text-sm text-muted-foreground">{data.total} syntheses</span>
                )}
            </div>

            {loading && <p className="text-muted-foreground">Loading...</p>}
            {error && <p className="text-destructive">Error: {error}</p>}

            {!loading && !error && data && data.syntheses.length > 0 && (
                <>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Craft</TableHead>
                                <TableHead>Crystal</TableHead>
                                <TableHead>NQ Yield</TableHead>
                                <TableHead className="text-right">AH Price</TableHead>
                                <TableHead className="text-right">AH Stack</TableHead>
                                <TableHead className="text-right">Profit/Single</TableHead>
                                <TableHead className="text-right">Profit/Stack</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {data.syntheses.map((s) => (
                                <>
                                    <TableRow
                                        key={s.id}
                                        className="cursor-pointer"
                                        onClick={() =>
                                            setExpandedId(expandedId === s.id ? null : s.id)
                                        }
                                    >
                                        <TableCell>
                                            <span
                                                className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${getCraftColor(s.mainCraft.craft)}`}
                                            >
                                                {s.mainCraft.craft}
                                            </span>{' '}
                                            <span className="text-muted-foreground text-xs">
                                                {s.mainCraft.craftLevel}
                                            </span>
                                        </TableCell>
                                        <TableCell>
                                            <span
                                                className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${getCrystalColor(s.crystal)}`}
                                            >
                                                {s.crystal}
                                            </span>
                                        </TableCell>
                                        <TableCell>
                                            {s.nqYield.name}
                                            {s.nqYield.quantity > 1
                                                ? ` ×${s.nqYield.quantity}`
                                                : ''}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            {formatGil(s.nqYield.auctionPrice)}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            {s.nqYield.auctionStackPrice !== null
                                                ? formatGil(s.nqYield.auctionStackPrice)
                                                : '—'}
                                        </TableCell>
                                        <ProfitCell value={s.profitPerSingle} />
                                        <ProfitCell value={s.profitPerStack} />
                                    </TableRow>
                                    {expandedId === s.id && <ExpandedRow synthesis={s} />}
                                </>
                            ))}
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
            )}

            {!loading && !error && data && data.syntheses.length === 0 && (
                <p className="text-muted-foreground">No profitable syntheses found.</p>
            )}
        </div>
    );
};

export default SynthesisPage;
