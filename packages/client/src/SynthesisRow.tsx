import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { SynthesisDetail, VendorInfo } from '@ffxi-crafting/api';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { TableCell, TableRow } from '@/components/ui/table';
import { formatGil } from '@/lib/utils';
import { getCrystalColor } from '@/lib/craft-colors';

const TIER_ORDER = ['NQ', 'HQ1', 'HQ2', 'HQ3'];

const IngredientItem = ({
    name,
    quantity,
    vendors,
    highlight,
}: {
    name: string;
    quantity: number;
    vendors: VendorInfo[];
    highlight?: boolean;
}) => {
    const [open, setOpen] = useState(false);
    const label = quantity > 1 ? `${name} x${quantity}` : name;
    const minPrice = vendors.length > 0 ? Math.min(...vendors.map((v) => v.price)) : null;

    if (vendors.length === 0) return <li className={highlight ? 'font-semibold' : ''}>{label}</li>;

    return (
        <li className={highlight ? 'font-semibold' : ''}>
            <Collapsible open={open} onOpenChange={setOpen}>
                <CollapsibleTrigger className="flex cursor-pointer items-center gap-1 text-left">
                    <span>
                        {label} — {formatGil(minPrice!)}
                    </span>
                    {open ? (
                        <ChevronDown className="size-3 shrink-0" />
                    ) : (
                        <ChevronRight className="size-3 shrink-0" />
                    )}
                </CollapsibleTrigger>
                <CollapsibleContent>
                    <ul className="ml-4 mt-1 space-y-0.5 text-sm text-muted-foreground">
                        {vendors.map((v) => {
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
                </CollapsibleContent>
            </Collapsible>
        </li>
    );
};

export const SynthesisRow = ({
    synthesis,
    highlightItemId,
    highlightIngredientItemId,
}: {
    synthesis: SynthesisDetail;
    highlightItemId?: number;
    highlightIngredientItemId?: number;
}) => {
    const sortedYields = [...synthesis.yields].sort(
        (a, b) => TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier),
    );

    return (
        <TableRow>
            <TableCell className="text-center font-medium">
                {synthesis.mainCraft.craftLevel}
            </TableCell>
            <TableCell>
                <span
                    className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${getCrystalColor(synthesis.crystal.name)}`}
                >
                    {synthesis.crystal.name}
                </span>
            </TableCell>
            <TableCell>
                <ul className="space-y-1">
                    {sortedYields.map((y) => (
                        <li key={y.tier} className={y.itemId === highlightItemId ? 'font-semibold' : ''}>
                            <Badge
                                variant={y.itemId === highlightItemId ? 'default' : 'outline'}
                                className="mr-1.5 text-xs"
                            >
                                {y.tier}
                            </Badge>
                            {y.name}
                            {y.quantity > 1 ? ` x${y.quantity}` : ''}
                        </li>
                    ))}
                </ul>
            </TableCell>
            <TableCell>
                <ul className="space-y-1">
                    {synthesis.ingredients.map((ing) => (
                        <IngredientItem
                            key={ing.name}
                            name={ing.name}
                            quantity={ing.quantity}
                            vendors={ing.vendors}
                            highlight={ing.itemId === highlightIngredientItemId}
                        />
                    ))}
                </ul>
            </TableCell>
        </TableRow>
    );
};
