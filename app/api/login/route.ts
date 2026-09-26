import { configuredAuth, errorResponse, jsonResponse, sameOrigin, sessionCookie, verifyPassword } from '../../../lib/auth';
import { ConfigurationError, publicClient } from '../../../lib/clients';

export const runtime = 'nodejs';

export async function POST(request: Request): Promise<Response> {
  try {
    if (!sameOrigin(request)) return errorResponse(403);
    const { users, clients, secret } = configuredAuth();
    if (!/^application\/json(?:\s*;\s*charset\s*=\s*utf-8)?\s*$/i.test(request.headers.get('content-type') ?? '')) return errorResponse(400);
    let body: unknown;
    try { body = await request.json(); } catch { return errorResponse(400); }
    if (!body || typeof body !== 'object' || Array.isArray(body) ||
      typeof (body as Record<string, unknown>).email !== 'string' ||
      typeof (body as Record<string, unknown>).password !== 'string' ||
      !(body as { email: string }).email.trim() ||
      !(body as { password: string }).password ||
      (body as { email: string }).email.length > 254 ||
      (body as { password: string }).password.length > 1024) return errorResponse(400);
    const { email, password } = body as { email: string; password: string };
    const user = users.find(item => item.email.toLowerCase() === email.trim().toLowerCase());
    if (!user || !verifyPassword(password, user.passwordHash)) return errorResponse(401);
    const visible = clients.filter(client => user.clients.includes(client.id));
    return jsonResponse({ user: { email: user.email, role: user.role }, clients: visible.map(publicClient) }, 200, { 'Set-Cookie': sessionCookie(user, secret) });
  } catch (error) {
    if (error instanceof ConfigurationError) return errorResponse(503);
    return errorResponse(503);
  }
}
