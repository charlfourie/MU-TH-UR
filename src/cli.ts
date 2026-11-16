#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { execFile as execFileCallback } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { findProjects, formatOverview, initializeProject, isActor, isStatus, logActivity, parseState, resolveProjectRoot, updateProject } from './store.js';

const execFile = promisify(execFileCallback);

type Output = (message: string) => void;

const HELP = `MU/TH/UR — local-first project handoffs

Usage:
  muthur init --actor <copilot|claude|human> [--name <name>] [--summary <text>]
  muthur update --actor <actor> [--status <active|paused|blocked|complete>]
                [--summary <text>] [--next <step> ...] [--clear-next]
  muthur log --actor <actor> --message <text>
  muthur overview [directory ...] [--depth <n>]
  muthur publish [--url <dashboard-url>]

All commands except overview run in the current repository (or its Git root).
Overview searches the given directories recursively; with no directories, it
searches the current directory. Publish reads MUTHUR_PUBLISH_TOKEN and
MUTHUR_URL from the environment. Repository state is stored in .muthur/.
`;

function parseOptions(args: string[]): { options: Map<string, string[]>; positionals: string[] } {
  const options = new Map<string, string[]>();
  const positionals: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg.startsWith('--')) {
      positionals.push(arg);
      continue;
    }
    const [name, inlineValue] = arg.slice(2).split(/=(.*)/s, 2);
    if (name === 'clear-next') {
      options.set(name, ['true']);
      continue;
    }
    const value = inlineValue ?? args[++i];
    if (value === undefined || value.startsWith('--')) throw new Error(`Option --${name} needs a value.`);
    const values = options.get(name) ?? [];
    values.push(value);
    options.set(name, values);
  }
  return { options, positionals };
}

function one(options: Map<string, string[]>, name: string): string | undefined {
  const values = options.get(name) ?? [];
  if (values.length > 1) throw new Error(`Option --${name} can only be used once.`);
  return values[0];
}

function assertKnownOptions(options: Map<string, string[]>, allowed: string[]): void {
  for (const name of options.keys()) if (!allowed.includes(name)) throw new Error(`Unknown option --${name}.`);
}

function actorOption(options: Map<string, string[]>): 'copilot' | 'claude' | 'human' {
  const actor = one(options, 'actor');
  if (!actor || !isActor(actor)) throw new Error('Specify --actor copilot, --actor claude, or --actor human.');
  return actor;
}

async function publishProject(root: string, dashboardUrl: string, token: string): Promise<void> {
  const state = parseState(await readFile(path.join(root, '.muthur', 'state.md'), 'utf8'));
  const activity = await readFile(path.join(root, '.muthur', 'activity.md'), 'utf8');
  let repositoryUrl: string | null = null;
  let repositoryIdentity: string | null = null;
  let repository = path.basename(root);
  try {
    const { stdout } = await execFile('git', ['remote', 'get-url', 'origin'], { cwd: root });
    const remote = stdout.trim();
    const ssh = remote.match(/^git@([^:]+):(.+)$/);
    if (ssh) {
      repositoryIdentity = `https://${ssh[1]}/${ssh[2]}`.replace(/\.git\/?$/, '').replace(/\/$/, '');
      repositoryUrl = repositoryIdentity;
      repository = ssh[2].replace(/\.git\/?$/, '').replace(/\/$/, '');
    } else {
      const parsed = new URL(remote);
      parsed.username = '';
      parsed.password = '';
      parsed.search = '';
      parsed.hash = '';
      repositoryIdentity = parsed.toString().replace(/\.git\/?$/, '').replace(/\/$/, '');
      if (parsed.protocol === 'https:') repositoryUrl = repositoryIdentity;
      repository = parsed.pathname.replace(/\.git\/?$/, '').replace(/^\/|\/$/g, '') || repository;
    }
  } catch (error) {
    const code = (error as { code?: string | number }).code;
    if (code !== 'ENOENT' && code !== 2 && code !== 128) throw error;
  }

  const id = createHash('sha256').update(repositoryIdentity ?? path.resolve(root)).digest('hex');
  const endpoint = new URL('/api/publish', dashboardUrl);
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ id, project: state.project, repository, repository_url: repositoryUrl, state, activity }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    const result = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(result?.error ?? `Publish failed with HTTP ${response.status}`);
  }
}

