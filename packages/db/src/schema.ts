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

export const priceSourceEnum = pgEnum('price_source', ['ah_single', 'ah_stack', 'vendor']);
export const revenueSourceEnum = pgEnum('revenue_source', ['single', 'stack']);

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
        stackPrice: integer('stack_price'),
        stackSalesPerDay: real('stack_sales_per_day'),
        createdAt: timestamp('created_at').notNull().defaultNow(),
    },
    (t) => [
        index('item_auction_prices_item_id_created_at_idx').on(t.itemId, t.createdAt),
        check('price_non_negative', sql`${t.price} >= 0`),
        check('stack_price_non_negative', sql`${t.stackPrice} IS NULL OR ${t.stackPrice} >= 0`),
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

// Profitability snapshot — denormalization rationale
//
// These three tables record a point-in-time snapshot of a synthesis's profitability
// calculation. All data that could otherwise be derived by joining across
// `item_auction_prices`, `item_vendor_prices`, `synthesis_yield_items`, and
// `synthesis_ingredient_items` is copied and stored here so that:
//   1. The UI can render a complete cost/revenue breakdown from a single snapshot
//      read, with no joins into price-history tables.
//   2. Historical snapshots remain accurate after prices change — the numbers
//      displayed reflect what was true at calculation time.
//   3. Sorting by profit is a plain indexed scan on this table; no aggregation
//      subqueries are needed at query time.

export const synthesisProfits = pgTable(
    'synthesis_profits',
    {
        // identity
        id: serial('id').primaryKey(),
        synthesisId: integer('synthesis_id')
            .references(() => syntheses.id)
            .notNull(),
        createdAt: timestamp('created_at').notNull().defaultNow(),

        // denormalized — prices copied from item_auction_prices at snapshot time
        salesPerDay: real('sales_per_day'),
        stackSalesPerDay: real('stack_sales_per_day'),

        // denormalized — values computed from ingredient/yield pricing at snapshot time
        totalIngredientCost: integer('total_ingredient_cost').notNull(),
        profitPerSingle: integer('profit_per_single').notNull(),
        profitPerStack: integer('profit_per_stack'),
        dailyProfitSingle: integer('daily_profit_single'),
        dailyProfitStack: integer('daily_profit_stack'),
        profitHQ1: integer('profit_hq1'),
        profitHQ2: integer('profit_hq2'),
        profitHQ3: integer('profit_hq3'),
        expectedProfitT0: integer('expected_profit_t0').notNull(),
        expectedProfitT1: integer('expected_profit_t1').notNull(),
        expectedProfitT2: integer('expected_profit_t2').notNull(),
        expectedProfitT3: integer('expected_profit_t3').notNull(),
        expectedProfitStackT0: integer('expected_profit_stack_t0'),
        expectedProfitStackT1: integer('expected_profit_stack_t1'),
        expectedProfitStackT2: integer('expected_profit_stack_t2'),
        expectedProfitStackT3: integer('expected_profit_stack_t3'),
    },
    (t) => [index('synthesis_profits_synthesis_id_created_at_idx').on(t.synthesisId, t.createdAt)],
);

export const synthesisProfitIngredients = pgTable(
    'synthesis_profit_ingredients',
    {
        // identity
        snapshotId: integer('snapshot_id')
            .references(() => synthesisProfits.id, { onDelete: 'cascade' })
            .notNull(),
        itemId: integer('item_id')
            .references(() => items.id)
            .notNull(),

        // denormalized — copied from items and synthesis_ingredient_items at snapshot time
        name: varchar('name', { length: 128 }).notNull(),
        quantity: integer('quantity').notNull(),
        stackSize: integer('stack_size').notNull(),

        // denormalized — prices copied from item_auction_prices / item_vendor_prices at snapshot time;
        // unitCost, priceSource, and totalCost are computed from those prices
        auctionSinglePerUnit: integer('auction_single_per_unit'),
        auctionStackPerUnit: integer('auction_stack_per_unit'),
        vendorPerUnit: integer('vendor_per_unit'),
        unitCost: integer('unit_cost').notNull(),
        priceSource: priceSourceEnum('price_source').notNull(),
        totalCost: integer('total_cost').notNull(),
    },
    (t) => [primaryKey({ columns: [t.snapshotId, t.itemId] })],
);

export const synthesisProfitYieldTiers = pgTable(
    'synthesis_profit_yield_tiers',
    {
        // identity
        snapshotId: integer('snapshot_id')
            .references(() => synthesisProfits.id, { onDelete: 'cascade' })
            .notNull(),
        tier: tierEnum('tier').notNull(),
        itemId: integer('item_id')
            .references(() => items.id)
            .notNull(),

        // denormalized — copied from items and synthesis_yield_items at snapshot time
        name: varchar('name', { length: 128 }).notNull(),
        quantity: integer('quantity').notNull(),
        stackSize: integer('stack_size').notNull(),

        // denormalized — prices copied from item_auction_prices at snapshot time;
        // revenue and revenueSource are computed from those prices
        auctionSinglePerUnit: integer('auction_single_per_unit'),
        auctionStackPerUnit: integer('auction_stack_per_unit'),
        revenue: integer('revenue').notNull(),
        revenueSource: revenueSourceEnum('revenue_source').notNull(),
    },
    (t) => [primaryKey({ columns: [t.snapshotId, t.tier, t.itemId] })],
);
