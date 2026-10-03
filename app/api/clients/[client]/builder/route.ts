import { authenticate, errorResponse, jsonResponse, sameOrigin } from '../../../../../lib/auth';
import { ConfigurationError } from '../../../../../lib/clients';
import { BuilderValidationError, parseBuilderDocument } from '../../../../../lib/builder-types';
import { BuilderConflictError, BuilderStorageError, readBuilderDocument, writeBuilderDocument } from '../../../../../lib/builder-store';

export const runtime = 'nodejs';
type Context = { params: Promise<{ client: string }> };
const slug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
async function authorized(request: Request, context: Context, write: boolean): Promise<{ client: string } | Response> {
  const session = authenticate(request);
  if (!session) return errorResponse(401);
  const { client } = await context.params;
  if (!slug.test(client) || new URL(request.url).pathname !== `/api/clients/${client}/builder`) return errorResponse(400);
  if (!session.clients.some(item => item.id === client) || (write && session.user.role !== 'admin')) return errorResponse(403);
  return { client };
}
function failed(error: unknown): Response {
  if (error instanceof BuilderConflictError) return jsonResponse({ error: 'Version conflict' }, 409);
  if (error instanceof BuilderValidationError) return errorResponse(400);
  if (error instanceof BuilderStorageError || error instanceof ConfigurationError) return errorResponse(503);
  return errorResponse(503);
}
export async function GET(request: Request, context: Context): Promise<Response> {
  try {
    const access = await authorized(request, context, false);
    if (access instanceof Response) return access;
    return jsonResponse(await readBuilderDocument(access.client));
  } catch (error) { return failed(error); }
}
async function readLimitedJson(request: Request): Promise<unknown> {
  const length = request.headers.get('content-length');
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > 65536)) throw new BuilderValidationError();
  if (!request.body) throw new BuilderValidationError();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 65536) throw new BuilderValidationError();
      chunks.push(value);
    }
  } catch { throw new BuilderValidationError(); }
  finally { reader.releaseLock(); }
  if (length !== null && size !== Number(length)) throw new BuilderValidationError();
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))); }
  catch { throw new BuilderValidationError(); }
}
export async function PUT(request: Request, context: Context): Promise<Response> {
  try {
    const access = await authorized(request, context, true);
    if (access instanceof Response) return access;
    if (!sameOrigin(request)) return errorResponse(403);
    if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get('content-type') ?? '')) return errorResponse(400);
    const document = parseBuilderDocument(await readLimitedJson(request));
    return jsonResponse(await writeBuilderDocument(access.client, document));
  } catch (error) { return failed(error); }
}