export async function runCli(args: string[], cwd: string, write: Output, writeError: Output): Promise<number> {
  try {
    const [command = 'help', ...rest] = args;
    if (command === 'help' || command === '--help' || command === '-h') {
      write(HELP);
      return 0;
    }
    if (command === 'init') {
      const { options, positionals } = parseOptions(rest);
      assertKnownOptions(options, ['actor', 'name', 'summary']);
      if (positionals.length) throw new Error(`Unexpected argument: ${positionals[0]}`);
      const actor = actorOption(options);
      const root = await resolveProjectRoot(cwd);
      const name = one(options, 'name') ?? path.basename(root);
      if (!name.trim()) throw new Error('Project name cannot be empty.');
      const state = await initializeProject(root, actor, name.trim(), one(options, 'summary') ?? '');
      write(`Initialized ${state.project} in ${path.join(root, '.muthur')}`);
      return 0;
    }
    if (command === 'update') {
      const { options, positionals } = parseOptions(rest);
      assertKnownOptions(options, ['actor', 'status', 'summary', 'next', 'clear-next']);
      if (positionals.length) throw new Error(`Unexpected argument: ${positionals[0]}`);
      const actor = actorOption(options);
      const status = one(options, 'status');
      if (status !== undefined && !isStatus(status)) throw new Error(`Invalid status "${status}". Use active, paused, blocked, or complete.`);
      const summary = one(options, 'summary');
      const root = await resolveProjectRoot(cwd);
      const state = await updateProject(root, actor, {
        status,
        summary,
        addNext: options.get('next'),
        clearNext: options.has('clear-next'),
      });
      write(`Updated ${state.project} (${state.status}) as ${actor}.`);
      return 0;
    }
    if (command === 'log') {
      const { options, positionals } = parseOptions(rest);
      assertKnownOptions(options, ['actor', 'message']);
      if (positionals.length) throw new Error(`Unexpected argument: ${positionals[0]}`);
      const actor = actorOption(options);
      const message = one(options, 'message');
      if (!message?.trim()) throw new Error('Specify a non-empty --message.');
      const root = await resolveProjectRoot(cwd);
      await logActivity(root, actor, message.trim());
      write(`Logged activity as ${actor}.`);
      return 0;
    }
    if (command === 'publish') {
      const { options, positionals } = parseOptions(rest);
      assertKnownOptions(options, ['url']);
      if (positionals.length) throw new Error(`Unexpected argument: ${positionals[0]}`);
      const dashboardUrl = one(options, 'url') ?? process.env.MUTHUR_URL;
      const token = process.env.MUTHUR_PUBLISH_TOKEN;
      if (!dashboardUrl) throw new Error('Set MUTHUR_URL or pass --url with your dashboard URL.');
      if (!token || token.length < 32) throw new Error('Set MUTHUR_PUBLISH_TOKEN to the publish token configured on Vercel.');
      const target = new URL(dashboardUrl);
      if (target.protocol !== 'https:' && target.hostname !== 'localhost' && target.hostname !== '127.0.0.1') {
        throw new Error('Dashboard URL must use HTTPS (HTTP is allowed for localhost).');
      }
      const root = await resolveProjectRoot(cwd);
      await publishProject(root, target.origin, token);
      write(`Published ${path.basename(root)} to ${target.origin}.`);
      return 0;
    }
    if (command === 'overview') {
      const { options, positionals } = parseOptions(rest);
      assertKnownOptions(options, ['depth']);
      const depthOption = one(options, 'depth');
      const depth = depthOption === undefined ? 5 : Number(depthOption);
      if (!Number.isInteger(depth) || depth < 0 || depth > 20) throw new Error('--depth must be an integer from 0 to 20.');
      const roots = positionals.length ? positionals.map((root) => path.resolve(cwd, root)) : [cwd];
      write(formatOverview(await findProjects(roots, depth)));
      return 0;
    }
    throw new Error(`Unknown command "${command}". Run "muthur help" for usage.`);
  } catch (error) {
    writeError(`Error: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  process.exitCode = await runCli(process.argv.slice(2), process.cwd(), console.log, console.error);
}
