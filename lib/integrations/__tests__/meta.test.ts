import { describe, expect, it, vi } from 'vitest';
import { readMetaInsights, MetaInsightsError } from '../meta';

const base = {
  account: 'act_12345', start: '2026-09-01', end: '2026-09-02',
  level: 'campaign' as const, token: 'synthetic-secret', allowedAccountIds: ['act_12345'],
};

describe('Meta Ads insights (synthetic fixtures only)', () => {
  it('rejects malformed account IDs before any network request', async () => {
    const fetchImpl = vi.fn();
    await expect(readMetaInsights({ ...base, account: '12345', fetchImpl })).rejects.toMatchObject({
      name: 'MetaInsightsError', status: 400,
    } satisfies Partial<MetaInsightsError>);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('denies unlisted accounts even with an otherwise valid ID before network', async () => {
    const fetchImpl = vi.fn();
    await expect(readMetaInsights({ ...base, allowedAccountIds: [], fetchImpl })).rejects.toMatchObject({
      name: 'MetaInsightsError', status: 403,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects impossible, inverted and excessive date ranges before network', async () => {
    const fetchImpl = vi.fn();
    for (const [start, end] of [
      ['2026-02-30', '2026-03-01'], ['2026-09-03', '2026-09-02'],
      ['2025-01-01', '2026-01-01'], ['2026/09/01', '2026-09-02'],
      ['2026-13-01', '2026-09-02'],
    ]) {
      await expect(readMetaInsights({ ...base, start, end, fetchImpl })).rejects.toMatchObject({ status: 400 });
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects unsupported levels before network', async () => {
    const fetchImpl = vi.fn();
    await expect(readMetaInsights({ ...base, level: 'account' as 'campaign', fetchImpl })).rejects.toMatchObject({ status: 400 });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('sends the required insight fields and date range with bearer header only', async () => {
    const fetchImpl = vi.fn(async (...args: [RequestInfo | URL, RequestInit?]) => {
      void args;
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    });
    await readMetaInsights({ ...base, fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [address, options] = fetchImpl.mock.calls[0];
    const url = new URL(String(address));
    expect(`${url.origin}${url.pathname}`).toBe('https://graph.facebook.com/v26.0/act_12345/insights');
    expect(url.searchParams.get('fields')?.split(',')).toEqual([
      'campaign_id', 'campaign_name', 'adset_id', 'adset_name', 'ad_id', 'ad_name',
      'spend', 'impressions', 'clicks', 'date_start', 'date_stop',
    ]);
    expect(url.searchParams.get('level')).toBe('campaign');
    expect(JSON.parse(url.searchParams.get('time_range') ?? 'null')).toEqual({ since: base.start, until: base.end });
    expect(url.toString()).not.toContain(base.token);
    expect(options).toEqual({ method: 'GET', headers: { Authorization: `Bearer ${base.token}` } });
  });

  it('normalizes a synthetic insight without assuming a currency', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ data: [{
      campaign_id: '100', campaign_name: 'Synthetic Campaign', adset_id: '200', adset_name: 'Synthetic Set',
      ad_id: '300', ad_name: 'Synthetic Ad', spend: '12.34', impressions: '100', clicks: '8',
      date_start: '2026-09-01', date_stop: '2026-09-02',
    }] }), { status: 200 }));
    const result = await readMetaInsights({ ...base, fetchImpl });
    expect(result).toMatchObject({
      provider: 'meta', scope: { account: base.account, level: 'campaign' },
      dateRange: { start: base.start, end: base.end }, status: 'succeeded', warnings: [],
      rows: [{ campaignId: '100', campaignName: 'Synthetic Campaign', adsetId: '200',
        adsetName: 'Synthetic Set', adId: '300', adName: 'Synthetic Ad',
        spend: 12.34, impressions: 100, clicks: 8,
        dateStart: '2026-09-01', dateStop: '2026-09-02' }],
    });
    expect(Number.isNaN(Date.parse((result as { collectedAt: string }).collectedAt))).toBe(false);
    expect(JSON.stringify(result)).not.toMatch(/BRL|currency/);
  });

  it('maps upstream rate limits to sanitized 429 without exposing response body', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ error: base.token }), { status: 429 }));
    let error: unknown;
    try { await readMetaInsights({ ...base, fetchImpl }); } catch (caught) { error = caught; }
    expect(error).toMatchObject({ name: 'MetaInsightsError', status: 429 });
    expect(JSON.stringify(error)).not.toContain(base.token);
    expect((error as Error).message).not.toContain(base.token);
  });

  it('bounds pagination and reports partial when a further page exists', async () => {
    const fetchImpl = vi.fn(async (...args: [RequestInfo | URL]) => {
      void args;
      return new Response(JSON.stringify({
        data: [], paging: { cursors: { after: `cursor-${fetchImpl.mock.calls.length}` }, next: 'https://evil.test/steal' },
      }), { status: 200 });
    });
    const result = await readMetaInsights({ ...base, fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(5);
    expect(result.status).toBe('partial');
    expect(result.warnings).toContain('Meta insights truncated after 5 pages');
    for (const [address] of fetchImpl.mock.calls) {
      expect(new URL(String(address)).origin).toBe('https://graph.facebook.com');
      expect(String(address)).not.toContain(base.token);
    }
    expect(new URL(String(fetchImpl.mock.calls[1][0])).searchParams.get('after')).toBe('cursor-1');
  });

  it('fails closed with 503 when token is not configured', async () => {
    const fetchImpl = vi.fn();
    await expect(readMetaInsights({ ...base, token: '', fetchImpl })).rejects.toMatchObject({ status: 503 });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('sanitizes transport exceptions containing credential text', async () => {
    const fetchImpl = vi.fn(async () => { throw new Error(`request failed: ${base.token}`); });
    let error: unknown;
    try { await readMetaInsights({ ...base, fetchImpl }); } catch (caught) { error = caught; }
    expect(error).toMatchObject({ name: 'MetaInsightsError', status: 502 });
    expect((error as Error).message).not.toContain(base.token);
    expect(JSON.stringify(error)).not.toContain(base.token);
  });

  it('sanitizes malformed upstream JSON without echoing its contents', async () => {
    const fetchImpl = vi.fn(async () => new Response(`not-json ${base.token}`, { status: 200 }));
    let error: unknown;
    try { await readMetaInsights({ ...base, fetchImpl }); } catch (caught) { error = caught; }
    expect(error).toMatchObject({ name: 'MetaInsightsError', status: 502 });
    expect((error as Error).message).not.toContain(base.token);
  });
});
