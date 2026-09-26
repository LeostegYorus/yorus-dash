import { createHmac, scryptSync, timingSafeEqual } from 'node:crypto';
import { ConfigurationError, getClients, type DashClient } from './clients';

export const COOKIE_NAME = 'dash_session';
const LIFETIME_SECONDS = 8 * 60 * 60;
export type DashUser = { email: string; passwordHash: string; role: string; clients: string[] };
export type Authenticated = { user: DashUser; clients: DashClient[] };

type Session = { email: string; clients: string[]; exp: number };

export function getUsers(): DashUser[] {
  let parsed: unknown;
  try { parsed = JSON.parse(process.env.DASH_USERS_JSON ?? ''); }
  catch { throw new ConfigurationError(); }
  if (!Array.isArray(parsed) || parsed.some(item => !item || typeof item !== 'object' ||
    typeof item.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item.email) ||
    typeof item.passwordHash !== 'string' || !/^scrypt:[0-9a-f]{32,}:[0-9a-f]{64}$/.test(item.passwordHash) ||
    typeof item.role !== 'string' || !item.role.trim() ||
    !Array.isArray(item.clients) || item.clients.some((id: unknown) => typeof id !== 'string')
  ) || new Set(parsed.map((item: DashUser) => item.email.toLowerCase())).size !== parsed.length) throw new ConfigurationError();
  return parsed as DashUser[];
}

function sessionSecret(): string {
  const secret = process.env.DASH_SESSION_SECRET;
  if (!secret || Buffer.byteLength(secret) < 32) throw new ConfigurationError();
  return secret;
}

export function configuredAuth() {
  return { users: getUsers(), clients: getClients(), secret: sessionSecret() };
}

export function verifyPassword(password: string, stored: string): boolean {
  const [, salt, expected] = stored.split(':');
  const actual = scryptSync(password, Buffer.from(salt, 'hex'), 32);
  return timingSafeEqual(actual, Buffer.from(expected, 'hex'));
}

function signature(payload: string, secret: string): Buffer {
  return createHmac('sha256', secret).update(payload).digest();
}

export function sessionCookie(user: DashUser, secret: string): string {
  const payload = Buffer.from(JSON.stringify({ email: user.email, clients: user.clients, exp: Math.floor(Date.now() / 1000) + LIFETIME_SECONDS } satisfies Session)).toString('base64url');
  const value = `${payload}.${signature(payload, secret).toString('base64url')}`;
  return `${COOKIE_NAME}=${value}; Path=/; Max-Age=${LIFETIME_SECONDS}; HttpOnly; SameSite=Strict${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`;
}

export function expiredCookie(): string {
  return `${COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`;
}

export function authenticate(request: Request): Authenticated | null {
  const { users, clients, secret } = configuredAuth();
  const value = request.headers.get('cookie')?.split(';').map(part => part.trim()).find(part => part.startsWith(`${COOKIE_NAME}=`))?.slice(COOKIE_NAME.length + 1);
  if (!value || value.length > 4096) return null;
  const [payload, mac, extra] = value.split('.');
  if (!payload || !mac || extra || !/^[A-Za-z0-9_-]+$/.test(payload) || !/^[A-Za-z0-9_-]+$/.test(mac)) return null;
  let data: Session;
  try {
    const given = Buffer.from(mac, 'base64url');
    const expected = signature(payload, secret);
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
    data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Session;
  } catch { return null; }
  if (!data || typeof data.email !== 'string' || !Array.isArray(data.clients) ||
    data.clients.some(id => typeof id !== 'string') || !Number.isSafeInteger(data.exp) || data.exp <= Math.floor(Date.now() / 1000)) return null;
  const user = users.find(item => item.email === data.email);
  if (!user) return null;
  const allowed = clients.filter(client => user.clients.includes(client.id) && data.clients.includes(client.id));
  return { user, clients: allowed };
}

export function jsonResponse(payload: unknown, status = 200, headers: HeadersInit = {}): Response {
  return Response.json(payload, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
}

export function errorResponse(status: number): Response {
  const messages: Record<number, string> = { 400: 'Invalid request', 401: 'Unauthorized', 403: 'Forbidden', 503: 'Service unavailable' };
  return jsonResponse({ error: messages[status] ?? 'Upstream error' }, status);
}
