import { randomToken, cookie, STATE_COOKIE } from '../../server/auth.js';

export function GET(req: Request): Response {
  const clientId = process.env.GITHUB_CLIENT_ID;
  if (!clientId) return Response.redirect(new URL('/?error=not-configured', req.url), 303);

  const state = randomToken();
  const authorize = new URL('https://github.com/login/oauth/authorize');
  authorize.searchParams.set('client_id', clientId);
  authorize.searchParams.set('redirect_uri', `${new URL(req.url).origin}/api/auth/callback`);
  authorize.searchParams.set('state', state);
  authorize.searchParams.set('allow_signup', 'false');
  const headers = new Headers({ location: authorize.toString(), 'cache-control': 'no-store' });
  headers.append('set-cookie', cookie(STATE_COOKIE, state, 600));
  return new Response(null, { status: 302, headers });
}
