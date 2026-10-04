import { afterEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DashboardBuilder from '../components/dashboard-builder';
import { parseBuilderDocument, type BuilderDocument } from '../../lib/builder-types';

const dataset = { id: '123e4567-e89b-42d3-a456-426614174000', name: 'Resultados', sourceLabel: 'Base manual de teste', periodStart: '2026-09-01', periodEnd: '2026-09-30', fields: [{ id: 'canal', label: 'Canal', type: 'text' as const }, { id: 'valor', label: 'Valor', type: 'number' as const }], rows: [{ canal: 'A', valor: 12.5 }, { canal: 'B', valor: 20 }] };
const widget = { id: '123e4567-e89b-42d3-a456-426614174001', kind: 'data' as const, title: 'Resultados por canal', width: 6, position: { x: 0, y: 0, height: 8 }, source: { kind: 'manual' as const, datasetId: dataset.id }, visualization: 'column' as const, dimension: 'canal', measure: 'valor', aggregation: 'sum' as const, format: 'number' as const };
const props = { clientId: 'alpha', admin: true, currency: 'BRL', metaConnected: false };
function api(initial: BuilderDocument = { version: 2, datasets: [dataset], widgets: [widget] }, failed = false) {
  let saved = structuredClone(initial);
  const puts: BuilderDocument[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (url !== '/api/clients/alpha/builder') throw new Error('Unexpected request');
    if (init?.method === 'PUT') {
      if (failed) return { ok: false, status: 409, json: async () => ({}) };
      const next = parseBuilderDocument(JSON.parse(String(init.body)));
      if (next.version !== saved.version) throw new Error('Stale revision');
      puts.push(next); saved = { ...next, version: saved.version + 1 };
    }
    return { ok: true, status: 200, json: async () => saved };
  }));
  return { get document() { return saved; }, puts };
}
afterEach(() => vi.unstubAllGlobals());

it.each([['treemap', 'treemap'], ['lollipop', 'pontos']] as const)('creates and reloads a %s through the visual gallery', async (visualization, label) => {
  const store = api({ version: 2, datasets: [dataset], widgets: [] });
  const user = userEvent.setup(); const view = render(<DashboardBuilder {...props} />);
  await user.click(await screen.findByRole('button', { name: `Adicionar gráfico de ${label}` }));
  await waitFor(() => expect(store.document.widgets).toHaveLength(1));
  expect(store.document.widgets[0]).toMatchObject({ visualization, source: widget.source, measure: 'valor', dimension: 'canal' });
  view.unmount(); render(<DashboardBuilder {...props} admin={false} />);
  expect(await screen.findByRole('group', { name: visualization === 'treemap' ? 'Treemap' : 'Gráfico de pontos' })).toBeInTheDocument();
});

it('toggles focus without persisting layout changes and preserves a draft across inspector sections', async () => {
  const store = api(); const user = userEvent.setup(); render(<DashboardBuilder {...props} />);
  const card = await screen.findByRole('article', { name: widget.title });
  await user.click(screen.getByRole('button', { name: 'Expandir painel' }));
  expect(screen.getByRole('region', { name: 'Painel configurável' })).toHaveAttribute('data-focus', 'true');
  await user.click(card); await user.click(screen.getByRole('button', { name: 'Editar dados e formato' }));
  await user.clear(screen.getByLabelText('Título da visualização')); await user.type(screen.getByLabelText('Título da visualização'), 'Rascunho');
  await user.click(screen.getByRole('tab', { name: 'Aparência' }));
  fireEvent.change(screen.getByLabelText('Cor do gráfico'), { target: { value: '#224466' } });
  await user.click(screen.getByRole('tab', { name: 'Campos' }));
  expect(screen.getByLabelText('Título da visualização')).toHaveValue('Rascunho');
  await user.click(screen.getByRole('button', { name: 'Recolher painel' }));
  expect(store.puts).toHaveLength(0);
  await user.click(screen.getByRole('button', { name: 'Salvar visualização' }));
  await waitFor(() => expect(store.document.widgets[0]).toMatchObject({ title: 'Rascunho', appearance: { color: '#224466' } }));
});

it('allows treemaps for additive Meta metrics and rejects misleading proportional metrics', () => {
  const meta = { ...widget, source: { kind: 'meta', level: 'campaign' }, dimension: 'campaignName', visualization: 'treemap', measure: 'spend' };
  expect(parseBuilderDocument({ version: 0, datasets: [], widgets: [meta] }).widgets[0]).toMatchObject({ visualization: 'treemap' });
  for (const measure of ['reach', 'ctr', 'cpc']) expect(() => parseBuilderDocument({ version: 0, datasets: [], widgets: [{ ...meta, measure }] })).toThrow();
});

