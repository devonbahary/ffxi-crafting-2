import axios from 'axios';
import { parseCraftRankPage } from '../parsers/craft-rank-parser.js';

const CRANK_RANK_BASE_URL = 'https://www.ffxiah.com/recipes';

const CRAFTS = [
    'alchemy',
    'bonecraft',
    'clothcraft',
    'cooking',
    'goldsmithing',
    'leathercraft',
    'smithing',
    'woodworking',
] as const;

const RANKS = [
    'amateur',
    'recruit',
    'initiate',
    'novice',
    'apprentice',
    'journeyman',
    'craftsman',
    'artisan',
    'adept',
    'veteran',
] as const;

const fetchHtml = async (url: string): Promise<string> => {
    const res = await axios.get<string>(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ffxi-crafting-scraper/0.1)' },
    });
    return res.data;
};

export const discoverSyntheses = async () => {
    console.log('Discovering syntheses...');

    const allSyntheses = [];

    for (const craft of CRAFTS) {
        console.log(` Discovering ${craft} syntheses...`);

        for (const rank of RANKS) {
            console.log(`  Discovering ${craft} ${rank} syntheses...`);

            const craftRankUrl = `${CRANK_RANK_BASE_URL}/${craft}/${rank}`;

            for (let i = 1; ; i++) {
                const pageSegment = i > 1 ? `/${i}` : '';
                const craftRankHtml = await fetchHtml(craftRankUrl + pageSegment);
                const syntheses = await parseCraftRankPage(craftRankHtml);
                console.log(`    ${craft} ${rank} page ${i}: ${syntheses.length} syntheses`);

                if (syntheses.length === 0) {
                    break;
                }

                allSyntheses.push(...syntheses);
            }
        }
    }
};
