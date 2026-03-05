import PgBoss from 'pg-boss';

export const boss = new PgBoss(
    process.env.DATABASE_URL ?? 'postgres://ffxi:ffxi@127.0.0.1:5432/ffxi_crafting',
);
