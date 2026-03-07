import { load } from 'cheerio';
import { describe, expect, it } from 'vitest';
import { parsePriceFromNotes, parseStackSize } from './bg-wiki-item-parser.js';

describe('parsePriceFromNotes', () => {
    it('parses comma-formatted gil with trailing content', () => {
        expect(parsePriceFromNotes('4,000 Gil\nRequires "Rhapsody in Fuchsia"')).toBe(4000);
    });

    it('parses gil with newline and condition text', () => {
        expect(parsePriceFromNotes('800 Gil\nMovalpolos must be under control by any nation')).toBe(
            800,
        );
    });

    it('parses shorthand "g" suffix', () => {
        expect(parsePriceFromNotes('50g')).toBe(50);
    });

    it('returns null when no price is found', () => {
        expect(parsePriceFromNotes('No price here')).toBeNull();
    });
});

describe('parseStackSize', () => {
    it('parses stack size from td.item-info-header layout', () => {
        const $ = load(`<table><tr>
            <td class="item-info-header">Stack size:</td>
            <td class="item-info-body">12</td>
        </tr></table>`);
        expect(parseStackSize($)).toBe(12);
    });

    it('parses stack size from th layout (e.g. Earth Crystal)', () => {
        // https://www.bg-wiki.com/ffxi/Earth_Crystal
        const $ = load(`<table><tr>
            <th>Stack size:</th>
            <td colspan="3">12</td>
        </tr></table>`);
        expect(parseStackSize($)).toBe(12);
    });

    it('defaults to 1 when stack size is not present', () => {
        const $ = load(`<table><tr><td>No stack info here</td></tr></table>`);
        expect(parseStackSize($)).toBe(1);
    });
});
