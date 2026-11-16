import { access, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const ACTORS = ['copilot', 'claude', 'human'] as const;
export type Actor = (typeof ACTORS)[number];
export const STATUSES = ['active', 'paused', 'blocked', 'complete'] as const;
export type ProjectStatus = (typeof STATUSES)[number];

export interface ProjectState {
  project: string;
  status: ProjectStatus;
  updated_at: string;
  updated_by: Actor;
  summary: string;
  next_steps: string[];
}

export const MUTHUR_DIR = '.muthur';
const STATE_FILE = 'state.md';
const ACTIVITY_FILE = 'activity.md';
const EXCLUDED_DIRS = new Set(['.git', 'node_modules', 'dist', 'build', 'coverage', '.next', '.venv', 'venv']);

export function isActor(value: string): value is Actor {
  return (ACTORS as readonly string[]).includes(value);
}

export function isStatus(value: string): value is ProjectStatus {
  return (STATUSES as readonly string[]).includes(value);
}

function stateMarkdown(state: ProjectState): string {
  const frontmatter = [
    '---',
    'schema: 1',
    `project: ${JSON.stringify(state.project)}`,
    `status: ${JSON.stringify(state.status)}`,
    `updated_at: ${JSON.stringify(state.updated_at)}`,
    `updated_by: ${JSON.stringify(state.updated_by)}`,
    `summary: ${JSON.stringify(state.summary)}`,
    'next_steps:',
    ...(state.next_steps.length ? state.next_steps.map((step) => `  - ${JSON.stringify(step)}`) : ['  []']),
    '---',
  ].join('\n');
  const steps = state.next_steps.length ? state.next_steps.map((step) => `- ${step}`).join('\n') : '_No next steps recorded._';
  return `${frontmatter}\n\n# ${state.project}\n\n**Status:** ${state.status}  \n**Updated:** ${state.updated_at} by **${state.updated_by}**\n\n## Current state\n\n${state.summary || '_No summary recorded._'}\n\n## Next steps\n\n${steps}\n`;
}

export function parseState(markdown: string): ProjectState {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) throw new Error('Missing YAML front matter in .muthur/state.md');

  const fields = new Map<string, string>();
  const steps: string[] = [];
  let readingSteps = false;
  for (const line of match[1].split(/\r?\n/)) {
    if (/^next_steps:\s*$/.test(line)) {
      readingSteps = true;
      continue;
    }
    if (readingSteps && /^\s+-\s+/.test(line)) {
      const value = line.replace(/^\s+-\s+/, '');
      if (value !== '[]') steps.push(parseYamlString(value, 'next_steps'));
      continue;
    }
    readingSteps = false;
    const field = line.match(/^([a-z_]+):\s*(.*)$/);
    if (field) fields.set(field[1], field[2]);
  }

  const getString = (name: string): string => parseYamlString(fields.get(name) ?? '', name);
  const project = getString('project');
  const status = getString('status');
  const updatedBy = getString('updated_by');
  const updatedAt = getString('updated_at');
  const summary = getString('summary');
  if (fields.get('schema') !== '1') throw new Error('Unsupported .muthur state schema');
  if (!project || !isStatus(status) || !isActor(updatedBy) || !updatedAt) throw new Error('Invalid .muthur state metadata');
  return { project, status, updated_at: updatedAt, updated_by: updatedBy, summary, next_steps: steps };
}

function parseYamlString(value: string, field: string): string {
  try {
    const parsed: unknown = JSON.parse(value);
    if (typeof parsed !== 'string') throw new Error();
    return parsed;
  } catch {
    throw new Error(`Invalid ${field} value in .muthur/state.md`);
  }
}

export async function resolveProjectRoot(cwd: string): Promise<string> {
  try {
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const run = promisify(execFile);
    const { stdout } = await run('git', ['rev-parse', '--show-toplevel'], { cwd });
    return path.resolve(stdout.trim());
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return path.resolve(cwd);
    const code = (error as { code?: number }).code;
    if (code === 128) return path.resolve(cwd);
    throw error;
  }
}