it('renders horizontal bars on both sides of zero while distinguishing zero and missing values', async () => {
  api({ version: 2, datasets: [{ ...dataset, rows: [{ canal: 'Perda', valor: -10 }, { canal: 'Ganho', valor: 20 }, { canal: 'Zero', valor: 0 }, { canal: 'Ausente', valor: null }] }], widgets: [{ ...widget, visualization: 'bar' }] });
  render(<DashboardBuilder {...props} admin={false} />);
  const card = await screen.findByRole('article', { name: widget.title });
  const rows = card.querySelectorAll('.builder-bar-row');
  const negative = rows[0].querySelector<HTMLElement>('.builder-bar-track > span')!;
  expect(parseFloat(negative.style.width)).toBeCloseTo(33.333);
  expect(parseFloat(negative.style.left)).toBe(0);
  const positive = rows[1].querySelector<HTMLElement>('.builder-bar-track > span')!;
  expect(parseFloat(positive.style.width)).toBeCloseTo(66.667);
  expect(parseFloat(positive.style.left)).toBeCloseTo(33.333);
  expect(rows[2].querySelector('.builder-bar-zero')).not.toBeNull();
  expect(rows[3]).toHaveTextContent('Sem valores informados');
  expect(rows[3].querySelector('.builder-bar-fill')).toBeNull();
});

it('offers a reading mode without edit tools and preserves an unsaved draft when returning to edit', async () => {
  const store = api(); const user = userEvent.setup(); render(<DashboardBuilder {...props} />);
  await user.click(await screen.findByRole('article', { name: widget.title }));
  await user.click(screen.getByRole('button', { name: 'Editar dados e formato' }));
  await user.clear(screen.getByLabelText('Título da visualização')); await user.type(screen.getByLabelText('Título da visualização'), 'Título em edição');
  await user.click(screen.getByRole('button', { name: 'Visualizar painel' }));
  expect(screen.queryByRole('button', { name: /Arrastar/ })).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Título da visualização')).not.toBeInTheDocument();
  expect(screen.queryByRole('complementary', { name: 'Inspetor' })).not.toBeInTheDocument();
  expect(screen.getByRole('article', { name: widget.title })).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Editar painel' }));
  expect(screen.getByLabelText('Título da visualização')).toHaveValue('Título em edição');
  expect(store.puts).toHaveLength(0);
});

it('persists presentation choices and renders them again for a reader after remount', async () => {
  const store = api(); const user = userEvent.setup(); const view = render(<DashboardBuilder {...props} />);
  await user.click(await screen.findByRole('article', { name: widget.title }));
  await user.click(screen.getByRole('button', { name: 'Editar dados e formato' }));
  await user.click(screen.getByRole('tab', { name: 'Aparência' }));
  fireEvent.change(screen.getByLabelText('Cor do gráfico'), { target: { value: '#22aabb' } });
  fireEvent.change(screen.getByLabelText('Cor do fundo'), { target: { value: '#112233' } });
  await user.selectOptions(screen.getByLabelText('Casas decimais'), '3');
  await user.click(screen.getByLabelText('Mostrar legenda'));
  await user.click(screen.getByLabelText('Mostrar valores no gráfico'));
  expect(screen.getByRole('article', { name: widget.title }).style.getPropertyValue('--widget-background')).toBe('#112233');
  expect(store.puts).toHaveLength(0);
  await user.click(screen.getByRole('article', { name: widget.title }));
  expect(screen.getByLabelText('Cor do fundo')).toHaveValue('#112233');
  await user.click(screen.getByRole('button', { name: 'Salvar visualização' }));
  await waitFor(() => expect(store.document.widgets[0]).toMatchObject({ ...widget, appearance: { color: '#22aabb', background: '#112233', decimals: 3, showLegend: false, showLabels: true } }));
  view.unmount(); render(<DashboardBuilder {...props} admin={false} />);
  const card = await screen.findByRole('article', { name: widget.title });
  expect(card.style.getPropertyValue('--widget-background')).toBe('#112233');
  expect(card.querySelector('.builder-chart-column')).toHaveAttribute('fill', '#22aabb');
  expect(within(card).queryByRole('list', { name: 'Legenda' })).not.toBeInTheDocument();
  expect(card.querySelector('.builder-chart-value')).toHaveTextContent('12,500');
});

