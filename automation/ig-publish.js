import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { createGraphClient, requireEnv } from './lib/graph.js';

export const CAPTION_MAX = 2200;
export const HASHTAG_MAX = 30;

export function validatePost({ imageUrl, caption }) {
  const errors = [];
  const warnings = [];
  let url;
  try {
    url = new URL(imageUrl);
  } catch {
    errors.push('image-url이 올바른 URL이 아니다');
  }
  if (url) {
    if (url.protocol !== 'https:') errors.push('image-url은 https 공개 주소여야 한다');
    if (!/\.jpe?g$/i.test(url.pathname)) warnings.push('image-url이 .jpg/.jpeg로 끝나지 않는다. 게시 이미지는 JPEG만 지원된다');
  }
  const text = caption ?? '';
  if (!text.trim()) errors.push('caption이 비어 있다');
  if ([...text].length > CAPTION_MAX) errors.push(`caption이 ${CAPTION_MAX}자를 넘는다`);
  const tags = text.match(/#[\p{L}\p{N}_]+/gu) ?? [];
  if (tags.length > HASHTAG_MAX) errors.push(`해시태그가 ${HASHTAG_MAX}개를 넘는다`);
  return { errors, warnings };
}

export async function publishImage(
  client,
  igUserId,
  { imageUrl, caption },
  { pollMs = 3000, timeoutMs = 60000, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), log = () => {} } = {},
) {
  const limit = await client.get(`${igUserId}/content_publishing_limit`, { fields: 'quota_usage,config' });
  const row = limit.data?.[0];
  if (row?.config?.quota_total && row.quota_usage >= row.config.quota_total) {
    throw new Error(`24시간 게시 한도에 도달했다 (${row.quota_usage}/${row.config.quota_total})`);
  }

  const { id: containerId } = await client.post(`${igUserId}/media`, { image_url: imageUrl, caption });
  log(`컨테이너 생성: ${containerId}`);

  for (let waited = 0; ; waited += pollMs) {
    const { status_code: status } = await client.get(containerId, { fields: 'status_code' });
    if (status === 'FINISHED') break;
    if (status === 'ERROR' || status === 'EXPIRED') {
      throw new Error(`컨테이너 처리 실패: ${status} (container ${containerId})`);
    }
    if (waited >= timeoutMs) throw new Error(`컨테이너 처리 시간 초과 (container ${containerId})`);
    await sleep(pollMs);
  }

  const { id: mediaId } = await client.post(`${igUserId}/media_publish`, { creation_id: containerId });
  return { containerId, mediaId };
}

async function main() {
  const { values } = parseArgs({
    options: {
      'image-url': { type: 'string' },
      caption: { type: 'string' },
      'caption-file': { type: 'string' },
      publish: { type: 'boolean', default: false },
    },
  });
  const caption = values['caption-file'] ? readFileSync(values['caption-file'], 'utf8').trim() : values.caption;
  const post = { imageUrl: values['image-url'], caption };

  const { errors, warnings } = validatePost(post);
  warnings.forEach((w) => console.warn(`경고: ${w}`));
  if (errors.length) {
    errors.forEach((e) => console.error(`오류: ${e}`));
    process.exit(1);
  }

  if (!values.publish) {
    console.log('드라이런: 검증만 수행했다. 실제 게시는 --publish를 붙인다.');
    console.log(JSON.stringify({ image_url: post.imageUrl, caption_chars: [...caption].length }, null, 2));
    return;
  }

  const env = requireEnv(['IG_USER_ID', 'IG_ACCESS_TOKEN']);
  const client = createGraphClient({ token: env.IG_ACCESS_TOKEN });
  const result = await publishImage(client, env.IG_USER_ID, post, { log: console.log });
  console.log(`게시 완료: media ${result.mediaId}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(`실패: ${err.message}`);
    process.exit(1);
  });
}
