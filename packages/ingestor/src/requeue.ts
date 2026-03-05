import { boss } from '@ffxi-crafting/db';
import type { ItemPageJob } from '@ffxi-crafting/types';

await boss.start();

const payload: ItemPageJob = { href: '/ffxi/Cursed_Cuisses', itemName: 'Cursed Cuisses' };
await boss.send('item.page.requested', payload, { singletonKey: payload.href, priority: 10 });
console.log('Queued Cursed Cuisses with priority 10');

await boss.stop();