it('duplicates a visual with its data and appearance into free space without changing the original', async () => {
  const store = api(); const user = userEvent.setup(); render(<DashboardBuilder {...props} />);
  const card = await screen.findByRole('article', { name: widget.title });
  await user.click(card);
  await user.click(within(card).getByRole('button', { name: `Duplicar ${widget.title}` }));
  await waitFor(() => expect(store.document.widgets).toHaveLength(2));
  expect(store.document.widgets[0]).toEqual(widget);
  const clone = store.document.widgets[1];
  expect(clone.id).not.toBe(widget.id);
  expect(clone).toMatchObject({ title: 'Resultados por canal (cópia)', source: widget.source, dimension: 'canal', measure: 'valor', width: 6, position: { x: 6, y: 0, height: 8 } });
  expect(screen.getByRole('article', { name: clone.title })).toBeInTheDocument();
});

it('keeps saved data when a duplicate hits a revision conflict and does not show false success', async () => {
  const store = api(undefined, true); const user = userEvent.setup(); render(<DashboardBuilder {...props} />);
  const card = await screen.findByRole('article', { name: widget.title });
  await user.click(card);
  await user.click(within(card).getByRole('button', { name: `Duplicar ${widget.title}` }));
  expect(await screen.findByRole('alert')).toHaveTextContent(/Outra pessoa/);
  expect(store.document.widgets).toHaveLength(1);
  expect(screen.queryByText('Alterações salvas')).not.toBeInTheDocument();
});

it('keeps editor panels out of a reader session', async () => {
  api(); render(<DashboardBuilder {...props} admin={false} />);
  await screen.findByRole('article', { name: widget.title });
  expect(screen.queryByRole('button', { name: 'Editar painel' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Duplicar/ })).not.toBeInTheDocument();
  expect(screen.queryByRole('complementary', { name: 'Inspetor' })).not.toBeInTheDocument();
  expect(screen.queryByRole('complementary', { name: 'Fontes de dados' })).not.toBeInTheDocument();
});

it('hides an open delete confirmation when switching to reading mode', async () => {
  const store = api(); const user = userEvent.setup(); render(<DashboardBuilder {...props} />);
  await user.click(await screen.findByRole('article', { name: widget.title }));
  await user.click(screen.getByRole('button', { name: `Excluir ${widget.title}` }));
  expect(screen.getByRole('button', { name: 'Confirmar exclusão' })).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Visualizar painel' }));
  expect(screen.queryByRole('button', { name: 'Confirmar exclusão' })).not.toBeInTheDocument();
  expect(store.puts).toHaveLength(0);
});

it('duplicates a tall visual without moving occupied neighbors', async () => {
  const original = { ...widget, position: { x: 0, y: 0, height: 20 }, appearance: { color: '#22aabb' } };
  const neighbor = { ...widget, id: '123e4567-e89b-42d3-a456-426614174002', title: 'Vizinho', position: { x: 6, y: 9, height: 8 } };
  const store = api({ version: 2, datasets: [dataset], widgets: [original, neighbor] });
  const user = userEvent.setup(); render(<DashboardBuilder {...props} />);
  await user.click(await screen.findByRole('article', { name: widget.title }));
  await user.click(screen.getByRole('button', { name: `Duplicar ${widget.title}` }));
  await waitFor(() => expect(store.document.widgets).toHaveLength(3));
  expect(store.document.widgets.slice(0, 2)).toEqual([original, neighbor]);
  expect(store.document.widgets[2]).toMatchObject({ appearance: original.appearance, position: { x: 6, y: 17, height: 20 } });
});

it('saves an exact canvas position and keeps it after returning to reading mode', async () => {
  const store = api(); const user = userEvent.setup(); render(<DashboardBuilder {...props} />);
  await user.click(await screen.findByRole('article', { name: widget.title }));
  await user.selectOptions(screen.getByLabelText('Coluna inicial'), '4');
  await waitFor(() => expect(store.document.widgets[0].position?.x).toBe(3));
  const row = screen.getByLabelText('Linha inicial');
  await user.clear(row); await user.type(row, '13'); await user.tab();
  await waitFor(() => expect(store.document.widgets[0].position?.y).toBe(12));
  await user.click(screen.getByRole('button', { name: 'Visualizar painel' }));
  expect(screen.getByRole('article', { name: widget.title })).toHaveStyle({ gridColumn: '4 / span 6', gridRow: '13 / span 8' });
});
