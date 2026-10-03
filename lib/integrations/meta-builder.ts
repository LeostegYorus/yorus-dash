// Server-only: use through the authenticated dashboard route.
import { MetaInsightsError, type MetaInsightsInput } from './meta';
import { BASE_META_METRICS, META_DISCOVERY_FIELDS, discoverMetaMetrics, getMetaMetric, type MetaMetric } from '../meta-metrics';

const CORE = ['spend', 'impressions', 'clicks'];
const IDENTITIES = [
  ['campaign_id', 'campaignId'], ['campaign_name', 'campaignName'],
  ['adset_id', 'adsetId'], ['adset_name', 'adsetName'],
  ['ad_id', 'adId'], ['ad_name', 'adName'],
  ['date_start', 'dateStart'], ['date_stop', 'dateStop'],
] as const;
type RawRow = Record<string, unknown>;
function metricValue(raw: RawRow, metric: MetaMetric): number | null {
  let value = raw[metric.field];
  if (metric.actionType) {
    const matches = Array.isArray(value) ? value.filter(item => item?.action_type === metric.actionType) : [];
    value = matches.length === 1 ? matches[0].value : undefined;
  }
  if (typeof value !== 'number' && (typeof value !== 'string' || !/^-?\d+(?:\.\d+)?$/.test(value))) return null;
  const normalized = Number(value) * metric.scale;
  return Number.isFinite(normalized) ? normalized : null;
}
type Page = { data: RawRow[]; summary?: RawRow; paging?: { next?: unknown; cursors?: { after?: unknown } } };
const isRecord = (value: unknown): value is RawRow => !!value && typeof value === 'object' && !Array.isArray(value);
class UnsupportedFieldError extends MetaInsightsError {
  constructor() { super('Meta requested field unsupported', 502); }
}
async function fetchPage(input: MetaBuilderInput, url: URL, timeoutMs: number): Promise<Page> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      (async () => {
        let response: Response;
        try {
          response = await (input.fetchImpl ?? fetch)(url.toString(), {
            method: 'GET', redirect: 'error', headers: { Authorization: `Bearer ${input.token}` }, signal: controller.signal,
          });
        } catch { throw new MetaInsightsError('Meta insights transport error', 502); }
        if (!response.ok) {
          if (response.status === 400) {
            const body: unknown = await response.json().catch(() => null);
            const error = isRecord(body) && isRecord(body.error) ? body.error : {};
            const message = typeof error.message === 'string' ? error.message : '';
            const requestedFields = url.searchParams.get('fields')!.split(',');
            if (error.code === 100 && /field/i.test(message) && /not valid|invalid|unsupported|not supported|nonexisting|does not exist/i.test(message) && requestedFields.some(field => new RegExp(`\\b${field}\\b`).test(message))) throw new UnsupportedFieldError();
          }
          throw new MetaInsightsError(response.status === 429 ? 'Meta rate limit exceeded' : 'Meta insights upstream error', response.status === 429 ? 429 : 502);
        }
        let payload: unknown;
        try { payload = await response.json(); } catch { throw new MetaInsightsError('Invalid Meta insights response', 502); }
        if (!isRecord(payload) || !Array.isArray(payload.data) || payload.data.length > 500) throw new MetaInsightsError('Invalid Meta insights response', 502);
        for (const row of payload.data) {
          if (!isRecord(row) || (row.account_id !== undefined && row.account_id !== input.account.slice(4)) || typeof row[`${input.level}_id`] !== 'string' || !/^\d+$/.test(row[`${input.level}_id`] as string) || row.date_start !== input.start || row.date_stop !== input.end || IDENTITIES.some(([field]) => row[field] !== undefined && typeof row[field] !== 'string')) throw new MetaInsightsError('Invalid Meta insight identity or period', 502);
        }
        return payload as Page;
      })(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => { reject(new MetaInsightsError('Meta insights timeout', 502)); controller.abort(); }, timeoutMs);
      }),
    ]);
  } finally { clearTimeout(timer); }
}
export type MetaBuilderInput = MetaInsightsInput & { metrics?: string[]; discover?: boolean };
export async function readMetaBuilderInsights(input: MetaBuilderInput) {
  if (!/^act_[0-9]+$/.test(input.account)) throw new MetaInsightsError('Invalid Meta account ID', 400);
  if (!Array.isArray(input.allowedAccountIds) || !input.allowedAccountIds.includes(input.account)) throw new MetaInsightsError('Meta account not authorized', 403);
  const parseDate = (value: string) => {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return NaN;
    const parsed = Date.parse(`${value}T00:00:00.000Z`);
    return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value ? parsed : NaN;
  };
  const start = parseDate(input.start), end = parseDate(input.end);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start || end - start > 92 * 86_400_000) throw new MetaInsightsError('Invalid Meta date range', 400);
  if (!['campaign', 'adset', 'ad'].includes(input.level)) throw new MetaInsightsError('Invalid Meta insights level', 400);
  if (input.discover !== undefined && typeof input.discover !== 'boolean') throw new MetaInsightsError('Invalid Meta discovery option', 400);
  if (input.metrics !== undefined && (!Array.isArray(input.metrics) || input.metrics.length < 1 || input.metrics.length > 200 || new Set(input.metrics).size !== input.metrics.length || input.metrics.some(id => typeof id !== 'string' || !getMetaMetric(id)))) throw new MetaInsightsError('Invalid Meta metrics', 400);
  if (typeof input.token !== 'string' || !input.token.trim()) throw new MetaInsightsError('Meta token is not configured', 503);
  const selected = [...new Set([...CORE, ...(input.metrics ?? [])])].map(id => getMetaMetric(id)!);
  const fields = [...new Set([...selected.map(metric => metric.field), ...(input.discover ? META_DISCOVERY_FIELDS : [])])];
  const baseUrl = new URL(`https://graph.facebook.com/v26.0/${input.account}/insights`);
  baseUrl.searchParams.set('level', input.level);
  baseUrl.searchParams.set('time_range', JSON.stringify({ since: input.start, until: input.end }));
  baseUrl.searchParams.set('default_summary', 'true');
  baseUrl.searchParams.set('limit', '500');
  const merged = new Map<string, RawRow>();
  const summary: RawRow = {};
  const warnings: string[] = [];
  const optional = fields.filter(field => !CORE.includes(field));
  const groups = optional.length ? Array.from({ length: Math.ceil(optional.length / 9) }, (_, i) => [...CORE, ...optional.slice(i * 9, i * 9 + 9)]) : [CORE];
  const deadline = Date.now() + 30_000;
  let requests = 0;
  let coreLoaded = false;
  const loadGroup = async (group: string[]) => {
    const url = new URL(baseUrl);
    url.searchParams.set('fields', [...IDENTITIES.map(([field]) => field), ...group].join(','));
    const cursors = new Set<string>();
    const groupRows: RawRow[] = [];
    let groupSummary: RawRow = {};
    for (let page = 0; page < 5; page++) {
      const remaining = deadline - Date.now();
      if (requests >= 40 || remaining <= 0) throw new MetaInsightsError('Meta collection budget exhausted', 502);
      requests++;
      const payload = await fetchPage(input, url, Math.min(10_000, remaining));
      groupRows.push(...payload.data);
      if (page === 0 && isRecord(payload.summary)) groupSummary = payload.summary;
      if (!payload.paging?.next) break;
      if (page === 4) { warnings.push('Meta insights truncated after 5 pages'); break; }
      const cursor = payload.paging.cursors?.after;
      if (typeof cursor !== 'string' || !/^[A-Za-z0-9_+=/.-]{1,2048}$/.test(cursor) || cursors.has(cursor)) throw new MetaInsightsError('Invalid Meta pagination cursor', 502);
      cursors.add(cursor);
      url.searchParams.set('after', cursor);
    }
    // Commit only a successful group. A later-page failure must not leave plausible numbers.
    for (const raw of groupRows) {
      const key = String(raw[`${input.level}_id`]);
      const prior = merged.get(key) ?? Object.fromEntries(IDENTITIES.filter(([field]) => raw[field] !== undefined).map(([field]) => [field, raw[field]]));
      for (const field of group) if (!CORE.includes(field) || prior[field] === undefined) prior[field] = raw[field];
      merged.set(key, prior);
    }
    for (const field of group) if (!CORE.includes(field) || summary[field] === undefined) summary[field] = groupSummary[field];
    coreLoaded = true;
  };
  for (const group of groups) {
    try {
      try { await loadGroup(group); }
      catch (error) {
        if (!(error instanceof UnsupportedFieldError) || group.length === CORE.length) throw error;
        if (!coreLoaded) await loadGroup(CORE);
        for (const field of group.filter(field => !CORE.includes(field))) {
          try { await loadGroup([...CORE, field]); }
          catch (error) {
            if (!(error instanceof UnsupportedFieldError)) throw error;
            warnings.push(`Meta field unavailable: ${field}`);
          }
        }
      }
    } catch (error) {
      if (!coreLoaded) throw error;
      warnings.push(error instanceof MetaInsightsError ? error.message : 'Meta collection stopped');
      break; // Permission/rate/transport/budget errors never trigger field retries.
    }
  }
  const rawRows = [...merged.values()];
  const rows = rawRows.map((raw: Record<string, unknown>) => ({
    ...Object.fromEntries(IDENTITIES.filter(([field]) => raw[field] !== undefined).map(([field, key]) => [key, raw[field]])),
    ...Object.fromEntries(selected.map(metric => [metric.id, metricValue(raw, metric)])),
  }));
  const totals = Object.fromEntries(selected.map(metric => [metric.id, metricValue(summary, metric)]));
  const unavailableMetrics = selected.filter(metric => totals[metric.id] === null && rows.every(row => row[metric.id] === null)).map(metric => metric.id);
  warnings.push(...unavailableMetrics.map(id => `Meta metric unavailable: ${id}`));
  if (selected.some(metric => totals[metric.id] === null)) warnings.push('Meta summary unavailable for one or more metrics; totals left null');
  if (rows.some(row => selected.some(metric => row[metric.id] === null))) warnings.push('Meta rows have missing metric values; left null');
  return {
    provider: 'meta' as const, scope: { account: input.account, level: input.level },
    dateRange: { start: input.start, end: input.end }, collectedAt: new Date().toISOString(),
    rows, totals, metrics: input.discover ? discoverMetaMetrics([...rawRows, summary]) : [...new Map([...BASE_META_METRICS, ...selected].map(metric => [metric.id, metric])).values()], unavailableMetrics, warnings, status: warnings.length ? 'partial' as const : 'succeeded' as const,
  };
}
