const DEFAULT_BASE = 'https://graph.facebook.com';
const DEFAULT_VERSION = 'v25.0';

export class GraphError extends Error {
  constructor(message, { status, code, subcode, type, transient = false } = {}) {
    super(message);
    this.name = 'GraphError';
    Object.assign(this, { status, code, subcode, type, transient });
  }
}

export function requireEnv(names) {
  const missing = names.filter((n) => !process.env[n]);
  if (missing.length) throw new Error(`환경 변수가 없다: ${missing.join(', ')}`);
  return Object.fromEntries(names.map((n) => [n, process.env[n]]));
}

// 조회(GET)만 재시도한다. 게시(POST)는 응답 유실 시 중복 게시가 되므로 재시도하지 않는다.
export function createGraphClient({
  token,
  version = process.env.GRAPH_API_VERSION || DEFAULT_VERSION,
  baseUrl = process.env.GRAPH_BASE_URL || DEFAULT_BASE,
  fetchImpl = globalThis.fetch,
  maxRetries = 3,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
} = {}) {
  if (!token) throw new Error('access token이 필요하다');

  const redact = (text) => String(text ?? '').split(token).join('***');

  async function request(method, path, params = {}) {
    const url = new URL(`${baseUrl}/${version}/${path.replace(/^\//, '')}`);
    const entries = Object.entries({ ...params, access_token: token }).filter(([, v]) => v !== undefined);
    const init = { method };
    if (method === 'GET') entries.forEach(([k, v]) => url.searchParams.set(k, String(v)));
    else init.body = new URLSearchParams(entries.map(([k, v]) => [k, String(v)]));

    const attempts = method === 'GET' ? maxRetries + 1 : 1;
    for (let i = 0; i < attempts; i++) {
      let error;
      try {
        const res = await fetchImpl(url, init);
        const body = await res.json().catch(() => ({}));
        if (res.ok && !body.error) return body;
        const e = body.error ?? {};
        error = new GraphError(redact(e.message ?? `HTTP ${res.status}`), {
          status: res.status,
          code: e.code,
          subcode: e.error_subcode,
          type: e.type,
          transient: e.is_transient === true || res.status >= 500,
        });
      } catch (err) {
        error = new GraphError(redact(err.message), { transient: true });
      }
      if (!error.transient || i === attempts - 1) throw error;
      await sleep(500 * 2 ** i);
    }
  }

  return {
    get: (path, params) => request('GET', path, params),
    post: (path, params) => request('POST', path, params),
  };
}
