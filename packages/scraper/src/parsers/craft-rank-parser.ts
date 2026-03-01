import { load, type CheerioAPI } from 'cheerio';

type Skill = {
    name: string;
    level: number;
};

type Ingredient = {
    itemId: number;
    name: string;
};

type Result = {
    itemId: number;
    name: string;
    quantity: number;
};

type Synthesis = {
    recipeId: number;
    skills: Skill[];
    crystal: Ingredient;
    ingredients: Ingredient[];
    results: Result[];
};

const extractItemId = (href: string | undefined): number | null => {
    if (!href) return null;
    const m = href.match(/\/item\/(\d+)/);
    return m ? parseInt(m[1], 10) : null;
};

const parseSkill = (text: string): Skill | null => {
    const m = text.trim().match(/^(.+?)\s*\((\d+)\)$/);
    if (!m) return null;
    return { name: m[1].trim(), level: parseInt(m[2], 10) };
};

const parseResultQuantity = (nameText: string): { name: string; quantity: number } => {
    const m = nameText.trim().match(/^(.+?)\s*x(\d+)$/);
    if (m) return { name: m[1].trim(), quantity: parseInt(m[2], 10) };
    return { name: nameText.trim(), quantity: 1 };
};

const parseSyntheses = ($: CheerioAPI): Synthesis[] => {
    const syntheses: Synthesis[] = [];

    $('tr').each((_, row) => {
        const $row = $(row);
        const $recipeIdDiv = $row.find('.recipe-id');
        if ($recipeIdDiv.length === 0) return;

        // Recipe ID from the link href
        const recipeHref = $recipeIdDiv.find('a').attr('href') ?? '';
        const recipeIdMatch = recipeHref.match(/\/recipes\/(\d+)/);
        if (!recipeIdMatch) return;
        const recipeId = parseInt(recipeIdMatch[1], 10);

        // Skills from .recipe-skill divs
        const skills: Skill[] = [];
        $row.find('.recipe-skill').each((_, el) => {
            const parsed = parseSkill($(el).text());
            if (parsed) skills.push(parsed);
        });

        // Ingredients from the second column's nested table
        const cols = $row.find('> td');
        const $ingredientTable = $(cols[1]).find('table');

        let crystal: Ingredient | null = null;
        const ingredients: Ingredient[] = [];

        $ingredientTable.find('tr').each((_, ingredRow) => {
            const $ingredRow = $(ingredRow);
            // Skip the "Total Cost" row (has a td with colspan=2)
            if ($ingredRow.find('td[colspan]').length > 0) return;

            const $firstTd = $ingredRow.find('td').first();
            const isIngredient = $firstTd.attr('width') === '16';

            const $link = $ingredRow.find('a[href*="/item/"]');
            const itemId = extractItemId($link.attr('href'));
            if (!itemId) return;

            const name = $link.text().trim();

            if (isIngredient) {
                ingredients.push({ itemId, name });
            } else if (!crystal) {
                crystal = { itemId, name };
            }
        });

        if (!crystal) return;

        // Results from the third column's nested table
        const $resultTable = $(cols[2]).find('table');
        const results: Result[] = [];

        $resultTable.find('tr').each((_, resultRow) => {
            const $link = $(resultRow).find('a[href*="/item/"]');
            const itemId = extractItemId($link.attr('href'));
            if (!itemId) return;

            const { name, quantity } = parseResultQuantity($link.text());
            results.push({ itemId, name, quantity });
        });

        if (results.length === 0) return;

        syntheses.push({ recipeId, skills, crystal, ingredients, results });
    });

    return syntheses;
};

export const parseCraftRankPage = async (html: string): Promise<Synthesis[]> => {
    const $ = load(html);
    return parseSyntheses($);
};
