// Regenerates fictional demonstration mail only. Never reads a user's desk.
import { writeFile } from 'node:fs/promises';
import { newDesk, createMessage, prepareMailbag, acceptMailbag, previewMailbag } from '../src/core.js';

const station = (handle, postmark) => {
  const desk = newDesk();
  desk.station.handle = handle;
  desk.station.postmark = postmark;
  return desk;
};
let a = station('sample-cumberland', 'Example · Cumberland Maker Meetup');
let b = station('sample-carrier', 'Example · Hamfest swap table');
let c = station('sample-defcon', 'Example · DEF CON');
const post = createMessage(a, { body: 'Who’s got a spare rotary encoder? This is a fictional example postcard.' });
a = post.desk;
const ab = prepareMailbag(a, [post.message.id]);
b = (await acceptMailbag(b, ab.bag)).desk;
const bc = prepareMailbag(b, [post.message.id]);
c = (await acceptMailbag(c, bc.bag)).desk;
c = createMessage(c, { parentId: post.message.id, body: 'I have a spare in the parts bin. Sending this fictional reply home from DEF CON. Turn the postcards over to inspect their separate journeys.' }).desk;
b = (await acceptMailbag(b, prepareMailbag(c, [post.message.id]).bag)).desk;
const finalBag = prepareMailbag(b, [post.message.id]).bag;
await previewMailbag(newDesk(), JSON.stringify(finalBag));
const path = new URL('../examples/sample-mailbag.json', import.meta.url);
await writeFile(path, `${JSON.stringify(finalBag, null, 2)}\n`);
const replySeed = { ...structuredClone(finalBag), id: `bag_${crypto.randomUUID()}` };
replySeed.messages = replySeed.messages.filter((m) => m.parentId === post.message.id);
replySeed.routes = replySeed.routes.filter((r) => replySeed.messages.some((m) => m.id === r.messageId));
await previewMailbag(newDesk(), JSON.stringify(replySeed));
await writeFile(new URL('../examples/reply-first-seed.json', import.meta.url), `${JSON.stringify(replySeed, null, 2)}\n`);
await writeFile(new URL('../examples/parent-later.json', import.meta.url), `${JSON.stringify(ab.bag, null, 2)}\n`);
console.log('Wrote sample-mailbag.json (2 fictional postcards), reply-first-seed.json, and parent-later.json. No private data.');
