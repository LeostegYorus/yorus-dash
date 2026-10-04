import { afterEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DashboardBuilder from '../components/dashboard-builder';
import { parseBuilderDocument, type BuilderDocument } from '../../lib/builder-types';

const dataset = { id: '123e4567-e89b-42d3-a456-426614174000', name: 'Resultados', sourceLabel: 'Teste', periodStart: '2026-09-01', periodEnd: '2026-09-30', fields: [{ id: 'canal', label: 'Canal', type: 'text' as const }, { id: 'valor', label: 'Valor', type: 'number' as const }], rows: [{ canal: 'A', valor: 10 }, { canal: 'B', valor: 30 }] };
const chart = { id: '123e4567-e89b-42d3-a456-426614174001', kind: 'data' as const, title: 'Por canal', width: 6, source: { kind: 'manual' as const, datasetId: dataset.id }, visualization: 'column' as const, dimension: 'canal', measure: 'valor', aggregation: 'sum' as const, format: 'number' as const };
const metric = { ...chart, id: '123e4567-e89b-42d3-a456-426614174002', title: 'Total', visualization: 'metric' as const };
const props = { clientId: 'alpha', admin: true, currency: 'BRL', metaConnected: false };
function api(initial: BuilderDocument = { version: 2, datasets: [dataset], widgets: [chart, metric] }) {
  let saved = structuredClone(initial), failure = 0;
  const puts: BuilderDocument[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (!url.includes('/builder')) throw new Error('Unexpected API request');
    if (init?.method === 'PUT') {
      if (failure) return Response.json({}, { status: failure });
      const next = parseBuilderDocument(JSON.parse(String(init.body)));
      if (next.version !== saved.version) return Response.json({}, { status: 409 });
      puts.push(next); saved = { ...next, version: saved.version + 1 };
    }
    return Response.json(saved);
  }));
  return { get doc() { return saved; }, puts, fail(status: number) { failure = status; } };
}
afterEach(() => vi.unstubAllGlobals());

