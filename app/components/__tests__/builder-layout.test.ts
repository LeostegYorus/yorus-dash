import { describe, expect, it } from 'vitest';
import { placeCanvasWidget, resolveCanvas } from '../builder-layout';
import { parseBuilderDocument, type BuilderWidget } from '../../../lib/builder-types';

const first: BuilderWidget = { id: '123e4567-e89b-42d3-a456-426614174001', title: 'First', kind: 'text', body: 'A', width: 12, position: { x: 0, y: 0, height: 5 } };
const second: BuilderWidget = { id: '123e4567-e89b-42d3-a456-426614174002', title: 'Second', kind: 'text', body: 'B', width: 12, position: { x: 0, y: 1199, height: 5 } };

describe('canvas placement', () => {
  it.each(['column', 'line', 'area', 'pie', 'donut'] as const)('gives a new %s preset room for its plot and legend', visualization => {
    const widget: BuilderWidget = { id: first.id, title: 'Visual', kind: 'data', width: 6, source: { kind: 'meta', level: 'campaign' }, visualization, dimension: 'campaignName', measure: 'spend', aggregation: 'sum', format: 'currency' };
    expect(resolveCanvas([widget])[widget.id].height).toBe(9);
    expect(resolveCanvas([{ ...widget, position: { x: 0, y: 0, height: 3 } }])[widget.id].height).toBe(3);
  });
  it('lays out a valid legacy document with 50 full-width widgets without crashing', () => {
    const legacy = Array.from({ length: 50 }, (_, index): BuilderWidget => ({ id: `123e4567-e89b-42d3-a456-${String(index).padStart(12, '0')}`, title: 'First', kind: 'text', body: 'A', width: 12 }));
    expect(parseBuilderDocument({ version: 0, datasets: [], widgets: legacy }).widgets).toHaveLength(50);
    const layout = resolveCanvas(legacy);
    expect(Object.keys(layout)).toHaveLength(50);
    expect(layout[legacy[49].id].y).toBe(245);
  });

  it('moves one chart in a near-limit legacy document without inflating every widget', () => {
    const base = Array.from({ length: 50 }, (_, index): BuilderWidget => ({ id: `123e4567-e89b-42d3-a456-${String(index).padStart(12, '0')}`, title: 'First', kind: 'text', body: 'x', width: 12 }));
    const baseDocument = { version: 0, datasets: [], widgets: base };
    const extra = Math.floor((65536 - JSON.stringify(baseDocument).length - 100) / 50);
    const legacy = base.map(item => ({ ...item, body: 'x'.repeat(extra + 1) }));
    expect(parseBuilderDocument({ ...baseDocument, widgets: legacy }).widgets).toHaveLength(50);
    const placed = placeCanvasWidget(legacy, legacy[49].id, { x: 0, y: 246, width: 12, height: 5 });
    expect(parseBuilderDocument({ ...baseDocument, widgets: placed }).widgets[49]).toMatchObject({ position: { x: 0, y: 246, height: 5 } });
    expect(placed.slice(0, 49).every(widget => !widget.position)).toBe(true);
  });

  it('moves a chart to the last allowed row and wraps displaced content into available space', () => {
    const placed = placeCanvasWidget([first, second], first.id, { x: 0, y: 1199, width: 12, height: 5 });
    expect(placed[0].position).toEqual({ x: 0, y: 1199, height: 5 });
    expect(placed[1].position).toEqual({ x: 0, y: 0, height: 5 });
    expect(resolveCanvas(placed)[first.id]).toEqual({ x: 0, y: 1199, width: 12, height: 5 });
  });
});
