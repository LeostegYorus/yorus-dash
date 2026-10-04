'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type { WidgetAppearance } from '../../lib/builder-types';
import '../builder-charts.css';
import Treemap from './builder-treemap';
import { categoryPalette } from './builder-colors';

type BuilderChartProps = {
  type: 'column' | 'line' | 'area' | 'pie' | 'donut' | 'treemap' | 'lollipop';
  data: Array<{ label: string; value: number | null }>;
  formatValue: (value: number) => string;
  appearance?: WidgetAppearance;
  onSelect?: (index: number) => void;
  selectedIndex?: number;
};

// Two half-arcs also describe a full circle (a single SVG arc cannot).
function slicePath(start: number, end: number, donut: boolean) {
  const point = (angle: number, radius: number) => `${140 + Math.cos(angle) * radius} ${140 + Math.sin(angle) * radius}`;
  const middle = (start + end) / 2;
  const outer = `M ${point(start, 100)} A 100 100 0 0 1 ${point(middle, 100)} A 100 100 0 0 1 ${point(end, 100)}`;
  return donut ? `${outer} L ${point(end, 58)} A 58 58 0 0 0 ${point(middle, 58)} A 58 58 0 0 0 ${point(start, 58)} Z` : `${outer} L 140 140 Z`;
}

