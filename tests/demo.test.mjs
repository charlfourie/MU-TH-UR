import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const demoUrl = new URL('../dist/demo.html', import.meta.url);

test('public demo is clearly fictional and does not load private dashboard data', async () => {
  const html = await readFile(demoUrl, 'utf8');

  assert.match(html, /PUBLIC DEMO/);
  assert.match(html, /fictional sample data/i);
  assert.match(html, /Kestrel Atlas/);
  assert.match(html, /Quiet Current/);
  assert.doesNotMatch(html, /\/api\//i);
  assert.doesNotMatch(html, /<script\b/i);
  assert.doesNotMatch(html, /mu-th-ur\.vercel\.app/i);
  assert.doesNotMatch(html, /Escapement|charl\.space/i);
});
