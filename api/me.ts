import { json, readSession } from '../server/auth.js';

export function GET(req: Request): Response {
  const missing = [
    !process.env.GITHUB_CLIENT_ID && 'GITHUB_CLIENT_ID',
    !process.env.GITHUB_CLIENT_SECRET && 'GITHUB_CLIENT_SECRET',
    (process.env.SESSION_SECRET ?? '').length < 32 && 'SESSION_SECRET (at least 32 characters)',
    !process.env.OWNER_GITHUB && 'OWNER_GITHUB',
    (process.env.MUTHUR_PUBLISH_TOKEN ?? '').length < 32 && 'MUTHUR_PUBLISH_TOKEN (at least 32 characters)',
    !(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID) && 'BLOB_READ_WRITE_TOKEN or BLOB_STORE_ID',
  ].filter((value): value is string => typeof value === 'string');
  return json({ configured: missing.length === 0, missing, login: readSession(req) });
}
