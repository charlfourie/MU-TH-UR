import './style.css';
import { countActivityEntries } from './scorecard.mjs';

interface Project {
  id: string;
  project: string;
  repository: string;
  repository_url: string | null;
  state: {
    status: 'active' | 'paused' | 'blocked' | 'complete';
    updated_at: string;
    updated_by: 'copilot' | 'claude' | 'human';
    summary: string;
    next_steps: string[];
  };
  activity: string;
  published_at: string;
}

const app = document.querySelector<HTMLElement>('#content')!;
const account = document.querySelector<HTMLElement>('#account')!;
const signedInMarker = new URLSearchParams(location.search).get('signed-in');
const errorCode = new URLSearchParams(location.search).get('error');
if (signedInMarker || errorCode) history.replaceState(null, '', location.pathname);

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function dateLabel(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function showMessage(title: string, detail: string, action?: { label: string; href: string }): void {
  app.replaceChildren();
  const panel = element('div', 'empty-panel');
  panel.append(element('h2', '', title), element('p', '', detail));
  if (action) {
    const link = element('a', 'button', action.label);
    link.href = action.href;
    panel.append(link);
  }
  app.append(panel);
}

function renderProject(project: Project): HTMLElement {
  const card = element('article', `project-card status-${project.state.status}`);
  const top = element('div', 'project-top');
  const projectHeading = element('div', 'project-heading');
  projectHeading.append(element('h2', '', project.project), element('p', 'repo-name', project.repository));
  const badge = element('span', `status-badge ${project.state.status}`, project.state.status);
  top.append(projectHeading, badge);
  card.append(top);

  const summary = element('p', 'summary', project.state.summary || 'No current-state summary yet.');
  card.append(summary);

  if (project.state.next_steps.length) {
    const next = element('section', 'next-steps');
    next.append(element('h3', '', 'UP NEXT'));
    const list = element('ul');
    project.state.next_steps.forEach((step) => list.append(element('li', '', step)));
    next.append(list);
    card.append(next);
  }

  const activity = element('details', 'activity');
  activity.append(element('summary', '', 'Recent work'));
  const log = element('pre', 'activity-log');
  log.textContent = project.activity.split(/\r?\n/).slice(-32).join('\n').trim() || 'No activity recorded.';
  activity.append(log);
  card.append(activity);

  const footer = element('div', 'card-footer');
  footer.append(element('span', '', `Updated ${dateLabel(project.state.updated_at)} by ${project.state.updated_by}`));
  if (project.repository_url && /^https:\/\/[^ ]+$/.test(project.repository_url)) {
    const repoLink = element('a', 'repo-link', 'Open repository ↗');
    repoLink.href = project.repository_url;
    repoLink.target = '_blank';
    repoLink.rel = 'noopener noreferrer';
    footer.append(repoLink);
  }
  card.append(footer);
  return card;
}

function renderScorecard(projects: Project[]): HTMLElement {
  const counts = countActivityEntries(projects);
  const maxCount = Math.max(1, counts[0].count);
  const section = element('section', 'scorecard');
  section.setAttribute('aria-labelledby', 'scorecard-title');

  const heading = element('div', 'scorecard-heading');
  const title = element('h2', '', 'Recorded contributions');
  title.id = 'scorecard-title';
  heading.append(
    element('div', 'scorecard-eyebrow', 'CREW SCORECARD'),
    title,
    element('p', '', 'Activity entries across published projects; self-reported, not a source-control diff.'),
  );
  section.append(heading);

  const list = element('ol', 'scorecard-list');
  for (const item of counts) {
    const row = element('li', `scorecard-item${item.rank === 1 && item.count > 0 ? ' leading' : ''}`);
    const identity = element('div', 'scorecard-identity');
    identity.append(
      element('span', 'scorecard-rank', String(item.rank).padStart(2, '0')),
      element('h3', '', item.actor),
    );
    const total = element('strong', 'scorecard-count', String(item.count));
    total.setAttribute('aria-label', `${item.count} activity ${item.count === 1 ? 'entry' : 'entries'}`);
    const progress = document.createElement('progress');
    progress.max = maxCount;
    progress.value = item.count;
    progress.setAttribute('aria-label', `${item.actor}: ${item.count} activity ${item.count === 1 ? 'entry' : 'entries'}`);
    row.append(identity, total, progress);
    list.append(row);
  }
  section.append(list);
  return section;
}

async function load(): Promise<void> {
  const meResponse = await fetch('/api/me', { credentials: 'same-origin', cache: 'no-store' });
  if (!meResponse.ok) throw new Error(`Could not check sign-in status (HTTP ${meResponse.status})`);
  const me = await meResponse.json() as { configured: boolean; missing: string[]; login: string | null };
  if (!me.configured) {
    account.replaceChildren();
    showMessage('Dashboard setup needed', 'Finish the Vercel environment configuration described in the README, then redeploy.');
    return;
  }
  if (!me.login) {
    account.replaceChildren();
    const login = element('a', 'button', 'Sign in with GitHub');
    login.href = '/api/auth/login';
    account.append(login);
    if (errorCode) {
      const messages: Record<string, string> = {
        denied: 'This GitHub account is not allowed to view the dashboard.',
        'oauth-state': 'Sign-in expired or could not be verified. Please try again.',
        'github-auth': 'GitHub sign-in failed. Please try again.',
        'not-configured': 'Dashboard sign-in is not configured yet.',
      };
      showMessage('Private dashboard', messages[errorCode] ?? 'Sign in to view your projects.', { label: 'Sign in with GitHub', href: '/api/auth/login' });
    } else {
      showMessage('Private dashboard', 'Sign in with your configured GitHub account to see your project handoffs.', { label: 'Sign in with GitHub', href: '/api/auth/login' });
    }
    return;
  }

  account.replaceChildren();
  const user = element('span', 'account-name', `Signed in as ${me.login}`);
  const refresh = element('button', 'text-button', 'Refresh');
  refresh.type = 'button';
  refresh.addEventListener('click', () => void loadProjects());
  const logout = element('button', 'text-button', 'Sign out');
  logout.type = 'button';
  logout.addEventListener('click', async () => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
    location.reload();
  });
  account.append(user, refresh, logout);
  await loadProjects();
}

async function loadProjects(): Promise<void> {
  app.replaceChildren(element('div', 'loading', 'Loading published projects…'));
  try {
    const response = await fetch('/api/projects', { credentials: 'same-origin', cache: 'no-store' });
    if (response.status === 401) {
      location.reload();
      return;
    }
    if (!response.ok) throw new Error(`Could not load projects (HTTP ${response.status})`);
    const data = await response.json() as { projects: Project[] };
    app.replaceChildren();
    const heading = element('div', 'section-heading');
    heading.append(element('div', '', `${data.projects.length} published ${data.projects.length === 1 ? 'project' : 'projects'}`));
    app.append(heading);
    if (!data.projects.length) {
      showMessage('Nothing published yet', 'From a repository with a .muthur/ handoff, run muthur publish to send its latest snapshot here.');
      return;
    }
    app.append(renderScorecard(data.projects));
    const grid = element('div', 'project-grid');
    data.projects.forEach((project) => grid.append(renderProject(project)));
    app.append(grid);
  } catch (error) {
    showMessage('Could not load projects', error instanceof Error ? error.message : String(error));
  }
}

void load().catch((error: unknown) => showMessage('Dashboard unavailable', error instanceof Error ? error.message : String(error)));
