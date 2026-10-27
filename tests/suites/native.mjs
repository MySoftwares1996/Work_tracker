import { parseNative } from '../../src/nativeJson.js';

export async function run({ ck, section }) {
  section('Native bridge: JSON string handling');

  ck('parses an SMS array', parseNative('[{"id":"1","body":"x","receivedAt":123}]', []).length === 1);
  ck('parses a step reading', parseNative('{"available":true,"steps":5200,"bootAt":99}', {}).steps === 5200);
  ck('parses a day map', parseNative('{"2026-09-20":1300}', {})['2026-09-20'] === 1300);

  section('Native bridge: failure modes fall back, never throw');
  ck('null becomes the fallback', parseNative(null, []).length === 0);
  ck('undefined becomes the fallback', parseNative(undefined, {}) && Object.keys(parseNative(undefined, {})).length === 0);
  ck('malformed JSON becomes the fallback', parseNative('{not json', []).length === 0);
  ck('empty string becomes the fallback', parseNative('', []).length === 0);
  ck('literal null JSON becomes the fallback', parseNative('null', []).length === 0);
  ck('an already-parsed object passes through', parseNative({ steps: 7 }, {}).steps === 7);

  section('Native bridge: realistic payloads');
  const queue = parseNative(JSON.stringify([
    { id: '55', sender: 'VM-BANKAB', body: 'Rs.850 debited', receivedAt: 1758300000000 },
    { id: '56', sender: 'AD-BANKBB', body: 'INR 75000 credited', receivedAt: 1758300600000 },
  ]), []);
  ck('queue round trips', queue.length === 2 && queue[1].sender === 'AD-BANKBB');
  ck('timestamps survive as numbers', typeof queue[0].receivedAt === 'number');
}
