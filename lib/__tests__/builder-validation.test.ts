// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { parseBuilderDocument } from '../builder-types';

const datasetId = '123e4567-e89b-42d3-a456-426614174000';
const widgetId = '123e4567-e89b-42d3-a456-426614174001';
const dataset = { id: datasetId, name: 'Sales', sourceLabel: 'Imported CSV', periodStart: '2026-09-01', periodEnd: '2026-09-30', fields: [{ id: 'region', label: 'Region', type: 'text' }, { id: 'revenue', label: 'Revenue', type: 'number' }], rows: [{ region: 'South', revenue: 42.5 }] };
const widget = { id: widgetId, kind: 'data', title: 'By region', width: 6, source: { kind: 'manual', datasetId }, visualization: 'bar', dimension: 'region', measure: 'revenue', aggregation: 'sum', format: 'currency' };
const document = (datasets: unknown[] = [dataset], widgets: unknown[] = [widget]) => ({ version: 0, datasets, widgets });

describe('builder document parser', () => {
  describe.each(['bar', 'column', 'line', 'area', 'pie', 'donut', 'table'])('%s visualization', visualization => {
    it('accepts manual data including null and negative cells without rewriting the document', () => {
      const selected = { ...dataset, rows: [{ region: null, revenue: null }, { region: 'Refunds', revenue: -42.5 }] };
      const chart = { ...widget, visualization, position: { x: 6, y: 245, height: 5 } };
      const input = document([selected], [chart]);
      expect(parseBuilderDocument(input)).toEqual(input);
    });
    it.each([
      ['campaign', 'campaignName'], ['adset', 'adsetName'], ['ad', 'adName'],
    ])('accepts Meta %s data with its declared dimension', (level, dimension) => {
      const chart = { ...widget, visualization, source: { kind: 'meta', level }, dimension, measure: 'spend' };
      expect(parseBuilderDocument(document([], [chart])).widgets[0]).toEqual(chart);
    });
    it('requires a nonempty dimension for manual and Meta sources', () => {
      for (const chart of [
        { ...widget, visualization },
        { ...widget, visualization, source: { kind: 'meta', level: 'campaign' }, measure: 'spend', dimension: 'campaignName' },
      ]) {
        const withoutDimension: Partial<typeof chart> = { ...chart };
        delete withoutDimension.dimension;
        expect(() => parseBuilderDocument(document([dataset], [withoutDimension]))).toThrow('Invalid builder document');
        for (const dimension of [undefined, null, '', 1, 'missing']) {
          expect(() => parseBuilderDocument(document([dataset], [{ ...chart, dimension }]))).toThrow('Invalid builder document');
        }
      }
    });
    it('retains strict source, account, field, format and position validation', () => {
      for (const changed of [
        { source: { kind: 'unknown' } },
        { source: { kind: 'manual', datasetId: crypto.randomUUID() } },
        { source: { kind: 'manual', datasetId, accountId: 'act_1' } },
        { accountId: 'act_1' }, { measure: 'missing' }, { measure: 'region' },
        { dimension: 'revenue' }, { aggregation: 'median' }, { format: 'percent' },
        { position: { x: 7, y: 0, height: 2 } },
        { position: { x: 0, y: 1200, height: 2 } },
        { position: { x: 0, y: 0, height: 1 } },
        { position: { x: 0, y: 0, height: 2, accountId: 'act_1' } },
      ]) {
        expect(() => parseBuilderDocument(document([dataset], [{ ...widget, visualization, ...changed }]))).toThrow('Invalid builder document');
      }
      const meta = { ...widget, visualization, source: { kind: 'meta', level: 'campaign' }, measure: 'spend', dimension: 'campaignName' };
      for (const changed of [
        { source: { ...meta.source, accountId: 'act_1' } },
        { source: { kind: 'meta', level: 'account' } },
        { source: { kind: 'meta', level: 'constructor' } },
        { dimension: 'adName' }, { measure: 'leads' },
      ]) {
        expect(() => parseBuilderDocument(document([], [{ ...meta, ...changed }]))).toThrow('Invalid builder document');
      }
    });
  });
  it.each(['scatter', 'radar', 'stacked-bar', 'Column', 'constructor', '', null, undefined, 1])('rejects unknown visualization %s', visualization => {
    expect(() => parseBuilderDocument(document([dataset], [{ ...widget, visualization }]))).toThrow('Invalid builder document');
  });
  it('retains metric widgets without a dimension in existing documents', () => {
    const metric: Partial<typeof widget> = { ...widget, visualization: 'metric' };
    delete metric.dimension;
    const input = document([dataset], [metric]);
    expect(parseBuilderDocument(input)).toEqual(input);
  });
  it('accepts a real manual dataset and chart without changing its contract', () => {
    expect(parseBuilderDocument(document())).toEqual(document());
  });
  it('retains a freely sized widget and its explicit canvas rectangle', () => {
    const placed = { ...widget, width: 5, position: { x: 7, y: 99, height: 24 } };
    expect(parseBuilderDocument(document([dataset], [placed])).widgets[0]).toEqual(placed);
  });
  it('accepts a positioned chart beyond the first hundred rows for migrated legacy panels', () => {
   const placed = { ...widget, position: { x: 0, y: 245, height: 5 } };
   expect(parseBuilderDocument(document([dataset], [placed])).widgets[0]).toMatchObject({ position: placed.position });
 });
 it('rejects overlapping explicitly placed rectangles in one document', () => {
    const first = { ...widget, position: { x: 2, y: 3, height: 4 } };
    const second = { ...widget, id: crypto.randomUUID(), position: { x: 6, y: 6, height: 2 } };
    expect(() => parseBuilderDocument(document([dataset], [first, second]))).toThrow();
  });
  it('accepts every integer width from 1 to 12 and retains legacy unplaced widgets', () => {
    for (let width = 1; width <= 12; width++) {
      const candidate = { ...widget, width };
      expect(parseBuilderDocument(document([dataset], [candidate])).widgets[0]).toEqual(candidate);
    }
    const legacy = { id: crypto.randomUUID(), kind: 'text', title: 'Legacy', width: 3, body: 'Still valid' };
    const placed = { ...widget, width: 1, position: { x: 11, y: 0, height: 2 } };
    expect(parseBuilderDocument(document([dataset], [legacy, placed])).widgets).toEqual([legacy, placed]);
  });
  it('rejects invalid widths, malformed rectangles and account overrides', () => {
    for (const width of [0, 13, -1, 5.5, NaN, Infinity, '5', null]) {
      expect(() => parseBuilderDocument(document([dataset], [{ ...widget, width }]))).toThrow();
    }
    const position = { x: 6, y: 0, height: 2 };
    for (const badPosition of [
      undefined, null, [], '0,0', {}, { x: 6, y: 0 }, { ...position, accountId: 'act_1' },
      ...[-1, 7, 12, 0.5, NaN, Infinity, '6'].map(x => ({ ...position, x })),
      ...[-1, 1200, 0.5, NaN, Infinity, '0'].map(y => ({ ...position, y })),
      ...[1, 25, 2.5, NaN, Infinity, '2'].map(height => ({ ...position, height })),
    ]) {
      expect(() => parseBuilderDocument(document([dataset], [{ ...widget, position: badPosition }]))).toThrow();
    }
    expect(() => parseBuilderDocument(document([dataset], [{ ...widget, position, accountId: 'act_1' }]))).toThrow();
  });
  it('allows rectangles to touch edges and only checks overlap between explicit placements', () => {
    const first = { id: crypto.randomUUID(), kind: 'text', title: 'Top left', width: 6, body: 'A', position: { x: 0, y: 0, height: 2 } };
    const right = { ...widget, position: { x: 6, y: 0, height: 2 } };
    const below = { ...widget, id: crypto.randomUUID(), width: 12, position: { x: 0, y: 2, height: 2 } };
    const legacy = { ...widget, id: crypto.randomUUID() };
    expect(parseBuilderDocument(document([dataset], [first, right, below, legacy])).widgets).toEqual([first, right, below, legacy]);
    expect(() => parseBuilderDocument(document([dataset], [first, { ...right, position: { x: 5, y: 0, height: 2 } }]))).toThrow();
    expect(() => parseBuilderDocument(document([dataset], [first, { ...below, position: { x: 0, y: 1, height: 2 } }]))).toThrow();
  });
  it('rejects an oversized document, including multibyte input', () => {
    expect(() => parseBuilderDocument(document([], [{ id: widgetId, kind: 'text', title: 'Note', width: 12, body: 'á'.repeat(33000) }]))).toThrow();
  });
  it('rejects unknown keys, account IDs, duplicate IDs, quotas and bad dates', () => {
    const bad = [
      { ...document(), metaAccountId: 'act_1' }, document([{ ...dataset, accountId: 'act_1' }]),
      document([dataset, dataset]), document([dataset], [widget, widget]),
      document(Array.from({ length: 9 }, (_, i) => ({ ...dataset, id: `123e4567-e89b-42d3-a456-${String(i).padStart(12, '0')}` })), []),
      document([{ ...dataset, fields: Array.from({ length: 13 }, (_, i) => ({ id: `field-${i}`, label: 'Field', type: 'text' })) }], []),
      document([{ ...dataset, rows: Array.from({ length: 201 }, () => dataset.rows[0]) }], []),
      document([], Array.from({ length: 51 }, (_, i) => ({ id: `123e4567-e89b-42d3-a456-${String(i).padStart(12, '0')}`, kind: 'text', title: 'A', width: 3, body: 'A' }))),
      document([{ ...dataset, periodStart: '2026-02-30' }]), document([{ ...dataset, periodStart: '2026-10-01' }]),
      document([{ ...dataset, fields: [...dataset.fields, dataset.fields[0]] }]),
      { ...document(), version: Number.MAX_SAFE_INTEGER + 1 },
    ];
    for (const item of bad) expect(() => parseBuilderDocument(item)).toThrow();
  });
  it('bounds each numeric cell so a full 200-row sum stays within safe integer magnitude', () => {
    expect(() => parseBuilderDocument(document([{ ...dataset, rows: [{ region: 'A', revenue: 1_000_000_000_001 }] }]))).toThrow();
    expect(parseBuilderDocument(document([{ ...dataset, rows: [{ region: 'A', revenue: 999_999_999_999.25 }] }])).datasets[0].rows[0].revenue).toBe(999_999_999_999.25);
  });
  it('validates every row cell type, bound and exact field set', () => {
    for (const rows of [[{ region: 'A', revenue: Infinity }], [{ region: 'A', revenue: Number.MAX_SAFE_INTEGER + 1 }], [{ region: '<img>', revenue: 1 }], [{ region: 'A', revenue: '1' }], [{ region: 'A', revenue: 1, secret: 'leak' }], [{ region: 'A' }]]) {
      expect(() => parseBuilderDocument(document([{ ...dataset, rows }]))).toThrow();
    }
    expect(parseBuilderDocument(document([{ ...dataset, rows: [{ region: null, revenue: null }] }])).datasets[0].rows).toEqual([{ region: null, revenue: null }]);
  });
  it('enforces manual measure and dimension references and visualization rules', () => {
    for (const changed of [
      { source: { kind: 'manual', datasetId: crypto.randomUUID() } }, { measure: 'missing' },
      { measure: 'region' }, { dimension: 'revenue' }, { dimension: 'missing' },
      { visualization: 'bar', dimension: undefined }, { format: 'secret' }, { aggregation: 'median' },
      { source: { kind: 'manual', datasetId, accountId: 'act_1' } },
    ]) expect(() => parseBuilderDocument(document([dataset], [{ ...widget, ...changed }]))).toThrow();
    expect(parseBuilderDocument(document([dataset], [{ ...widget, measure: 'region', aggregation: 'count' }])).widgets).toHaveLength(1);
    expect(parseBuilderDocument(document([dataset], [{ ...widget, visualization: 'metric', dimension: undefined }])).widgets).toHaveLength(1);
  });
  it('whitelists Meta metrics and dimensions by level without accepting account overrides', () => {
    for (const [level, dimension] of [['campaign', 'campaignName'], ['adset', 'adsetName'], ['ad', 'adName']] as const) {
      const meta = { ...widget, source: { kind: 'meta', level }, dimension, measure: 'spend' };
      expect(parseBuilderDocument(document([], [meta])).widgets[0]).toEqual(meta);
      for (const changed of [{ dimension: 'other' }, { measure: 'leads' }, { source: { ...meta.source, accountId: 'act_1' } }]) {
        expect(() => parseBuilderDocument(document([], [{ ...meta, ...changed }]))).toThrow();
      }
    }
  });
  it('rejects percent formatting of raw Meta totals', () => {
    for (const measure of ['spend', 'impressions', 'clicks']) {
      expect(() => parseBuilderDocument(document([], [{ ...widget, source: { kind: 'meta', level: 'campaign' }, dimension: 'campaignName', measure, format: 'percent' }]))).toThrow();
    }
  });
  it('rejects percent formatting on manual values without proportion metadata', () => {
    expect(() => parseBuilderDocument(document([dataset], [{ ...widget, format: 'percent' }]))).toThrow();
  });
  it('keeps text widgets plain and bounded and forbids control chars in labels', () => {
    const plain = { id: widgetId, kind: 'text', title: 'Finding', width: 12, body: 'One\nTwo', note: 'Evidence' };
    expect(parseBuilderDocument(document([], [plain])).widgets[0]).toEqual(plain);
    for (const changed of [{ body: '<script />' }, { title: 'X\u0000Y' }, { width: 13 }, { body: 'x'.repeat(4001) }, { measure: 'spend' }]) expect(() => parseBuilderDocument(document([], [{ ...plain, ...changed }]))).toThrow();
  });
});
