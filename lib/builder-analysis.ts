export type MetaLevel = 'campaign' | 'adset' | 'ad';
export type MetaEntityFilter = { level: MetaLevel; id: string };
export type BuilderSelection = { label: string; widgetId: string } & (
  { kind: 'manual'; datasetId: string; dimension: string; value: string | number | null } |
  { kind: 'meta'; level: MetaLevel; id: string }
);
const levels: MetaLevel[] = ['campaign', 'adset', 'ad'];
export function supportsMetaFilter(level: MetaLevel, filter: MetaEntityFilter) {
  return levels.indexOf(level) >= levels.indexOf(filter.level);
}
export function validEntityFilter(value: unknown): value is MetaEntityFilter {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return Object.keys(v).length === 2 && levels.includes(v.level as MetaLevel) && typeof v.id === 'string' && /^\d{1,32}$/.test(v.id);
}
export function previousPeriod(start: string, end: string): { start: string; end: string } | null {
  const parse = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return NaN;
    const time = Date.parse(`${value}T00:00:00Z`);
    return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value ? time : NaN;
  };
  const first = parse(start), last = parse(end), day = 86_400_000;
  if (!Number.isFinite(first) || !Number.isFinite(last) || last < first || last - first > 92 * day) return null;
  const from = new Date(first - (last - first + day)).toISOString().slice(0, 10);
  return /^\d{4}-/.test(from) ? { start: from, end: new Date(first - day).toISOString().slice(0, 10) } : null;
}
export function relativeChange(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || !Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) return null;
  const change = current / Math.abs(previous) - previous / Math.abs(previous);
  return Number.isFinite(change) ? change : null;
}
