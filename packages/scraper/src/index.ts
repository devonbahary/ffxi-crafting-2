import axios from 'axios';
import * as cheerio from 'cheerio';

const BASE_URL = 'https://www.ffxiah.com/item';

async function scrapeItem(itemId: number, slug: string): Promise<void> {
    const url = `${BASE_URL}/${itemId}/${slug}`;
    console.log(`Fetching: ${url}`);

    const response = await axios.get<string>(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; ffxi-crafting-scraper/0.1)',
        },
    });

    const $ = cheerio.load(response.data);

    // Find the <script> block containing Item. assignments
    let itemScript: string | undefined;
    $('script').each((_, el) => {
        const text = $(el).html() ?? '';
        if (text.includes('Item.') && text.includes('Item.sales')) {
            itemScript = text;
        }
    });

    if (!itemScript) {
        console.error('Could not find Item data script block');
        return;
    }

    // Extract individual Item.* assignments via regex
    const assignments = itemScript.matchAll(/Item\.(\w+)\s*=\s*([^;]+);/g);

    const itemData: Record<string, unknown> = {};
    for (const match of assignments) {
        const key = match[1];
        const rawValue = match[2].trim();
        try {
            itemData[key] = (0, eval)(`(${rawValue})`);
        } catch {
            itemData[key] = rawValue;
        }
    }

    console.log('\n--- Scraped Item Data ---');
    console.log(JSON.stringify(itemData, null, 2));
}

// Example: Iron Ore (item 4238)
scrapeItem(4238, 'iron-ore').catch(console.error);
