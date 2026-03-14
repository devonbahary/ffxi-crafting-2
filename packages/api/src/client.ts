// Browser-safe entry point — no Node.js transitive dependencies.
// CRAFTS and craft types come from @ffxi-crafting/types (no runtime deps).
// Everything else is type-only (erased at build time).

export { CRAFTS } from '@ffxi-crafting/types';
export type { Craft, CraftRequirement } from '@ffxi-crafting/types';
export type {
    VendorInfo,
    ItemWithVendors,
    SynthesisDetail,
    ItemDetail,
    HqYieldTier,
    IngredientCost,
    ProfitableSynthesis,
    RateFilter,
} from './queries.js';
export type { AppType } from './app.js';
