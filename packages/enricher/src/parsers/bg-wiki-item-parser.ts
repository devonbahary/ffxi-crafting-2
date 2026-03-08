import axios, { AxiosResponse } from 'axios';
import { CheerioAPI, load } from 'cheerio';

export type ParsedItem = {
    ffxiId: number;
    stackSize: number;
    isExclusive: boolean;
    vendors: {
        vendorName: string;
        vendorZone: string | null;
        vendorLocation: string | null;
        price: number;
    }[];
};

const BG_WIKI_URL = 'https://bg-wiki.com';

const fetchHtml = async (url: string): Promise<string> => {
    const res = await axios.get<string>(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ffxi-crafting-ingestor/0.1)' },
    });
    return res.data;
};

const getExternalLinks = (
    $: CheerioAPI,
): { ffxiahHref: string | null; ffxidbHref: string | null } => {
    const ffxiahHref = $('a[href*="ffxiah.com"]').first().attr('href');
    const ffxidbHref = $('a[href*="ffxidb.com"]').first().attr('href');

    return { ffxiahHref: ffxiahHref ?? null, ffxidbHref: ffxidbHref ?? null };
};

const parseItemIdFromExternalLinks = (
    ffxiahHref: string | null,
    ffxidbHref: string | null,
): number | null => {
    // most of the time, the itemId is within the external links themselves
    // (e.g., http://www.ffxiah.com/item/**4509**/distilled-water or http://ffxidb.com/items/**4509**)
    const ffxiahMatch = ffxiahHref?.match(/\/item\/(\d+)/);
    const ffxidbMatch = ffxidbHref?.match(/\/items?\/(\d+)/);

    const itemIdStr = (ffxiahMatch ?? ffxidbMatch)?.[1];

    if (!itemIdStr) {
        // but at other times the link is just a search query
        // (e.g., http://www.ffxiah.com/search/item?name=Cursed_Cuisses)
        return null;
    }

    return parseInt(itemIdStr, 10);
};

// sometimes search URLs like http://www.ffxiah.com/search/item?name=Cursed_Cuisses
// are redirected to the direct item page (https://www.ffxiah.com/item/**1390**/cursed-cuisses)
const parseItemIdFromRedirect = (res: AxiosResponse): number | null => {
    // follow-redirects (used by axios) sets responseUrl on the underlying Node.js response
    const redirectUrl: string =
        (res.request as { res?: { responseUrl?: string } }).res?.responseUrl ?? '';

    const itemIdMatch = redirectUrl.match(/\/item\/(\d+)/);
    if (itemIdMatch) return parseInt(itemIdMatch[1], 10);

    return null;
};

const parseItemIdFromSearchResults = (ffxiahHref: string, res: AxiosResponse): number | null => {
    const searchName = new URL(ffxiahHref).searchParams
        .get('name')
        ?.replace(/_/g, ' ')
        .toLowerCase();
    if (!searchName) return null;

    const $ffxiahSearchResultsDoc = load(res.data);

    let ffxiId: number | null = null;

    $ffxiahSearchResultsDoc('a.ucwords').each((_, el) => {
        if (ffxiId) return;
        const text = $ffxiahSearchResultsDoc(el).text().trim().toLowerCase();
        if (text === searchName) {
            const match = $ffxiahSearchResultsDoc(el)
                .attr('href')
                ?.match(/\/item\/(\d+)/);
            if (match) ffxiId = parseInt(match[1], 10);
        }
    });

    return ffxiId;
};

const extractItemIdFromFFXIAH = async (ffxiahHref: string): Promise<number | null> => {
    const res = await axios.get<string>(ffxiahHref, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ffxi-crafting-ingestor/0.1)' },
    });

    return parseItemIdFromRedirect(res) || parseItemIdFromSearchResults(ffxiahHref, res);
};

