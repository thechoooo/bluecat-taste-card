import test from 'node:test';
import assert from 'node:assert/strict';
import { createGraphClient, GraphError } from '../lib/graph.js';
import { mockFetch, noSleep } from './_mock.js';

const TOKEN = 'SECRET_TOKEN_123';

test('GET은 access_token을 쿼리에, POST는 본문에 싣는다', async () => {
  const f = mockFetch([{ body: { ok: 1 } }, { body: { ok: 2 } }]);
  const c = createGraphClient({ token: TOKEN, fetchImpl: f, version: 'v25.0' });
  await c.get('123/insights', { fields: 'spend' });
  await c.post('123/media', { caption: 'hi' });
  assert.match(f.calls[0].url, /\/v25\.0\/123\/insights\?/);
  assert.equal(new URL(f.calls[0].url).searchParams.get('access_token'), TOKEN);
  assert.equal(f.calls[1].init.body.get('access_token'), TOKEN);
  assert.equal(f.calls[1].url.includes(TOKEN), false);
});

test('Graph 오류를 GraphError로 바꾸고 토큰을 가린다', async () => {
  const f = mockFetch([{ status: 400, body: { error: { message: `bad ${TOKEN}`, code: 190, type: 'OAuthException' } } }]);
  const c = createGraphClient({ token: TOKEN, fetchImpl: f, sleep: noSleep });
  await assert.rejects(c.get('me'), (e) => e instanceof GraphError && e.code === 190 && !e.message.includes(TOKEN));
  assert.equal(f.calls.length, 1);
});

test('GET은 일시적 오류에서 재시도한다', async () => {
  const f = mockFetch([{ status: 500, body: {} }, { body: { ok: true } }]);
  const c = createGraphClient({ token: TOKEN, fetchImpl: f, sleep: noSleep });
  assert.deepEqual(await c.get('me'), { ok: true });
  assert.equal(f.calls.length, 2);
});

test('POST는 일시적 오류여도 재시도하지 않는다 (중복 게시 방지)', async () => {
  const f = mockFetch([{ status: 500, body: {} }, { body: { id: '1' } }]);
  const c = createGraphClient({ token: TOKEN, fetchImpl: f, sleep: noSleep });
  await assert.rejects(c.post('1/media_publish', { creation_id: 'x' }));
  assert.equal(f.calls.length, 1);
});

test('네트워크 오류도 GET에서만 재시도한다', async () => {
  const f = mockFetch([new Error('fetch failed'), { body: { ok: true } }]);
  const c = createGraphClient({ token: TOKEN, fetchImpl: f, sleep: noSleep });
  assert.deepEqual(await c.get('me'), { ok: true });
});

test('토큰이 없으면 생성에 실패한다', () => {
  assert.throws(() => createGraphClient({ token: '' }));
});
