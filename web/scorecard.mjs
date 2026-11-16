const ACTORS = ['human', 'copilot', 'claude'];

export function countActivityEntries(projects) {
  const counts = Object.fromEntries(ACTORS.map((actor) => [actor, 0]));

  for (const project of projects) {
    const entries = project.activity.matchAll(/^## [^\r\n]*\s—\s(human|copilot|claude)\s*$/gm);
    for (const entry of entries) counts[entry[1]] += 1;
  }

  const sorted = ACTORS
    .map((actor, order) => ({ actor, count: counts[actor], order }))
    .sort((a, b) => b.count - a.count || a.order - b.order);

  let rank = 0;
  let previousCount;
  return sorted.map(({ actor, count }, index) => {
    if (count !== previousCount) rank = index + 1;
    previousCount = count;
    return { rank, actor, count };
  });
}