export async function initializeProject(root: string, actor: Actor, name: string, summary = ''): Promise<ProjectState> {
  const directory = path.join(root, MUTHUR_DIR);
  try {
    await access(directory);
    throw new Error(`Already initialized: ${directory}`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }

  const now = new Date().toISOString();
  const state: ProjectState = { project: name, status: 'active', updated_at: now, updated_by: actor, summary, next_steps: [] };
  await mkdir(directory, { recursive: false });
  await writeFile(path.join(directory, STATE_FILE), stateMarkdown(state), { flag: 'wx' });
  await writeFile(path.join(directory, ACTIVITY_FILE), `# Activity\n\n## ${now} — ${actor}\n\nInitialized project handoff.\n`, { flag: 'wx' });
  return state;
}

export async function updateProject(root: string, actor: Actor, changes: { status?: ProjectStatus; summary?: string; addNext?: string[]; clearNext?: boolean }): Promise<ProjectState> {
  const directory = path.join(root, MUTHUR_DIR);
  const statePath = path.join(directory, STATE_FILE);
  const activityPath = path.join(directory, ACTIVITY_FILE);
  const current = parseState(await readFile(statePath, 'utf8'));
  const nextSteps = changes.clearNext ? [] : [...current.next_steps];
  nextSteps.push(...(changes.addNext ?? []));
  const updated: ProjectState = {
    ...current,
    status: changes.status ?? current.status,
    summary: changes.summary ?? current.summary,
    next_steps: nextSteps,
    updated_at: new Date().toISOString(),
    updated_by: actor,
  };
  const changesMade = [
    changes.status ? `Status: ${current.status} → ${updated.status}` : '',
    changes.summary !== undefined ? 'Updated current state summary.' : '',
    changes.clearNext ? 'Cleared next steps.' : '',
    ...(changes.addNext ?? []).map((step) => `Next: ${step}`),
  ].filter(Boolean);
  if (!changesMade.length) throw new Error('No changes specified.');

  await writeFile(statePath, stateMarkdown(updated));
  await appendActivity(activityPath, updated.updated_at, actor, changesMade);
  return updated;
}

export async function logActivity(root: string, actor: Actor, message: string): Promise<void> {
  const directory = path.join(root, MUTHUR_DIR);
  await access(path.join(directory, STATE_FILE));
  await appendActivity(path.join(directory, ACTIVITY_FILE), new Date().toISOString(), actor, [message]);
}

async function appendActivity(file: string, timestamp: string, actor: Actor, lines: string[]): Promise<void> {
  try {
    await access(file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    await writeFile(file, '# Activity\n', { flag: 'wx' });
  }
  const entry = `\n## ${timestamp} — ${actor}\n\n${lines.map((line) => `- ${line.replace(/\r?\n/g, ' ').trim()}`).join('\n')}\n`;
  await writeFile(file, entry, { flag: 'a' });
}

export interface OverviewItem {
  root: string;
  state: ProjectState;
}

export async function findProjects(roots: string[], maxDepth = 5): Promise<OverviewItem[]> {
  const found: OverviewItem[] = [];
  const visited = new Set<string>();

  async function walk(directory: string, depth: number): Promise<void> {
    const absolute = path.resolve(directory);
    if (visited.has(absolute)) return;
    visited.add(absolute);
    try {
      const statePath = path.join(absolute, MUTHUR_DIR, STATE_FILE);
      const contents = await readFile(statePath, 'utf8');
      found.push({ root: absolute, state: parseState(contents) });
      return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    if (depth >= maxDepth) return;

    let entries;
    try {
      entries = await readdir(absolute, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EACCES') return;
      throw error;
    }
    for (const entry of entries) {
      if (entry.isDirectory() && !EXCLUDED_DIRS.has(entry.name)) await walk(path.join(absolute, entry.name), depth + 1);
    }
  }

  for (const root of roots) await walk(root, 0);
  return found.sort((a, b) => a.state.project.localeCompare(b.state.project));
}

export function formatOverview(items: OverviewItem[]): string {
  if (!items.length) return 'No MU/TH/UR projects found.';
  const rows = [
    '| Project | Repository | Status | Updated by | Updated at | Current state | Next steps |',
    '|---|---|---|---|---|---|---|',
    ...items.map(({ root, state }) => [
      state.project,
      root,
      state.status,
      state.updated_by,
      state.updated_at,
      state.summary || '—',
      state.next_steps.join('; ') || '—',
    ].map((cell) => cell.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ')).join(' | ')).map((row) => `| ${row} |`),
  ];
  return rows.join('\n');
}
