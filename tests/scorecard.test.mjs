import assert from 'node:assert/strict';
import { test } from 'node:test';
import { countActivityEntries } from '../web/scorecard.mjs';

test('scorecard counts actor-stamped activity entries across projects and ranks the most first', () => {
  const projects = [
    { activity: '# Activity\n\n## 2026-01-03 — claude\n\n- One\n\n## 2026-01-02 — copilot\n\n- Two\n' },
    { activity: '# Activity\n\n## 2026-01-01 — copilot\n\n- Three\n' },
  ];

  assert.deepEqual(countActivityEntries(projects), [
    { rank: 1, actor: 'copilot', count: 2 },
    { rank: 2, actor: 'claude', count: 1 },
    { rank: 3, actor: 'human', count: 0 },
  ]);
});

test('scorecard ignores body mentions and unknown actors and handles empty activity', () => {
  assert.deepEqual(countActivityEntries([
    { activity: '# Activity\n\n- claude did work\n\n## 2026-01-01 — gemini\n\n- Unknown actor\n' },
  ]), [
    { rank: 1, actor: 'human', count: 0 },
    { rank: 1, actor: 'copilot', count: 0 },
    { rank: 1, actor: 'claude', count: 0 },
  ]);
});

test('scorecard assigns equal ranks to ties', () => {
  const scores = countActivityEntries([
    { activity: '## 2026-01-01 — human\n\n- One\n' },
    { activity: '## 2026-01-02 — copilot\n\n- Two\n' },
  ]);

  assert.deepEqual(scores, [
    { rank: 1, actor: 'human', count: 1 },
    { rank: 1, actor: 'copilot', count: 1 },
    { rank: 3, actor: 'claude', count: 0 },
  ]);
});