it.each(['bar', 'column', 'line', 'area', 'pie', 'donut', 'treemap', 'lollipop', 'table'] as const)('filters with keyboard in a %s and toggles the category off', async visualization => {
  api({ version: 2, datasets: [dataset], widgets: [{ ...chart, visualization }, metric] });
  render(<DashboardBuilder {...props} admin={false} />);
  fireEvent.keyDown(await screen.findByRole('button', { name: 'Filtrar por A' }), { key: 'Enter' });
  if (visualization === 'table') fireEvent.click(screen.getByRole('button', { name: 'Filtrar por A' }));
  expect(within(screen.getByRole('article', { name: 'Total' })).getByText('10')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Filtrar por A' }));
  expect(within(screen.getByRole('article', { name: 'Total' })).getByText('40')).toBeInTheDocument();
});

it('blocks undo on version conflict and clears session history on client change', async () => {
  const store = api(); const user = userEvent.setup(); const view = render(<DashboardBuilder {...props} />);
  await user.click(await screen.findByRole('article', { name: 'Por canal' }));
  await user.click(screen.getByRole('button', { name: 'Duplicar visual' }));
  await screen.findByRole('article', { name: 'Por canal (cópia)' });
  store.fail(409); await user.click(screen.getByRole('button', { name: 'Desfazer' }));
  await screen.findByRole('button', { name: 'Recarregar painel' });
  expect(screen.getByRole('button', { name: 'Desfazer' })).toBeDisabled();
  expect(store.puts).toHaveLength(1);
  view.rerender(<DashboardBuilder {...props} clientId="beta" />);
  await screen.findByRole('article', { name: 'Por canal' });
  expect(screen.getByRole('button', { name: 'Desfazer' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Refazer' })).toBeDisabled();
});

it('keeps only the most recent 20 changes and supports editor keyboard shortcuts', async () => {
  const store = api(); render(<DashboardBuilder {...props} />);
  const handle = await screen.findByRole('button', { name: 'Arrastar Por canal' });
  for (let i = 1; i <= 21; i++) {
    fireEvent.keyDown(handle, { key: 'ArrowDown' });
    await waitFor(() => expect(store.doc.version).toBe(i + 2));
  }
  const editor = screen.getByRole('region', { name: 'Painel configurável' });
  for (let i = 1; i <= 20; i++) {
    fireEvent.keyDown(editor, { key: 'z', ctrlKey: true });
    await waitFor(() => expect(store.doc.version).toBe(23 + i));
  }
  expect(screen.getByRole('button', { name: 'Desfazer' })).toBeDisabled();
  fireEvent.keyDown(editor, { key: 'z', metaKey: true, shiftKey: true });
  await waitFor(() => expect(store.doc.version).toBe(44));
  expect(screen.getByRole('button', { name: 'Desfazer' })).toBeEnabled();
});

it('filters related manual indicators, preserves other sources, and clears without saving', async () => {
  const other = { ...dataset, id: '123e4567-e89b-42d3-a456-426614174003', name: 'Outro', rows: [{ canal: 'A', valor: 99 }] };
  const store = api({ version: 2, datasets: [dataset, other], widgets: [chart, metric, { ...metric, id: '123e4567-e89b-42d3-a456-426614174004', title: 'Outra fonte', source: { kind: 'manual', datasetId: other.id } }] });
  const user = userEvent.setup(); render(<DashboardBuilder {...props} admin={false} />);
  await user.click(await screen.findByRole('button', { name: 'Filtrar por A' }));
  expect(within(screen.getByRole('article', { name: 'Total' })).getByText('10')).toBeInTheDocument();
  expect(within(screen.getByRole('article', { name: 'Outra fonte' })).getByText('99')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Limpar filtro' })).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Limpar filtro' }));
  expect(within(screen.getByRole('article', { name: 'Total' })).getByText('40')).toBeInTheDocument();
  expect(store.puts).toHaveLength(0);
});

it('undoes and redoes saved edits using the latest revision, then discards a branched redo', async () => {
  const store = api(); const user = userEvent.setup(); render(<DashboardBuilder {...props} />);
  await user.click(await screen.findByRole('article', { name: 'Por canal' }));
  await user.click(screen.getByRole('button', { name: 'Duplicar visual' }));
  await screen.findByRole('article', { name: 'Por canal (cópia)' });
  await user.click(screen.getByRole('button', { name: 'Desfazer' }));
  await waitFor(() => expect(screen.queryByRole('article', { name: 'Por canal (cópia)' })).not.toBeInTheDocument());
  expect(store.doc.version).toBe(4);
  await user.click(screen.getByRole('button', { name: 'Refazer' }));
  await screen.findByRole('article', { name: 'Por canal (cópia)' });
  expect(store.doc.version).toBe(5);
  await user.click(screen.getByRole('button', { name: 'Desfazer' }));
  await waitFor(() => expect(store.doc.widgets).toHaveLength(2));
  await user.click(screen.getByRole('article', { name: 'Total' }));
  await user.click(screen.getByRole('button', { name: 'Duplicar visual' }));
  await screen.findByRole('article', { name: 'Total (cópia)' });
  expect(screen.getByRole('button', { name: 'Refazer' })).toBeDisabled();
});

it('preserves history after a failed undo, blocks drafts and does not intercept text undo', async () => {
  const store = api(); const user = userEvent.setup(); render(<DashboardBuilder {...props} />);
  await user.click(await screen.findByRole('article', { name: 'Por canal' }));
  await user.click(screen.getByRole('button', { name: 'Duplicar visual' }));
  const copy = await screen.findByRole('article', { name: 'Por canal (cópia)' });
  store.fail(503); await user.click(screen.getByRole('button', { name: 'Desfazer' }));
  await screen.findByRole('alert'); expect(copy).toBeInTheDocument();
  store.fail(0); await user.click(screen.getByRole('button', { name: 'Desfazer' }));
  await waitFor(() => expect(copy).not.toBeInTheDocument());
  await user.click(screen.getByRole('article', { name: 'Por canal' }));
  await user.click(screen.getByRole('button', { name: 'Editar dados e formato' }));
  expect(screen.getByRole('button', { name: 'Refazer' })).toBeDisabled();
  const count = store.puts.length;
  fireEvent.keyDown(screen.getByLabelText('Título da visualização'), { key: 'z', ctrlKey: true });
  expect(store.puts).toHaveLength(count);
});

function metaApi(previousStatus: 'succeeded' | 'partial' = 'succeeded', previousValue = 100, duplicateNames = false) {
  const widgets = [{ ...chart, source: { kind: 'meta' as const, level: 'campaign' as const }, dimension: 'campaignName', measure: 'spend' }, { ...metric, source: { kind: 'meta' as const, level: 'campaign' as const }, dimension: 'campaignName', measure: 'spend' }];
  const requests: URL[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.includes('/builder')) return Response.json({ version: 2, datasets: [], widgets });
    const q = new URL(url, 'https://local.test'); requests.push(q);
    const start = q.searchParams.get('start'), end = q.searchParams.get('end'), filtered = q.searchParams.has('entityId');
    const previous = start === '2026-09-28';
    return Response.json({ provider: 'meta', client: { id: 'alpha' }, scope: { level: 'campaign', ...(filtered ? { entityFilter: { level: 'campaign', id: '1' } } : {}) }, dateRange: { start, end }, status: previous ? previousStatus : 'succeeded', warnings: [], totals: { spend: previous ? previousValue : filtered ? 50 : 125 }, rows: [{ campaignId: '1', campaignName: 'A', spend: 50, impressions: 100, clicks: 5 }, ...(filtered ? [] : [{ campaignId: '2', campaignName: duplicateNames ? 'A' : 'B', spend: 75, impressions: 100, clicks: 5 }])] });
  }));
  return requests;
}
it('toggles a selected Meta entity by ID after duplicate labels collapse in the filtered result', async () => {
  metaApi('succeeded', 100, true); const user = userEvent.setup(); render(<DashboardBuilder {...props} metaConnected admin={false} />);
  await user.click(await screen.findByRole('button', { name: 'Filtrar por A · 1' }));
  const point = await screen.findByRole('button', { name: 'Filtrar por A' });
  expect(point).toHaveAttribute('aria-pressed', 'true');
  await user.click(point);
  await screen.findByRole('button', { name: 'Filtrar por A · 2' });
  expect(screen.queryByRole('button', { name: 'Limpar filtro' })).not.toBeInTheDocument();
  expect(within(screen.getByRole('article', { name: 'Total' })).getByText('125')).toBeInTheDocument();
});
it('compares equal periods on demand, and carries entity filters to both queries', async () => {
  const requests = metaApi(); const user = userEvent.setup(); render(<DashboardBuilder {...props} metaConnected admin={false} />);
  const start = await screen.findByLabelText('Início Meta');
  fireEvent.change(start, { target: { value: '2026-10-01' } }); fireEvent.change(screen.getByLabelText('Fim Meta'), { target: { value: '2026-10-03' } });
  await user.click(await screen.findByRole('checkbox', { name: 'Comparar com período anterior' }));
  expect(await screen.findByText('+25%')).toBeInTheDocument();
  expect(requests.some(q => q.searchParams.get('start') === '2026-09-28' && q.searchParams.get('end') === '2026-09-30')).toBe(true);
  await user.click(screen.getByRole('button', { name: 'Filtrar por A' }));
  expect(await screen.findByText('-50%')).toBeInTheDocument();
  expect(requests.filter(q => q.searchParams.get('entityId') === '1')).toHaveLength(2);
});
it.each([['partial', 100, 'Comparação indisponível: dados parciais.'], ['succeeded', 0, 'Sem variação percentual: base anterior zero.']] as const)('does not invent variation for %s / %s', async (status, value, label) => {
  metaApi(status, value); const user = userEvent.setup(); render(<DashboardBuilder {...props} metaConnected admin={false} />);
  fireEvent.change(await screen.findByLabelText('Início Meta'), { target: { value: '2026-10-01' } }); fireEvent.change(screen.getByLabelText('Fim Meta'), { target: { value: '2026-10-03' } });
  await user.click(screen.getByRole('checkbox', { name: 'Comparar com período anterior' }));
  expect(await screen.findByText(label)).toBeInTheDocument();
  expect(screen.queryByText('+25%')).not.toBeInTheDocument();
});
