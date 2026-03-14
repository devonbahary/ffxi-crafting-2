export const CRAFTS = [
    'Alchemy',
    'Bonecraft',
    'Clothcraft',
    'Cooking',
    'Goldsmithing',
    'Leathercraft',
    'Smithing',
    'Woodworking',
] as const;

export type Craft = (typeof CRAFTS)[number];

export type CraftRequirement = {
    craft: Craft;
    craftLevel: number;
};
