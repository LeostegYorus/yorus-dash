import { BUILDER_MAX_ROW, type BuilderWidget } from '../../lib/builder-types';

export type CanvasRect = { x: number; y: number; width: number; height: number };
const COLUMNS = 12;
const MAX_ROWS = BUILDER_MAX_ROW;
const defaultHeight = (widget: BuilderWidget) => widget.kind === 'text' || widget.visualization === 'metric' ? 5 : widget.visualization === 'table' ? 8 : widget.visualization === 'bar' ? 7 : 9;
const overlaps = (a: CanvasRect, b: CanvasRect) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
const free = (rect: CanvasRect, occupied: CanvasRect[]) => occupied.every(other => !overlaps(rect, other));

function firstAvailable(width: number, height: number, occupied: CanvasRect[], startY = 0, preferredX = 0): CanvasRect {
  for (let offset = 0; offset <= MAX_ROWS; offset++) {
    const y = (startY + offset) % (MAX_ROWS + 1);
    const xs = [preferredX, ...Array.from({ length: COLUMNS - width + 1 }, (_, x) => x).filter(x => x !== preferredX)];
    for (const x of xs) {
      const rect = { x, y, width, height };
      if (x + width <= COLUMNS && free(rect, occupied)) return rect;
    }
  }
  throw new Error('Não há espaço para esta visualização no canvas.');
}

export function resolveCanvas(widgets: BuilderWidget[]): Record<string, CanvasRect> {
  const positioned = new Map<string, CanvasRect>();
  const occupied: CanvasRect[] = [];
  for (const widget of widgets) {
    if (!widget.position) continue;
    const rect = { ...widget.position, width: widget.width };
    positioned.set(widget.id, rect);
    occupied.push(rect);
  }
  for (const widget of widgets) {
    if (positioned.has(widget.id)) continue;
    const rect = firstAvailable(widget.width, defaultHeight(widget), occupied);
    positioned.set(widget.id, rect);
    occupied.push(rect);
  }
  return Object.fromEntries(positioned);
}

export function placeCanvasWidget(widgets: BuilderWidget[], id: string, desired: CanvasRect): BuilderWidget[] {
  const previous = resolveCanvas(widgets);
  const chosen = widgets.find(widget => widget.id === id);
  if (!chosen) return widgets;
  const width = Math.max(1, Math.min(COLUMNS, Math.round(desired.width)));
  const height = Math.max(2, Math.min(24, Math.round(desired.height)));
  const target = { x: Math.max(0, Math.min(COLUMNS - width, Math.round(desired.x))), y: Math.max(0, Math.min(MAX_ROWS, Math.round(desired.y))), width, height };
  const occupied = [target];
  const result = new Map<string, CanvasRect>([[id, target]]);
  for (const widget of widgets) {
    if (widget.id === id) continue;
    const original = previous[widget.id];
    const next = free(original, occupied) ? original : firstAvailable(original.width, original.height, occupied, original.y, original.x);
    result.set(widget.id, next);
    occupied.push(next);
  }
  return widgets.map(widget => {
    const rect = result.get(widget.id)!;
    const before = previous[widget.id];
    if (widget.id !== id && before.x === rect.x && before.y === rect.y && before.width === rect.width && before.height === rect.height) return widget;
    return { ...widget, width: rect.width, position: { x: rect.x, y: rect.y, height: rect.height } };
  });
}
