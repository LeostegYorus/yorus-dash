// @vitest-environment node
import { expect, it } from 'vitest';
import { parseBuilderDocument } from '../builder-types';

const widget = { id: '123e4567-e89b-42d3-a456-426614174001', kind: 'data', title: 'Investimento', width: 6, source: { kind: 'meta', level: 'campaign' }, visualization: 'column', dimension: 'campaignName', measure: 'spend', aggregation: 'sum', format: 'currency' };
const doc = (appearance?: unknown) => ({ version: 7, datasets: [], widgets: [{ ...widget, ...(appearance === undefined ? {} : { appearance }) }] });

it('round-trips safe presentation options without changing data bindings, geometry or document revision', () => {
  const value = doc({ color: '#23aabb', background: '#151821', textColor: '#ffffff', fontSize: 16, decimals: 3, showTitle: false, showLegend: false, showLabels: true });
  expect(parseBuilderDocument(value)).toEqual(value);
  expect(parseBuilderDocument(doc())).toEqual(doc());
});

it.each([
  null, [], 'red', { color: 'url(https://example.test)' }, { color: '#fff;display:none' },
  { background: 'transparent' }, { textColor: 'red' }, { fontSize: 9 }, { fontSize: 33 },
  { fontSize: 14.5 }, { decimals: -1 }, { decimals: 5 }, { decimals: 1.5 },
  { showTitle: 'false' }, { showLegend: 1 }, { showLabels: null }, { html: '<script>' },
])('rejects malformed or unsafe presentation options: %j', appearance => {
  expect(() => parseBuilderDocument(doc(appearance))).toThrow('Invalid builder document');
});

it('also preserves appearance on text widgets without accepting data-source fields', () => {
  const text = { id: widget.id, kind: 'text', title: 'Contexto', body: 'Leitura do período', width: 12, appearance: { background: '#303030', fontSize: 20, showTitle: false } };
  expect(parseBuilderDocument({ version: 0, datasets: [], widgets: [text] }).widgets[0]).toEqual(text);
  expect(() => parseBuilderDocument({ version: 0, datasets: [], widgets: [{ ...text, source: widget.source }] })).toThrow();
});
