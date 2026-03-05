import axios from 'axios';
import { Cheerio, load, type CheerioAPI } from 'cheerio';
import type { Element } from 'domhandler';
import type { Tier } from '@ffxi-crafting/db';

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

// bg-wiki occasionally uses alternate names for crafts; map them to canonical values
const CRAFT_ALIASES: Record<string, string> = {
    Blacksmithing: 'Smithing', // e.g., Thug's Jambiya lists "Blacksmithing - (42)" as a sub craft
};

const normalizeCraftName = (name: string): string => CRAFT_ALIASES[name] ?? name;

const RANK_PATTERN =
    /Amateur|Recruit|Initiate|Novice|Apprentice|Journeyman|Craftsman|Artisan|Adept|Veteran|Expert|Authority/;

const fetchHtml = async (url: string): Promise<string> => {
    const res = await axios.get<string>(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ffxi-crafting-discovery/0.1)' },
    });
    return res.data;
};

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

type Synthesis = {
    yields: YieldItem[];
    mainCraft: Skill;
    subCrafts: Skill[];
    ingredients: Ingredient[];
};

const parseQty = (text: string): number => {
    const m = text.match(/ x(\d+)$/);
    return m ? parseInt(m[1], 10) : 1;
};

const parseYields = ($: CheerioAPI, tds: Cheerio<Element>): YieldItem[] => {
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
    return yields;
};

const parseCraftRequirements = (
    $: CheerioAPI,
    tds: Cheerio<Element>,
): { mainCraft: Skill; subCrafts: Skill[] } | null => {
    // Craft skills from the <p> block
    const pText = $(tds[1]).find('p').text();

    const mainMatch = pText.match(/Main Craft:\s*(.+?)\s*-\s*\((\d+)/);
    if (!mainMatch) return null;

    const mainCraft: Skill = {
        name: normalizeCraftName(mainMatch[1].trim()),
        level: parseInt(mainMatch[2], 10),
    };

    const subCrafts: Skill[] = [];
    const subSection = pText.split('Sub Craft(s):')[1];
    if (subSection) {
        for (const m of subSection.matchAll(/([A-Za-z]+)\s*-\s*\((\d+)/g)) {
            subCrafts.push({ name: normalizeCraftName(m[1].trim()), level: parseInt(m[2], 10) });
        }
    }

    return { mainCraft, subCrafts };
};

const parseIngredients = ($: CheerioAPI, tds: Cheerio<Element>): Ingredient[] => {
    const ingredients: Ingredient[] = [];

    $(tds[2])
        .find('li')
        .each((_, li) => {
            const link = $(li).find('a[href]').first();
            const href = link.attr('href');
            const name = link.text().trim();

            if (!href || !name) return;

            const quantity = parseQty($(li).text().trim());
            ingredients.push({ name, href, quantity });
        });

    return ingredients;
};

const parseSynthesisRow = ($: CheerioAPI, row: Element): Synthesis | null => {
    const tds = $(row).find('td');

    // expect Yield | Requirements | Ingredients columns
    // not every row in the table will fit this requirement, but the synthesis rows we care about should
    const doesRowHaveSynthesisRowStructure = tds.length === 3;
    if (!doesRowHaveSynthesisRowStructure) return null;

    const yields = parseYields($, tds);
    if (yields.length === 0) {
        console.warn(`Could not determine yields for synthesis row ${row}`);
        return null;
    }

    const craftRequirements = parseCraftRequirements($, tds);
    if (!craftRequirements) {
        console.warn(`Could not determine craft requirements for synthesis row ${$(row).text()}`);
        return null;
    }

    const { mainCraft, subCrafts } = craftRequirements;

    const ingredients = parseIngredients($, tds);

    if (ingredients.length === 0) {
        console.warn(`Could not determine ingredients for synthesis row ${row}`);
        return null;
    }

    return {
        yields,
        mainCraft,
        subCrafts,
        ingredients,
    };
};

const getCraftRankTables = ($: CheerioAPI): Cheerio<Element>[] => {
    const rankTables: Cheerio<Element>[] = [];

    $('h2').each((_, h2) => {
        const headingText = $(h2).text();
        const rankMatch = headingText.match(RANK_PATTERN);
        if (!rankMatch) return;

        console.log(`   Found rank heading: ${rankMatch[0]}`);
        rankTables.push($(h2).next('table'));
    });

    return rankTables;
};

export const extractSyntheses = async (): Promise<Synthesis[]> => {
    const syntheses: Synthesis[] = [];

    for (const craft of CRAFTS) {
        console.log(` Extracting ${craft} syntheses...`);

        const bgWikiCraftPage = await fetchHtml(`${BASE_URL}/${craft}`);
        const $ = load(bgWikiCraftPage);

        for (const table of getCraftRankTables($)) {
            table.find('tr').each((_, row) => {
                const synthesis = parseSynthesisRow($, row);
                if (synthesis) syntheses.push(synthesis);
            });
        }
    }

    return syntheses;
};
