import { authenticate, errorResponse, jsonResponse, sameOrigin } from '../../../../../lib/auth';
import { ConfigurationError } from '../../../../../lib/clients';
import { BlockValidationError, parseBlockDocument } from '../../../../../lib/block-types';
import { BlockConflictError, BlockStorageError, readBlockDocument, writeBlockDocument } from '../../../../../lib/block-store';

export const runtime = 'nodejs';
type Context = { params: Promise<{ client: string }> };
const slug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

async function authorized(request: Request, context: Context, write: boolean): Promise<{ client: string } | Response> {
  const session = authenticate(request);
  if (!session) return errorResponse(401);
  const { client } = await context.params;
  const path = new URL(request.url).pathname;
  if (!slug.test(client) || path !== `/api/clients/${client}/blocks`) return errorResponse(400);
  if (!session.clients.some(item => item.id === client) || (write && session.user.role !== 'admin')) return errorResponse(403);
  return { client };
}

function failed(error: unknown): Response {
  if (error instanceof BlockConflictError) return jsonResponse({ error: 'Version conflict' }, 409);
  if (error instanceof BlockValidationError) return errorResponse(400);
  if (error instanceof BlockStorageError || error instanceof ConfigurationError) return errorResponse(503);
  return errorResponse(503);
}

export async function GET(request: Request, context: Context): Promise<Response> {
  try {
    const access = await authorized(request, context, false);
    if (access instanceof Response) return access;
    return jsonResponse(await readBlockDocument(access.client));
  } catch (error) { return failed(error); }
}

async function readLimitedJson(request: Request): Promise<unknown> {
  const length = request.headers.get('content-length');
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > 65536)) throw new BlockValidationError();
  if (!request.body) throw new BlockValidationError();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 65536) throw new BlockValidationError();
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))); }
  catch { throw new BlockValidationError(); }
}

export async function PUT(request: Request, context: Context): Promise<Response> {
  try {
    const access = await authorized(request, context, true);
    if (access instanceof Response) return access;
    if (!sameOrigin(request)) return errorResponse(403);
    if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get('content-type') ?? '')) return errorResponse(400);
    const document = parseBlockDocument(await readLimitedJson(request));
    return jsonResponse(await writeBlockDocument(access.client, document));
  } catch (error) { return failed(error); }
}
