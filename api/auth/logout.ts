import { clearCookie, json, SESSION_COOKIE } from '../../server/auth.js';

export function POST(): Response {
  return json({ ok: true }, 200, { 'set-cookie': clearCookie(SESSION_COOKIE) });
}
