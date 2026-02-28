import { parseItem } from './ffxiah-item-page-parser.js';

// Lustreless Scale (item 4086)
// Lizard Tail (item 926)
// S. Astral Detritus (item 9875)
// Gavialis Helm (item 26702)
const result = await parseItem(26702);
console.log(JSON.stringify(result, null, 2));
