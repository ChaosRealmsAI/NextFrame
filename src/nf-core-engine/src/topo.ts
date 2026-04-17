// Kahn topological sort. Walking stub: returns input order (no deps extracted yet).

export function topoSort(nodes: string[], edges: Record<string, string[]> = {}): string[] {
  const indeg: Record<string, number> = Object.fromEntries(nodes.map((n) => [n, 0]));
  for (const key of Object.keys(edges)) {
    for (const dep of edges[key] ?? []) {
      if (indeg[dep] !== undefined) indeg[dep] += 1;
    }
  }
  const queue = nodes.filter((n) => indeg[n] === 0);
  const out: string[] = [];
  while (queue.length > 0) {
    const n = queue.shift() as string;
    out.push(n);
    for (const next of edges[n] ?? []) {
      if (indeg[next] === undefined) continue;
      indeg[next] -= 1;
      if (indeg[next] === 0) queue.push(next);
    }
  }
  return out.length === nodes.length ? out : nodes;
}
