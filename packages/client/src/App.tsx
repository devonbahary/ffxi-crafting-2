import { useState, useEffect } from 'react';
import { hc } from 'hono/client';
import type { AppType } from '@ffxi-crafting/api';
import type { SynthesisDetail } from '@ffxi-crafting/api';
import { CRAFTS } from '@ffxi-crafting/types';
import type { Craft } from '@ffxi-crafting/types';
import { SynthesisCard } from './SynthesisCard';

const client = hc<AppType>('/');

const App = () => {
    const [craft, setCraft] = useState<Craft>(CRAFTS[0]);
    const [syntheses, setSyntheses] = useState<SynthesisDetail[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchSyntheses = async () => {
            setLoading(true);
            setError(null);
            try {
                const res = await client.api.syntheses.$get({ query: { craft } });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const data = await res.json();
                setSyntheses(data);
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Unknown error');
            } finally {
                setLoading(false);
            }
        };

        fetchSyntheses();
    }, [craft]);

    return (
        <div className="app">
            <h1>FFXI Crafting</h1>

            <div className="controls">
                <label htmlFor="craft-select">Craft: </label>
                <select
                    id="craft-select"
                    value={craft}
                    onChange={(e) => setCraft(e.target.value as Craft)}
                >
                    {CRAFTS.map((c) => (
                        <option key={c} value={c}>
                            {c}
                        </option>
                    ))}
                </select>
            </div>

            {loading && <p>Loading...</p>}
            {error && <p className="error">Error: {error}</p>}

            {!loading && !error && (
                syntheses.length === 0 ? (
                    <p>No syntheses found.</p>
                ) : (
                    <table>
                        <thead>
                            <tr>
                                <th>Lv</th>
                                <th>Crystal</th>
                                <th>Yields</th>
                                <th>Ingredients</th>
                            </tr>
                        </thead>
                        <tbody>
                            {syntheses.map((s) => <SynthesisCard key={s.id} synthesis={s} />)}
                        </tbody>
                    </table>
                )
            )}
        </div>
    );
};

export default App;
