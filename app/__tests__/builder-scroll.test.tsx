import { readFileSync } from 'node:fs';
import { expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import DashboardBuilder from '../components/dashboard-builder';

it('keeps long saved text and its note in a scrollable area inside the fixed-height card', async () => {
  const body = 'Relatório longo. '.repeat(240);
  const note = 'Observação complementar. '.repeat(70);
  const response = { version: 1, datasets: [], widgets: [{ id: '8b956e8e-2fd7-407f-8378-d0fb98579447', kind: 'text', title: 'Contexto', width: 6, body, note, position: { x: 0, y: 0, height: 5 } }] };
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => response })));
  const css = document.createElement('style');
  css.textContent = readFileSync(`${process.cwd()}/app/builder.css`, 'utf8');
  document.body.appendChild(css);
  try {
    render(<DashboardBuilder clientId="alpha" admin={false} currency="BRL" metaConnected={false} />);
    const card = await screen.findByRole('article', { name: 'Contexto' });
    const text = card.querySelector<HTMLElement>('.builder-copy');
    const annotation = card.querySelector<HTMLElement>('.builder-note');
    expect(text).toHaveTextContent('Relatório longo.');
    expect(annotation).toHaveTextContent('Observação complementar.');
    const scroller = text!.closest('.builder-text-scroll');
    expect(scroller).not.toBeNull();
    expect(scroller).toContainElement(annotation);
    expect(getComputedStyle(scroller!).overflowY).toBe('auto');
    expect(getComputedStyle(scroller!).minHeight).toBe('0px');
    expect(getComputedStyle(scroller!).flexGrow).toBe('1');
  } finally {
    css.remove();
    vi.unstubAllGlobals();
  }
});
