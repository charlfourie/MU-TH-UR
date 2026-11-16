import { clearCookie, getCookie, makeSession, sessionCookie, STATE_COOKIE } from '../../server/auth.js';
import { redirectTo } from '../../server/auth-redirect.js';

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const state = url.searchParams.get('state');
  const savedState = getCookie(req, STATE_COOKIE);
  const clearState = clearCookie(STATE_COOKIE);
  if (!state || !savedState || state !== savedState) return redirectTo(req, '/?error=oauth-state', [clearState]);

  const clientId = process.env.GITHUB_CLIENT_ID ?? '';
  const clientSecret = process.env.GITHUB_CLIENT_SECRET ?? '';
  const allowedOwner = (process.env.OWNER_GITHUB ?? '').trim().toLowerCase();
  const code = url.searchParams.get('code');
  if (!clientId || !clientSecret || !allowedOwner || (process.env.SESSION_SECRET ?? '').length < 32 || !code) {
    return redirectTo(req, '/?error=not-configured', [clearState]);
  }

  try {
    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: `${url.origin}/api/auth/callback`,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!tokenResponse.ok) return redirectTo(req, '/?error=github-auth', [clearState]);
    const tokenData: unknown = await tokenResponse.json();
    if (!tokenData || typeof tokenData !== 'object' || typeof (tokenData as { access_token?: unknown }).access_token !== 'string') {
      return redirectTo(req, '/?error=github-auth', [clearState]);
    }
    const accessToken = (tokenData as { access_token: string }).access_token;
    const userResponse = await fetch('https://api.github.com/user', {
      headers: { authorization: `Bearer ${accessToken}`, accept: 'application/vnd.github+json', 'user-agent': 'muthur' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!userResponse.ok) return redirectTo(req, '/?error=github-auth', [clearState]);
    const user: unknown = await userResponse.json();
    const login = user && typeof user === 'object' ? (user as { login?: unknown }).login : undefined;
    if (typeof login !== 'string' || login.toLowerCase() !== allowedOwner) return redirectTo(req, '/?error=denied', [clearState]);

    return redirectTo(req, '/?signed-in=1', [clearState, sessionCookie(makeSession(login))]);
  } catch {
    return redirectTo(req, '/?error=github-auth', [clearState]);
  }
}
