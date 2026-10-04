// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sessionCookie, type DashUser } from '../auth';
import { GET } from '../../app/api/dashboard/route';

const secret = 'test-only-session-secret-at-least-32-bytes';
const user: DashUser = { email: 'viewer@example.test', passwordHash: `scrypt:${'0'.repeat(32)}:${'0'.repeat(64)}`, role: 'viewer', clients: ['alpha'] };
const clients = [{ id: 'alpha', name: 'Alpha', currency: 'BRL', metaAccountId: 'act_1' }, { id: 'beta', name: 'Beta', currency: 'USD', metaAccountId: 'act_2' }];
const start = '2026-09-01', end = '2026-09-25';
const query = `client=alpha&start=${start}&end=${end}&level=campaign`;
const fixture = { campaign_id: '1', campaign_name: 'One', date_start: start, date_stop: end, spend: '10', impressions: '100', clicks: '5', reach: '80', ctr: '5', actions: [{ action_type: 'offsite_conversion.fb_pixel_custom.venda', value: '2' }] };
const request = (params = query, authenticated = true) => new Request(`https://localhost/api/dashboard?${params}`, { headers: authenticated ? { cookie: sessionCookie(user, secret).split(';')[0] } : {} });
beforeEach(() => {
  vi.stubEnv('DASH_USERS_JSON', JSON.stringify([user]));
  vi.stubEnv('DASH_CLIENTS_JSON', JSON.stringify(clients));
  vi.stubEnv('DASH_SESSION_SECRET', secret);
  vi.stubEnv('META_SYSTEM_USER_TOKEN', 'synthetic-server-token');
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ data: [fixture], summary: fixture })));
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('dashboard builder metrics route', () => {
  it('accepts an entity filter without exposing a caller-selected account', async () => {
    const result = await GET(request(`${query}&entityLevel=campaign&entityId=1`));
    expect(result.status).toBe(200);
    expect(await result.json()).toMatchObject({ scope: { account: 'act_1', entityFilter: { level: 'campaign', id: '1' } }, totals: { spend: 10 } });
  });
  it.each(['entityLevel=campaign', 'entityId=1', 'entityLevel=campaign&entityId=1&entityId=2', 'entityLevel=account&entityId=1', 'entityLevel=campaign&entityId=abc'])('rejects malformed entity query %s before fetching', async suffix => {
    expect((await GET(request(`${query}&${suffix}`))).status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('opts into real builder metrics and catalog using the session-bound account', async () => {
    const result = await GET(request(`${query}&metrics=reach,ctr&catalog=1`));
    expect(result.status).toBe(200);
    expect(result.headers.get('cache-control')).toBe('no-store');
    const body = await result.json() as { rows: Record<string, unknown>[]; metrics: { id: string }[] };
    expect(body).toMatchObject({ client: { id: 'alpha', name: 'Alpha', currency: 'BRL' }, rows: [{ spend: 10, reach: 80, ctr: .05 }], totals: { reach: 80, ctr: .05 } });
    expect(body.metrics.map((metric: { id: string }) => metric.id)).toContain('actions:offsite_conversion.fb_pixel_custom.venda');
    expect(JSON.stringify(body)).not.toContain('synthetic-server-token');
    const [url, options] = vi.mocked(fetch).mock.calls[0];
    expect(new URL(String(url)).pathname).toBe('/v26.0/act_1/insights');
    expect(options?.headers).toEqual({ Authorization: 'Bearer synthetic-server-token' });
  });
  it.each(['catalog=0', 'catalog=true', 'catalog=', 'catalog=1&catalog=1', 'metrics=reach&metrics=ctr'])('rejects malformed or repeated opt-in query %s before fetch', async suffix => {
    expect((await GET(request(`${query}&${suffix}`))).status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each(['metrics=', 'metrics=spend,spend', 'metrics=reach,', 'metrics=reach,%20ctr', 'metrics=access_token', 'metrics=actions:__proto__', 'account=act_2', 'token=browser-token', 'fields=reach', 'client=alpha', 'start=2026-09-01', 'end=2026-09-25', 'level=ad'])('rejects unsafe, duplicate, or arbitrary query %s before fetch', async suffix => {
    expect((await GET(request(`${query}&${suffix}`))).status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('supports catalog-only core values and metrics-only without discovery', async () => {
    const catalog = await GET(request(`${query}&catalog=1`));
    expect(catalog.status).toBe(200);
    expect(await catalog.json()).toMatchObject({ rows: [{ spend: 10, impressions: 100, clicks: 5 }], totals: { spend: 10, impressions: 100, clicks: 5 } });
    vi.mocked(fetch).mockClear();
    const result = await GET(request(`${query}&metrics=reach`));
    expect(result.status).toBe(200);
    const fields = new URL(String(vi.mocked(fetch).mock.calls[0][0])).searchParams.get('fields')!.split(',');
    expect(fields).toContain('reach');
    expect(fields).not.toContain('actions');
  });
  it('enforces singleton required inputs, authentication and current tenant membership', async () => {
    expect((await GET(request(`${query}&catalog=1`, false))).status).toBe(401);
    expect((await GET(request(`${query.replace('alpha', 'beta')}&catalog=1`))).status).toBe(403);
    expect((await GET(request(query.replace('&level=campaign', '') + '&catalog=1'))).status).toBe(400);
    vi.stubEnv('DASH_USERS_JSON', JSON.stringify([{ ...user, clients: [] }]));
    expect((await GET(request(`${query}&catalog=1`))).status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('accepts 200 unique structured IDs but rejects 201 and invalid date ranges', async () => {
    const metrics = Array.from({ length: 200 }, (_, i) => `actions:custom.${i}`);
    expect((await GET(request(`${query}&metrics=${metrics.join(',')}`))).status).toBe(200);
    vi.mocked(fetch).mockClear();
    expect((await GET(request(`${query}&metrics=${[...metrics, 'reach'].join(',')}`))).status).toBe(400);
    expect((await GET(request(`${query.replace(start, '2026-02-30')}&catalog=1`))).status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('keeps legacy requests on the unchanged original connector and envelope', async () => {
    const result = await GET(request());
    expect(result.status).toBe(200);
    const body = await result.json() as { rows: Record<string, unknown>[]; metrics: { id: string }[] };
    expect(body.rows[0]).toEqual({ campaignId: '1', campaignName: 'One', dateStart: start, dateStop: end, spend: 10, impressions: 100, clicks: 5 });
    expect(body).not.toHaveProperty('totals');
    expect(body).not.toHaveProperty('metrics');
    expect(new URL(String(vi.mocked(fetch).mock.calls[0][0])).searchParams.has('default_summary')).toBe(false);
  });
});
