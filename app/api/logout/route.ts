import { expiredCookie, jsonResponse } from '../../../lib/auth';

export const runtime = 'nodejs';

export async function POST(): Promise<Response> {
  return jsonResponse({ ok: true }, 200, { 'Set-Cookie': expiredCookie() });
}
