// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import BuilderChart from '../builder-chart';

const formatValue = (value: number) => `R$ ${value}`;
const sample = [{ label: 'Receita', value: 30 }, { label: 'Ausente', value: null }, { label: 'Zero', value: 0 }];

describe('BuilderChart', () => {
  it('renders treemap areas in proportion to positive values without inventing areas for zero', () => {
    const { container, rerender } = render(<BuilderChart type="treemap" data={[{ label: 'A', value: 30 }, { label: 'H', value: 10 }, { label: 'Zero', value: 0 }]} formatValue={formatValue} />);
    expect(screen.getByRole('img', { name: 'Treemap' })).toBeInTheDocument();
    const tiles = [...container.querySelectorAll('.builder-treemap-tile')];
    expect(tiles).toHaveLength(2);
    const areas = tiles.map(tile => Number(tile.getAttribute('width')) * Number(tile.getAttribute('height')));
    expect(areas[0] / areas[1]).toBeCloseTo(3);
    expect(tiles[0].getAttribute('fill')).not.toBe(tiles[1].getAttribute('fill'));
    expect(screen.getByRole('list', { name: 'Legenda' })).toHaveTextContent('Zero: R$ 0');
    rerender(<BuilderChart type="treemap" data={[{ label: 'A', value: 1e308 }, { label: 'H', value: 1e308 }]} formatValue={formatValue} />);
    expect(container.querySelector('svg')!.outerHTML).not.toMatch(/NaN|Infinity/);
  });

  it.each([
    [[{ label: 'A', value: null }, { label: 'B', value: 10 }], /ausentes/],
    [[{ label: 'A', value: -1 }, { label: 'B', value: 10 }], /negativos/],
    [[{ label: 'A', value: 0 }], /soma é zero/],
  ] as const)('keeps unsupported treemap proportions explicit', (data, warning) => {
    render(<BuilderChart type="treemap" data={[...data]} formatValue={formatValue} />);
    expect(screen.getByRole('status')).toHaveTextContent(warning);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('renders a point chart with stems from zero, signed values and gaps for missing data', () => {
    const { container } = render(<BuilderChart type="lollipop" data={[{ label: 'Perda', value: -4 }, { label: 'Ganho', value: 6 }, { label: 'Ausente', value: null }]} formatValue={formatValue} />);
    expect(screen.getByRole('img', { name: 'Gráfico de pontos' })).toBeInTheDocument();
    const stems = [...container.querySelectorAll('.builder-chart-stem')];
    expect(stems).toHaveLength(2);
    const baseline = Number(container.querySelector('.builder-chart-baseline')!.getAttribute('y1'));
    expect(Number(stems[0].getAttribute('y1'))).toBe(baseline);
    expect(Number(stems[0].getAttribute('y2'))).toBeGreaterThan(baseline);
    expect(Number(stems[1].getAttribute('y2'))).toBeLessThan(baseline);
    expect(container.querySelectorAll('.builder-chart-point')).toHaveLength(2);
  });

  it('resizes the plot with its viewport and reserves room for large labels', () => {
    let resize!: (entries: Array<{ contentRect: { width: number; height: number } }>) => void;
    const disconnect = vi.fn();
    vi.stubGlobal('ResizeObserver', class { constructor(callback: typeof resize) { resize = callback; } observe() {} disconnect = disconnect; });
    try {
      const { container, unmount, rerender } = render(<BuilderChart type="column" data={[{ label: 'Campanha', value: 6840 }, { label: 'Outra', value: -200 }]} formatValue={formatValue} appearance={{ fontSize: 32, showLabels: true }} />);
      act(() => resize([{ contentRect: { width: 800, height: 400 } }]));
      const svg = container.querySelector('svg')!;
      expect(svg).toHaveAttribute('viewBox', '0 0 800 400');
      const labels = [...container.querySelectorAll('.builder-chart-value')];
      expect(Number(labels[0].getAttribute('y'))).toBeGreaterThanOrEqual(32);
      expect(Number(labels[1].getAttribute('y'))).toBeLessThanOrEqual(400 - 64);
      const gutter = Number(container.querySelector('.builder-chart-baseline')!.getAttribute('x1'));
      expect(gutter).toBeGreaterThanOrEqual(formatValue(6840).length * 20);
      act(() => resize([{ contentRect: { width: 920, height: 510 } }]));
      expect(svg).toHaveAttribute('viewBox', '0 0 920 510');
      expect(svg.outerHTML).not.toMatch(/NaN|Infinity/);
      rerender(<BuilderChart type="column" data={Array.from({ length: 8 }, (_, i) => ({ label: `Campanha ${i}`, value: i + 1 }))} formatValue={formatValue} appearance={{ fontSize: 32, showLabels: false }} />);
      act(() => resize([{ contentRect: { width: 320, height: 200 } }]));
      const categories = container.querySelectorAll('svg > g > text');
      expect(Number(categories[1].getAttribute('x')) - Number(categories[0].getAttribute('x'))).toBeGreaterThanOrEqual(32 * 3 * 0.72);
      unmount(); expect(disconnect).toHaveBeenCalledOnce();
    } finally { vi.unstubAllGlobals(); }
  });
  it.each(['column', 'line', 'area'] as const)('%s labels its zero axis once and distinguishes zero-only from missing-only data', (type) => {
    const { container, rerender } = render(<BuilderChart type={type} data={[{ label: 'Perda', value: -4 }, { label: 'Ganho', value: 6 }]} formatValue={formatValue} />);
    expect([...container.querySelectorAll('.builder-chart-tick')].filter(tick => tick.textContent === 'R$ 0')).toHaveLength(1);
    rerender(<BuilderChart type={type} data={[{ label: 'Zero', value: 0 }]} formatValue={formatValue} />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(container.querySelectorAll('.builder-chart-tick')).toHaveLength(1);
    expect(container.querySelectorAll('.builder-chart-point')).toHaveLength(1);
    expect(container.querySelector('svg')!.outerHTML).not.toMatch(/NaN|Infinity/);
    rerender(<BuilderChart type={type} data={[{ label: 'Só perda', value: -5 }]} formatValue={formatValue} />);
    const baseline = Number(container.querySelector('.builder-chart-baseline')!.getAttribute('y1'));
    expect(baseline).toBe(24);
    expect(container.querySelector('svg')!.outerHTML).not.toMatch(/NaN|Infinity/);
    rerender(<BuilderChart type={type} data={[{ label: 'Ausente', value: null }]} formatValue={formatValue} />);
    expect(screen.getByRole('status')).toHaveTextContent(/sem dados/i);
    expect(container.querySelector('svg')).not.toBeInTheDocument();
  });
  it('keeps every long category inside keyboard-scrollable minimum chart viewports', () => {
    const label = 'Categoria extensa sem abreviação '.repeat(6);
    const data = Array.from({ length: 60 }, (_, index) => ({ label: `${index} ${label}`, value: index }));
    const { container } = render(<BuilderChart type="column" data={data} formatValue={formatValue} />);
    const viewport = container.querySelector('.builder-chart-viewport');
    expect(viewport).not.toBeNull();
    expect(viewport).toHaveAttribute('tabindex', '0');
    const style = document.createElement('style');
    style.textContent = readFileSync(`${process.cwd()}/app/builder-charts.css`, 'utf8');
    document.head.appendChild(style);
    try {
      const rootStyle = getComputedStyle(container.querySelector('.builder-chart-root')!);
      expect(rootStyle.minWidth).toBe('0px');
      expect(rootStyle.minHeight).toBe('0px');
      expect(rootStyle.overflowY).toBe('auto');
      expect(rootStyle.maxWidth).toBe('100%');
      expect(getComputedStyle(viewport!).overflowX).toBe('auto');
      const svg = container.querySelector('svg')!;
      expect(parseFloat(svg.style.minWidth)).toBeLessThanOrEqual(60 * 80 + 240);
      expect(parseFloat(getComputedStyle(svg).minHeight)).toBeGreaterThanOrEqual(160);
      expect(getComputedStyle(svg).height).toBe('100%');
      expect(container.querySelectorAll('.builder-chart-column')).toHaveLength(60);
      expect(within(screen.getByRole('list')).getAllByRole('listitem')).toHaveLength(60);
      expect(svg.textContent).toContain(data[59].label);
      fireEvent.click(screen.getByText('Ver dados'));
      expect(screen.getByRole('table')).toHaveTextContent(data[59].label);
    } finally { style.remove(); }
  });
  it('keeps category colors consistent through reordering and chart types, with unique stable accessible IDs', () => {
    const data = [{ label: 'Alpha', value: 1 }, { label: 'Beta', value: 2 }];
    const { container, rerender } = render(<><BuilderChart type="pie" data={data} formatValue={formatValue} /><BuilderChart type="column" data={data} formatValue={formatValue} /></>);
    const charts = container.querySelectorAll('svg');
    const ids = [...charts].map(chart => chart.getAttribute('aria-labelledby'));
    expect(ids.every(Boolean)).toBe(true);
    expect(new Set(ids).size).toBe(2);
    ids.forEach(id => expect(document.getElementById(id!)).not.toBeNull());
    const pieColors = [...container.querySelectorAll('.builder-chart-slice')].map(slice => slice.getAttribute('fill'));
    expect(pieColors.every(Boolean)).toBe(true);
    expect(new Set(pieColors).size).toBe(2);
    expect([...container.querySelectorAll('.builder-chart-column')].map(bar => bar.getAttribute('fill'))).toEqual(pieColors);
    expect([...container.querySelectorAll('.builder-chart-legend')][0].querySelectorAll('.builder-chart-swatch')).toHaveLength(2);
    rerender(<><BuilderChart type="pie" data={[...data].reverse()} formatValue={formatValue} /><BuilderChart type="column" data={data} formatValue={formatValue} /></>);
    expect([...container.querySelectorAll('svg')].map(chart => chart.getAttribute('aria-labelledby'))).toEqual(ids);
    expect([...container.querySelectorAll('.builder-chart-slice')].map(slice => slice.getAttribute('fill'))).toEqual([...pieColors].reverse());
  });
  it.each(['column', 'line', 'area', 'pie', 'donut'] as const)('%s keeps extreme finite values and invalid inputs out of SVG geometry', (type) => {
    const radial = type === 'pie' || type === 'donut';
    const data = [{ label: 'Máximo', value: Number.MAX_VALUE }, { label: 'Extremo', value: radial ? Number.MAX_VALUE : -Number.MAX_VALUE }];
    const { container, rerender } = render(<BuilderChart type={type} data={data} formatValue={formatValue} />);
    expect(container.querySelector('svg')!.outerHTML).not.toMatch(/NaN|Infinity/);
    if (radial) {
      expect(container.querySelectorAll('.builder-chart-slice')).toHaveLength(2);
      expect(screen.getByRole('list')).toHaveTextContent('50%');
    }
    rerender(<BuilderChart type={type} data={[{ label: 'Inválido', value: Infinity }, { label: 'Também inválido', value: NaN }, { label: 'Real', value: 2 }]} formatValue={formatValue} />);
    expect(container.querySelector('svg')?.outerHTML ?? '').not.toMatch(/NaN|Infinity/);
    if (radial) expect(screen.getByRole('status')).toHaveTextContent(/valores inválidos/i);
    else expect(container.querySelectorAll(type === 'column' ? '.builder-chart-column' : '.builder-chart-point')).toHaveLength(1);
    fireEvent.click(screen.getByText('Ver dados'));
    expect(screen.getByRole('table')).toHaveTextContent('Valor inválido');
  });
  it.each(['pie', 'donut'] as const)('%s renders real proportions and a complete full-circle single category', (type) => {
    const data = [{ label: 'Um', value: 1 }, { label: 'Três', value: 3 }, { label: 'Zero', value: 0 }];
    const { container, rerender } = render(<BuilderChart type={type} data={data} formatValue={formatValue} />);
    expect(screen.getByRole('img', { name: type === 'pie' ? 'Gráfico de pizza' : 'Gráfico de rosca' })).toBeInTheDocument();
    const slices = [...container.querySelectorAll('.builder-chart-slice')];
    expect(slices).toHaveLength(2);
    expect(slices.map(slice => Number(slice.getAttribute('data-proportion')))).toEqual([0.25, 0.75]);
    expect(slices.reduce((sum, slice) => sum + Number(slice.getAttribute('data-proportion')), 0)).toBe(1);
    const legend = screen.getByRole('list', { name: 'Legenda' });
    expect(within(legend).getAllByRole('listitem')).toHaveLength(3);
    expect(legend).toHaveTextContent('Um: R$ 1 · 25%');
    expect(legend).toHaveTextContent('Três: R$ 3 · 75%');
    expect(legend).toHaveTextContent('Zero: R$ 0 · 0%');
    expect(slices[0].querySelector('title')).toHaveTextContent('Um: R$ 1 · 25%');
    expect(slices[0].getAttribute('d')).toContain('A 100 100');
    if (type === 'donut') expect(slices[0].getAttribute('d')).toContain('A 58 58');
    rerender(<BuilderChart type={type} data={[{ label: 'Tudo', value: 7 }]} formatValue={formatValue} />);
    const full = container.querySelector('.builder-chart-slice')!;
    expect(full).toHaveAttribute('data-proportion', '1');
    expect(full.getAttribute('d')!.match(/A 100 100/g)).toHaveLength(2);
    expect(full.getAttribute('d')).toContain('Z');
    expect(screen.getByRole('list')).toHaveTextContent('Tudo: R$ 7 · 100%');
  });
  describe.each(['pie', 'donut'] as const)('%s validation', (type) => {
    it.each([
      { data: [{ label: 'A', value: -1 }, { label: 'B', value: 2 }], message: /valores negativos/i },
      { data: sample, message: /valores ausentes/i },
      { data: [{ label: 'A', value: 0 }, { label: 'B', value: 0 }], message: /soma é zero/i },
      { data: [], message: /sem dados/i },
    ])('does not invent slices for $data', ({ data, message }) => {
      const { container } = render(<BuilderChart type={type} data={data} formatValue={formatValue} />);
      expect(screen.getByRole('status')).toHaveTextContent(message);
      expect(container.querySelector('svg')).not.toBeInTheDocument();
      fireEvent.click(screen.getByText('Ver dados'));
      expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(data.length + 1);
    });
  });
  it.each(['line', 'area'] as const)('%s preserves null gaps and signed isolated points instead of joining missing data', (type) => {
    const data = [{ label: 'A', value: 10 }, { label: 'B', value: 5 }, { label: 'Gap', value: null }, { label: 'D', value: -10 }];
    const { container, rerender } = render(<BuilderChart type={type} data={data} formatValue={formatValue} />);
    expect(screen.getByRole('img', { name: type === 'line' ? 'Gráfico de linhas' : 'Gráfico de área' })).toBeInTheDocument();
    expect(screen.getByText('Categorias na ordem da fonte; não representa uma série diária.')).toBeInTheDocument();
    const points = container.querySelectorAll('.builder-chart-point');
    expect(points).toHaveLength(3);
    const baseline = Number(container.querySelector('.builder-chart-baseline')!.getAttribute('y1'));
    expect(Number(points[0].getAttribute('cy'))).toBeLessThan(baseline);
    expect(Number(points[2].getAttribute('cy'))).toBeGreaterThan(baseline);
    const segments = container.querySelectorAll('.builder-chart-line');
    expect(segments).toHaveLength(2);
    expect(segments[0].getAttribute('d')!.match(/L/g)).toHaveLength(1);
    expect(segments[1].getAttribute('d')).not.toContain('L');
    if (type === 'area') {
      const areas = container.querySelectorAll('.builder-chart-area');
      expect(areas).toHaveLength(2);
      for (const area of areas) expect(area.getAttribute('d')).toContain(`${baseline} Z`);
    }
    rerender(<BuilderChart type={type} data={[{ label: 'Único', value: 0 }]} formatValue={formatValue} />);
    expect(container.querySelectorAll('.builder-chart-point')).toHaveLength(1);
    expect(Number(container.querySelector('.builder-chart-point')!.getAttribute('r'))).toBeGreaterThan(0);
  });
  it('draws signed columns around a real zero axis, retaining zero and omitting null', () => {
    const data = [{ label: 'Positivo', value: 20 }, { label: 'Negativo', value: -10 }, ...sample.slice(1)];
    const { container } = render(<BuilderChart type="column" data={data} formatValue={formatValue} />);
    const axis = container.querySelector('.builder-chart-baseline')!;
    expect(axis).not.toBeNull();
    const baseline = Number(axis.getAttribute('y1'));
    const bars = [...container.querySelectorAll('.builder-chart-column')];
    expect(bars).toHaveLength(3);
    const [positive, negative, zero] = bars;
    expect(Number(positive.getAttribute('y'))).toBeLessThan(baseline);
    expect(Number(positive.getAttribute('y')) + Number(positive.getAttribute('height'))).toBeCloseTo(baseline);
    expect(Number(negative.getAttribute('y'))).toBe(baseline);
    expect(Number(negative.getAttribute('height'))).toBeGreaterThan(0);
    expect(Number(zero.getAttribute('height'))).toBe(0);
    expect(negative.querySelector('title')).toHaveTextContent('Negativo: R$ -10');
    expect(container.querySelector('svg')).toHaveTextContent('Ausente');
    expect(container.querySelector('svg')).toHaveTextContent('R$ -10');
  });
  it('names its SVG and exposes every exact value in a readable expandable table', () => {
    const { container } = render(<BuilderChart type="column" data={sample} formatValue={formatValue} />);
    expect(screen.getByRole('img', { name: 'Gráfico de colunas' })).toBeInTheDocument();
    fireEvent.click(screen.getByText('Ver dados'));
    const table = screen.getByRole('table', { name: 'Dados do gráfico' });
    expect(within(table).getAllByRole('row')).toHaveLength(4);
    expect(table).toHaveTextContent('Receita');
    expect(table).toHaveTextContent('R$ 30');
    expect(table).toHaveTextContent('AusenteSem dados');
    expect(table).toHaveTextContent('ZeroR$ 0');
    expect(container.querySelector('details')).toHaveAttribute('open');
  });
});
