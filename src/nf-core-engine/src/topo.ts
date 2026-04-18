// Kahn topological sort with full-cycle-chain detection.
// Input graph: node -> list of nodes it DEPENDS ON (edges from dependency to dependent during Kahn).

export class CycleError extends Error {
  chain: string[];
  constructor(chain: string[]) {
    super(`cycle detected: ${chain.join(' -> ')}`);
    this.name = 'CycleError';
    this.chain = chain;
  }
}

export interface UnknownRefError {
  kind: 'unknown-ref';
  from: string;
  missing: string;
}

/**
 * Kahn topological sort.
 * @param graph - map from node name to list of node names that this node DEPENDS ON.
 * @returns array of node names in order such that dependencies come before dependents.
 * @throws CycleError with the full cycle path (a -> b -> c -> a) if cyclic.
 */
export function topologicalOrder(graph: Record<string, string[]>): string[] {
  const nodes = Object.keys(graph);
  const nodeSet = new Set(nodes);
  const indeg = new Map<string, number>();
  for (const n of nodes) indeg.set(n, 0);

  // For Kahn we need reverse edges (dep -> dependent).
  const reverse = new Map<string, string[]>();
  for (const n of nodes) reverse.set(n, []);
  for (const [node, deps] of Object.entries(graph)) {
    for (const d of deps) {
      if (!nodeSet.has(d)) continue; // Unknown refs handled elsewhere.
      reverse.get(d)!.push(node);
      indeg.set(node, (indeg.get(node) ?? 0) + 1);
    }
  }

  const queue: string[] = [];
  for (const n of nodes) if ((indeg.get(n) ?? 0) === 0) queue.push(n);
  queue.sort(); // Stable output for identical input.

  const order: string[] = [];
  while (queue.length > 0) {
    const n = queue.shift()!;
    order.push(n);
    const nexts = (reverse.get(n) ?? []).slice().sort();
    for (const m of nexts) {
      const d = (indeg.get(m) ?? 0) - 1;
      indeg.set(m, d);
      if (d === 0) queue.push(m);
    }
  }

  if (order.length < nodes.length) {
    const remaining = nodes.filter(n => !order.includes(n));
    const chain = findCycleChain(graph, remaining);
    throw new CycleError(chain);
  }
  return order;
}

/** DFS within the remaining (cyclic) subgraph to produce a path like [a, b, c, a]. */
function findCycleChain(graph: Record<string, string[]>, remaining: string[]): string[] {
  const remSet = new Set(remaining);
  const start = remaining[0];
  if (start === undefined) return [];
  const stack: string[] = [];
  const onStack = new Set<string>();

  const dfs = (node: string): string[] | null => {
    stack.push(node);
    onStack.add(node);
    const deps = graph[node] ?? [];
    for (const dep of deps) {
      if (!remSet.has(dep)) continue;
      if (onStack.has(dep)) {
        // Found the back-edge. Slice the cycle portion, append dep to close.
        const idx = stack.indexOf(dep);
        return [...stack.slice(idx), dep];
      }
      const found = dfs(dep);
      if (found) return found;
    }
    stack.pop();
    onStack.delete(node);
    return null;
  };

  return dfs(start) ?? [start, start];
}
