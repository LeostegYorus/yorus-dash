import { authenticate, errorResponse, jsonResponse } from '../../../lib/auth';
import { ConfigurationError, publicClient } from '../../../lib/clients';

export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  try {
    const session = authenticate(request);
    if (!session) return errorResponse(401);
    return jsonResponse({ user: { email: session.user.email, role: session.user.role }, clients: session.clients.map(publicClient) });
  } catch (error) {
    if (error instanceof ConfigurationError) return errorResponse(503);
    return errorResponse(503);
  }
}
