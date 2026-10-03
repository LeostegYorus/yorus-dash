export type BlockTab = 'overview' | 'profile' | 'costs';
export type BlockBase = { id: string; tab: BlockTab; title: string; updatedAt: string };
export type InvestmentBlock = BlockBase & ({ kind: 'investment'; source: 'meta' } | { kind: 'investment'; source: 'manual'; amountCents: number; periodStart: string; periodEnd: string; sourceLabel: string; note?: string });
export type QuestionBlock = BlockBase & { kind: 'question'; question: string; options: Array<{ label: string; count: number | null }>; sourceLabel?: string; periodStart?: string; periodEnd?: string };
export type NoteBlock = BlockBase & { kind: 'note'; body: string; evidenceType: 'fact' | 'hypothesis' | 'decision'; sourceLabel?: string };
export type Block = InvestmentBlock | QuestionBlock | NoteBlock;
export type BlockDocument = { version: number; blocks: Block[] };
type BlockDraft = Block extends infer B ? B extends Block ? Omit<B, 'updatedAt'> : never : never;
export type BlockDraftDocument = { version: number; blocks: BlockDraft[] };

export class BlockValidationError extends Error { name = 'BlockValidationError'; constructor() { super('Invalid block document'); } }
const invalid = (): never => { throw new BlockValidationError(); };
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
function keys(value: Record<string, unknown>, required: string[], optional: string[] = []): void {
  if (required.some(key => !(key in value)) || Object.keys(value).some(key => !required.includes(key) && !optional.includes(key))) invalid();
}
function text(value: unknown, max: number, required = true, multiline = false): void {
  const controls = multiline ? /[<>\u0000-\u0009\u000b-\u001f\u007f]/ : /[<>\u0000-\u001f\u007f]/;
  if (typeof value !== 'string' || value.length > max || (required && !value.trim()) || controls.test(value)) invalid();
}
function date(value: unknown): void {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`)) || new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value) invalid();
}
function period(value: Record<string, unknown>, required: boolean): void {
  if (required || value.periodStart !== undefined || value.periodEnd !== undefined) {
    date(value.periodStart); date(value.periodEnd);
    if ((value.periodStart as string) > (value.periodEnd as string)) invalid();
  }
}
function label(value: Record<string, unknown>, required: boolean): void {
  if (required || value.sourceLabel !== undefined) text(value.sourceLabel, 160);
}
function block(value: unknown, stored: boolean): Block | BlockDraft {
  if (!object(value)) throw new BlockValidationError();
  const common = ['id', 'kind', 'tab', 'title'];
  const optionalTime = stored ? [] : ['updatedAt'];
  if (typeof value.id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.id) ||
    !['overview', 'profile', 'costs'].includes(value.tab as string)) invalid();
  text(value.title, 120);
  if (stored) {
    if (typeof value.updatedAt !== 'string' || Number.isNaN(Date.parse(value.updatedAt)) || new Date(value.updatedAt).toISOString() !== value.updatedAt) invalid();
    common.push('updatedAt');
  }
  if (value.kind === 'investment') {
    if (value.source === 'meta') keys(value, [...common, 'source'], optionalTime);
    else if (value.source === 'manual') {
      keys(value, [...common, 'source', 'amountCents', 'periodStart', 'periodEnd', 'sourceLabel'], [...optionalTime, 'note']);
      if (!Number.isSafeInteger(value.amountCents) || (value.amountCents as number) < 0) invalid();
      period(value, true); label(value, true);
      if (value.note !== undefined) text(value.note, 2000, false);
    } else invalid();
  } else if (value.kind === 'question') {
    keys(value, [...common, 'question', 'options'], [...optionalTime, 'sourceLabel', 'periodStart', 'periodEnd']);
    text(value.question, 1000);
    if (!Array.isArray(value.options) || value.options.length < 2 || value.options.length > 12) throw new BlockValidationError();
    for (const option of value.options) {
      if (!object(option)) invalid();
      keys(option, ['label', 'count']); text(option.label, 160);
      if (option.count !== null && (!Number.isSafeInteger(option.count) || (option.count as number) < 0)) invalid();
    }
    const counts = value.options.map(option => option.count);
    const labels = value.options.map(option => (option.label as string).trim().toLocaleLowerCase());
    if (new Set(labels).size !== labels.length) invalid();
    if (counts.some(count => count !== null) && counts.some(count => count === null)) invalid();
    if (counts[0] !== null && !Number.isSafeInteger(counts.reduce<number>((sum, count) => sum + (count as number), 0))) invalid();
    label(value, counts[0] !== null); period(value, counts[0] !== null);
  } else if (value.kind === 'note') {
    keys(value, [...common, 'body', 'evidenceType'], [...optionalTime, 'sourceLabel']);
    text(value.body, 4000, true, true);
    if (!['fact', 'hypothesis', 'decision'].includes(value.evidenceType as string)) invalid();
    label(value, value.evidenceType === 'fact');
  } else invalid();
  if (stored) return value as Block;
  const { updatedAt: _ignored, ...draft } = value;
  void _ignored;
  return draft as BlockDraft;
}

export function parseBlockDocument(value: unknown, stored: true): BlockDocument;
export function parseBlockDocument(value: unknown, stored?: false): BlockDraftDocument;
export function parseBlockDocument(value: unknown, stored = false): BlockDocument | BlockDraftDocument {
  if (!object(value)) throw new BlockValidationError();
  keys(value, ['version', 'blocks']);
  if (!Number.isSafeInteger(value.version) || (value.version as number) < 0 || !Array.isArray(value.blocks) || value.blocks.length > 50) throw new BlockValidationError();
  const blocks = value.blocks.map(item => block(item, stored));
  if (new Set(blocks.map(item => item.id)).size !== blocks.length) invalid();
  return { version: value.version as number, blocks } as BlockDocument | BlockDraftDocument;
}