const extractFFXIId = async (href: string, $: CheerioAPI): Promise<number> => {
    const { ffxiahHref, ffxidbHref } = getExternalLinks($);

    const ffxiId = parseItemIdFromExternalLinks(ffxiahHref, ffxidbHref);
    if (ffxiId) return ffxiId;

    if (ffxiahHref) {
        console.log(
            `  No ffxiId found directly on page external links, going to follow ${ffxiahHref}`,
        );
        const ffxiahItemId = await extractItemIdFromFFXIAH(ffxiahHref);
        if (ffxiahItemId) return ffxiahItemId;
    } else {
        console.log(`  No ffxiah redirect found for item with href ${href}`);
    }

    throw new Error(`No ffxiId found for item with href ${href}`);
};

export const parseStackSize = ($: CheerioAPI): number => {
    // Some pages use td.item-info-header, others (e.g. crystals) use a plain th
    const fromTdHeader = $('td.item-info-header')
        .filter((_, el) => $(el).text().includes('Stack size:'))
        .first()
        .next('td');

    const fromTh = $('th')
        .filter((_, el) => $(el).text().includes('Stack size:'))
        .first()
        .next('td');

    const stackSizeTd = fromTdHeader.length ? fromTdHeader : fromTh;
    return parseInt(stackSizeTd.text().trim(), 10) || 1;
};

export const parsePriceFromNotes = (notesText: string): number | null => {
    const priceMatch = notesText.match(/([\d,]+)\s*(?:g|gil)/i);
    if (!priceMatch) return null;
    return parseInt(priceMatch[1].replace(/,/g, ''), 10);
};

const parseVendors = ($: CheerioAPI): ParsedItem['vendors'] => {
    // Vendor prices: table with "NPC Name" header
    const vendorTable = $('th')
        .filter((_, el) => $(el).text().trim() === 'NPC Name')
        .closest('table');

    const vendors: ParsedItem['vendors'] = [];

    vendorTable
        .find('tr')
        .filter((_, row) => $(row).find('td').length > 0)
        .each((_, row) => {
            const tds = $(row).find('td');
            const vendorName = $(tds[0]).text().trim();
            const zoneText = $(tds[1]).text().trim();
            const notesText = $(tds[2]).text().trim();

            if (!vendorName) {
                console.log(`  No vendor name found for row ${row}`);
                return;
            }

            const price = parsePriceFromNotes(notesText);
            if (price === null) {
                console.log(
                    `  No price in gil found for vendor "${vendorName}" (text: "${notesText}")`,
                );
                return;
            }

            const zoneMatch = zoneText.match(/^(.+?)\s*-\s*\(([^)]+)\)/);
            const vendorZone = zoneMatch ? zoneMatch[1].trim() : zoneText || null;
            const vendorLocation = zoneMatch ? zoneMatch[2].trim() : null;

            if (!vendorZone) console.warn(`  No zone found for vendor "${vendorName}"`);
            if (!vendorLocation)
                console.warn(
                    `  No location found for vendor "${vendorName}" (zone: "${zoneText}")`,
                );

            vendors.push({ vendorName, vendorZone, vendorLocation, price });
        });

    return vendors;
};

const parseFlags = ($: CheerioAPI): string[] => {
    let flags: string[] = [];

    $('tr').each((_, row) => {
        const cells = $(row).find('td, th');
        if (cells.length < 2) return;
        const label = $(cells[0]).text().trim().toLowerCase().replace(/:$/, '');
        if (label !== 'flags') return;

        flags = $(cells[1])
            .text()
            .split(',')
            .map((f) => f.trim());

        return false;
    });

    return flags;
};

const parseIsExclusive = ($: CheerioAPI): boolean => {
    const flags = parseFlags($);
    return flags.some((f) => f.toLowerCase() === 'exclusive');
};

export const extractItem = async (href: string): Promise<ParsedItem> => {
    const bgWikiHtml = await fetchHtml(`${BG_WIKI_URL}/${href}`);
    const $ = load(bgWikiHtml);

    const ffxiId = await extractFFXIId(href, $);
    const stackSize = parseStackSize($);
    const isExclusive = parseIsExclusive($);
    const vendors = parseVendors($);

    return { ffxiId, stackSize, isExclusive, vendors };
};
