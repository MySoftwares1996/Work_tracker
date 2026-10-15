import { makeSerial } from '../../src/serialQueue.js';

export async function run({ ck, section }) {
  section('Serial queue: a hung job cannot block the rest');
  const serial = makeSerial(40, 'job');
  const order = [];
  const a = serial(async () => { order.push('a'); await new Promise((r) => setTimeout(r, 5)); order.push('a-done'); });
  const b = serial(async () => { order.push('b'); });
  await Promise.all([a, b]);
  ck('jobs run one at a time, in order', order.join() === 'a,a-done,b', order.join());

  const hung = serial(() => new Promise(() => {}));        // never answers
  const after = serial(async () => 'ran');
  let err = null;
  await hung.catch((e) => { err = e; });
  ck('a job that never answers is given up on', err && /timed out/.test(err.message), err?.message);
  ck('...and the next job still runs', (await after) === 'ran');
  const failed = serial(async () => { throw new Error('boom'); });
  await failed.catch(() => {});
  ck('a failed job does not stop later ones', (await serial(async () => 7)) === 7);
}
