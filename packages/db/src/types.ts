import { InferSelectModel } from 'drizzle-orm';
import { items } from './schema.js';

export type Item = InferSelectModel<typeof items>;
