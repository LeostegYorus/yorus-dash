// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHmac, scryptSync } from 'node:crypto';

const salt = '00112233445566778899aabbccddeeff';
const hash = `scrypt:${salt}:${scryptSync('test-only-password', Buffer.from(salt, 'hex'), 32).toString('hex')}`;
const users = [{ email: 'a@example.test', passwordHash: hash, role: 'viewer', clients: ['alpha'] }];
const clients = [{ id: 'alpha', name: 'Alpha', currency: 'BRL', metaAccountId: 'act_123' }];
const envKeys = ['DASH_USERS_JSON', 'DASH_CLIENTS_JSON', 'DASH_SESSION_SECRET', 'META_SYSTEM_USER_TOKEN'] as const;
const original = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));

beforeEach(() => {
  process.env.DASH_USERS_JSON = JSON.stringify(users);
  process.env.DASH_CLIENTS_JSON = JSON.stringify(clients);
  process.env.DASH_SESSION_SECRET = 'test-only-session-secret-at-least-32-bytes';
  process.env.META_SYSTEM_USER_TOKEN = 'test-only-meta-token';
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  for (const key of envKeys) {
    if (original[key] === undefined) delete process.env[key];
    else process.env[key] = original[key];
  }
});

const postLogin = (body: unknown) => new Request('http://localhost/api/login', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
});

