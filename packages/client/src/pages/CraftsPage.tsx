import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { hc } from 'hono/client';
import type { AppType, SynthesisDetail } from '@ffxi-crafting/api';
import { CRAFTS } from '@ffxi-crafting/api';
import type { Craft } from '@ffxi-crafting/api';
import { SynthesisRow } from '@/SynthesisRow';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getCraftColor } from '@/lib/craft-colors';
import { Table, TableBody, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const client = hc<AppType>('/');

const isCraft = (value: string | null): value is Craft =>
    CRAFTS.includes(value as Craft);

const CraftsPage = () => {
    const [searchParams, setSearchParams] = useSearchParams();

    const craftParam = searchParams.get('craft');
    const craft: Craft = isCraft(craftParam) ? craftParam : CRAFTS[0];

    const [syntheses, setSyntheses] = useState<SynthesisDetail[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const load = async () => {
            setLoading(true);
            setError(null);
            try {
                const res = await client.api.syntheses.$get({ query: { craft } });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                setSyntheses(await res.json());
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Unknown error');
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [craft]);

    const setCraft = (value: Craft) => setSearchParams({ craft: value });

    return (
        <div className="p-6">
            <h1 className="mb-6 text-2xl font-bold">FFXI Crafting</h1>

            <Select value={craft} onValueChange={(v) => setCraft(v as Craft)}>
                <SelectTrigger className="mb-4 w-48">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    {CRAFTS.map((c) => (
                        <SelectItem key={c} value={c}>
                            <span
                                className={`mr-1.5 inline-block rounded px-1.5 py-0.5 text-xs font-medium ${getCraftColor(c)}`}
                            >
                                {c}
                            </span>
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>

            {loading && <p className="text-muted-foreground">Loading...</p>}
            {error && <p className="text-destructive">Error: {error}</p>}

            {!loading && !error && syntheses.length === 0 && (
                <p className="text-muted-foreground">No syntheses found.</p>
            )}

            {!loading && !error && syntheses.length > 0 && (
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
                            <SynthesisRow key={s.id} synthesis={s} />
                        ))}
                    </TableBody>
                </Table>
            )}
        </div>
    );
};

export default CraftsPage;
