import { check, integer, pgTable, primaryKey, varchar } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const items = pgTable(
    'items',
    {
        itemId: integer('item_id').primaryKey(),
        name: varchar('name', { length: 128 }).notNull(),
        stackSize: integer('stack_size').default(1),
    },
    (t) => [check('stack_size_valid', sql`${t.stackSize} IN (1, 12, 99)`)],
);

export const vendorPrices = pgTable(
    'vendor_prices',
    {
        itemId: integer('item_id')
            .references(() => items.itemId)
            .notNull(),
        price: integer('price').notNull(),
        vendorName: varchar('vendor_name', { length: 128 }).notNull(),
        vendorZone: varchar('vendor_zone', { length: 128 }),
        vendorLocation: varchar('vendor_location', { length: 128 }),
    },
    (t) => [primaryKey({ columns: [t.itemId, t.vendorName] })],
);
