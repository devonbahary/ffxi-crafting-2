import axios from 'axios';
import * as cheerio from 'cheerio';

const BASE_URL = 'https://www.ffxiah.com/item';
const SERVER = 'Bahamut';

// Thresholds from ffxiah's getSalesRating() in main-bundle.js
// x >= 8 → Very Fast, >= 4 → Fast, >= 1 → Average, >= 1/7 → Slow, >= 1/30 → Very Slow, else Dead Slow
const RATE_LABELS = ['Dead Slow', 'Very Slow', 'Slow', 'Average', 'Fast', 'Very Fast'] as const;
type RateLabel = (typeof RATE_LABELS)[number];

function getSalesRating(x: number): RateLabel {
    if (x >= 8) return 'Very Fast';
    if (x >= 4) return 'Fast';
    if (x >= 1) return 'Average';
    if (x >= 1 / 7) return 'Slow';
    if (x >= 1 / 30) return 'Very Slow';
    return 'Dead Slow';
}

interface ServerMedian {
    median: number;
    server_name: string;
}

export interface ItemPrices {
    server: string;
    name: string;
    itemId: number;
    median: number | null;
    rate: RateLabel | null;
    stackSize: number | null;
    stackMedian: number | null;
    stackRate: RateLabel | null;
}

function parsePage(html: string, server: string) {
    const $ = cheerio.load(html);

    // Pull server_medians out of the embedded Item.* script block
    let serverMedians: ServerMedian[] = [];
    $('script').each((_, el) => {
        const text = $(el).html() ?? '';
        if (!text.includes('Item.server_medians')) return;
        const m = text.match(/Item\.server_medians\s*=\s*(null|\[[\s\S]*?\]);/);
        if (m && m[1] !== 'null') {
            try {
                serverMedians = (0, eval)(`(${m[1]})`);
            } catch {}
        }
    });

    const median = serverMedians.find((s) => s.server_name === server)?.median ?? null;

    // Rate: numeric value is in span.sales-rate (row is CSS-hidden but Cheerio reads it)
    const rateRaw = parseFloat($('.sales-rate').first().text());
    const rate: RateLabel | null = isNaN(rateRaw) ? null : getSalesRating(rateRaw);

    // Stack size: appears as "x99" text inside .item-name on the stack page
    const itemNameText = $('.item-name').first().text().trim();
    const stackSizeMatch = itemNameText.match(/x(\d+)/);
    const stackSize = stackSizeMatch ? parseInt(stackSizeMatch[1], 10) : null;

    // Stack link only present on single page when item is stackable
    const hasStackLink = $('a[href*="stack=1"]').length > 0;

    return { itemNameText, median, rate, stackSize, hasStackLink };
}

async function fetchHtml(url: string): Promise<string> {
    const res = await axios.get<string>(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ffxi-crafting-scraper/0.1)' },
    });
    return res.data;
}

export async function getItemPrices(itemId: number, server: string): Promise<ItemPrices> {
    const singleHtml = await fetchHtml(`${BASE_URL}/${itemId}`);
    const single = parsePage(singleHtml, server);

    let stackMedian: number | null = null;
    let stackSize: number | null = null;
    let stackRate: RateLabel | null = null;

    if (single.hasStackLink) {
        const stackHtml = await fetchHtml(`${BASE_URL}/${itemId}/?stack=1`);
        const stack = parsePage(stackHtml, server);
        stackMedian = stack.median;
        stackSize = stack.stackSize;
        stackRate = stack.rate;
    }

    return {
        server,
        name: single.itemNameText,
        itemId,
        median: single.median,
        rate: single.rate,
        stackSize,
        stackMedian,
        stackRate,
    };
}

// Lustreless Scale (item 4086)
// Lizard Tail (item 926)
// S. Astral Detritus (item 9875)
const result = await getItemPrices(9875, SERVER);
console.log(JSON.stringify(result, null, 2));
