import { describe, expect, it } from 'vitest';
import { metadata } from '../layout';

describe('product identity', () => {
  it('names the separate Yorus Dash product in browser metadata', () => {
    expect(metadata.title).toBe('Yorus Dash | Inteligência de mídia');
  });
});
