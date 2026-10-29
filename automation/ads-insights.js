import { pathToFileURL } from 'node:url';
import { mkdirSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { createGraphClient, requireEnv } from './lib/graph.js';

export const DEFAULT_FIELDS = 'campaign_id,campaign_name,spend,impressions,reach,clicks,ctr,cpc,cpm';

export function normalizeAccountId(id) {
  const digits = String(id).replace(/^act_/, '');
  if (!/^\d+$/.test(digits)) throw new Error('광고 계정 ID는 숫자(또는 act_숫자)여야 한다');
  return `act_${digits}`;
}

export async function fetchInsights(
  client,
  accountId,
  { level = 'campaign', fields = DEFAULT_FIELDS, datePreset = 'last_7d', since, until, maxPages = 20 } = {},
) {
  const params = { level, fields, limit: 100 };
  if (since && until) params.time_range = JSON.stringify({ since, until });
  else params.date_preset = datePreset;

  const rows = [];
  let after;
  for (let page = 0; page < maxPages; page++) {
    const body = await client.get(`${normalizeAccountId(accountId)}/insights`, { ...params, after });
    rows.push(...(body.data ?? []));
    after = body.paging?.next ? body.paging.cursors?.after : undefined;
    if (!after) return rows;
  }
  throw new Error(`페이지가 ${maxPages}개를 넘어 중단했다. 기간이나 level을 좁혀라`);
}

export function toCsv(rows) {
  if (!rows.length) return '';
  const cols = [...new Set(rows.flatMap(Object.keys))];
  const esc = (v) => {
    const s = typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n');
}

async function main() {
  const { values } = parseArgs({
    options: {
      level: { type: 'string', default: 'campaign' },
      fields: { type: 'string', default: DEFAULT_FIELDS },
      preset: { type: 'string', default: 'last_7d' },
      since: { type: 'string' },
      until: { type: 'string' },
      out: { type: 'string', default: 'out' },
    },
  });
  const env = requireEnv(['META_AD_ACCOUNT_ID', 'META_ADS_TOKEN']);
  const client = createGraphClient({ token: env.META_ADS_TOKEN });
  const rows = await fetchInsights(client, env.META_AD_ACCOUNT_ID, {
    level: values.level,
    fields: values.fields,
    datePreset: values.preset,
    since: values.since,
    until: values.until,
  });
  mkdirSync(values.out, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 10);
  writeFileSync(`${values.out}/insights-${stamp}.json`, JSON.stringify(rows, null, 2));
  writeFileSync(`${values.out}/insights-${stamp}.csv`, toCsv(rows));
  console.table(rows);
  console.log(`${rows.length}행 저장: ${values.out}/insights-${stamp}.{json,csv}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(`실패: ${err.message}`);
    process.exit(1);
  });
}
