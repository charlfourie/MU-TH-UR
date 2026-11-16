import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const guidelinesUrl = new URL('../dist/guidelines.html', import.meta.url);

test('public crew guidelines are built as an accessible, private-data-free page', async () => {
  const html = await readFile(guidelinesUrl, 'utf8');

  assert.match(html, /Crew guidelines/i);
  assert.match(html, /The dashboard is the handoff authority/i);
  assert.match(html, /Publish and verify the handoff/i);
  assert.match(html, /Protect private data and credentials/i);
  assert.match(html, /href="\/demo\.html"/);
  assert.doesNotMatch(html, /\/api\//i);
  assert.doesNotMatch(html, /<script\b/i);
  assert.doesNotMatch(html, /Escapement|charl\.space/i);
});
