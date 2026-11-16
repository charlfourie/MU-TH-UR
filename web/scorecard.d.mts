type Actor = 'human' | 'copilot' | 'claude';

interface ActivityProject {
  activity: string;
}

interface ActorScore {
  rank: number;
  actor: Actor;
  count: number;
}

export function countActivityEntries(projects: ActivityProject[]): ActorScore[];
