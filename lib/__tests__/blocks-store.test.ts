// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile, symlink, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readBlockDocument, writeBlockDocument } from '../block-store';

let directory: string;
const previous = process.env.DASH_DATA_DIR;
beforeEach(async () => { directory = await mkdtemp(join(tmpdir(), 'yorus-blocks-')); process.env.DASH_DATA_DIR = directory; });
afterEach(async () => { if (previous === undefined) delete process.env.DASH_DATA_DIR; else process.env.DASH_DATA_DIR = previous; await rm(directory, { recursive: true, force: true }); });

describe('block storage', () => {
  it('persists an empty document and a new store read recovers it from disk', async () => {
    expect(await readBlockDocument('alpha')).toEqual({ version: 0, blocks: [] });
    const saved = await writeBlockDocument('alpha', { version: 0, blocks: [] });
    expect(saved).toEqual({ version: 1, blocks: [] });
    expect(JSON.parse(await readFile(join(directory, 'alpha.json'), 'utf8'))).toEqual(saved);
    expect(await readBlockDocument('alpha')).toEqual(saved);
  });

  it('rejects a stale version without changing disk, including simultaneous writes', async () => {
    const results = await Promise.allSettled([
      writeBlockDocument('alpha', { version: 0, blocks: [] }),
      writeBlockDocument('alpha', { version: 0, blocks: [] }),
    ]);
    expect(results.map(result => result.status).sort()).toEqual(['fulfilled', 'rejected']);
    expect(await readBlockDocument('alpha')).toEqual({ version: 1, blocks: [] });
    await expect(writeBlockDocument('alpha', { version: 0, blocks: [] })).rejects.toMatchObject({ name: 'BlockConflictError' });
    expect(await readBlockDocument('alpha')).toEqual({ version: 1, blocks: [] });
  });

  it('does not overflow the persisted revision and make an otherwise readable client unavailable', async () => {
    const destination = join(directory, 'alpha.json');
    const current = { version: Number.MAX_SAFE_INTEGER, blocks: [] };
    await writeFile(destination, JSON.stringify(current), { mode: 0o600 });
    expect(await readBlockDocument('alpha')).toEqual(current);
    await expect(writeBlockDocument('alpha', current)).rejects.toMatchObject({ name: 'BlockStorageError' });
    expect(await readBlockDocument('alpha')).toEqual(current);
    expect(JSON.parse(await readFile(destination, 'utf8'))).toEqual(current);
  });

  it('fails closed for corrupt JSON instead of silently resetting a client', async () => {
    await writeFile(join(directory, 'alpha.json'), '{oops');
    await expect(readBlockDocument('alpha')).rejects.toMatchObject({ name: 'BlockStorageError' });
    await expect(writeBlockDocument('alpha', { version: 0, blocks: [] })).rejects.toMatchObject({ name: 'BlockStorageError' });
    expect(await readFile(join(directory, 'alpha.json'), 'utf8')).toBe('{oops');
  });

  it('requires an existing absolute private data directory', async () => {
    delete process.env.DASH_DATA_DIR;
    await expect(readBlockDocument('alpha')).rejects.toMatchObject({ name: 'BlockStorageError' });
    process.env.DASH_DATA_DIR = 'relative-data';
    await expect(writeBlockDocument('alpha', { version: 0, blocks: [] })).rejects.toMatchObject({ name: 'BlockStorageError' });
    process.env.DASH_DATA_DIR = join(directory, 'missing');
    await expect(readBlockDocument('alpha')).rejects.toMatchObject({ name: 'BlockStorageError' });
  });

  it('rejects traversal and symlinked client documents', async () => {
    await expect(readBlockDocument('../beta')).rejects.toMatchObject({ name: 'BlockStorageError' });
    await expect(writeBlockDocument('../beta', { version: 0, blocks: [] })).rejects.toMatchObject({ name: 'BlockStorageError' });
    const outside = join(tmpdir(), `outside-${crypto.randomUUID()}.json`);
    await writeFile(outside, JSON.stringify({ version: 7, blocks: [] }));
    try {
      await symlink(outside, join(directory, 'alpha.json'));
      await expect(readBlockDocument('alpha')).rejects.toMatchObject({ name: 'BlockStorageError' });
      await expect(writeBlockDocument('alpha', { version: 0, blocks: [] })).rejects.toMatchObject({ name: 'BlockStorageError' });
      expect(JSON.parse(await readFile(outside, 'utf8'))).toEqual({ version: 7, blocks: [] });
    } finally { await rm(outside, { force: true }); }
  });

  it('rejects a structurally invalid on-disk document without replacing it', async () => {
    const bad = JSON.stringify({ version: 4, blocks: [{ id: 'oops', kind: 'note' }] });
    await writeFile(join(directory, 'alpha.json'), bad);
    await expect(readBlockDocument('alpha')).rejects.toMatchObject({ name: 'BlockStorageError' });
    await expect(writeBlockDocument('alpha', { version: 4, blocks: [] })).rejects.toMatchObject({ name: 'BlockStorageError' });
    expect(await readFile(join(directory, 'alpha.json'), 'utf8')).toBe(bad);
  });

  it('issues server timestamps and preserves unchanged block timestamps', async () => {
    const block = { id: crypto.randomUUID(), kind: 'note', tab: 'overview', title: 'Context', body: 'Observed', evidenceType: 'fact', sourceLabel: 'Report' } as const;
    const first = await writeBlockDocument('alpha', { version: 0, blocks: [block] } as never);
    expect(first.blocks[0].updatedAt).toMatch(/^\d{4}-\d\d-\d\dT/);
    const second = await writeBlockDocument('alpha', first);
    expect(second.blocks[0].updatedAt).toBe(first.blocks[0].updatedAt);
    const changed = await writeBlockDocument('alpha', { version: second.version, blocks: [{ ...second.blocks[0], title: 'New' }] });
    expect(changed.blocks[0].title).toBe('New');
  });

  it('isolates two clients with independent revisions', async () => {
    await writeBlockDocument('alpha', { version: 0, blocks: [] });
    expect(await readBlockDocument('beta')).toEqual({ version: 0, blocks: [] });
    await writeBlockDocument('beta', { version: 0, blocks: [] });
    expect(await readBlockDocument('alpha')).toEqual({ version: 1, blocks: [] });
  });

  it('refuses a group-readable data directory without changing its permissions', async () => {
    await chmod(directory, 0o750);
    await expect(readBlockDocument('alpha')).rejects.toMatchObject({ name: 'BlockStorageError' });
    await expect(writeBlockDocument('alpha', { version: 0, blocks: [] })).rejects.toMatchObject({ name: 'BlockStorageError' });
  });

  it('refuses a pre-existing group-readable client file without resetting it', async () => {
    const destination = join(directory, 'alpha.json');
    const raw = JSON.stringify({ version: 1, blocks: [] });
    await writeFile(destination, raw, { mode: 0o644 });
    await chmod(destination, 0o644);
    await expect(readBlockDocument('alpha')).rejects.toMatchObject({ name: 'BlockStorageError' });
    await expect(writeBlockDocument('alpha', { version: 1, blocks: [] })).rejects.toMatchObject({ name: 'BlockStorageError' });
    expect(await readFile(destination, 'utf8')).toBe(raw);
  });
});
