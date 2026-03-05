import { sql, type InferInsertModel } from 'drizzle-orm';
import { db } from './index.js';
import { items, vendorPrices } from './schema.js';

export type ItemInsert = InferInsertModel<typeof items>;
export type VendorPriceInsert = InferInsertModel<typeof vendorPrices>;

export const upsertItem = async (item: ItemInsert): Promise<void> => {
    await db
        .insert(items)
        .values(item)
        .onConflictDoUpdate({
            target: items.itemId,
            set: { name: sql`excluded.name`, stackSize: sql`excluded.stack_size` },
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
