import { get, list } from '@vercel/blob';
import { json, requireOwner } from '../server/auth.js';

interface StoredProject {
  id: string;
  project: string;
  repository: string;
  repository_url: string | null;
  state: {
    status: string;
    updated_at: string;
    updated_by: string;
    summary: string;
    next_steps: string[];
  };
  activity: string;
  published_at: string;
}

async function mapLimit<T, R>(items: T[], concurrency: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const output = new Array<R>(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      output[index] = await fn(items[index]);
    }
  }));
  return output;
}

export async function GET(req: Request): Promise<Response> {
  const login = requireOwner(req);
  if (login instanceof Response) return login;

  const paths: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await list({ prefix: 'projects/', cursor, limit: 100 });
    paths.push(...page.blobs.map((blob) => blob.pathname));
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);

  const projects = (await mapLimit(paths, 8, async (pathname) => {
    const blob = await get(pathname, { access: 'private' });
    if (!blob || blob.statusCode !== 200) return null;
    return (await new Response(blob.stream).json()) as StoredProject;
  })).filter((project): project is StoredProject => project !== null);
  projects.sort((a, b) => b.state.updated_at.localeCompare(a.state.updated_at));
  return json({ projects });
}
