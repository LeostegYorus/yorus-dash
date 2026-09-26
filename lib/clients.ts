export type DashClient = { id: string; name: string; currency: string; metaAccountId: string };

export class ConfigurationError extends Error {
  constructor() { super('Dashboard configuration unavailable'); }
}

export function getClients(): DashClient[] {
  let parsed: unknown;
  try { parsed = JSON.parse(process.env.DASH_CLIENTS_JSON ?? ''); }
  catch { throw new ConfigurationError(); }
  if (!Array.isArray(parsed) || parsed.some((item) =>
    !item || typeof item !== 'object' ||
    typeof item.id !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.id) ||
    typeof item.name !== 'string' || !item.name.trim() ||
    typeof item.currency !== 'string' || !/^[A-Z]{3}$/.test(item.currency) ||
    typeof item.metaAccountId !== 'string' || !/^act_[0-9]+$/.test(item.metaAccountId)
  ) || new Set(parsed.map((item: DashClient) => item.id)).size !== parsed.length ||
    new Set(parsed.map((item: DashClient) => item.metaAccountId)).size !== parsed.length) throw new ConfigurationError();
  return parsed as DashClient[];
}

export function publicClient(client: DashClient) {
  return { id: client.id, name: client.name, currency: client.currency,
    metaConnected: Boolean(process.env.META_SYSTEM_USER_TOKEN?.trim()), gaConnected: false };
}
