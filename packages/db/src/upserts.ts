import { sql, type InferInsertModel } from 'drizzle-orm';
import { db } from './index.js';
import {
    craftEnum,
    tierEnum,
    items,
    vendorPrices,
    syntheses,
    synthesisCrafts,
    synthesisYields,
    synthesisIngredients,
} from './schema.js';

export type Craft = (typeof craftEnum.enumValues)[number];
export type Tier = (typeof tierEnum.enumValues)[number];

export type VendorPriceInsert = InferInsertModel<typeof vendorPrices>;

export type SynthesisCraftInsert = InferInsertModel<typeof synthesisCrafts>;

export const upsertItemStub = async ({
    href,
    name,
}: {
    href: string;
    name: string;
}): Promise<number> => {
    const [row] = await db
        .insert(items)
        .values({ href, name })
        .onConflictDoUpdate({
            target: items.href,
            set: { name: sql`excluded.name` },
        })
        .returning({ id: items.id });
    return row.id;
};

export const upsertItem = async ({
    href,
    itemId,
    name,
    stackSize,
}: {
    href: string;
    itemId: number;
    name: string;
    stackSize?: number | null;
}): Promise<void> => {
    await db
        .insert(items)
        .values({ href, itemId, name, stackSize })
        .onConflictDoUpdate({
            target: items.href,
            set: {
                itemId: sql`excluded.item_id`,
                name: sql`excluded.name`,
                stackSize: sql`excluded.stack_size`,
            },
        });
};

export const upsertVendorPrice = async (vendor: VendorPriceInsert): Promise<void> => {
    await db
        .insert(vendorPrices)
        .values(vendor)
        .onConflictDoUpdate({
            target: [vendorPrices.itemId, vendorPrices.vendorName],
            set: {
                price: sql`excluded.price`,
                vendorZone: sql`excluded.vendor_zone`,
                vendorLocation: sql`excluded.vendor_location`,
            },
        });
};

type SynthesisCraftInput = Pick<SynthesisCraftInsert, 'craft' | 'craftLevel'>;

type SynthesisInput = {
    mainCraft: SynthesisCraftInput;
    subCrafts: SynthesisCraftInput[];
    yields: { itemId: number; tier: Tier; quantity: number }[];
    ingredients: { itemId: number; quantity: number }[];
};

// bg-wiki has no stable per-synthesis IDs, so we compute uniqueness
const buildFingerprint = (
    mainCraft: SynthesisCraftInput,
    ingredients: { itemId: number; quantity: number }[],
): string => {
    // sort so that the order arbitrarily passed in doesn't result in a different fingerprint
    const sorted = [...ingredients].sort((a, b) => a.itemId - b.itemId);
    const ingredientStr = sorted.map((i) => `${i.itemId}:${i.quantity}`).join(',');
    return `${mainCraft.craft}:${mainCraft.craftLevel}|${ingredientStr}`;
};

/**
 * Inserts a new synthesis and its related rows.
 *
 * @param mainCraft - The primary craft skill and level required.
 * @param subCrafts - Any supporting craft skills and levels required.
 * @param yields - NQ/HQ output items with their items.id, tier, and quantity.
 * @param ingredients - All ingredients with their items.id and quantity, in
 *   order. The first element MUST be the crystal.
 */
export const upsertSynthesis = async ({
    mainCraft,
    subCrafts,
    yields,
    ingredients,
}: SynthesisInput): Promise<void> => {
    const fingerprint = buildFingerprint(mainCraft, ingredients);

    await db.transaction(async (tx) => {
        const [synthesis] = await tx
            .insert(syntheses)
            .values({ fingerprint })
            .onConflictDoNothing()
            .returning({ id: syntheses.id });

        const didCreateSynthesis = Boolean(synthesis);
        if (!didCreateSynthesis) return;

        await tx
            .insert(synthesisCrafts)
            .values([
                { synthesisId: synthesis.id, ...mainCraft, isMain: true },
                ...subCrafts.map((sc) => ({ synthesisId: synthesis.id, ...sc, isMain: false })),
            ])
            .onConflictDoNothing();

        await tx
            .insert(synthesisYields)
            .values(yields.map((y) => ({ synthesisId: synthesis.id, ...y })))
            .onConflictDoNothing();

        await tx
            .insert(synthesisIngredients)
            .values(ingredients.map((i) => ({ synthesisId: synthesis.id, ...i })))
            .onConflictDoNothing();
    });
};
