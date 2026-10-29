import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAccountId, fetchInsights, toCsv } from '../ads-insights.js';
import { createGraphClient } from '../lib/graph.js';
import { mockFetch, noSleep } from './_mock.js';

test('계정 ID를 act_ 형식으로 정규화하고 잘못된 값은 거부한다', () => {
  assert.equal(normalizeAccountId('123'), 'act_123');
  assert.equal(normalizeAccountId('act_123'), 'act_123');
  assert.throws(() => normalizeAccountId('abc'));
});

test('커서(after)로 페이지를 끝까지 읽는다', async () => {
  const f = mockFetch([
    { body: { data: [{ campaign_id: '1' }], paging: { cursors: { after: 'A' }, next: 'u' } } },
    { body: { data: [{ campaign_id: '2' }], paging: { cursors: { after: 'B' } } } },
  ]);
  const c = createGraphClient({ token: 'T', fetchImpl: f, sleep: noSleep });
  const rows = await fetchInsights(c, '9', { datePreset: 'last_7d' });
  assert.deepEqual(rows.map((r) => r.campaign_id), ['1', '2']);
  assert.equal(new URL(f.calls[1].url).searchParams.get('after'), 'A');
  assert.equal(new URL(f.calls[0].url).searchParams.get('date_preset'), 'last_7d');
});

test('since/until이 있으면 time_range를 쓰고 date_preset은 보내지 않는다', async () => {
  const f = mockFetch([{ body: { data: [] } }]);
  const c = createGraphClient({ token: 'T', fetchImpl: f, sleep: noSleep });
  await fetchInsights(c, '9', { since: '2026-10-01', until: '2026-10-07' });
  const q = new URL(f.calls[0].url).searchParams;
  assert.equal(q.get('date_preset'), null);
  assert.deepEqual(JSON.parse(q.get('time_range')), { since: '2026-10-01', until: '2026-10-07' });
});

test('CSV는 쉼표와 따옴표를 이스케이프한다', () => {
  assert.equal(toCsv([{ a: 'x,y', b: 'q"r' }]), 'a,b\n"x,y","q""r"');
  assert.equal(toCsv([]), '');
});
