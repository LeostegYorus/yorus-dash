import { expect, it } from 'vitest';
import { previousPeriod, relativeChange } from '../builder-analysis';

it.each([
  ['2026-10-01', '2026-10-03', { start: '2026-09-28', end: '2026-09-30' }],
  ['2024-03-01', '2024-03-01', { start: '2024-02-29', end: '2024-02-29' }],
  ['2026-01-01', '2026-01-02', { start: '2025-12-30', end: '2025-12-31' }],
  ['2026-02-30', '2026-03-01', null], ['2026-10-03', '2026-10-01', null],
  ['', '2026-10-01', null], ['2025-01-01', '2026-10-01', null],
])('uses inclusive UTC calendar days for %s–%s', (start, end, expected) => {
  expect(previousPeriod(start, end)).toEqual(expected);
});
it('does not invent change for missing, zero-base or overflowing values', () => {
  expect(relativeChange(125, 100)).toBe(.25);
  expect(relativeChange(0, 100)).toBe(-1);
  expect(relativeChange(5, 0)).toBeNull();
  expect(relativeChange(null, 10)).toBeNull();
  expect(relativeChange(1e308, 1e-308)).toBeNull();
});
