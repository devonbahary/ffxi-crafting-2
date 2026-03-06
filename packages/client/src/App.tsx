import { useState, useEffect } from 'react';
import { hc } from 'hono/client';
import type { AppType, SynthesisDetail } from '@ffxi-crafting/api';
import { CRAFTS } from '@ffxi-crafting/types';
import type { Craft } from '@ffxi-crafting/types';
import { SynthesisRow } from './SynthesisRow';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const client = hc<AppType>('/');

const App = () => {
    const [craft, setCraft] = useState<Craft>(CRAFTS[0]);
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
                            {c}
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

export default App;
