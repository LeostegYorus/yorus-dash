import { authenticate, errorResponse, jsonResponse } from '../../../lib/auth';
import { ConfigurationError } from '../../../lib/clients';
import { MetaInsightsError, readMetaInsights, type MetaLevel } from '../../../lib/integrations/meta';
import { readMetaBuilderInsights } from '../../../lib/integrations/meta-builder';
import { validEntityFilter } from '../../../lib/builder-analysis';

export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  try {
    const session = authenticate(request);
    if (!session) return errorResponse(401);
    const query = new URL(request.url).searchParams;
    if ([...query.keys()].some(key => !['client', 'start', 'end', 'level', 'metrics', 'catalog', 'entityLevel', 'entityId'].includes(key)) ||
      ['client', 'start', 'end', 'level'].some(key => query.getAll(key).length !== 1) ||
      ['metrics', 'catalog', 'entityLevel', 'entityId'].some(key => query.getAll(key).length > 1) ||
      (query.has('catalog') && query.get('catalog') !== '1')) return errorResponse(400);
    const id = query.get('client')!;
    const start = query.get('start')!;
    const end = query.get('end')!;
    const level = query.get('level')!;
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) || !/^\d{4}-\d{2}-\d{2}$/.test(start) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(end) || !['campaign', 'adset', 'ad'].includes(level)) return errorResponse(400);
    const client = session.clients.find(item => item.id === id);
    if (!client) return errorResponse(403);
    const entityFilter = query.has('entityLevel') || query.has('entityId') ? { level: query.get('entityLevel'), id: query.get('entityId') } : undefined;
    if (entityFilter !== undefined && !validEntityFilter(entityFilter)) return errorResponse(400);
    const input = {
      account: client.metaAccountId, allowedAccountIds: session.clients.map(item => item.metaAccountId),
      start, end, level: level as MetaLevel, token: process.env.META_SYSTEM_USER_TOKEN ?? '',
    };
    const insights = query.has('metrics') || query.has('catalog') || entityFilter
      ? await readMetaBuilderInsights({ ...input, metrics: query.has('metrics') ? query.get('metrics')!.split(',') : undefined, discover: query.get('catalog') === '1', entityFilter: validEntityFilter(entityFilter) ? entityFilter : undefined })
      : await readMetaInsights(input);
    return jsonResponse({ client: { id: client.id, name: client.name, currency: client.currency }, ...insights });
  } catch (error) {
    if (error instanceof ConfigurationError) return errorResponse(503);
    if (error instanceof MetaInsightsError) return errorResponse(error.status);
    return errorResponse(502);
  }
}
