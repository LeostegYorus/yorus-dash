'use client';
import { useEffect, useState } from 'react';
import { previousPeriod, supportsMetaFilter, type MetaEntityFilter, type MetaLevel } from '../../lib/builder-analysis';

export type MetaResult = { client: { id: string }; provider: 'meta'; scope: { level: MetaLevel; entityFilter?: MetaEntityFilter }; dateRange: { start: string; end: string }; status: 'succeeded' | 'partial'; warnings: string[]; rows: Array<Record<string, unknown>>; totals?: Record<string, number | null>; metrics?: Array<{ id: string }>; unavailableMetrics?: string[] };
export type MetaState = { status: 'loading' | 'error' | 'ready'; error?: string; result?: MetaResult };
const core = ['spend', 'impressions', 'clicks'];
export function validateMeta(payload: unknown, clientId: string, level: MetaLevel, start: string, end: string, filter?: MetaEntityFilter): payload is MetaResult {
  if (!payload || typeof payload !== 'object') return false;
  const v = payload as MetaResult;
  const sameFilter = filter ? v.scope?.entityFilter?.level === filter.level && v.scope.entityFilter.id === filter.id : v.scope?.entityFilter === undefined;
  return sameFilter && v.provider === 'meta' && v.client?.id === clientId && v.scope?.level === level && v.dateRange?.start === start && v.dateRange?.end === end && ['partial', 'succeeded'].includes(v.status) && Array.isArray(v.warnings) && v.warnings.every(w => typeof w === 'string') && Array.isArray(v.rows) && v.rows.every(row => row && core.every(key => row[key] === null || (typeof row[key] === 'number' && Number.isFinite(row[key]))) && (!filter || row[`${filter.level}Id`] === filter.id));
}
export function useBuilderMeta({ clientId, start, end, levelKey, measureKey, entityFilter, enabled = true, summary = false }: { clientId: string; start: string; end: string; levelKey: string; measureKey: string; entityFilter?: MetaEntityFilter; enabled?: boolean; summary?: boolean }) {
  const filterLevel = entityFilter?.level, filterId = entityFilter?.id;
  const key = JSON.stringify([clientId, start, end, levelKey, measureKey, filterLevel, filterId, enabled, summary]);
  const [state, setState] = useState<{ key: string; results: Partial<Record<MetaLevel, MetaState>> }>({ key: '', results: {} });
  useEffect(() => {
    if (!enabled || !levelKey || !previousPeriod(start, end)) return;
    const controller = new AbortController();
    for (const level of levelKey.split(',') as MetaLevel[]) {
      const filter = filterLevel && filterId && supportsMetaFilter(level, { level: filterLevel, id: filterId }) ? { level: filterLevel, id: filterId } : undefined;
      const params = new URLSearchParams({ client: clientId, start, end, level });
      const measures: string[] = JSON.parse(measureKey)[level] ?? [];
      if (summary || filter || measures.some(id => !core.includes(id))) params.set('metrics', [...new Set([...core, ...measures])].join(','));
      if (filter) { params.set('entityLevel', filter.level); params.set('entityId', filter.id); }
      const update = (value: MetaState) => { if (!controller.signal.aborted) setState(current => ({ key, results: { ...(current.key === key ? current.results : {}), [level]: value } })); };
      fetch(`/api/dashboard?${params}`, { cache: 'no-store', signal: controller.signal }).then(async response => {
        if (!response.ok) throw new Error('Meta Ads indisponível para este recorte.');
        const result: unknown = await response.json();
        if (!validateMeta(result, clientId, level, start, end, filter)) throw new Error('Resposta Meta não corresponde ao cliente, nível, filtro ou período solicitado.');
        update({ status: 'ready', result });
      }).catch(reason => update({ status: 'error', error: reason instanceof Error ? reason.message : 'Meta Ads indisponível.' }));
    }
    return () => controller.abort();
  }, [clientId, start, end, levelKey, measureKey, filterLevel, filterId, enabled, summary, key]);
  return state.key === key && enabled ? state.results : {};
}
