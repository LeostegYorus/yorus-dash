import { afterEach, describe, expect, it } from 'vitest';
import { ConfigurationError, getClients } from '../clients';

const previous = process.env.DASH_CLIENTS_JSON;
afterEach(() => {
  if (previous === undefined) delete process.env.DASH_CLIENTS_JSON;
  else process.env.DASH_CLIENTS_JSON = previous;
});

describe('client registry', () => {
  it('rejects a Meta account mapped to two client slugs', () => {
    process.env.DASH_CLIENTS_JSON = JSON.stringify([
      { id: 'alpha', name: 'Alpha', currency: 'BRL', metaAccountId: 'act_123' },
      { id: 'beta', name: 'Beta', currency: 'BRL', metaAccountId: 'act_123' },
    ]);
    expect(() => getClients()).toThrow(ConfigurationError);
  });
});
