import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, test } from 'node:test';
import { runCli } from '../build/cli/cli.js';
import { parseState } from '../build/cli/store.js';

const tempDirs = [];

async function tempDir() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'muthur-test-'));
  tempDirs.push(directory);
  return directory;
}

async function run(args, cwd) {
  const output = [];
  const errors = [];
  const code = await runCli(args, cwd, (line) => output.push(line), (line) => errors.push(line));
  return { code, output: output.join('\n'), errors: errors.join('\n') };
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

test('init and update create attributed, readable state and activity', async () => {
  const root = await tempDir();
  assert.equal((await run(['init', '--actor', 'human', '--name', 'Demo', '--summary', 'First handoff'], root)).code, 0);
  assert.equal((await run(['update', '--actor', 'copilot', '--status', 'blocked', '--summary', 'Waiting on API', '--next', 'Ask Claude to review'], root)).code, 0);

  const stateMarkdown = await readFile(path.join(root, '.muthur', 'state.md'), 'utf8');
  const state = parseState(stateMarkdown);
  assert.equal(state.project, 'Demo');
  assert.equal(state.status, 'blocked');
  assert.equal(state.updated_by, 'copilot');
  assert.equal(state.summary, 'Waiting on API');
  assert.deepEqual(state.next_steps, ['Ask Claude to review']);

  const activity = await readFile(path.join(root, '.muthur', 'activity.md'), 'utf8');
  assert.match(activity, /— human/);
  assert.match(activity, /— copilot/);
});

test('init refuses to overwrite an existing handoff', async () => {
  const root = await tempDir();
  await run(['init', '--actor', 'human'], root);
  const result = await run(['init', '--actor', 'claude'], root);
  assert.equal(result.code, 1);
  assert.match(result.errors, /Already initialized/);
});

test('overview aggregates nested project handoffs', async () => {
  const root = await tempDir();
  const repo = path.join(root, 'nested', 'repo');
  await mkdir(repo, { recursive: true });
  await run(['init', '--actor', 'claude', '--name', 'Nested project', '--summary', 'In progress'], repo);

  const result = await run(['overview', root], root);
  assert.equal(result.code, 0);
  assert.match(result.output, /Nested project/);
  assert.ok(result.output.includes(repo));
  assert.match(result.output, /claude/);
  assert.match(result.output, /In progress/);
});

test('activity log keeps multiline messages from spoofing attribution headings', async () => {
  const root = await tempDir();
  await run(['init', '--actor', 'human'], root);
  await run(['log', '--actor', 'copilot', '--message', 'Reviewed changes\n## spoofed — claude'], root);
  const activity = await readFile(path.join(root, '.muthur', 'activity.md'), 'utf8');
  assert.match(activity, /— copilot/);
  assert.doesNotMatch(activity, /\n## spoofed — claude/);
  assert.match(activity, /Reviewed changes ## spoofed — claude/);
});

test('publish sends the local snapshot using the configured token', async () => {
  const root = await tempDir();
  await run(['init', '--actor', 'human', '--name', 'Publish test'], root);
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.MUTHUR_URL;
  const originalToken = process.env.MUTHUR_PUBLISH_TOKEN;
  let request;
  process.env.MUTHUR_URL = 'http://localhost:3000';
  process.env.MUTHUR_PUBLISH_TOKEN = 't'.repeat(48);
  globalThis.fetch = async (input, init) => {
    request = { url: String(input), init };
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };
  try {
    const result = await run(['publish'], root);
    assert.equal(result.code, 0);
    assert.equal(request.url, 'http://localhost:3000/api/publish');
    assert.equal(request.init.headers.authorization, `Bearer ${'t'.repeat(48)}`);
    const snapshot = JSON.parse(request.init.body);
    assert.equal(snapshot.project, 'Publish test');
    assert.equal(snapshot.state.updated_by, 'human');
    assert.match(snapshot.id, /^[a-f0-9]{64}$/);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.MUTHUR_URL;
    else process.env.MUTHUR_URL = originalUrl;
    if (originalToken === undefined) delete process.env.MUTHUR_PUBLISH_TOKEN;
    else process.env.MUTHUR_PUBLISH_TOKEN = originalToken;
  }
});

test('every update and activity log requires a known actor', async () => {
  const root = await tempDir();
  await run(['init', '--actor', 'human'], root);
  assert.equal((await run(['update', '--summary', 'Unattributed'], root)).code, 1);
  assert.equal((await run(['log', '--actor', 'gemini', '--message', 'Changed something'], root)).code, 1);
});
