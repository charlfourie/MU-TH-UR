import { put } from '@vercel/blob';
import { json, validPublishToken } from '../server/auth.js';

const MAX_BODY_BYTES = 250_000;
const KINDS = ['copilot', 'claude', 'human'] as const;
const STATUSES = ['active', 'paused', 'blocked', 'complete'] as const;
const isString = (value: unknown, max: number): value is string => typeof value === 'string' && value.length <= max;
function validRepositoryUrl(value: unknown): value is string {
  if (!isString(value, 1000)) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash;
  } catch {
    return false;
  }
}

export async function POST(req: Request): Promise<Response> {
  if (!validPublishToken(req)) return json({ error: 'Invalid publish token' }, 401);
  const contentLength = Number(req.headers.get('content-length') ?? 0);
  if (contentLength > MAX_BODY_BYTES) return json({ error: 'Snapshot exceeds 250 KB' }, 413);

  let text: string;
  try {
    text = await req.text();
  } catch {
    return json({ error: 'Could not read request body' }, 400);
  }
  if (Buffer.byteLength(text) > MAX_BODY_BYTES) return json({ error: 'Snapshot exceeds 250 KB' }, 413);

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ error: 'Body must be a JSON object' }, 400);
  const doc = body as Record<string, unknown>;
  const state = doc.state;
  if (
    typeof doc.id !== 'string' || !/^[a-f0-9]{64}$/.test(doc.id) ||
    !isString(doc.project, 200) || !doc.project.trim() ||
    !isString(doc.repository, 300) || !doc.repository.trim() ||
    !(doc.repository_url === null || validRepositoryUrl(doc.repository_url)) ||
    !state || typeof state !== 'object' || Array.isArray(state) ||
    !isString(doc.activity, 200_000)
  ) return json({ error: 'Invalid snapshot' }, 400);

  const s = state as Record<string, unknown>;
  if (
    s.project !== doc.project ||
    !isString(s.project, 200) || !s.project.trim() ||
    !STATUSES.includes(s.status as (typeof STATUSES)[number]) ||
    !isString(s.updated_at, 40) || !Number.isFinite(Date.parse(s.updated_at)) ||
    !KINDS.includes(s.updated_by as (typeof KINDS)[number]) ||
    !isString(s.summary, 10_000) ||
    !Array.isArray(s.next_steps) || s.next_steps.length > 100 ||
    !s.next_steps.every((step) => isString(step, 1000))
  ) return json({ error: 'Invalid project state' }, 400);

  const snapshot = {
    id: doc.id,
    project: doc.project,
    repository: doc.repository,
    repository_url: doc.repository_url,
    state: s,
    activity: doc.activity,
    published_at: new Date().toISOString(),
  };
  await put(`projects/${doc.id}.json`, JSON.stringify(snapshot), {
    access: 'private',
    allowOverwrite: true,
    addRandomSuffix: false,
    contentType: 'application/json',
    cacheControlMaxAge: 60,
  });
  return json({ ok: true, published_at: snapshot.published_at });
}
