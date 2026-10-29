import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePost, publishImage } from '../ig-publish.js';
import { createGraphClient } from '../lib/graph.js';
import { mockFetch, noSleep } from './_mock.js';

const post = { imageUrl: 'https://cdn.example.com/a.jpg', caption: '블루캣의 밤 #bluecat' };
const opts = { sleep: noSleep, pollMs: 1, timeoutMs: 5 };
const client = (responses) => {
  const f = mockFetch(responses);
  return { f, c: createGraphClient({ token: 'T', fetchImpl: f, sleep: noSleep }) };
};
const limitOk = { body: { data: [{ quota_usage: 3, config: { quota_total: 100 } }] } };

test('검증: 정상 입력은 오류가 없다', () => {
  assert.deepEqual(validatePost(post).errors, []);
});

test('검증: http, 빈 캡션, 2200자 초과, 해시태그 31개를 막는다', () => {
  assert.ok(validatePost({ ...post, imageUrl: 'http://x.com/a.jpg' }).errors.length);
  assert.ok(validatePost({ ...post, caption: '  ' }).errors.length);
  assert.ok(validatePost({ ...post, caption: 'a'.repeat(2201) }).errors.length);
  const tags = Array.from({ length: 31 }, (_, i) => `#t${i}`).join(' ');
  assert.ok(validatePost({ ...post, caption: tags }).errors.length);
});

test('검증: JPEG가 아닌 확장자는 경고만 낸다', () => {
  const r = validatePost({ ...post, imageUrl: 'https://x.com/a.png' });
  assert.deepEqual(r.errors, []);
  assert.equal(r.warnings.length, 1);
});

test('게시: 한도 확인 → 컨테이너 → 상태 폴링 → 게시 순서로 호출한다', async () => {
  const { f, c } = client([
    limitOk,
    { body: { id: 'C1' } },
    { body: { status_code: 'IN_PROGRESS' } },
    { body: { status_code: 'FINISHED' } },
    { body: { id: 'M1' } },
  ]);
  const r = await publishImage(c, 'IG1', post, opts);
  assert.deepEqual(r, { containerId: 'C1', mediaId: 'M1' });
  assert.match(f.calls[0].url, /IG1\/content_publishing_limit/);
  assert.match(f.calls[1].url, /IG1\/media$/);
  assert.match(f.calls[4].url, /IG1\/media_publish$/);
  assert.equal(f.calls[4].init.body.get('creation_id'), 'C1');
});

test('게시: 한도에 도달하면 컨테이너를 만들지 않는다', async () => {
  const { f, c } = client([{ body: { data: [{ quota_usage: 100, config: { quota_total: 100 } }] } }]);
  await assert.rejects(publishImage(c, 'IG1', post, opts), /한도/);
  assert.equal(f.calls.length, 1);
});

test('게시: 컨테이너가 ERROR면 게시하지 않는다', async () => {
  const { f, c } = client([limitOk, { body: { id: 'C1' } }, { body: { status_code: 'ERROR' } }]);
  await assert.rejects(publishImage(c, 'IG1', post, opts), /ERROR/);
  assert.equal(f.calls.some((x) => x.url.endsWith('media_publish')), false);
});

test('게시: 처리 시간 초과 시 컨테이너 ID를 오류에 남기고 게시하지 않는다', async () => {
  const stuck = { body: { status_code: 'IN_PROGRESS' } };
  const { f, c } = client([limitOk, { body: { id: 'C9' } }, stuck, stuck, stuck, stuck, stuck, stuck, stuck]);
  await assert.rejects(publishImage(c, 'IG1', post, opts), /C9/);
  assert.equal(f.calls.some((x) => x.url.endsWith('media_publish')), false);
});
