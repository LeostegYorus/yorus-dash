import { afterEach, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useBuilderMeta, validateMeta } from '../use-builder-meta';
const args = { clientId: 'alpha', start: '2026-10-01', end: '2026-10-03', levelKey: 'campaign', measureKey: '{"campaign":["spend"]}' };
const payload = { provider: 'meta', client: { id: 'alpha' }, scope: { level: 'campaign' }, dateRange: { start: args.start, end: args.end }, status: 'succeeded', warnings: [], totals: { spend: 20 }, rows: [{ campaignId: '1', spend: 20, impressions: 100, clicks: 5 }] };
afterEach(() => vi.unstubAllGlobals());
it('hides stale results immediately and ignores late responses after the filter changes', async () => {
  let finish: (value: Response) => void = () => {};
  vi.stubGlobal('fetch', vi.fn((url: string) => url.includes('entityId') ? Promise.resolve(Response.json({ ...payload, scope: { level: 'campaign', entityFilter: { level: 'campaign', id: '1' } }, totals: { spend: 7 } })) : new Promise<Response>(resolve => { finish = resolve; })));
  const view = renderHook(({ filtered }) => useBuilderMeta({ ...args, entityFilter: filtered ? { level: 'campaign', id: '1' } : undefined }), { initialProps: { filtered: false } });
  view.rerender({ filtered: true });
  await waitFor(() => expect(view.result.current.campaign?.result?.totals?.spend).toBe(7));
  await act(async () => { finish(Response.json(payload)); });
  expect(view.result.current.campaign?.result?.totals?.spend).toBe(7);
});
it('does not fetch an inactive comparison or an invalid date', async () => {
  const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
  const view = renderHook(({ enabled }) => useBuilderMeta({ ...args, enabled, start: '2026-02-30' }), { initialProps: { enabled: false } });
  view.rerender({ enabled: true });
  expect(fetcher).not.toHaveBeenCalled();
});
it('rejects responses for a different filter while allowing explicitly missing metrics', () => {
  expect(validateMeta(payload, 'alpha', 'campaign', args.start, args.end, { level: 'campaign', id: '1' })).toBe(false);
  expect(validateMeta({ ...payload, rows: [{ spend: null, impressions: 100, clicks: 5 }] }, 'alpha', 'campaign', args.start, args.end)).toBe(true);
  expect(validateMeta({ ...payload, client: { id: 'beta' } }, 'alpha', 'campaign', args.start, args.end)).toBe(false);
});