export default function BuilderChart({ type, data, formatValue, appearance = {}, onSelect, selectedIndex }: BuilderChartProps) {
  const titleId = useId();
  const viewport = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    if (!viewport.current || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      const width = Math.round(entry.contentRect.width), height = Math.round(entry.contentRect.height);
      if (width > 0 && height > 0) setSize(current => current.width === width && current.height === height ? current : { width, height });
    });
    observer.observe(viewport.current);
    return () => observer.disconnect();
  }, []);
  const isValid = (value: number | null): value is number => value !== null && Number.isFinite(value);
  const displayValue = (value: number | null) => value === null ? 'Sem dados' : isValid(value) ? formatValue(value) : 'Valor inválido';
  const values = data.flatMap(item => isValid(item.value) ? [item.value] : []);
  const min = values.reduce((a, b) => Math.min(a, b), 0);
  const max = values.reduce((a, b) => Math.max(a, b), 0);
  // Normalize before subtracting or summing: finite inputs may overflow together.
  const magnitude = Math.max(Math.abs(min), max) || 1;
  const fontSize = appearance.fontSize ?? 11;
  const top = Math.max(24, Math.ceil(fontSize * 1.6));
  const bottom = Math.max(66, Math.ceil(fontSize * 3.5));
  const minimumHeight = Math.max(160, fontSize * 8);
  const chartHeight = size.height ? Math.max(minimumHeight, size.height) : Math.max(minimumHeight, 290);
  const y = (value: number) => top + Math.max(20, chartHeight - top - bottom) * ((max / magnitude - value / magnitude) / ((max / magnitude - min / magnitude) || 1));
  const baseline = y(0);
  const charWidth = Math.max(8, fontSize * 0.72);
  const left = Math.max(80, formatValue(min).length * charWidth + 16, formatValue(max).length * charWidth + 16);
  const labelWidth = appearance.showLabels ? Math.max(...values.map(value => formatValue(value).length), 0) * charWidth + 20 : 0;
  const minimumStep = Math.max(labelWidth, charWidth * 3 + 12);
  const naturalWidth = Math.max(480, left + 20 + data.length * Math.max(80, minimumStep));
  const minimumWidth = data.length > 8 ? naturalWidth : Math.max(left + 120, left + 20 + minimumStep * data.length);
  const width = size.width ? Math.max(minimumWidth, size.width) : naturalWidth;
  const step = (width - left - 20) / Math.max(1, data.length);
  const labelCharacters = Math.max(3, Math.min(11, Math.floor(step / charWidth)));
  const x = (index: number) => left + step / 2 + index * step;
  const segments: Array<Array<{ x: number; y: number }>> = [];
  let segment: Array<{ x: number; y: number }> = [];
  data.forEach((item, index) => {
    if (!isValid(item.value)) { segment = []; return; }
    if (!segment.length) segments.push(segment);
    segment.push({ x: x(index), y: y(item.value) });
  });
  const name = { column: 'Gráfico de colunas', line: 'Gráfico de linhas', area: 'Gráfico de área', pie: 'Gráfico de pizza', donut: 'Gráfico de rosca', treemap: 'Treemap', lollipop: 'Gráfico de pontos' }[type];
  const radial = type === 'pie' || type === 'donut' || type === 'treemap';
  const palette = categoryPalette(data.map(item => item.label), radial ? appearance.color : undefined);
  const color = (label: string) => radial ? palette(label) : appearance.color ?? palette(label);
  const warning = !data.length ? 'Sem dados para exibir.' : radial && data.some(item => item.value !== null && !isValid(item.value))
    ? 'Não é possível calcular proporções com valores inválidos.' : radial && data.some(item => item.value === null)
    ? 'Não é possível calcular proporções com valores ausentes.' : radial && values.some(value => value < 0)
      ? 'Não é possível calcular proporções com valores negativos.' : radial && values.every(value => value === 0)
        ? 'A soma é zero; não há proporções para exibir.' : !values.length ? 'Sem dados válidos para exibir.' : null;
  const total = values.reduce((sum, value) => sum + value / magnitude, 0);
  let accumulated = 0;
  const slices: Array<{ proportion: number; d: string }> = [];
  for (const item of data) {
    const proportion = !radial || warning || !isValid(item.value) || !total ? 0 : (item.value / magnitude) / total;
    const start = accumulated * Math.PI * 2 - Math.PI / 2;
    accumulated += proportion;
    slices.push({ proportion, d: slicePath(start, accumulated * Math.PI * 2 - Math.PI / 2, type === 'donut') });
  }
  const description = (index: number) => `${data[index].label}: ${displayValue(data[index].value)}${radial && !warning ? ` · ${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(slices[index].proportion * 100)}%` : ''}`;
  const interaction = (index: number) => onSelect ? {
    role: 'button', tabIndex: 0, 'aria-label': `Filtrar por ${data[index].label}`, 'aria-pressed': selectedIndex === index,
    className: 'builder-chart-interactive',
    onClick: (event: React.MouseEvent<SVGElement>) => { event.stopPropagation(); onSelect(index); },
    onKeyDown: (event: React.KeyboardEvent<SVGElement>) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); onSelect(index); } },
  } : {};
  return <div className="builder-chart-root">
    <div className="builder-chart-viewport" ref={viewport} style={{ minHeight: minimumHeight, flexBasis: minimumHeight }} tabIndex={0} role="region" aria-label={`${name} — visualização rolável`}>
    {warning ? <p className="builder-chart-status" role="status">{warning}</p> : type === 'treemap' ? <svg className="builder-chart-svg builder-treemap" style={{ minWidth: 280 }} role={onSelect ? "group" : "img"} aria-labelledby={titleId} viewBox={`0 0 ${Math.max(280, size.width || 480)} ${chartHeight}`}>
      <title id={titleId}>{name}</title><Treemap data={data} width={Math.max(280, size.width || 480)} height={chartHeight} color={color} formatValue={formatValue} fontSize={fontSize} showLabels={appearance.showLabels !== false} interaction={interaction} />
    </svg> : radial ? <svg className="builder-chart-svg" style={{ minWidth: 160 }} role={onSelect ? "group" : "img"} aria-labelledby={titleId} viewBox="0 0 280 280">
      <title id={titleId}>{name}</title>
      {slices.map((slice, index) => slice.proportion > 0 && <path key={index} {...interaction(index)} className={`builder-chart-slice${onSelect ? ' builder-chart-interactive' : ''}`} fill={color(data[index].label)} d={slice.d} data-proportion={slice.proportion}>
        <title>{description(index)}</title>
      </path>)}
    </svg> : <svg className="builder-chart-svg" style={{ minWidth: Math.max(280, minimumWidth), minHeight: minimumHeight }} role={onSelect ? "group" : "img"} aria-labelledby={titleId} viewBox={`0 0 ${width} ${chartHeight}`}>
      <title id={titleId}>{name}</title>
      {[...new Set([min, 0, max])].map(value => <text className="builder-chart-tick" key={value} x={4} y={y(value)}>{formatValue(value)}</text>)}
      <line className="builder-chart-baseline" x1={left} x2={width - 20} y1={baseline} y2={baseline} />
      {(type === 'line' || type === 'area') && segments.map((points, index) => {
        const d = points.map((point, i) => `${i ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ');
        return <g key={index}>
          {type === 'area' && <path className="builder-chart-area" style={{ fill: appearance.color }} d={`${d} L ${points[points.length - 1].x} ${baseline} L ${points[0].x} ${baseline} Z`} />}
          <path className="builder-chart-line" style={{ stroke: appearance.color }} d={d} fill="none" />
        </g>;
      })}
      {data.map((item, index) => <g key={index} {...interaction(index)}>
        {type === 'lollipop' && isValid(item.value) && <line className="builder-chart-stem" stroke={color(item.label)} x1={x(index)} x2={x(index)} y1={baseline} y2={y(item.value)} />}
        {isValid(item.value) && (type === 'column' ? <rect className="builder-chart-column" fill={color(item.label)} x={x(index) - Math.min(21, step * 0.3)} width={Math.min(42, step * 0.6)}
          y={Math.min(baseline, y(item.value))} height={Math.abs(y(item.value) - baseline)}>
          <title>{item.label}: {formatValue(item.value)}</title>
        </rect> : <circle className="builder-chart-point" fill={color(item.label)} cx={x(index)} cy={y(item.value)} r={type === 'lollipop' ? 7 : 4}>
          <title>{item.label}: {formatValue(item.value)}</title>
        </circle>)}
        {type === 'column' && item.value === 0 && <circle className="builder-chart-point" fill={color(item.label)} cx={x(index)} cy={baseline} r={3}>
          <title>{description(index)}</title>
        </circle>}
        {appearance.showLabels && isValid(item.value) && <text className="builder-chart-value" x={x(index)} y={y(item.value) + (item.value < 0 ? Math.max(17, fontSize * 1.25) : -9)} textAnchor="middle">{formatValue(item.value)}</text>}
        <text x={x(index)} y={chartHeight - 40} textAnchor="middle"><title>{item.label}</title>{Array.from(item.label).length > labelCharacters ? `${Array.from(item.label).slice(0, labelCharacters - 1).join("")}…` : item.label}</text>
      </g>)}
    </svg>}
    </div>
    {(type === "line" || type === "area") && <p className="builder-visual-context">Categorias na ordem da fonte; não representa uma série diária.</p>}
    {appearance.showLegend !== false && <ul className="builder-chart-legend" aria-label="Legenda">{data.map((item, index) => <li key={index}>
      <span className="builder-chart-swatch" style={{ backgroundColor: color(item.label) }} aria-hidden="true" />
      <span>{description(index)}</span>
    </li>)}</ul>}
    <details className="builder-chart-details">
      <summary>Ver dados</summary>
      <table><caption>Dados do gráfico</caption>
        <thead><tr><th scope="col">Categoria</th><th scope="col">Valor</th></tr></thead>
        <tbody>{data.map((item, index) => <tr key={index}>
          <th scope="row">{item.label}</th><td>{displayValue(item.value)}</td>
        </tr>)}</tbody>
      </table>
    </details>
  </div>;
}
