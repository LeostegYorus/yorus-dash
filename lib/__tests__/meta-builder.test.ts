// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MetaInsightsError, type MetaInsightsInput } from '../integrations/meta';

import { BASE_META_METRICS, META_DISCOVERY_FIELDS } from '../meta-metrics';
const input: MetaInsightsInput = { account: 'act_1', allowedAccountIds: ['act_1'], start: '2026-09-01', end: '2026-09-25', level: 'campaign', token: 'synthetic-token' };
const row = (extra: Record<string, unknown> = {}) => ({ campaign_id: '1', campaign_name: 'Campaign', date_start: input.start, date_stop: input.end, spend: '10', impressions: '100', clicks: '5', ...extra });
const response = (data: unknown[], summary: unknown = { spend: '10', impressions: '100', clicks: '5' }, extra = {}) => Response.json({ data, summary, ...extra });
const read = async (options: Record<string, unknown> = {}) => (await import('../integrations/meta-builder')).readMetaBuilderInsights({ ...input, ...options });
afterEach(() => vi.useRealTimers());

describe('Meta builder connector', () => {
  it.each([
    [{ account: 'https://evil.test' }, 400], [{ account: 'act_2' }, 403],
    [{ start: '2026-02-30' }, 400], [{ start: '2025-01-01' }, 400],
    [{ end: '2026-08-01' }, 400], [{ level: 'account' }, 400], [{ token: '' }, 503],
    [{ metrics: ['access_token'] }, 400], [{ metrics: ['spend', 'spend'] }, 400],
    [{ metrics: [] }, 400], [{ metrics: ['actions:__proto__'] }, 400], [{ discover: 'true' }, 400],
  ])('rejects invalid or unauthorized input %j before fetching', async (options, status) => {
    const fetchImpl = vi.fn(async () => response([row()]));
    await expect(read({ ...options, fetchImpl })).rejects.toMatchObject({ status, name: 'MetaInsightsError' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it('requests only selected fields, normalizes percentages and exact action subtypes, and uses summary totals', async () => {
    const subtype = 'offsite_conversion.fb_pixel_custom.venda';
    const fetchImpl = vi.fn(async () => response([
      row({ reach: '80', ctr: '5', actions: [{ action_type: subtype, value: '2' }, { action_type: 'purchase', value: '999' }] }),
      row({ campaign_id: '2', reach: '60', ctr: '10', actions: [{ action_type: subtype, value: '3' }] }),
    ], { spend: '20', impressions: '200', clicks: '10', reach: '90', ctr: '7.5', actions: [{ action_type: subtype, value: '5' }] }));
    const result = await read({ fetchImpl, metrics: ['reach', 'ctr', `actions:${subtype}`, 'cpc'] });
    expect(result.rows[0]).toMatchObject({ reach: 80, ctr: .05, [`actions:${subtype}`]: 2, cpc: null });
    expect(result.rows[0]).not.toHaveProperty('actions');
    expect(result.totals).toMatchObject({ reach: 90, ctr: .075, [`actions:${subtype}`]: 5, cpc: null });
    expect(result.unavailableMetrics).toContain('cpc');
    expect(result.status).toBe('partial');
    const fields = new URL((fetchImpl.mock.calls[0] as unknown as [string])[0]).searchParams.get('fields')!.split(',');
    expect(fields).toEqual(expect.arrayContaining(['spend', 'impressions', 'clicks', 'reach', 'ctr', 'actions', 'cpc']));
    expect(fields).not.toContain('action_values');
    expect(result.metrics.some(metric => metric.id === 'reach')).toBe(true);
  });

  it('leaves absent summaries and invalid/missing values null, never summing reach or inventing zero', async () => {
    const fetchImpl = vi.fn(async () => response([row({ reach: '80', ctr: '', spend: null, impressions: false }), row({ campaign_id: '2', reach: '70', ctr: 'Infinity' })], null));
    const result = await read({ fetchImpl, metrics: ['reach', 'ctr'] });
    expect(result.rows[0]).toMatchObject({ reach: 80, ctr: null, spend: null, impressions: null });
    expect(result.totals).toEqual({ spend: null, impressions: null, clicks: null, reach: null, ctr: null });
    expect(result.warnings.join(' ')).toMatch(/summary/i);
    expect(result.status).toBe('partial');
  });

  it('paginates on a fixed origin with validated cursors, stops at five pages, and does not sum summaries', async () => {
    const fetchImpl = vi.fn(async () => response([row({ campaign_id: String(fetchImpl.mock.calls.length) })], { spend: '50', impressions: '500', clicks: '25' }, { paging: { next: 'https://evil.test/steal', cursors: { after: `cursor_${fetchImpl.mock.calls.length}` } } }));
    const result = await read({ fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(5);
    expect(result.rows).toHaveLength(5);
    expect(result.totals.spend).toBe(50);
    expect(result.status).toBe('partial');
    expect(result.warnings.join(' ')).toMatch(/5 pages/);
    for (const [url] of fetchImpl.mock.calls as unknown as [string][]) expect(new URL(url).origin).toBe('https://graph.facebook.com');
    expect(new URL((fetchImpl.mock.calls[1] as unknown as [string])[0]).searchParams.get('after')).toBe('cursor_1');
  });
  it.each(['', 'bad\ncursor', 'x'.repeat(2049)])('rejects invalid pagination cursor', async cursor => {
    await expect(read({ fetchImpl: vi.fn(async () => response([row()], {}, { paging: { next: 'https://evil.test', cursors: { after: cursor } } })) })).rejects.toMatchObject({ status: 502 });
  });
  it('rejects repeated pagination cursors', async () => {
    const fetchImpl = vi.fn(async () => response([row()], {}, { paging: { next: 'yes', cursors: { after: 'same' } } }));
    await expect(read({ fetchImpl })).rejects.toMatchObject({ status: 502 });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it.each([401, 403, 429, 500])('sanitizes HTTP %i without retries or leaked upstream details', async status => {
    const fetchImpl = vi.fn(async () => Response.json({ error: { code: 190, message: input.token } }, { status }));
    await expect(read({ fetchImpl })).rejects.toMatchObject({ name: 'MetaInsightsError', status: status === 429 ? 429 : 502 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
  it.each([
    async () => { throw new Error(input.token); },
    async () => new Response(input.token),
    async () => Response.json({ data: 'invalid' }),
    async () => response([null]),
    async () => response([row({ campaign_id: undefined })]),
    async () => response([row({ campaign_name: {} })]),
    async () => response([row({ date_start: '2026-08-01' })]),
  ])('rejects malformed responses and sanitizes exceptions', async fetchImpl => {
    const error = await read({ fetchImpl }).catch(error => error);
    expect(error).toBeInstanceOf(MetaInsightsError);
    expect(error.status).toBe(502);
    expect(error.message).not.toContain(input.token);
  });
  it('times out even when an injected fetch ignores abort', async () => {
    vi.useFakeTimers();
    const promise = read({ fetchImpl: vi.fn(() => new Promise(() => {})) });
    const rejection = expect(promise).rejects.toMatchObject({ status: 502, message: expect.stringMatching(/timeout/i) });
    await vi.advanceTimersByTimeAsync(10_001);
    await rejection;
  });

  it('discovers exact custom action IDs only on opt-in, including summary-only subtypes', async () => {
    const custom = 'offsite_conversion.fb_pixel_custom.venda';
    const fetchImpl = vi.fn(async () => response([row({ actions: [{ action_type: custom, value: '2' }] })], { spend: '10', impressions: '100', clicks: '5', conversions: [{ action_type: 'custom.summary_only', value: '4' }] }));
    const result = await read({ fetchImpl, discover: true });
    expect(result.metrics.map(metric => metric.id)).toEqual(expect.arrayContaining([`actions:${custom}`, 'conversions:custom.summary_only', 'reach']));
    expect(result.rows[0]).not.toHaveProperty(`actions:${custom}`);
    const fields = new URL((fetchImpl.mock.calls[0] as unknown as [string])[0]).searchParams.get('fields')!.split(',');
    expect(fields).toEqual(expect.arrayContaining(META_DISCOVERY_FIELDS));
  });

  it('chunks many fields into at most twelve metric fields and merges by entity ID, not row order', async () => {
    const selected = BASE_META_METRICS.filter(metric => !metric.actionType && !['spend', 'impressions', 'clicks'].includes(metric.id)).slice(0, 25);
    const fetchImpl = vi.fn(async (url: string) => {
      const fields = new URL(url).searchParams.get('fields')!.split(',');
      const values = Object.fromEntries(fields.filter(field => selected.some(metric => metric.field === field)).map(field => [field, '12']));
      const rows = [row({ ...values, campaign_id: '1' }), row({ ...Object.fromEntries(Object.keys(values).map(field => [field, '24'])), campaign_id: '2' })];
      return response(fetchImpl.mock.calls.length % 2 ? rows : rows.reverse(), { spend: '20', impressions: '200', clicks: '10', ...values });
    });
    const result = await read({ fetchImpl, metrics: selected.map(metric => metric.id) });
    expect(fetchImpl.mock.calls.length).toBeGreaterThan(1);
    expect(fetchImpl.mock.calls.length).toBeLessThanOrEqual(4);
    expect(result.rows).toHaveLength(2);
    for (const metric of selected) {
      expect(result.rows.find(row => row.campaignId === '1')?.[metric.id]).toBe(12 * metric.scale);
      expect(result.rows.find(row => row.campaignId === '2')?.[metric.id]).toBe(24 * metric.scale);
    }
    for (const [url] of fetchImpl.mock.calls) {
      const fields = new URL(url).searchParams.get('fields')!.split(',').filter(field => !field.endsWith('_id') && !field.endsWith('_name') && !field.startsWith('date_'));
      expect(fields.length).toBeLessThanOrEqual(12);
      expect(fields).toEqual(expect.arrayContaining(['spend', 'impressions', 'clicks']));
    }
  });

  it('isolates code100 unsupported fields, preserving core and other selected values', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      const fields = new URL(url).searchParams.get('fields')!.split(',');
      if (fields.includes('reach')) return Response.json({ error: { code: 100, message: '(#100) reach is not valid for fields param. synthetic-token' } }, { status: 400 });
      return response([row({ ctr: '5' })], { spend: '10', impressions: '100', clicks: '5', ctr: '5' });
    });
    const result = await read({ fetchImpl, metrics: ['reach', 'ctr'] });
    expect(result.rows[0]).toMatchObject({ spend: 10, reach: null, ctr: .05 });
    expect(result.totals).toMatchObject({ spend: 10, reach: null, ctr: .05 });
    expect(result.unavailableMetrics).toContain('reach');
    expect(result.status).toBe('partial');
    expect(result.warnings.join(' ')).toMatch(/reach/);
    expect(JSON.stringify(result)).not.toContain(input.token);
    expect(fetchImpl.mock.calls.length).toBeLessThanOrEqual(4);
  });
  it('does not isolate permission, rate-limit, or unrelated code100 failures', async () => {
    for (const error of [{ code: 100, message: 'Invalid date range' }, { code: 200, message: 'Permission for reach denied' }, { code: 4, message: 'Too many calls' }]) {
      const fetchImpl = vi.fn(async () => Response.json({ error }, { status: 400 }));
      await expect(read({ fetchImpl, metrics: ['reach', 'ctr'] })).rejects.toBeInstanceOf(MetaInsightsError);
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    }
  });

  it('bounds unsupported-field retries to forty requests and preserves already fetched core', async () => {
    const metrics = BASE_META_METRICS.filter(metric => !metric.actionType && !['spend', 'impressions', 'clicks'].includes(metric.id)).map(metric => metric.id);
    const fetchImpl = vi.fn(async (url: string) => {
      const optional = new URL(url).searchParams.get('fields')!.split(',').filter(field => metrics.includes(field));
      return optional.length ? Response.json({ error: { code: 100, message: `${optional[0]} is not valid for fields param` } }, { status: 400 }) : response([row()]);
    });
    const result = await read({ fetchImpl, metrics });
    expect(fetchImpl.mock.calls.length).toBeLessThanOrEqual(40);
    expect(result.rows[0].spend).toBe(10);
    expect(result.status).toBe('partial');
    expect(result.warnings.join(' ')).toMatch(/budget/i);
    expect(result.unavailableMetrics).toEqual(expect.arrayContaining(metrics));
  });
  it('discards failed multi-page field values and stops on a later permission error, retaining core', async () => {
    const metrics = BASE_META_METRICS.filter(metric => !metric.actionType && !['spend', 'impressions', 'clicks'].includes(metric.id)).slice(0, 12).map(metric => metric.id);
    const fetchImpl = vi.fn(async (url: string) => {
      const fields = new URL(url).searchParams.get('fields')!.split(',');
      if (!fields.includes(metrics[9])) return response([row()]);
      if (new URL(url).searchParams.has('after')) return Response.json({ error: { code: 200, message: input.token } }, { status: 403 });
      const values = Object.fromEntries(metrics.slice(9).map(field => [field, '888']));
      return response([row(values)], values, { paging: { next: 'yes', cursors: { after: 'second' } } });
    });
    const result = await read({ fetchImpl, metrics });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(result.rows[0].spend).toBe(10);
    for (const id of metrics.slice(9)) { expect(result.rows[0][id]).toBeNull(); expect(result.totals[id]).toBeNull(); }
    expect(result.unavailableMetrics).toEqual(expect.arrayContaining(metrics.slice(9)));
    expect(result.status).toBe('partial');
    expect(JSON.stringify(result)).not.toContain(input.token);
  });
  it('bounds the whole collection to thirty seconds, retaining completed groups', async () => {
    vi.useFakeTimers();
    const metrics = BASE_META_METRICS.filter(metric => !metric.actionType && !['spend', 'impressions', 'clicks'].includes(metric.id)).slice(0, 40).map(metric => metric.id);
    const fetchImpl = vi.fn(async () => { await new Promise(resolve => setTimeout(resolve, 9000)); return response([row()]); });
    const promise = read({ fetchImpl, metrics });
    await vi.advanceTimersByTimeAsync(30_001);
    const result = await promise;
    expect(result.status).toBe('partial');
    expect(result.rows[0].spend).toBe(10);
    expect(fetchImpl).toHaveBeenCalledTimes(4);
    expect(result.warnings.join(' ')).toMatch(/timeout|budget/i);
  });

  it('requests bounded pages and refuses redirect-following', async () => {
    const fetchImpl = vi.fn(async () => response([row()]));
    await read({ fetchImpl });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(new URL(url).searchParams.get('limit')).toBe('500');
    expect(init.redirect).toBe('error');
  });
  it('rejects oversized pages and conflicting account identity', async () => {
    for (const data of [Array.from({ length: 501 }, (_, i) => row({ campaign_id: String(i) })), [row({ account_id: '2' })]]) {
      await expect(read({ fetchImpl: vi.fn(async () => response(data)) })).rejects.toMatchObject({ status: 502 });
    }
  });
  it('returns null for duplicate action subtypes instead of choosing or summing them', async () => {
    const actions = [{ action_type: 'purchase', value: '4' }, { action_type: 'purchase', value: '9' }];
    const result = await read({ metrics: ['actions:purchase'], fetchImpl: vi.fn(async () => response([row({ actions })], { actions })) });
    expect(result.rows[0]['actions:purchase']).toBeNull();
    expect(result.totals['actions:purchase']).toBeNull();
  });

  it('returns normalized core rows and provider summary without exposing the token', async () => {
    const fetchImpl = vi.fn(async () => response([row()]));
    const result = await read({ fetchImpl });
    expect(result).toMatchObject({ provider: 'meta', scope: { account: 'act_1', level: 'campaign' }, status: 'succeeded', rows: [{ campaignId: '1', campaignName: 'Campaign', dateStart: input.start, dateStop: input.end, spend: 10, impressions: 100, clicks: 5 }], totals: { spend: 10, impressions: 100, clicks: 5 }, unavailableMetrics: [], warnings: [] });
    expect(JSON.stringify(result)).not.toContain(input.token);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).not.toContain(input.token);
    expect(new URL(url).pathname).toBe('/v26.0/act_1/insights');
    expect(new URL(url).searchParams.get('default_summary')).toBe('true');
    expect(init.headers).toEqual({ Authorization: `Bearer ${input.token}` });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
});
