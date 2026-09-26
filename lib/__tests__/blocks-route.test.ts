// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sessionCookie, type DashUser } from '../auth';
import { GET, PUT } from '../../app/api/clients/[client]/blocks/route';

const secret = 'test-only-session-secret-at-least-32-bytes';
const users: DashUser[] = [
  { email: 'admin@example.test', passwordHash: `scrypt:${'0'.repeat(32)}:${'0'.repeat(64)}`, role: 'admin', clients: ['alpha', 'beta'] },
  { email: 'viewer@example.test', passwordHash: `scrypt:${'0'.repeat(32)}:${'0'.repeat(64)}`, role: 'viewer', clients: ['alpha'] },
];
const clients = ['alpha', 'beta'].map((id, n) => ({ id, name: id, currency: 'BRL', metaAccountId: `act_${n + 1}` }));
const prior = Object.fromEntries(['DASH_USERS_JSON', 'DASH_CLIENTS_JSON', 'DASH_SESSION_SECRET', 'DASH_DATA_DIR', 'META_SYSTEM_USER_TOKEN'].map(key => [key, process.env[key]]));
let directory: string;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'yorus-route-blocks-'));
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
const request = (client: string, user?: DashUser, document?: unknown, extra: Record<string, string> = {}) => new Request(`http://localhost/api/clients/${encodeURIComponent(client)}/blocks`, {
  method: document === undefined ? 'GET' : 'PUT',
  headers: { ...(user ? { cookie: sessionCookie(user, secret).split(';')[0] } : {}), ...(document === undefined ? {} : { 'Content-Type': 'application/json' }), ...extra },
  ...(document === undefined ? {} : { body: JSON.stringify(document) }),
});
const block = { id: '123e4567-e89b-42d3-a456-426614174000', kind: 'question', tab: 'profile', title: 'Purpose', question: 'Why?', options: [{ label: 'One', count: null }, { label: 'Two', count: null }] };

describe('per-client blocks API', () => {
  it('allows an admin to create a question and read it in a new request despite Meta being unavailable', async () => {
    const saved = await PUT(request('alpha', users[0], { version: 0, blocks: [block] }), context('alpha'));
    expect(saved.status).toBe(200);
    expect(saved.headers.get('cache-control')).toBe('no-store');
    const data = await saved.json() as { version: number; blocks: Array<typeof block & { updatedAt: string }> };
    expect(data.version).toBe(1);
    expect(data.blocks[0]).toMatchObject(block);
    expect(data.blocks[0].updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    const result = await GET(request('alpha', users[0]), context('alpha'));
    expect(result.status).toBe(200);
    expect(result.headers.get('cache-control')).toBe('no-store');
    expect(await result.json()).toEqual(data);
  });

  it('denies anonymous and unauthorized cross-tenant reads and viewer writes', async () => {
    expect((await GET(request('alpha'), context('alpha'))).status).toBe(401);
    expect((await GET(request('beta', users[1]), context('beta'))).status).toBe(403);
    expect((await PUT(request('alpha', users[1], { version: 0, blocks: [block] }), context('alpha'))).status).toBe(403);
    expect((await GET(request('alpha', users[1]), context('alpha'))).status).toBe(200);
    expect((await GET(request('beta', users[0]), context('beta'))).status).toBe(200);
    process.env.DASH_USERS_JSON = JSON.stringify([{ ...users[0], clients: ['beta'] }, users[1]]);
    expect((await GET(request('alpha', users[0]), context('alpha'))).status).toBe(403);
  });

  it('returns 409 for stale revisions and does not change persisted data', async () => {
    expect((await PUT(request('alpha', users[0], { version: 0, blocks: [block] }), context('alpha'))).status).toBe(200);
    const original = await readFile(join(directory, 'alpha.json'), 'utf8');
    const response = await PUT(request('alpha', users[0], { version: 0, blocks: [] }), context('alpha'));
    expect(response.status).toBe(409);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await readFile(join(directory, 'alpha.json'), 'utf8')).toBe(original);
  });

  it('fails closed with 503 for corrupt storage, never resets it', async () => {
    await writeFile(join(directory, 'alpha.json'), '{oops');
    expect((await GET(request('alpha', users[0]), context('alpha'))).status).toBe(503);
    expect((await PUT(request('alpha', users[0], { version: 0, blocks: [] }), context('alpha'))).status).toBe(503);
    expect(await readFile(join(directory, 'alpha.json'), 'utf8')).toBe('{oops');
    delete process.env.DASH_DATA_DIR;
    expect((await GET(request('beta', users[0]), context('beta'))).status).toBe(503);
  });

  it('rejects malformed documents, partial counts, account IDs, oversized bodies and wrong media types', async () => {
    const bodies = [
      { version: 0, blocks: [{ ...block, options: [{ label: 'One', count: 1 }, { label: 'Two', count: null }] }] },
      { version: 0, blocks: [block], metaAccountId: 'act_1' },
      { version: 0, blocks: [{ ...block, id: '../beta' }] },
      { version: 0, blocks: [block], padding: 'x'.repeat(65536) },
    ];
    for (const body of bodies) {
      const response = await PUT(request('alpha', users[0], body), context('alpha'));
      expect(response.status).toBe(400);
      expect(response.headers.get('cache-control')).toBe('no-store');
    }
    expect((await PUT(request('alpha', users[0], { version: 0, blocks: [] }, { 'content-type': 'text/plain' }), context('alpha'))).status).toBe(400);
    const empty = await GET(request('alpha', users[0]), context('alpha'));
    expect((await empty.json() as { version: number }).version).toBe(0);
  });

  it('rejects cross-origin writes and invalid client path params', async () => {
    expect((await PUT(request('alpha', users[0], { version: 0, blocks: [] }, { origin: 'https://evil.example' }), context('alpha'))).status).toBe(403);
    expect((await PUT(request('alpha', users[0], { version: 0, blocks: [] }, { origin: 'http://localhost' }), context('alpha'))).status).toBe(200);
    expect((await GET(request('alpha', users[0]), context('../alpha'))).status).toBe(400);
    expect((await GET(request('alpha', users[0]), context('beta'))).status).toBe(400);
  });
  it('accepts a same-host HTTPS browser write through a TLS proxy and rejects other hosts', async () => {
    expect((await PUT(request('alpha', users[0], { version: 0, blocks: [] }, { origin: 'https://localhost', 'x-forwarded-proto': 'https' }), context('alpha'))).status).toBe(200);
    expect((await PUT(request('alpha', users[0], { version: 1, blocks: [] }, { origin: 'https://evil.example', 'x-forwarded-proto': 'https' }), context('alpha'))).status).toBe(403);
    expect((await PUT(request('alpha', users[0], { version: 1, blocks: [] }, { origin: 'https://localhost', 'x-forwarded-proto': 'https,http' }), context('alpha'))).status).toBe(403);
    const saved = await GET(request('alpha', users[0]), context('alpha'));
    expect((await saved.json() as { version: number }).version).toBe(1);
  });
});
