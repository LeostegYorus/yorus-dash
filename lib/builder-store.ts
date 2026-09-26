import { open, realpath, rename, rm, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { BuilderValidationError, parseBuilderDocument, type BuilderDocument } from './builder-types';

export class BuilderStorageError extends Error { name = 'BuilderStorageError'; constructor() { super('Builder storage unavailable'); } }
export class BuilderConflictError extends Error { name = 'BuilderConflictError'; constructor() { super('Builder version conflict'); } }
const queues = new Map<string, Promise<unknown>>();
const empty = (): BuilderDocument => ({ version: 0, datasets: [], widgets: [] });

async function location(client: string): Promise<{ path: string; directory: string }> {
  const directory = process.env.DASH_DATA_DIR;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(client) || !directory || !isAbsolute(directory)) throw new BuilderStorageError();
  const normalized = resolve(directory);
  const repoRelative = relative(process.cwd(), normalized);
  if (!repoRelative.startsWith('..') && !isAbsolute(repoRelative)) throw new BuilderStorageError();
  try {
    const details = await stat(directory);
    if (await realpath(directory) !== normalized || !details.isDirectory() || (details.mode & 0o777) !== 0o700) throw new BuilderStorageError();
  } catch { throw new BuilderStorageError(); }
  return { path: join(directory, `${client}.builder.json`), directory };
}

async function readFileDocument(path: string): Promise<BuilderDocument> {
  let handle;
  try {
    handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const details = await handle.stat();
    if (!details.isFile() || (details.mode & 0o777) !== 0o600 || details.size > 65536) throw new BuilderStorageError();
    const data = await handle.readFile();
    if (data.byteLength > 65536) throw new BuilderStorageError();
    return parseBuilderDocument(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(data)));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return empty();
    throw new BuilderStorageError();
  } finally { await handle?.close(); }
}
function serialize<T>(key: string, task: () => Promise<T>): Promise<T> {
  const previous = queues.get(key) ?? Promise.resolve();
  const pending = previous.catch(() => undefined).then(task);
  queues.set(key, pending);
  void pending.finally(() => { if (queues.get(key) === pending) queues.delete(key); }).catch(() => undefined);
  return pending;
}
export async function readBuilderDocument(client: string): Promise<BuilderDocument> {
  const { path } = await location(client);
  return serialize(path, () => readFileDocument(path));
}
export async function writeBuilderDocument(client: string, incoming: BuilderDocument): Promise<BuilderDocument> {
  const { path, directory } = await location(client);
  const valid = parseBuilderDocument(incoming);
  return serialize(path, async () => {
    const current = await readFileDocument(path);
    if (current.version !== valid.version) throw new BuilderConflictError();
    if (current.version === Number.MAX_SAFE_INTEGER) throw new BuilderStorageError();
    const document: BuilderDocument = { ...valid, version: current.version + 1 };
    const encoded = JSON.stringify(document);
    if (Buffer.byteLength(encoded) > 65536) throw new BuilderValidationError();
    const temporary = join(directory, `.${client}.${randomUUID()}.tmp`);
    let handle;
    try {
      handle = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
      await handle.writeFile(encoded);
      await handle.sync();
      await handle.close();
      handle = undefined;
      await rename(temporary, path);
      return document;
    } catch { throw new BuilderStorageError(); }
    finally { await handle?.close(); await rm(temporary, { force: true }).catch(() => undefined); }
  });
}
