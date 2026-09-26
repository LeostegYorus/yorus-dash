// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sessionCookie, type DashUser } from '../auth';
import { GET, PUT } from '../../app/api/clients/[client]/builder/route';
const secret = 'test-only-session-secret-at-least-32-bytes';
const users: DashUser[] = [
  { email: 'admin@example.test', passwordHash: `scrypt:${'0'.repeat(32)}:${'0'.repeat(64)}`, role: 'admin', clients: ['alpha', 'beta'] },
  { email: 'viewer@example.test', passwordHash: `scrypt:${'0'.repeat(32)}:${'0'.repeat(64)}`, role: 'viewer', clients: ['alpha'] },
];
const clients = ['alpha', 'beta'].map((id, n) => ({ id, name: id, currency: 'BRL', metaAccountId: `act_${n + 1}` }));
const prior = Object.fromEntries(['DASH_USERS_JSON', 'DASH_CLIENTS_JSON', 'DASH_SESSION_SECRET', 'DASH_DATA_DIR', 'META_SYSTEM_USER_TOKEN'].map(key => [key, process.env[key]]));
let directory: string;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'yorus-route-builder-'));
  process.env.DASH_USERS_JSON = JSON.stringify(users);
  process.env.DASH_CLIENTS_JSON = JSON.stringify(clients);
  process.env.DASH_SESSION_SECRET = secret;
  process.env.DASH_DATA_DIR = directory;
  delete process.env.META_SYSTEM_USER_TOKEN;
});
afterEach(async () => {
  for (const [key, value] of Object.entries(prior)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  await rm(directory, { force: true, recursive: true });
});
const context = (client: string) => ({ params: Promise.resolve({ client }) });
const empty = { version: 0, datasets: [], widgets: [] };
const request = (client: string, user?: DashUser, document?: unknown, extra: Record<string, string> = {}) => new Request(`http://localhost/api/clients/${encodeURIComponent(client)}/builder`, {
  method: document === undefined ? 'GET' : 'PUT',
  headers: { ...(user ? { cookie: sessionCookie(user, secret).split(';')[0] } : {}), ...(document === undefined ? {} : { 'Content-Type': 'application/json' }), ...extra },
  ...(document === undefined ? {} : { body: JSON.stringify(document) }),
});
describe('builder HTTP API', () => {
  it('persists a manual dashboard without Meta credentials and returns no-store response', async () => {
    const datasetId = crypto.randomUUID();
    const dashboard = { version: 0, datasets: [{ id: datasetId, name: 'Revenue', sourceLabel: 'Ledger', periodStart: '2026-09-01', periodEnd: '2026-09-30', fields: [{ id: 'market', label: 'Market', type: 'text' }, { id: 'sales', label: 'Sales', type: 'number' }], rows: [{ market: 'North', sales: 52.5 }] }], widgets: [{ id: crypto.randomUUID(), kind: 'data', title: 'Sales by market', width: 6, source: { kind: 'manual', datasetId }, visualization: 'table', dimension: 'market', measure: 'sales', aggregation: 'sum', format: 'currency' }] };
    const saved = await PUT(request('alpha', users[0], dashboard), context('alpha'));
    expect(saved.status).toBe(200);
    expect(saved.headers.get('cache-control')).toBe('no-store');
    expect(await saved.json()).toEqual({ ...dashboard, version: 1 });
    const result = await GET(request('alpha', users[1]), context('alpha'));
    expect(result.status).toBe(200);
    expect(await result.json()).toEqual({ ...dashboard, version: 1 });
  });
  it('denies anonymous, cross-tenant and viewer writes and checks current membership', async () => {
    expect((await GET(request('alpha'), context('alpha'))).status).toBe(401);
    expect((await PUT(request('alpha', users[1], empty), context('alpha'))).status).toBe(403);
    expect((await GET(request('beta', users[1]), context('beta'))).status).toBe(403);
    process.env.DASH_USERS_JSON = JSON.stringify([{ ...users[0], clients: ['beta'] }, users[1]]);
    expect((await GET(request('alpha', users[0]), context('alpha'))).status).toBe(403);
  });
  it('returns 409 on stale writes and 503 for corrupt storage without changing files', async () => {
    expect((await PUT(request('alpha', users[0], empty), context('alpha'))).status).toBe(200);
    const path = join(directory, 'alpha.builder.json');
    const original = await readFile(path, 'utf8');
    expect((await PUT(request('alpha', users[0], empty), context('alpha'))).status).toBe(409);
    expect(await readFile(path, 'utf8')).toBe(original);
    await writeFile(path, '{bad');
    expect((await GET(request('alpha', users[0]), context('alpha'))).status).toBe(503);
    expect((await PUT(request('alpha', users[0], empty), context('alpha'))).status).toBe(503);
    expect(await readFile(path, 'utf8')).toBe('{bad');
  });
  it('rejects malformed, oversized and wrongly typed bodies with 400', async () => {
    for (const body of [{ ...empty, accountId: 'act_1' }, { ...empty, widgets: [{ id: 'nope' }] }, { ...empty, padding: 'x'.repeat(65536) }]) {
      expect((await PUT(request('alpha', users[0], body), context('alpha'))).status).toBe(400);
    }
    expect((await PUT(request('alpha', users[0], empty, { 'content-type': 'text/plain' }), context('alpha'))).status).toBe(400);
    const broken = new Request('http://localhost/api/clients/alpha/builder', { method: 'PUT', headers: { cookie: sessionCookie(users[0], secret).split(';')[0], 'content-type': 'application/json', 'content-length': '999999' }, body: '{}' });
    expect((await PUT(broken, context('alpha'))).status).toBe(400);
  });
  it('rejects false content-length and malformed UTF-8 bodies', async () => {
    const headers = { cookie: sessionCookie(users[0], secret).split(';')[0], 'content-type': 'application/json' };
    const mismatch = new Request('http://localhost/api/clients/alpha/builder', { method: 'PUT', headers: { ...headers, 'content-length': '1' }, body: '{}' });
    expect((await PUT(mismatch, context('alpha'))).status).toBe(400);
    const invalidUtf8 = new Request('http://localhost/api/clients/alpha/builder', { method: 'PUT', headers, body: new Uint8Array([0xff]) });
    expect((await PUT(invalidUtf8, context('alpha'))).status).toBe(400);
  });
  it('rejects cross-origin writes and mismatched paths while accepting a same-host HTTPS proxy', async () => {
    expect((await PUT(request('alpha', users[0], empty, { origin: 'https://evil.example' }), context('alpha'))).status).toBe(403);
    expect((await GET(request('alpha', users[0]), context('beta'))).status).toBe(400);
    expect((await GET(request('alpha', users[0]), context('../alpha'))).status).toBe(400);
    expect((await PUT(request('alpha', users[0], empty, { origin: 'https://localhost', 'x-forwarded-proto': 'https' }), context('alpha'))).status).toBe(200);
  });
});
