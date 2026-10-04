import { relativeChange } from '../../lib/builder-analysis';
import type { MetaState } from './use-builder-meta';

export default function BuilderComparison({ current, previous, value, previousValue, range, formatValue }: { current?: MetaState; previous?: MetaState; value: number | null; previousValue: number | null; range: { start: string; end: string } | null; formatValue: (value: number) => string }) {
  if (!range) return null;
  const date = (value: string) => value.split('-').reverse().join('/');
  const change = relativeChange(value, previousValue);
  const message = current?.status === 'error' || previous?.status === 'error' ? 'Comparação indisponível: falha na consulta.'
    : current?.status !== 'ready' || previous?.status !== 'ready' ? 'Consultando período anterior…'
    : current.result?.status === 'partial' || previous.result?.status === 'partial' ? 'Comparação indisponível: dados parciais.'
    : value === null || previousValue === null ? 'Comparação indisponível: valores não informados.'
    : previousValue === 0 ? 'Sem variação percentual: base anterior zero.'
    : change === null ? 'Comparação indisponível para estes valores.' : null;
  return <div className="builder-comparison" aria-label="Comparação com período anterior">
    {message ? <span>{message}</span> : <strong>{change! > 0 ? '+' : ''}{new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 1 }).format(change!)}</strong>}
    <small>Anterior: {previous?.status === 'ready' && previous.result?.status === 'succeeded' && previousValue !== null ? formatValue(previousValue) : '—'} · {date(range.start)} a {date(range.end)}</small>
  </div>;
}
