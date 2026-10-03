'use client';

import { useId } from 'react';
import '../builder-charts.css';

type BuilderChartProps = {
  type: 'column' | 'line' | 'area' | 'pie' | 'donut';
  data: Array<{ label: string; value: number | null }>;
  formatValue: (value: number) => string;
};

const colors = ['#ff6a00', '#ffb45b', '#6ec8b7', '#a49bea', '#ed8299', '#d6c66b', '#72aee6'];
function categoryColor(label: string) {
  let hash = 0;
  for (const character of label) hash = (Math.imul(hash, 31) + character.codePointAt(0)!) >>> 0;
  return colors[hash % colors.length];
}

// Two half-arcs also describe a full circle (a single SVG arc cannot).
function slicePath(start: number, end: number, donut: boolean) {
  const point = (angle: number, radius: number) => `${140 + Math.cos(angle) * radius} ${140 + Math.sin(angle) * radius}`;
  const middle = (start + end) / 2;
  const outer = `M ${point(start, 100)} A 100 100 0 0 1 ${point(middle, 100)} A 100 100 0 0 1 ${point(end, 100)}`;
  return donut ? `${outer} L ${point(end, 58)} A 58 58 0 0 0 ${point(middle, 58)} A 58 58 0 0 0 ${point(start, 58)} Z` : `${outer} L 140 140 Z`;
}

export default function BuilderChart({ type, data, formatValue }: BuilderChartProps) {
  const titleId = useId();
  const isValid = (value: number | null): value is number => value !== null && Number.isFinite(value);
  const displayValue = (value: number | null) => value === null ? 'Sem dados' : isValid(value) ? formatValue(value) : 'Valor inválido';
  const values = data.flatMap(item => isValid(item.value) ? [item.value] : []);
  const min = values.reduce((a, b) => Math.min(a, b), 0);
  const max = values.reduce((a, b) => Math.max(a, b), 0);
  // Normalize before subtracting or summing: finite inputs may overflow together.
  const magnitude = Math.max(Math.abs(min), max) || 1;
  const y = (value: number) => 24 + 200 * ((max / magnitude - value / magnitude) / ((max / magnitude - min / magnitude) || 1));
  const baseline = y(0);
  const step = 80;
  const left = Math.max(80, formatValue(min).length * 8 + 16, formatValue(max).length * 8 + 16);
  const width = Math.max(480, left + 20 + data.length * step);
  const x = (index: number) => left + step / 2 + index * step;
  const segments: Array<Array<{ x: number; y: number }>> = [];
  let segment: Array<{ x: number; y: number }> = [];
  data.forEach((item, index) => {
    if (!isValid(item.value)) { segment = []; return; }
    if (!segment.length) segments.push(segment);
    segment.push({ x: x(index), y: y(item.value) });
  });
  const name = { column: 'Gráfico de colunas', line: 'Gráfico de linhas', area: 'Gráfico de área', pie: 'Gráfico de pizza', donut: 'Gráfico de rosca' }[type];
  const radial = type === 'pie' || type === 'donut';
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
  return <div className="builder-chart-root">
    <div className="builder-chart-viewport" tabIndex={0} role="region" aria-label={`${name} — visualização rolável`}>
    {warning ? <p className="builder-chart-status" role="status">{warning}</p> : radial ? <svg className="builder-chart-svg" style={{ minWidth: 280 }} role="img" aria-labelledby={titleId} viewBox="0 0 280 280">
      <title id={titleId}>{name}</title>
      {slices.map((slice, index) => slice.proportion > 0 && <path key={index} className="builder-chart-slice" fill={categoryColor(data[index].label)} d={slice.d} data-proportion={slice.proportion}>
        <title>{description(index)}</title>
      </path>)}
    </svg> : <svg className="builder-chart-svg" style={{ minWidth: data.length > 8 ? width : 280 }} role="img" aria-labelledby={titleId} viewBox={`0 0 ${width} 290`}>
      <title id={titleId}>{name}</title>
      {[...new Set([min, 0, max])].map(value => <text className="builder-chart-tick" key={value} x={4} y={y(value)}>{formatValue(value)}</text>)}
      <line className="builder-chart-baseline" x1={left} x2={width - 20} y1={baseline} y2={baseline} />
      {(type === 'line' || type === 'area') && segments.map((points, index) => {
        const d = points.map((point, i) => `${i ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ');
        return <g key={index}>
          {type === 'area' && <path className="builder-chart-area" d={`${d} L ${points[points.length - 1].x} ${baseline} L ${points[0].x} ${baseline} Z`} />}
          <path className="builder-chart-line" d={d} fill="none" />
        </g>;
      })}
      {data.map((item, index) => <g key={index}>
        {isValid(item.value) && (type === 'column' ? <rect className="builder-chart-column" fill={categoryColor(item.label)} x={x(index) - 21} width={42}
          y={Math.min(baseline, y(item.value))} height={Math.abs(y(item.value) - baseline)}>
          <title>{item.label}: {formatValue(item.value)}</title>
        </rect> : <circle className="builder-chart-point" fill={categoryColor(item.label)} cx={x(index)} cy={y(item.value)} r={4}>
          <title>{item.label}: {formatValue(item.value)}</title>
        </circle>)}
        {type === 'column' && item.value === 0 && <circle className="builder-chart-point" fill={categoryColor(item.label)} cx={x(index)} cy={baseline} r={3}>
          <title>{description(index)}</title>
        </circle>}
        <text x={x(index)} y={250} textAnchor="middle"><title>{item.label}</title>{Array.from(item.label).length > 11 ? `${Array.from(item.label).slice(0, 10).join("")}…` : item.label}</text>
      </g>)}
    </svg>}
    </div>
    {(type === "line" || type === "area") && <p className="builder-visual-context">Categorias na ordem da fonte; não representa uma série diária.</p>}
    <ul className="builder-chart-legend" aria-label="Legenda">{data.map((item, index) => <li key={index}>
      <span className="builder-chart-swatch" style={{ backgroundColor: categoryColor(item.label) }} aria-hidden="true" />
      <span>{description(index)}</span>
    </li>)}</ul>
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
