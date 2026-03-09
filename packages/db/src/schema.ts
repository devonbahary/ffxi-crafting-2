import {
    boolean,
    check,
    index,
    integer,
    pgEnum,
    pgTable,
    primaryKey,
    real,
    serial,
    timestamp,
    uniqueIndex,
    varchar,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { CRAFTS } from '@ffxi-crafting/types';

export const craftEnum = pgEnum('craft', CRAFTS);

export const tierEnum = pgEnum('tier', ['NQ', 'HQ1', 'HQ2', 'HQ3']);

export const items = pgTable(
    'items',
    {
        id: serial('id').primaryKey(),
        href: varchar('href', { length: 256 }).notNull().unique(),
        ffxiId: integer('ffxi_id').unique(),
        name: varchar('name', { length: 128 }).notNull(),
        stackSize: integer('stack_size').notNull().default(1),
        isExclusive: boolean('is_exclusive').notNull().default(false),
    },
    (t) => [check('stack_size_valid', sql`${t.stackSize} IN (1, 12, 99)`)],
);

export const itemAuctionPrices = pgTable(
    'item_auction_prices',
    {
        id: serial('id').primaryKey(),
        itemId: integer('item_id')
            .references(() => items.id)
            .notNull(),
        price: integer('price').notNull(),
        salesPerDay: real('sales_per_day').notNull(),
        stackPrice: integer('stack_price').notNull(),
        stackSalesPerDay: real('stack_sales_per_day').notNull(),
        createdAt: timestamp('created_at').notNull().defaultNow(),
    },
    (t) => [
        index('item_auction_prices_item_id_created_at_idx').on(t.itemId, t.createdAt),
        check('price_non_negative', sql`${t.price} >= 0`),
        check('stack_price_non_negative', sql`${t.stackPrice} >= 0`),
    ],
);

export const itemVendorPrices = pgTable(
    'item_vendor_prices',
    {
        itemId: integer('item_id')
            .references(() => items.id)
            .notNull(),
        price: integer('price').notNull(),
        vendorName: varchar('vendor_name', { length: 128 }).notNull(),
        vendorZone: varchar('vendor_zone', { length: 128 }),
        vendorLocation: varchar('vendor_location', { length: 128 }),
    },
    (t) => [
        primaryKey({ columns: [t.itemId, t.vendorName] }),
        check('price_non_negative', sql`${t.price} >= 0`),
    ],
);

export const syntheses = pgTable('syntheses', {
    id: serial('id').primaryKey(),
    // bg-wiki has no stable per-synthesis IDs, so we compute uniqueness
    // see buildFingerprint()
    fingerprint: varchar('fingerprint', { length: 512 }).notNull().unique(),
});

export const synthesisCraftRequirements = pgTable(
    'synthesis_craft_requirements',
    {
        synthesisId: integer('synthesis_id')
            .references(() => syntheses.id)
            .notNull(),
        craft: craftEnum('craft').notNull(),
        craftLevel: integer('craft_level').notNull(),
        isMain: boolean('is_main').notNull().default(false),
    },
    (t) => [
        primaryKey({ columns: [t.synthesisId, t.craft] }),
        uniqueIndex('one_main_craft_per_synthesis')
            .on(t.synthesisId)
            .where(sql`${t.isMain} = true`),
        check('craft_level_positive', sql`${t.craftLevel} > 0`),
    ],
);

export const synthesisYieldItems = pgTable(
    'synthesis_yield_items',
    {
        synthesisId: integer('synthesis_id')
            .references(() => syntheses.id)
            .notNull(),
        itemId: integer('item_id')
            .references(() => items.id)
            .notNull(),
        tier: tierEnum('tier').notNull(),
        quantity: integer('quantity').notNull(),
    },
    (t) => [
        primaryKey({ columns: [t.synthesisId, t.itemId, t.tier] }),
        check('quantity_positive', sql`${t.quantity} > 0`),
    ],
);

export const synthesisIngredientItems = pgTable(
    'synthesis_ingredient_items',
    {
        synthesisId: integer('synthesis_id')
            .references(() => syntheses.id)
            .notNull(),
        itemId: integer('item_id')
            .references(() => items.id)
            .notNull(),
        quantity: integer('quantity').notNull(),
    },
    (t) => [
        primaryKey({ columns: [t.synthesisId, t.itemId] }),
        check('quantity_positive', sql`${t.quantity} > 0`),
    ],
);