describe('server auth routes', () => {
  it('authenticates a hashed password and sets an HttpOnly Strict signed session cookie', async () => {
    const { POST } = await import('../../app/api/login/route');
    const response = await POST(postLogin({ email: 'a@example.test', password: 'test-only-password' }));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('set-cookie')).toMatch(/dash_session=[^;]+;.*HttpOnly.*SameSite=Strict/i);
    expect(await response.json()).toEqual({ user: { email: 'a@example.test', role: 'viewer' }, clients: [{ id: 'alpha', name: 'Alpha', currency: 'BRL', metaConnected: true, gaConnected: false }] });
  });

  it('lists only the authenticated user’s current client memberships', async () => {
    const { POST } = await import('../../app/api/login/route');
    const { GET } = await import('../../app/api/session/route');
    const login = await POST(postLogin({ email: 'a@example.test', password: 'test-only-password' }));
    const cookie = login.headers.get('set-cookie')!.split(';')[0];
    process.env.DASH_CLIENTS_JSON = JSON.stringify([...clients, { id: 'beta', name: 'Beta', currency: 'USD', metaAccountId: 'act_456' }]);
    const response = await GET(new Request('http://localhost/api/session', { headers: { cookie } }));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({ user: { email: 'a@example.test', role: 'viewer' }, clients: [{ id: 'alpha', name: 'Alpha', currency: 'BRL', metaConnected: true, gaConnected: false }] });
  });

  it('fetches an authorized client’s Meta account and returns only safe insight fields', async () => {
    const { POST } = await import('../../app/api/login/route');
    const { GET } = await import('../../app/api/dashboard/route');
    const cookie = (await POST(postLogin({ email: 'a@example.test', password: 'test-only-password' }))).headers.get('set-cookie')!.split(';')[0];
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ data: [] }), { status: 200 }));
    const response = await GET(new Request('http://localhost/api/dashboard?client=alpha&start=2026-09-01&end=2026-09-07&level=campaign', { headers: { cookie } }));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toContain('/act_123/insights');
    expect(options?.headers).toEqual({ Authorization: 'Bearer test-only-meta-token' });
    const result = await response.json() as { client: unknown; provider: string; rows: unknown[] };
    expect(result.client).toEqual({ id: 'alpha', name: 'Alpha', currency: 'BRL' });
    expect(result.provider).toBe('meta');
    expect(result.rows).toEqual([]);
    expect(JSON.stringify(result)).not.toContain('test-only-meta-token');
  });

  it('expires the session cookie on logout without caching the response', async () => {
    const { POST } = await import('../../app/api/logout/route');
    const response = await POST();
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('set-cookie')).toMatch(/dash_session=;.*Max-Age=0;.*HttpOnly; SameSite=Strict/i);
  });

  it('rejects wrong passwords and malformed login input without setting a cookie', async () => {
    const { POST } = await import('../../app/api/login/route');
    for (const [body, status] of [[{ email: 'a@example.test', password: 'wrong' }, 401], [{ email: 'nobody@example.test', password: 'wrong' }, 401], [{ email: 'a@example.test' }, 400]] as const) {
      const response = await POST(postLogin(body));
      expect(response.status).toBe(status);
      expect(response.headers.get('set-cookie')).toBeNull();
      expect(response.headers.get('cache-control')).toBe('no-store');
    }
  });

  it('rejects non-JSON content types even when the body is valid JSON', async () => {
    const { POST } = await import('../../app/api/login/route');
    const request = postLogin({ email: 'a@example.test', password: 'test-only-password' });
    request.headers.set('content-type', 'application/jsonp');
    const response = await POST(request);
    expect(response.status).toBe(400);
    expect(response.headers.get('set-cookie')).toBeNull();
  });

  it('rejects anonymous and tampered cookies without disclosing data', async () => {
    const { POST } = await import('../../app/api/login/route');
    const { GET: session } = await import('../../app/api/session/route');
    const { GET: dashboard } = await import('../../app/api/dashboard/route');
    const url = 'http://localhost/api/dashboard?client=alpha&start=2026-09-01&end=2026-09-07&level=campaign';
    const cookie = (await POST(postLogin({ email: 'a@example.test', password: 'test-only-password' }))).headers.get('set-cookie')!.split(';')[0];
    const [name, value] = cookie.split('=');
    const [payload, mac] = value.split('.');
    const altered = `${name}=${Buffer.from(JSON.stringify({ email: 'a@example.test', clients: ['beta'], exp: 9999999999 })).toString('base64url')}.${mac}`;
    const corruptedMac = `${mac[0] === 'A' ? 'B' : 'A'}${mac.slice(1)}`;
    for (const headers of [new Headers(), new Headers({ cookie: altered }), new Headers({ cookie: `${name}=${payload}.${corruptedMac}` })]) {
      const sessionResponse = await session(new Request('http://localhost/api/session', { headers }));
      const dashboardResponse = await dashboard(new Request(url, { headers }));
      expect(sessionResponse.status).toBe(401);
      expect(dashboardResponse.status).toBe(401);
      expect(sessionResponse.headers.get('cache-control')).toBe('no-store');
      expect(dashboardResponse.headers.get('cache-control')).toBe('no-store');
    }
  });

  it('rejects expired sessions even if correctly signed', async () => {
    const { GET } = await import('../../app/api/session/route');
    const payload = Buffer.from(JSON.stringify({ email: 'a@example.test', clients: ['alpha'], exp: 1 })).toString('base64url');
    const mac = createHmac('sha256', process.env.DASH_SESSION_SECRET!).update(payload).digest('base64url');
    const response = await GET(new Request('http://localhost/api/session', { headers: { cookie: `dash_session=${payload}.${mac}` } }));
    expect(response.status).toBe(401);
  });

  it('revalidates client membership and refuses cross-client reads before upstream fetch', async () => {
    const { POST } = await import('../../app/api/login/route');
    const { GET: dashboard } = await import('../../app/api/dashboard/route');
    const { GET: session } = await import('../../app/api/session/route');
    process.env.DASH_CLIENTS_JSON = JSON.stringify([...clients, { id: 'beta', name: 'Beta', currency: 'USD', metaAccountId: 'act_456' }]);
    const cookie = (await POST(postLogin({ email: 'a@example.test', password: 'test-only-password' }))).headers.get('set-cookie')!.split(';')[0];
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const url = 'http://localhost/api/dashboard?client=beta&start=2026-09-01&end=2026-09-07&level=campaign';
    const denied = await dashboard(new Request(url, { headers: { cookie } }));
    expect(denied.status).toBe(403);
    process.env.DASH_USERS_JSON = JSON.stringify([{ ...users[0], clients: [] }]);
    const stale = await dashboard(new Request(url.replace('client=beta', 'client=alpha'), { headers: { cookie } }));
    expect(stale.status).toBe(403);
    const current = await session(new Request('http://localhost/api/session', { headers: { cookie } }));
    expect((await current.json() as { clients: unknown[] }).clients).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses account lookup and malformed query parameters', async () => {
    const { POST } = await import('../../app/api/login/route');
    const { GET } = await import('../../app/api/dashboard/route');
    const cookie = (await POST(postLogin({ email: 'a@example.test', password: 'test-only-password' }))).headers.get('set-cookie')!.split(';')[0];
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const base = 'http://localhost/api/dashboard?client=alpha&start=2026-09-01&end=2026-09-07&level=campaign';
    for (const url of [base + '&account=act_456', base + '&client=beta', base.replace('end=2026-09-07', 'end=2026-02-31'), base.replace('level=campaign', 'level=account'), base.replace('client=alpha', 'client=INVALID')]) {
      const response = await GET(new Request(url, { headers: { cookie } }));
      expect(response.status).toBe(400);
      expect(response.headers.get('cache-control')).toBe('no-store');
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns 503 when auth config or Meta token is missing without upstream fallback', async () => {
    const { POST } = await import('../../app/api/login/route');
    const { GET: dashboard } = await import('../../app/api/dashboard/route');
    const { GET: session } = await import('../../app/api/session/route');
    const cookie = (await POST(postLogin({ email: 'a@example.test', password: 'test-only-password' }))).headers.get('set-cookie')!.split(';')[0];
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    delete process.env.META_SYSTEM_USER_TOKEN;
    const noToken = await dashboard(new Request('http://localhost/api/dashboard?client=alpha&start=2026-09-01&end=2026-09-07&level=campaign', { headers: { cookie } }));
    expect(noToken.status).toBe(503);
    expect(noToken.headers.get('cache-control')).toBe('no-store');
    expect(fetchMock).not.toHaveBeenCalled();
    const noTokenSession = await session(new Request('http://localhost/api/session', { headers: { cookie } }));
    expect((await noTokenSession.json() as { clients: Array<{ metaConnected: boolean }> }).clients[0].metaConnected).toBe(false);
    delete process.env.DASH_SESSION_SECRET;
    expect((await session(new Request('http://localhost/api/session', { headers: { cookie } }))).status).toBe(503);
    expect((await POST(postLogin({ email: 'a@example.test', password: 'test-only-password' }))).status).toBe(503);
    process.env.DASH_SESSION_SECRET = 'test-only-session-secret-at-least-32-bytes';
    process.env.DASH_USERS_JSON = 'not json';
    expect((await POST(postLogin({ email: 'a@example.test', password: 'test-only-password' }))).status).toBe(503);
    process.env.DASH_USERS_JSON = JSON.stringify(users);
    delete process.env.DASH_CLIENTS_JSON;
    expect((await POST(postLogin({ email: 'a@example.test', password: 'test-only-password' }))).status).toBe(503);
  });

  it('rejects cross-origin login submissions without issuing a cookie', async () => {
    const { POST } = await import('../../app/api/login/route');
    const request = postLogin({ email: 'a@example.test', password: 'test-only-password' });
    request.headers.set('origin', 'https://attacker.example');
    const response = await POST(request);
    expect(response.status).toBe(403);
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(response.headers.get('cache-control')).toBe('no-store');
    const sameOriginRequest = postLogin({ email: 'a@example.test', password: 'test-only-password' });
    sameOriginRequest.headers.set('origin', 'http://localhost');
    expect((await POST(sameOriginRequest)).status).toBe(200);
  });

  it('accepts browser HTTPS Origin behind a TLS-terminating proxy but not forged hosts or ambiguous forwarding', async () => {
    const { POST } = await import('../../app/api/login/route');
    const body = { email: 'a@example.test', password: 'test-only-password' };
    const proxied = postLogin(body);
    proxied.headers.set('origin', 'https://localhost');
    proxied.headers.set('x-forwarded-proto', 'https');
    expect((await POST(proxied)).status).toBe(200);
    for (const [origin, proto] of [
      ['https://attacker.example', 'https'],
      ['https://localhost', 'https,http'],
      ['https://localhost', 'http'],
    ]) {
      const request = postLogin(body);
      request.headers.set('origin', origin);
      request.headers.set('x-forwarded-proto', proto);
      expect((await POST(request)).status).toBe(403);
    }
  });

  it('marks cookies Secure in production', async () => {
    const { POST } = await import('../../app/api/login/route');
    vi.stubEnv('NODE_ENV', 'production');
    const response = await POST(postLogin({ email: 'a@example.test', password: 'test-only-password' }));
    expect(response.headers.get('set-cookie')).toContain('Secure');
  });
});
