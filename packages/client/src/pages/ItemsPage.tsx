import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { hc } from 'hono/client';
import type { AppType } from '@ffxi-crafting/api';
import type { ItemDetail } from '@ffxi-crafting/api';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
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

const ItemsPage = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const query = searchParams.get('name') ?? '';

    const [items, setItems] = useState<ItemDetail[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (!query) {
            setItems([]);
            return;
        }

        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(async () => {
            setLoading(true);
            setError(null);
            try {
                const res = await client.api.items.$get({ query: { name: query } });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                setItems(await res.json());
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Unknown error');
            } finally {
                setLoading(false);
            }
        }, 300);

        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
        };
    }, [query]);

    return (
        <div className="p-6">
            <h1 className="mb-6 text-2xl font-bold">Items</h1>

            <input
                className="border-input mb-4 w-72 rounded-md border px-3 py-2 text-sm outline-none focus:ring-1"
                placeholder="Search by name..."
                value={query}
                onChange={(e) =>
                    setSearchParams(e.target.value ? { name: e.target.value } : {})
                }
            />

            {loading && <p className="text-muted-foreground">Loading...</p>}
            {error && <p className="text-destructive">Error: {error}</p>}
            {!loading && !error && query && items.length === 0 && (
                <p className="text-muted-foreground">No items found.</p>
            )}

            {!loading && !error && items.length > 0 && (
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
                        {items.map((item) => (
                            <TableRow key={item.id}>
                                <TableCell>{item.name}</TableCell>
                                <TableCell className="text-right">
                                    {item.stackSize > 1 ? `x${item.stackSize}` : '—'}
                                </TableCell>
                                <TableCell className="text-right">
                                    {item.auctionPrice !== null ? formatGil(item.auctionPrice) : '—'}
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
                                        : formatGil(Math.min(...item.vendors.map((v) => v.price)))}
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            )}
        </div>
    );
};

export default ItemsPage;
