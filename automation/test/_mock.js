export function mockFetch(responses) {
  const queue = [...responses];
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url: String(url), init });
    const r = queue.shift();
    if (!r) throw new Error('mock 응답이 소진되었다');
    if (r instanceof Error) throw r;
    const status = r.status ?? 200;
    return { ok: status < 400, status, json: async () => r.body };
  };
  fn.calls = calls;
  return fn;
}
export const noSleep = async () => {};
