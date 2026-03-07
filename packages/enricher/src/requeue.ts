import { boss } from '@ffxi-crafting/db';
import type { EnrichJob } from '@ffxi-crafting/types';

await boss.start();

const payload: EnrichJob = { href: '/ffxi/Naegling', itemName: 'Naegling' };
await boss.send('item.enrich', payload, { singletonKey: payload.href, priority: 10 });
console.log('Queued Naegling with priority 10');

await boss.stop();
