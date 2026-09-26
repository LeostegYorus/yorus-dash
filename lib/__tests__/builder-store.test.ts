// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile, chmod, symlink, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readBuilderDocument, writeBuilderDocument } from '../builder-store';
let directory: string;
const previous = process.env.DASH_DATA_DIR;
const empty = { version: 0, datasets: [], widgets: [] };
beforeEach(async () => { directory = await mkdtemp(join(tmpdir(), 'yorus-builder-')); process.env.DASH_DATA_DIR = directory; });
afterEach(async () => { if (previous === undefined) delete process.env.DASH_DATA_DIR; else process.env.DASH_DATA_DIR = previous; await rm(directory, { recursive: true, force: true }); });
describe('private per-client builder storage', () => {
  it('starts empty and atomically persists a new revision in a private client file', async () => {
    expect(await readBuilderDocument('alpha')).toEqual(empty);
    const saved = await writeBuilderDocument('alpha', empty);
    expect(saved).toEqual({ ...empty, version: 1 });
    const path = join(directory, 'alpha.builder.json');
    expect(JSON.parse(await readFile(path, 'utf8'))).toEqual(saved);
    expect((await stat(path)).mode & 0o777).toBe(0o600);
    expect(await readBuilderDocument('alpha')).toEqual(saved);
  });
  it('serializes simultaneous writes, rejects stale revisions and isolates tenants', async () => {
    const results = await Promise.allSettled([writeBuilderDocument('alpha', empty), writeBuilderDocument('alpha', empty)]);
    expect(results.map(result => result.status).sort()).toEqual(['fulfilled', 'rejected']);
    expect(await readBuilderDocument('alpha')).toEqual({ ...empty, version: 1 });
    await expect(writeBuilderDocument('alpha', empty)).rejects.toMatchObject({ name: 'BuilderConflictError' });
    expect(await readBuilderDocument('beta')).toEqual(empty);
  });
  it('never resets corrupt files and refuses unsafe revision overflow', async () => {
    const path = join(directory, 'alpha.builder.json');
    await writeFile(path, '{oops', { mode: 0o600 });
    await expect(readBuilderDocument('alpha')).rejects.toMatchObject({ name: 'BuilderStorageError' });
    await expect(writeBuilderDocument('alpha', empty)).rejects.toMatchObject({ name: 'BuilderStorageError' });
    expect(await readFile(path, 'utf8')).toBe('{oops');
    const maxed = { ...empty, version: Number.MAX_SAFE_INTEGER };
    await writeFile(path, JSON.stringify(maxed), { mode: 0o600 });
    await expect(writeBuilderDocument('alpha', maxed)).rejects.toMatchObject({ name: 'BuilderStorageError' });
    expect(await readBuilderDocument('alpha')).toEqual(maxed);
  });
  it('rejects missing, relative, inside-repo or nonprivate data directories and traversal', async () => {
    delete process.env.DASH_DATA_DIR;
    await expect(readBuilderDocument('alpha')).rejects.toMatchObject({ name: 'BuilderStorageError' });
    process.env.DASH_DATA_DIR = 'relative';
    await expect(writeBuilderDocument('alpha', empty)).rejects.toMatchObject({ name: 'BuilderStorageError' });
    process.env.DASH_DATA_DIR = directory;
    await expect(readBuilderDocument('../beta')).rejects.toMatchObject({ name: 'BuilderStorageError' });
    await chmod(directory, 0o750);
    await expect(readBuilderDocument('alpha')).rejects.toMatchObject({ name: 'BuilderStorageError' });
  });
  it('rejects symlinked or group-readable client files without touching their targets', async () => {
    const path = join(directory, 'alpha.builder.json');
    const outside = join(tmpdir(), `builder-outside-${crypto.randomUUID()}`);
    await writeFile(outside, JSON.stringify(empty), { mode: 0o600 });
    try {
      await symlink(outside, path);
      await expect(readBuilderDocument('alpha')).rejects.toMatchObject({ name: 'BuilderStorageError' });
      await expect(writeBuilderDocument('alpha', empty)).rejects.toMatchObject({ name: 'BuilderStorageError' });
      await rm(path);
      await writeFile(path, JSON.stringify(empty), { mode: 0o644 });
      await chmod(path, 0o644);
      await expect(readBuilderDocument('alpha')).rejects.toMatchObject({ name: 'BuilderStorageError' });
      expect(JSON.parse(await readFile(outside, 'utf8'))).toEqual(empty);
    } finally { await rm(outside, { force: true }); }
  });
});
