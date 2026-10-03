import { expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MetaMetricPicker from '../components/meta-metric-picker';
import { getMetaMetric } from '../../lib/meta-metrics';

it('opens clickable lead suggestions at the search and chooses one without submitting a form', async () => {
  const onChange = vi.fn(), submit = vi.fn(event => event.preventDefault());
  const user = userEvent.setup();
  render(<form onSubmit={submit}><MetaMetricPicker metrics={['spend', 'actions:lead', 'cost_per_action_type:lead'].map(id => getMetaMetric(id)!)} selected={['spend']} multiple loading={false} disabled={false} onChange={onChange} /></form>);
  const input = screen.getByLabelText('Buscar métricas Meta');
  await user.type(input, 'lead');
  expect(input).toHaveAttribute('role', 'combobox');
  expect(input).toHaveAttribute('aria-expanded', 'true');
  const popup = screen.getByRole('listbox', { name: 'Métricas encontradas' });
  expect(popup).toBeVisible();
  await user.click(within(popup).getByRole('option', { name: /Adicionar .*\(actions:lead\)$/ }));
  expect(onChange).toHaveBeenCalledWith(['spend', 'actions:lead']);
  expect(submit).not.toHaveBeenCalled();
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
});

it('selects the first lead result by keyboard and closes with Escape', async () => {
  const onChange = vi.fn(), user = userEvent.setup();
  render(<MetaMetricPicker metrics={['spend', 'cost_per_action_type:lead', 'actions:lead'].map(id => getMetaMetric(id)!)} selected={['spend']} multiple loading={false} disabled={false} onChange={onChange} />);
  const input = screen.getByLabelText('Buscar métricas Meta');
  await user.type(input, 'lead');await user.keyboard('{ArrowDown}{Enter}');
  expect(onChange).toHaveBeenCalledWith(['spend', 'actions:lead']);
  await user.type(input, 'lead');await user.keyboard('{Escape}');
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
});
