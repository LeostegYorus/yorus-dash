import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { render } from '@testing-library/react';

it('wraps long campaign names inside table cells rather than painting over metric columns', () => {
  const style = document.createElement('style');
  style.textContent = 'td { white-space: nowrap; }' + readFileSync(`${process.cwd()}/app/builder.css`, 'utf8');
  document.body.appendChild(style);
  try {
    const { container } = render(<div className="builder"><div className="builder-table-scroll"><table><tbody><tr><td>Campanha com nome muito longo e muitas categorias no título</td><td>R$ 123,45</td></tr></tbody></table></div></div>);
    expect(getComputedStyle(container.querySelector('td')!).whiteSpace).toBe('normal');
  } finally { style.remove(); }
});
