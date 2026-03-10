import axios from 'axios';
import * as cheerio from 'cheerio';
import { SERVER_IDS, type Server } from '../constants.js';

const FFXIAH_URL = 'https://www.ffxiah.com';
const USER_AGENT = 'Mozilla/5.0 (compatible; ffxi-crafting-pricer/0.1)';
const SERVER: Server = 'Bahamut';
const SERVER_SID = SERVER_IDS[SERVER];

type ParsedPageData = {
    price: number | null;
    salesPerDay: number | null;
};

export type ItemPrices = ParsedPageData & {
    price: number | null;
    salesPerDay: number | null;
    stackPrice: number | null;
    stackSalesPerDay: number | null;
};

const parseTableValue = ($: cheerio.CheerioAPI, label: string): string | null => {
    let value: string | null = null;
    // specifically find in the .stdtbl
    $('.stdtbl td').each((_, el) => {
        if ($(el).text().trim() === label) {
            value = $(el).next('td').text().trim();
            return false;
        }
    });
    return value;
};

export const parseItemPrice = (html: string): ParsedPageData => {
    const $ = cheerio.load(html);
    const price = parseInt(parseTableValue($, 'Median') ?? '', 10) || null;
    const salesPerDay = parseFloat(parseTableValue($, 'Rate') ?? '') || null;
    return { price, salesPerDay };
};

export const fetchItemPrices = async (ffxiId: number, hasStack: boolean): Promise<ItemPrices> => {
    const baseUrl = `${FFXIAH_URL}/item/${ffxiId}`;
    const headers = { 'User-Agent': USER_AGENT, Cookie: `sid=${SERVER_SID}` };

    const [singleRes, stackRes] = await Promise.all([
        axios.get<string>(baseUrl, { headers }),
        hasStack ? axios.get<string>(`${baseUrl}?stack=1`, { headers }) : Promise.resolve(null),
    ]);

    const { price, salesPerDay } = parseItemPrice(singleRes.data);

    const { price: stackPrice, salesPerDay: stackSalesPerDay } = stackRes
        ? parseItemPrice(stackRes.data)
        : { price: null, salesPerDay: null };

    return {
        price,
        salesPerDay,
        stackPrice,
        stackSalesPerDay,
    };
};
