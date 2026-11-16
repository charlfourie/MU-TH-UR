import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const SESSION_COOKIE = 'muthur_session';
export const STATE_COOKIE = 'muthur_oauth_state';
const SESSION_SECONDS = 30 * 24 * 60 * 60;

const secret = () => process.env.SESSION_SECRET ?? '';
const owner = () => (process.env.OWNER_GITHUB ?? '').trim().toLowerCase();

export function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });
}

export function cookie(name: string, value: string, maxAge: number): string {
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

export function clearCookie(name: string): string {
  return cookie(name, '', 0);
}

export function getCookie(req: Request, name: string): string | null {
  for (const part of (req.headers.get('cookie') ?? '').split(';')) {
    const equals = part.indexOf('=');
    if (equals < 0 || part.slice(0, equals).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(equals + 1).trim());
    } catch {
      return null;
    }
  }
  return null;
}

function sign(payload: string): string {
  return createHmac('sha256', secret()).update(payload).digest('base64url');
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function makeSession(login: string): string {
  const payload = Buffer.from(JSON.stringify({ login, exp: Date.now() + SESSION_SECONDS * 1000 })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

export function readSession(req: Request): string | null {
  if (secret().length < 32 || !owner()) return null;
  const token = getCookie(req, SESSION_COOKIE);
  if (!token) return null;
  const dot = token.indexOf('.');
  if (dot < 1) return null;
  const payload = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  if (!safeEqual(signature, sign(payload))) return null;
  try {
    const data: unknown = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!data || typeof data !== 'object') return null;
    const session = data as { login?: unknown; exp?: unknown };
    if (typeof session.login !== 'string' || typeof session.exp !== 'number' || session.exp <= Date.now()) return null;
    return session.login.toLowerCase() === owner() ? session.login : null;
  } catch {
    return null;
  }
}

export function requireOwner(req: Request): string | Response {
  const login = readSession(req);
  return login ?? json({ error: 'Not signed in' }, 401);
}

export function validPublishToken(req: Request): boolean {
  const configured = process.env.MUTHUR_PUBLISH_TOKEN ?? '';
  const provided = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  return configured.length >= 32 && safeEqual(provided, configured);
}

export function randomToken(): string {
  return randomBytes(32).toString('base64url');
}

export function sessionCookie(value: string): string {
  return cookie(SESSION_COOKIE, value, SESSION_SECONDS);
}
