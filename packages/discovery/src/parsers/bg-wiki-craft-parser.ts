import axios from 'axios';
import { load, type CheerioAPI } from 'cheerio';
import type { Element } from 'domhandler';

const BASE_URL = 'https://bg-wiki.com/ffxi';

const CRAFTS = [
    'Alchemy',
    'Bonecraft',
    'Clothcraft',
    'Cooking',
    'Goldsmithing',
    'Leathercraft',
    'Smithing',
    'Woodworking',
] as const;

const RANK_PATTERN =
    /Amateur|Recruit|Initiate|Novice|Apprentice|Journeyman|Craftsman|Artisan|Adept|Veteran|Expert|Authority/;

const fetchHtml = async (url: string): Promise<string> => {
    const res = await axios.get<string>(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ffxi-crafting-discovery/0.1)' },
    });
    return res.data;
};

type Tier = 'NQ' | 'HQ1' | 'HQ2' | 'HQ3';

type YieldItem = {
    tier: Tier;
    name: string;
    href: string;
    quantity: number;
};

type Skill = {
    name: string;
    level: number;
};

type Ingredient = {
    name: string;
    href: string;
    quantity: number;
};

type Recipe = {
    yields: YieldItem[];
    crystal: { name: string; href: string };
    mainCraft: Skill;
    subCrafts: Skill[];
    ingredients: Ingredient[];
};

const parseQty = (text: string): number => {
    const m = text.match(/ x(\d+)$/);
    return m ? parseInt(m[1], 10) : 1;
};

const parseRecipeRow = ($: CheerioAPI, row: Element): Recipe | null => {
    const tds = $(row).find('td');
    if (tds.length < 3) return null;

    // Yields: NQ in the bold div, HQs in the blockquote
    const yields: YieldItem[] = [];
    $(tds[0])
        .find('li')
        .each((_, li) => {
            const text = $(li).text().trim();
            const tierMatch = text.match(/^(NQ|HQ\d+):/);
            if (!tierMatch) return;
            const tier = tierMatch[1] as Tier;
            const link = $(li).find('a[href]').first();
            const href = link.attr('href');
            const name = link.text().trim();
            if (!href || !name) return;
            yields.push({ tier, name, href, quantity: parseQty(text) });
        });

    // Crystal: the linked image at the top of the requirements cell
    const crystalLink = $(tds[1]).find('a[href]').first();
    const crystalHref = crystalLink.attr('href');
    const crystalName = crystalLink.attr('title');
    if (!crystalHref || !crystalName) return null;

    // Craft skills from the <p> block
    const pText = $(tds[1]).find('p').text();

    const mainMatch = pText.match(/Main Craft:\s*(.+?)\s*-\s*\((\d+)/);
    if (!mainMatch) return null;
    const mainCraft: Skill = { name: mainMatch[1].trim(), level: parseInt(mainMatch[2], 10) };

    const subCrafts: Skill[] = [];
    const subSection = pText.split('Sub Craft(s):')[1];
    if (subSection) {
        for (const m of subSection.matchAll(/([A-Za-z]+)\s*-\s*\((\d+)/g)) {
            subCrafts.push({ name: m[1].trim(), level: parseInt(m[2], 10) });
        }
    }

    // Ingredients
    const ingredients: Ingredient[] = [];
    $(tds[2])
        .find('li')
        .each((_, li) => {
            const link = $(li).find('a[href]').first();
            const href = link.attr('href');
            const name = link.text().trim();
            if (!href || !name) return;
            ingredients.push({ name, href, quantity: parseQty($(li).text().trim()) });
        });

    if (yields.length === 0 || ingredients.length === 0) return null;

    return {
        yields,
        crystal: { name: crystalName, href: crystalHref },
        mainCraft,
        subCrafts,
        ingredients,
    };
};

export type { Recipe };

export const parseBgWikiCrafts = async (): Promise<Recipe[]> => {
    const recipes: Recipe[] = [];

    for (const craft of CRAFTS) {
        console.log(` Parsing ${craft}...`);
        const html = await fetchHtml(`${BASE_URL}/${craft}`);
        const $ = load(html);

        $('h2').each((_, h2) => {
            if (!RANK_PATTERN.test($(h2).text())) return;

            $(h2)
                .next('table')
                .find('tr')
                .each((_, row) => {
                    const recipe = parseRecipeRow($, row);
                    if (recipe) recipes.push(recipe);
                });
        });
    }

    return recipes;
};
