// Server-only connector: call from protected server routes, never client components.

export class MetaInsightsError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = 'MetaInsightsError';
  }
}

export type MetaLevel = 'campaign' | 'adset' | 'ad';
export type MetaInsightsInput = {
  account: string;
  start: string;
  end: string;
  level: MetaLevel;
  token: string;
  allowedAccountIds: readonly string[];
  fetchImpl?: typeof fetch;
};

export type MetaInsightRow = {
  campaignId?: string; campaignName?: string; adsetId?: string; adsetName?: string;
  adId?: string; adName?: string; spend: number; impressions: number; clicks: number;
  dateStart: string; dateStop: string;
};
export type MetaInsightsResult = {
  provider: 'meta'; scope: { account: string; level: MetaLevel };
  dateRange: { start: string; end: string }; collectedAt: string;
  rows: MetaInsightRow[]; warnings: string[]; status: 'succeeded' | 'partial';
};

function numeric(value: unknown, field: string): number {
  if (typeof value !== 'string' || !/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)) {
    throw new MetaInsightsError(`Invalid Meta ${field} metric`, 502);
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new MetaInsightsError(`Invalid Meta ${field} metric`, 502);
  return parsed;
}

function normalizeRow(value: unknown): MetaInsightRow {
  if (!value || typeof value !== 'object') throw new MetaInsightsError('Invalid Meta insight row', 502);
  const row = value as Record<string, unknown>;
  if (typeof row.date_start !== 'string' || typeof row.date_stop !== 'string') {
    throw new MetaInsightsError('Invalid Meta insight period', 502);
  }
  const normalized: MetaInsightRow = {
    spend: numeric(row.spend, 'spend'), impressions: numeric(row.impressions, 'impressions'),
    clicks: numeric(row.clicks, 'clicks'), dateStart: row.date_start, dateStop: row.date_stop,
  };
  for (const [source, dest] of [
    ['campaign_id', 'campaignId'], ['campaign_name', 'campaignName'],
    ['adset_id', 'adsetId'], ['adset_name', 'adsetName'],
    ['ad_id', 'adId'], ['ad_name', 'adName'],
  ] as const) {
    if (row[source] !== undefined) {
      if (typeof row[source] !== 'string') throw new MetaInsightsError('Invalid Meta insight dimension', 502);
      normalized[dest] = row[source];
    }
  }
  return normalized;
}

export async function readMetaInsights(input: MetaInsightsInput): Promise<MetaInsightsResult> {
  if (!/^act_[0-9]+$/.test(input.account)) {
    throw new MetaInsightsError('Invalid Meta account ID', 400);
  }
  if (!Array.isArray(input.allowedAccountIds) || !input.allowedAccountIds.includes(input.account)) {
    throw new MetaInsightsError('Meta account not authorized', 403);
  }
  const parseDate = (value: string) => {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return NaN;
    const date = Date.parse(`${value}T00:00:00.000Z`);
    return Number.isFinite(date) && new Date(date).toISOString().slice(0, 10) === value ? date : NaN;
  };
  const start = parseDate(input.start);
  const end = parseDate(input.end);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start || end - start > 92 * 86_400_000) {
    throw new MetaInsightsError('Invalid Meta date range', 400);
  }
  if (!(['campaign', 'adset', 'ad'] as unknown[]).includes(input.level)) {
    throw new MetaInsightsError('Invalid Meta insights level', 400);
  }
  if (typeof input.token !== 'string' || !input.token.trim()) {
    throw new MetaInsightsError('Meta token is not configured', 503);
  }
  const url = new URL(`https://graph.facebook.com/v26.0/${input.account}/insights`);
  url.searchParams.set('fields', [
    'campaign_id', 'campaign_name', 'adset_id', 'adset_name', 'ad_id', 'ad_name',
    'spend', 'impressions', 'clicks', 'date_start', 'date_stop',
  ].join(','));
  url.searchParams.set('level', input.level);
  url.searchParams.set('time_range', JSON.stringify({ since: input.start, until: input.end }));
  const rows: MetaInsightRow[] = [];
  const seenCursors = new Set<string>();
  let partial = false;
  for (let page = 0; page < 5; page++) {
    let response: Response;
    try {
      response = await (input.fetchImpl ?? fetch)(url.toString(), {
        method: 'GET', headers: { Authorization: `Bearer ${input.token}` },
      });
    } catch {
      throw new MetaInsightsError('Meta insights transport error', 502);
    }
    if (!response.ok) {
      throw new MetaInsightsError(response.status === 429 ? 'Meta rate limit exceeded' : 'Meta insights upstream error', response.status === 429 ? 429 : 502);
    }
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new MetaInsightsError('Invalid Meta insights response', 502);
    }
    if (!payload || typeof payload !== 'object' || !Array.isArray((payload as { data?: unknown }).data)) {
      throw new MetaInsightsError('Invalid Meta insights response', 502);
    }
    const pageData = payload as { data: unknown[]; paging?: { next?: unknown; cursors?: { after?: unknown } } };
    rows.push(...pageData.data.map(normalizeRow));
    if (!pageData.paging?.next) break;
    if (page === 4) { partial = true; break; }
    const cursor = pageData.paging.cursors?.after;
    if (typeof cursor !== 'string' || !cursor || seenCursors.has(cursor)) {
      throw new MetaInsightsError('Invalid Meta pagination cursor', 502);
    }
    seenCursors.add(cursor);
    url.searchParams.set('after', cursor);
  }
  return {
    provider: 'meta', scope: { account: input.account, level: input.level },
    dateRange: { start: input.start, end: input.end }, collectedAt: new Date().toISOString(),
    rows, warnings: partial ? ['Meta insights truncated after 5 pages'] : [],
    status: partial ? 'partial' : 'succeeded',
  };
}
