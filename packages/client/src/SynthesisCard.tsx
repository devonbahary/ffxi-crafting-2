import type { SynthesisDetail, VendorInfo } from '@ffxi-crafting/api';

const TIER_ORDER = ['NQ', 'HQ1', 'HQ2', 'HQ3'];

const VendorList = ({ vendors }: { vendors: VendorInfo[] }) => {
    if (vendors.length === 0) return null;
    return (
        <ul>
            {vendors.map((v) => (
                <li key={v.vendorName}>
                    {v.vendorName} — {v.price.toLocaleString()} gil
                </li>
            ))}
        </ul>
    );
};

export const SynthesisCard = ({ synthesis }: { synthesis: SynthesisDetail }) => {
    const sortedYields = [...synthesis.yields].sort(
        (a, b) => TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier),
    );

    return (
        <tr>
            <td>{synthesis.mainCraft.craftLevel}</td>
            <td>{synthesis.crystal.name}</td>
            <td>
                <ol>
                    {sortedYields.map((y) => (
                        <li key={y.tier}>
                            {y.name}
                            {y.quantity > 1 ? ` x${y.quantity}` : ''}
                        </li>
                    ))}
                </ol>
            </td>
            <td>
                <ul>
                    {synthesis.ingredients.map((ing) => (
                        <li key={ing.name}>
                            {ing.name}
                            {ing.quantity > 1 ? ` x${ing.quantity}` : ''}
                            <VendorList vendors={ing.vendors} />
                        </li>
                    ))}
                </ul>
            </td>
        </tr>
    );
};
