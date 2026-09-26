import { open, realpath, rename, rm, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { parseBlockDocument, type BlockDocument, type BlockDraftDocument, type Block } from './block-types';

export class BlockStorageError extends Error { name = 'BlockStorageError'; constructor() { super('Block storage unavailable'); } }
export class BlockConflictError extends Error { name = 'BlockConflictError'; constructor() { super('Block version conflict'); } }
const queues = new Map<string, Promise<unknown>>();
const empty = (): BlockDocument => ({ version: 0, blocks: [] });

async function location(client: string): Promise<string> {
  const directory = process.env.DASH_DATA_DIR;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(client) || !directory || !isAbsolute(directory)) throw new BlockStorageError();
  const normalized = resolve(directory);
  const repoRelative = relative(process.cwd(), normalized);
  if (!repoRelative.startsWith('..') && !isAbsolute(repoRelative)) throw new BlockStorageError();
  try {
    const details = await stat(directory);
    if (await realpath(directory) !== normalized || !details.isDirectory() || (details.mode & 0o077) !== 0) throw new BlockStorageError();
  } catch { throw new BlockStorageError(); }
  return join(directory, `${client}.json`);
}

async function readFileDocument(path: string): Promise<BlockDocument> {
  let handle;
  try {
    handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const details = await handle.stat();
    if (!details.isFile() || (details.mode & 0o077) !== 0 || details.size > 65536) throw new BlockStorageError();
    const parsed: unknown = JSON.parse(await handle.readFile('utf8'));
    return parseBlockDocument(parsed, true);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return empty();
    throw new BlockStorageError();
  } finally { await handle?.close(); }
}

export async function readBlockDocument(client: string): Promise<BlockDocument> {
  const path = await location(client);
  return serialize(path, () => readFileDocument(path));
}

function serialize<T>(key: string, task: () => Promise<T>): Promise<T> {
  const previous = queues.get(key) ?? Promise.resolve();
  const pending = previous.catch(() => undefined).then(task);
  queues.set(key, pending);
  void pending.finally(() => { if (queues.get(key) === pending) queues.delete(key); }).catch(() => undefined);
  return pending;
}

export async function writeBlockDocument(client: string, incoming: BlockDocument | BlockDraftDocument): Promise<BlockDocument> {
  const destination = await location(client);
  const valid = parseBlockDocument(incoming);
  return serialize(destination, async () => {
    const current = await readFileDocument(destination);
    if (current.version !== valid.version) throw new BlockConflictError();
    if (current.version === Number.MAX_SAFE_INTEGER) throw new BlockStorageError();
    const blocks: Block[] = valid.blocks.map(item => {
      const prior = current.blocks.find(block => block.id === item.id);
      const { updatedAt: _old, ...original } = prior ?? ({} as Block);
      void _old;
      return { ...item, updatedAt: prior && JSON.stringify(original) === JSON.stringify(item) ? prior.updatedAt : new Date().toISOString() } as Block;
    });
    const document: BlockDocument = { version: current.version + 1, blocks };
    if (Buffer.byteLength(JSON.stringify(document)) > 65536) throw new BlockStorageError();
    const temporary = join(process.env.DASH_DATA_DIR!, `.${client}.${randomUUID()}.tmp`);
    let handle;
    try {
      handle = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
      await handle.writeFile(JSON.stringify(document));
      await handle.sync();
      await handle.close();
      handle = undefined;
      await rename(temporary, destination);
      return document;
    } catch { throw new BlockStorageError(); }
    finally { await handle?.close(); await rm(temporary, { force: true }).catch(() => undefined); }
  });
}
