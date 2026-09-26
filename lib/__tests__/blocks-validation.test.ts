// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { parseBlockDocument } from '../block-types';

const id = '123e4567-e89b-42d3-a456-426614174000';
const base = { id, kind: 'question', tab: 'profile', title: 'Purpose', question: 'Why?', options: [{ label: 'One', count: null }, { label: 'Two', count: null }] };
const document = (block: unknown) => ({ version: 0, blocks: [block] });

describe('strict block document validation', () => {
  it('accepts unanswered questions but rejects partially answered questions', () => {
    expect(parseBlockDocument(document(base)).blocks[0]).toMatchObject(base);
    expect(() => parseBlockDocument(document({ ...base, options: [{ label: 'One', count: 2 }, { label: 'Two', count: null }] }))).toThrow();
  });

  it('requires source and real ordered dates for counted questions and manual investments', () => {
    const counted = { ...base, options: [{ label: 'One', count: 0 }, { label: 'Two', count: 3 }] };
    expect(() => parseBlockDocument(document(counted))).toThrow();
    expect(parseBlockDocument(document({ ...counted, sourceLabel: 'Survey', periodStart: '2026-09-01', periodEnd: '2026-09-30' })).blocks).toHaveLength(1);
    for (const broken of [
      { ...counted, sourceLabel: 'Survey', periodStart: '2026-02-30', periodEnd: '2026-09-30' },
      { ...counted, sourceLabel: 'Survey', periodStart: '2026-09-30', periodEnd: '2026-09-01' },
      { ...counted, sourceLabel: 'Survey', periodStart: '2026-09-01', periodEnd: '2026-09-30', options: [{ label: 'One', count: -1 }, { label: 'Two', count: 1 }] },
      { ...counted, sourceLabel: 'Survey', periodStart: '2026-09-01', periodEnd: '2026-09-30', options: [{ label: 'One', count: 1.5 }, { label: 'Two', count: 1 }] },
      { id, kind: 'investment', tab: 'costs', title: 'Invested', source: 'manual', amountCents: 100, sourceLabel: 'Invoice', periodStart: '2026-09-01' },
    ]) expect(() => parseBlockDocument(document(broken))).toThrow();
  });

  it('rejects an unsafe sum of otherwise individually safe option counts', () => {
    const counted = { ...base, options: [{ label: 'One', count: Number.MAX_SAFE_INTEGER }, { label: 'Two', count: Number.MAX_SAFE_INTEGER }], sourceLabel: 'Survey', periodStart: '2026-09-01', periodEnd: '2026-09-30' };
    expect(() => parseBlockDocument(document(counted))).toThrow();
  });

  it('rejects extra fields, invalid IDs, duplicates, oversized arrays and version', () => {
    for (const malformed of [
      { ...base, metaAccountId: 'act_123' }, { ...base, id: '../beta' },
      { ...base, options: [{ label: 'Only', count: null }] },
      { ...base, question: 'x'.repeat(2001) },
      { id, kind: 'investment', tab: 'costs', title: 'Meta', source: 'meta', amountCents: 999 },
      { id, kind: 'note', tab: 'overview', title: 'Claim', body: '<b>claim</b>', evidenceType: 'fact' },
    ]) expect(() => parseBlockDocument(document(malformed))).toThrow();
    expect(() => parseBlockDocument({ version: 0, blocks: [base, base] })).toThrow();
    expect(() => parseBlockDocument({ version: 0, blocks: Array.from({ length: 51 }, (_, n) => ({ ...base, id: `123e4567-e89b-42d3-a456-${String(n).padStart(12, '0')}` })) })).toThrow();
    expect(() => parseBlockDocument({ version: -1, blocks: [] })).toThrow();
    expect(() => parseBlockDocument({ version: 0, blocks: [], secret: 'no' })).toThrow();
  });

  it('validates stored timestamps but generates timestamps for submitted blocks', () => {
    const submitted = parseBlockDocument(document({ ...base, updatedAt: '2020-01-01T00:00:00.000Z' }));
    expect('updatedAt' in submitted.blocks[0]).toBe(false);
    expect(() => parseBlockDocument(document({ ...base, updatedAt: 'bad' }), true)).toThrow();
    expect(parseBlockDocument(document({ ...base, updatedAt: '2026-09-01T00:00:00.000Z' }), true).blocks[0].updatedAt).toBe('2026-09-01T00:00:00.000Z');
  });

  it('allows multiline plain-text note bodies but rejects HTML and other controls', () => {
    const note = { id, kind: 'note', tab: 'overview', title: 'Context', body: 'First paragraph\nSecond paragraph', evidenceType: 'fact', sourceLabel: 'Report' };
    expect(parseBlockDocument(document(note)).blocks[0]).toMatchObject(note);
    expect(() => parseBlockDocument(document({ ...note, body: 'bad\u0000control' }))).toThrow();
    expect(() => parseBlockDocument(document({ ...note, body: '<script>alert(1)</script>' }))).toThrow();
  });

  it('rejects duplicate option labels regardless of case or surrounding spaces', () => {
    expect(() => parseBlockDocument(document({ ...base, options: [{ label: ' Yes ', count: null }, { label: 'yes', count: null }] }))).toThrow();
  });
});
