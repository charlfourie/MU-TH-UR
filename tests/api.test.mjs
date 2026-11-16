import assert from 'node:assert/strict';
import { test } from 'node:test';
import { POST as publish } from '../build/api/api/publish.js';
import { GET as me } from '../build/api/api/me.js';

test('publish API rejects unauthenticated and malformed snapshots', async () => {
  process.env.MUTHUR_PUBLISH_TOKEN = 'p'.repeat(48);
  const unauthenticated = await publish(new Request('https://muthur.example/api/publish', {
    method: 'POST',
    body: '{}',
  }));
  assert.equal(unauthenticated.status, 401);

  const malformed = await publish(new Request('https://muthur.example/api/publish', {
    method: 'POST',
    headers: { authorization: `Bearer ${process.env.MUTHUR_PUBLISH_TOKEN}` },
    body: 'null',
  }));
  assert.equal(malformed.status, 400);
});

test('dashboard API does not expose a project list to signed-out visitors', async () => {
  process.env.SESSION_SECRET = 's'.repeat(48);
  process.env.OWNER_GITHUB = 'owner';
  const response = await (await import('../build/api/api/projects.js')).GET(new Request('https://muthur.example/api/projects'));
  assert.equal(response.status, 401);
});

test('health endpoint reports setup without revealing credentials', async () => {
  const response = await me(new Request('https://muthur.example/api/me'));
  const body = await response.json();
  assert.equal(body.configured, false);
  assert.equal(body.login, null);
  assert.equal(JSON.stringify(body).includes(process.env.MUTHUR_PUBLISH_TOKEN), false);
});

test('health endpoint accepts a Vercel-linked Blob store ID without a read-write token', async () => {
  const keys = ['GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET', 'SESSION_SECRET', 'OWNER_GITHUB', 'MUTHUR_PUBLISH_TOKEN', 'BLOB_READ_WRITE_TOKEN', 'BLOB_STORE_ID'];
  const previous = new Map(keys.map((key) => [key, process.env[key]]));
  Object.assign(process.env, {
    GITHUB_CLIENT_ID: 'client',
    GITHUB_CLIENT_SECRET: 'secret',
    SESSION_SECRET: 's'.repeat(48),
    OWNER_GITHUB: 'owner',
    MUTHUR_PUBLISH_TOKEN: 'p'.repeat(48),
    BLOB_STORE_ID: 'store-id',
  });
  delete process.env.BLOB_READ_WRITE_TOKEN;
  try {
    const body = await (await me(new Request('https://muthur.example/api/me'))).json();
    assert.equal(body.configured, true);
    assert.equal(body.missing.length, 0);
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test('GitHub sign-in checks OAuth state and restricts access to the configured owner', async () => {
  process.env.GITHUB_CLIENT_ID = 'client';
  process.env.GITHUB_CLIENT_SECRET = 'secret';
  process.env.SESSION_SECRET = 's'.repeat(48);
  process.env.OWNER_GITHUB = 'owner';
  const { GET: login } = await import('../build/api/api/auth/login.js');
  const { GET: callback } = await import('../build/api/api/auth/callback.js');
  const started = login(new Request('https://muthur.example/api/auth/login'));
  const authorizationUrl = new URL(started.headers.get('location'));
  const state = authorizationUrl.searchParams.get('state');
  const stateCookie = started.headers.get('set-cookie').split(';')[0];

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => new Response(JSON.stringify(
    String(url).includes('access_token') ? { access_token: 'oauth-token' } : { login: 'owner' },
  ));
  try {
    const valid = await callback(new Request(`https://muthur.example/api/auth/callback?code=ok&state=${state}`, {
      headers: { cookie: stateCookie },
    }));
    assert.equal(valid.headers.get('location'), 'https://muthur.example/?signed-in=1');
    assert.ok(valid.headers.getSetCookie().some((cookie) => cookie.startsWith('muthur_session=')));

    const invalid = await callback(new Request(`https://muthur.example/api/auth/callback?code=ok&state=wrong`, {
      headers: { cookie: stateCookie },
    }));
    assert.equal(invalid.headers.get('location'), 'https://muthur.example/?error=oauth-state');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
