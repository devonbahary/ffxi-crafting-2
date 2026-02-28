import { parseItem } from './ffxiah-item-page-parser.js';

const SERVER = 'Bahamut';

// Lustreless Scale (item 4086)
// Lizard Tail (item 926)
// S. Astral Detritus (item 9875)
// Gavialis Helm (item 26702)
const result = await parseItem(26702, SERVER);
console.log(JSON.stringify(result, null, 2));
