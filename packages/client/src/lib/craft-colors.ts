import type { Craft } from '@ffxi-crafting/types';

export const CRAFT_COLORS: Record<Craft, string> = {
    Alchemy: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200',
    Bonecraft: 'bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-200',
    Clothcraft: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
    Cooking: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
    Goldsmithing: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
    Leathercraft: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
    Smithing: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
    Woodworking: 'bg-lime-100 text-lime-800 dark:bg-lime-900 dark:text-lime-200',
};

const CRYSTAL_COLORS: Record<string, string> = {
    'Fire Crystal': 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
    'Ice Crystal': 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200',
    'Wind Crystal': 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    'Earth Crystal': 'bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-200',
    'Lightning Crystal': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
    'Water Crystal': 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
    'Light Crystal': 'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200',
    'Dark Crystal': 'bg-violet-100 text-violet-800 dark:bg-violet-900 dark:text-violet-200',
};

export const getCraftColor = (craft: Craft): string => CRAFT_COLORS[craft];

export const getCrystalColor = (crystalName: string): string =>
    CRYSTAL_COLORS[crystalName] ?? 'bg-muted text-muted-foreground';
