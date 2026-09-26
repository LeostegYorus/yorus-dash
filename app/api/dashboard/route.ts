import { authenticate, errorResponse, jsonResponse } from '../../../lib/auth';
import { ConfigurationError } from '../../../lib/clients';
import { MetaInsightsError, readMetaInsights, type MetaLevel } from '../../../lib/integrations/meta';

export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  try {
    const session = authenticate(request);
    if (!session) return errorResponse(401);
    const query = new URL(request.url).searchParams;
    if ([...query.keys()].some(key => !['client', 'start', 'end', 'level'].includes(key)) ||
      ['client', 'start', 'end', 'level'].some(key => query.getAll(key).length !== 1)) return errorResponse(400);
    const id = query.get('client')!;
    const start = query.get('start')!;
    const end = query.get('end')!;
    const level = query.get('level')!;
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) || !/^\d{4}-\d{2}-\d{2}$/.test(start) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(end) || !['campaign', 'adset', 'ad'].includes(level)) return errorResponse(400);
    const client = session.clients.find(item => item.id === id);
    if (!client) return errorResponse(403);
    const insights = await readMetaInsights({
      account: client.metaAccountId, allowedAccountIds: session.clients.map(item => item.metaAccountId),
      start, end, level: level as MetaLevel, token: process.env.META_SYSTEM_USER_TOKEN ?? '',
    });
    return jsonResponse({ client: { id: client.id, name: client.name, currency: client.currency }, ...insights });
  } catch (error) {
    if (error instanceof ConfigurationError) return errorResponse(503);
    if (error instanceof MetaInsightsError) return errorResponse(error.status);
    return errorResponse(502);
  }
}
