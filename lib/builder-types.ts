export type ManualDataset = {
  id: string; name: string; sourceLabel: string; periodStart: string; periodEnd: string;
  fields: Array<{ id: string; label: string; type: 'text' | 'number' }>;
  rows: Array<Record<string, string | number | null>>;
};
export const BUILDER_MAX_ROW = 1199;
type WidgetBase = { id: string; title: string; width: number; note?: string; position?: { x: number; y: number; height: number } };
export type BuilderWidget = WidgetBase & (
  { kind: 'text'; body: string } |
  { kind: 'data'; source: { kind: 'manual'; datasetId: string } | { kind: 'meta'; level: 'campaign' | 'adset' | 'ad' }; visualization: 'metric' | 'bar' | 'table'; dimension?: string; measure: string; aggregation: 'sum' | 'avg' | 'count'; format: 'number' | 'currency' | 'percent' }
);
export type BuilderDocument = { version: number; datasets: ManualDataset[]; widgets: BuilderWidget[] };
export class BuilderValidationError extends Error { name = 'BuilderValidationError'; constructor() { super('Invalid builder document'); } }
const invalid = (): never => { throw new BuilderValidationError(); };
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const slug = (value: unknown): value is string => typeof value === 'string' && /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(value) && value.length <= 64;
function keys(value: Record<string, unknown>, required: string[], optional: string[] = []): void {
  if (required.some(key => !Object.hasOwn(value, key)) || Object.keys(value).some(key => !required.includes(key) && !optional.includes(key))) invalid();
}
function text(value: unknown, max: number, required = true, multiline = false): void {
  const controls = multiline ? /[<>\u0000-\u0009\u000b-\u001f\u007f]/ : /[<>\u0000-\u001f\u007f]/;
  if (typeof value !== 'string' || value.length > max || (required && !value.trim()) || controls.test(value)) invalid();
}
function date(value: unknown): void {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`)) || new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value) invalid();
}
function dataset(value: unknown): ManualDataset {
  if (!object(value)) throw new BuilderValidationError();
  keys(value, ['id', 'name', 'sourceLabel', 'periodStart', 'periodEnd', 'fields', 'rows']);
  if (!uuid(value.id)) invalid();
  text(value.name, 120); text(value.sourceLabel, 160);
  date(value.periodStart); date(value.periodEnd);
  if ((value.periodStart as string) > (value.periodEnd as string)) invalid();
  if (!Array.isArray(value.fields) || value.fields.length < 1 || value.fields.length > 12 || !Array.isArray(value.rows) || value.rows.length > 200) throw new BuilderValidationError();
  for (const field of value.fields) {
    if (!object(field)) invalid();
    keys(field, ['id', 'label', 'type']);
    if (!slug(field.id) || !['text', 'number'].includes(field.type as string)) invalid();
    text(field.label, 160);
  }
  const fields = value.fields as ManualDataset['fields'];
  if (new Set(fields.map(field => field.id)).size !== fields.length) invalid();
  for (const row of value.rows) {
    if (!object(row)) invalid();
    keys(row, fields.map(field => field.id));
    for (const field of fields) {
      const cell = row[field.id];
      if (cell === null) continue;
      if (field.type === 'text') text(cell, 2000, false);
      // Decimal cells remain finite; at most 200 rows * 1e12 = 2e14 in magnitude.
      else if (typeof cell !== 'number' || !Number.isFinite(cell) || Math.abs(cell) > 1_000_000_000_000) invalid();
    }
  }
  return value as ManualDataset;
}
function widget(value: unknown, datasets: Map<string, ManualDataset>): BuilderWidget {
  if (!object(value)) throw new BuilderValidationError();
  if (!uuid(value.id) || !Number.isInteger(value.width) || (value.width as number) < 1 || (value.width as number) > 12) invalid();
  text(value.title, 120);
  if (value.note !== undefined) text(value.note, 2000, false, true);
  if (Object.hasOwn(value, 'position')) {
    const position = value.position;
    if (!object(position)) throw new BuilderValidationError();
    keys(position, ['x', 'y', 'height']);
    if (!Number.isInteger(position.x) || (position.x as number) < 0 || (position.x as number) > 11 ||
        !Number.isInteger(position.y) || (position.y as number) < 0 || (position.y as number) > BUILDER_MAX_ROW ||
        !Number.isInteger(position.height) || (position.height as number) < 2 || (position.height as number) > 24 ||
        (position.x as number) + (value.width as number) > 12) invalid();
  }
  if (value.kind === 'text') {
    keys(value, ['id', 'kind', 'title', 'width', 'body'], ['note', 'position']);
    text(value.body, 4000, true, true);
  } else if (value.kind === 'data') {
    keys(value, ['id', 'kind', 'title', 'width', 'source', 'visualization', 'measure', 'aggregation', 'format'], ['dimension', 'note', 'position']);
    if (!object(value.source) || !['metric', 'bar', 'table'].includes(value.visualization as string) || !['sum', 'avg', 'count'].includes(value.aggregation as string) || !['number', 'currency', 'percent'].includes(value.format as string)) invalid();
    // No source in this schema declares a 0..1 proportion; percent would mislabel raw totals.
    if (value.format === 'percent') invalid();
    if (value.dimension !== undefined && (typeof value.dimension !== 'string' || !value.dimension)) invalid();
    if (value.visualization !== 'metric' && value.dimension === undefined) invalid();
    const source = value.source as Record<string, unknown>;
    if (source.kind === 'manual') {
      keys(source, ['kind', 'datasetId']);
      const selected = datasets.get(source.datasetId as string);
      if (!selected) throw new BuilderValidationError();
      const measure = selected.fields.find(field => field.id === value.measure);
      if (!measure || (value.aggregation !== 'count' && measure.type !== 'number')) invalid();
      if (value.dimension !== undefined && !selected.fields.some(field => field.id === value.dimension && field.type === 'text')) invalid();
    } else if (source.kind === 'meta') {
      keys(source, ['kind', 'level']);
      const dimensions: Record<string, string> = { campaign: 'campaignName', adset: 'adsetName', ad: 'adName' };
      if (typeof source.level !== 'string' || !Object.hasOwn(dimensions, source.level) || !['spend', 'impressions', 'clicks'].includes(value.measure as string) || (value.dimension !== undefined && value.dimension !== dimensions[source.level])) invalid();
    } else invalid();
  } else invalid();
  return value as BuilderWidget;
}
export function parseBuilderDocument(value: unknown): BuilderDocument {
  if (!object(value)) throw new BuilderValidationError();
  keys(value, ['version', 'datasets', 'widgets']);
  if (!Number.isSafeInteger(value.version) || (value.version as number) < 0 || !Array.isArray(value.datasets) || value.datasets.length > 8 || !Array.isArray(value.widgets) || value.widgets.length > 50) throw new BuilderValidationError();
  const datasets = value.datasets.map(dataset);
  if (new Set(datasets.map(item => item.id)).size !== datasets.length) invalid();
  const widgets = value.widgets.map(item => widget(item, new Map(datasets.map(dataset => [dataset.id, dataset]))));
  if (new Set(widgets.map(item => item.id)).size !== widgets.length) invalid();
  for (let i = 0; i < widgets.length; i++) {
    const a = widgets[i];
    if (!a.position) continue;
    for (let j = i + 1; j < widgets.length; j++) {
      const b = widgets[j];
      if (!b.position) continue;
      if (a.position.x < b.position.x + b.width && b.position.x < a.position.x + a.width &&
          a.position.y < b.position.y + b.position.height && b.position.y < a.position.y + a.position.height) invalid();
    }
  }
  if (Buffer.byteLength(JSON.stringify(value)) > 65536) invalid();
  return { version: value.version as number, datasets, widgets };
}
