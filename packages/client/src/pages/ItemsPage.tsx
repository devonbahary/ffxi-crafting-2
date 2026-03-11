import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { hc } from 'hono/client';
import type { AppType, ItemDetail, SynthesisDetail } from '@ffxi-crafting/api';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { SynthesisRow } from '@/SynthesisRow';
import { formatGil } from '@/lib/utils';
import { getSalesRating, getRatingColor } from '@/lib/sales-rating';

const client = hc<AppType>('/');

const RatingCell = ({ salesPerDay }: { salesPerDay: number | null }) => {
    if (salesPerDay === null) return <TableCell>—</TableCell>;
    const rating = getSalesRating(salesPerDay);
    return (
        <TableCell>
            <span className={getRatingColor(rating)}>
                {rating}{' '}
                <span className="text-muted-foreground">
                    ({salesPerDay.toLocaleString(undefined, { maximumFractionDigits: 2 })}/day)
                </span>
            </span>
        </TableCell>
    );
};

const EXPANDED_COL_SPAN = 7;

const ItemExpandedRow = ({ item }: { item: ItemDetail }) => {
    const [syntheses, setSyntheses] = useState<SynthesisDetail[] | null>(null);
    const [ingredientSyntheses, setIngredientSyntheses] = useState<SynthesisDetail[] | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        Promise.all([
            client.api.items[':itemId'].syntheses
                .$get({ param: { itemId: String(item.id) } })
                .then((res) => res.json()),
            client.api.items[':itemId']['ingredient-syntheses']
                .$get({ param: { itemId: String(item.id) } })
                .then((res) => res.json()),
        ])
            .then(([yieldSyntheses, ingSyntheses]) => {
                setSyntheses(yieldSyntheses);
                setIngredientSyntheses(ingSyntheses);
            })
            .finally(() => setLoading(false));
    }, [item.id]);

    return (
        <TableRow className="bg-muted/40 hover:bg-muted/40">
            <TableCell colSpan={EXPANDED_COL_SPAN} className="p-4">
                {loading && <p className="text-muted-foreground text-sm">Loading...</p>}

                {!loading && syntheses && syntheses.length > 0 && (
                    <div className="mb-4">
                        <p className="text-sm font-semibold mb-2">Syntheses (yields this item)</p>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-12 text-center">Lv</TableHead>
                                    <TableHead className="w-36">Crystal</TableHead>
                                    <TableHead>Yields</TableHead>
                                    <TableHead>Ingredients</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {syntheses.map((s) => (
                                    <SynthesisRow key={s.id} synthesis={s} highlightItemId={item.id} />
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                )}

                {!loading && ingredientSyntheses && ingredientSyntheses.length > 0 && (
                    <div className="mb-4">
                        <p className="text-sm font-semibold mb-2">Syntheses (uses this item)</p>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-12 text-center">Lv</TableHead>
                                    <TableHead className="w-36">Crystal</TableHead>
                                    <TableHead>Yields</TableHead>
                                    <TableHead>Ingredients</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {ingredientSyntheses.map((s) => (
                                    <SynthesisRow
                                        key={s.id}
                                        synthesis={s}
                                        highlightIngredientItemId={item.id}
                                    />
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                )}

                {item.vendors.length > 0 && (
                    <div>
                        <p className="text-sm font-semibold mb-2">Vendors</p>
                        <ul className="text-sm space-y-1">
                            {item.vendors.map((v) => {
                                const location = [v.vendorZone, v.vendorLocation]
                                    .filter(Boolean)
                                    .join(', ');
                                return (
                                    <li key={v.vendorName}>
                                        {v.vendorName}
                                        {location ? ` (${location})` : ''} —{' '}
                                        {formatGil(v.price)}
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                )}
            </TableCell>
        </TableRow>
    );
};

const PER_PAGE = 50;

const ItemsPage = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const query = searchParams.get('name') ?? '';
    const page = parseInt(searchParams.get('page') ?? '1', 10);

    const [data, setData] = useState<{ items: ItemDetail[]; total: number } | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [expandedItemId, setExpandedItemId] = useState<number | null>(null);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        setExpandedItemId(null);
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(async () => {
            setLoading(true);
            setError(null);
            try {
                const res = await client.api.items.$get({
                    query: {
                        ...(query ? { name: query } : {}),
                        page: String(page),
                        perPage: String(PER_PAGE),
                    },
                });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                setData(await res.json());
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Unknown error');
            } finally {
                setLoading(false);
            }
        }, 300);

        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
        };
    }, [query, page]);

    const setPage = (p: number) =>
        setSearchParams({ ...Object.fromEntries(searchParams), page: String(p) });
    const setQuery = (value: string) => {
        const next = new URLSearchParams(searchParams);
        if (value) {
            next.set('name', value);
        } else {
            next.delete('name');
        }
        next.set('page', '1');
        setSearchParams(next);
    };

    const totalPages = data ? Math.ceil(data.total / PER_PAGE) : 1;

    return (
        <div className="p-6">
            <h1 className="mb-6 text-2xl font-bold">Items</h1>

            <div className="mb-4 flex items-center gap-4">
                <input
                    className="border-input w-72 rounded-md border px-3 py-2 text-sm outline-none focus:ring-1"
                    placeholder="Search by name..."
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                />
                {data && (
                    <span className="text-sm text-muted-foreground">{data.total} items</span>
                )}
            </div>

            {loading && <p className="text-muted-foreground">Loading...</p>}
            {error && <p className="text-destructive">Error: {error}</p>}
            {!loading && !error && data && data.items.length === 0 && (
                <p className="text-muted-foreground">No items found.</p>
            )}

            {!loading && !error && data && data.items.length > 0 && (
                <>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Name</TableHead>
                                <TableHead className="text-right">Stack</TableHead>
                                <TableHead className="text-right">AH Price</TableHead>
                                <TableHead>Rate</TableHead>
                                <TableHead className="text-right">AH Stack Price</TableHead>
                                <TableHead>Rate</TableHead>
                                <TableHead className="text-right">Vendor Price</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {data.items.map((item) => (
                                <>
                                    <TableRow
                                        key={item.id}
                                        className="cursor-pointer"
                                        onClick={() =>
                                            setExpandedItemId(
                                                expandedItemId === item.id ? null : item.id,
                                            )
                                        }
                                    >
                                        <TableCell>{item.name}</TableCell>
                                        <TableCell className="text-right">
                                            {item.stackSize > 1 ? `x${item.stackSize}` : '—'}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            {item.auctionPrice !== null
                                                ? formatGil(item.auctionPrice)
                                                : '—'}
                                        </TableCell>
                                        <RatingCell salesPerDay={item.auctionSalesPerDay} />
                                        <TableCell className="text-right">
                                            {item.auctionStackPrice !== null
                                                ? formatGil(item.auctionStackPrice)
                                                : '—'}
                                        </TableCell>
                                        <RatingCell salesPerDay={item.auctionStackSalesPerDay} />
                                        <TableCell className="text-right">
                                            {item.vendors.length === 0
                                                ? '—'
                                                : formatGil(
                                                      Math.min(
                                                          ...item.vendors.map((v) => v.price),
                                                      ),
                                                  )}
                                        </TableCell>
                                    </TableRow>
                                    {expandedItemId === item.id && (
                                        <ItemExpandedRow key={`${item.id}-expanded`} item={item} />
                                    )}
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
        </div>
    );
};

export default ItemsPage;
