// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { parseBuilderDocument } from '../builder-types';

const datasetId = '123e4567-e89b-42d3-a456-426614174000';
const widgetId = '123e4567-e89b-42d3-a456-426614174001';
const dataset = { id: datasetId, name: 'Sales', sourceLabel: 'Imported CSV', periodStart: '2026-09-01', periodEnd: '2026-09-30', fields: [{ id: 'region', label: 'Region', type: 'text' }, { id: 'revenue', label: 'Revenue', type: 'number' }], rows: [{ region: 'South', revenue: 42.5 }] };
const widget = { id: widgetId, kind: 'data', title: 'By region', width: 6, source: { kind: 'manual', datasetId }, visualization: 'bar', dimension: 'region', measure: 'revenue', aggregation: 'sum', format: 'currency' };
const document = (datasets: unknown[] = [dataset], widgets: unknown[] = [widget]) => ({ version: 0, datasets, widgets });

describe('builder document parser', () => {
  it('accepts a real manual dataset and chart without changing its contract', () => {
    expect(parseBuilderDocument(document())).toEqual(document());
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
    for (const changed of [{ body: '<script />' }, { title: 'X\u0000Y' }, { width: 5 }, { body: 'x'.repeat(4001) }, { measure: 'spend' }]) expect(() => parseBuilderDocument(document([], [{ ...plain, ...changed }]))).toThrow();
  });
});
