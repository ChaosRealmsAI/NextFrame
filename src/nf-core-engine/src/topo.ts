// Kahn topological sort over a dependency graph.
// edges[node] = list of nodes that `node` depends on (predecessors).
// Output order = dependencies resolved first, dependents last.

export class CyclicAnchors extends Error {
  constructor(public readonly cycle: string[]) {
    super(`cyclic anchors: ${cycle.join(" -> ")}`);
    this.name = "CyclicAnchors";
  }
}

export class UnknownRef extends Error {
  constructor(public readonly name: string, public readonly from?: string) {
    super(from ? `anchor "${from}" references unknown "${name}"` : `unknown reference "${name}"`);
    this.name = "UnknownRef";
  }
}

export interface TopoInput {
  nodes: string[];
  deps: Record<string, string[]>;
}

export function topoSort(input: TopoInput | string[], maybeDeps?: Record<string, string[]>): string[] {
  const nodes = Array.isArray(input) ? input : input.nodes;
  const deps = Array.isArray(input) ? (maybeDeps ?? {}) : input.deps;

  const nodeSet = new Set(nodes);
  for (const [k, ds] of Object.entries(deps)) {
    if (!nodeSet.has(k)) continue;
    for (const d of ds) {
      if (!nodeSet.has(d)) throw new UnknownRef(d, k);
    }
  }

  const indeg: Record<string, number> = {};
  for (const n of nodes) indeg[n] = 0;
  for (const n of nodes) {
    for (const d of deps[n] ?? []) {
      indeg[n] += 1;
      void d;
    }
  }

  const queue = nodes.filter((n) => indeg[n] === 0);
  const out: string[] = [];
  while (queue.length > 0) {
    const n = queue.shift() as string;
    out.push(n);
    for (const m of nodes) {
      if ((deps[m] ?? []).includes(n)) {
        indeg[m] -= 1;
        if (indeg[m] === 0) queue.push(m);
      }
    }
  }

  if (out.length !== nodes.length) {
    const remaining = nodes.filter((n) => !out.includes(n));
    throw new CyclicAnchors(findCycle(remaining, deps));
  }
  return out;
}

function findCycle(nodes: string[], deps: Record<string, string[]>): string[] {
  const stack: string[] = [];
  const onStack = new Set<string>();
  const visited = new Set<string>();
  let cycle: string[] | null = null;

  const dfs = (n: string): boolean => {
    if (cycle) return true;
    if (onStack.has(n)) {
      const idx = stack.indexOf(n);
      cycle = stack.slice(idx).concat(n);
      return true;
    }
    if (visited.has(n)) return false;
    visited.add(n);
    stack.push(n);
    onStack.add(n);
    for (const d of deps[n] ?? []) {
      if (nodes.includes(d) && dfs(d)) return true;
    }
    stack.pop();
    onStack.delete(n);
    return false;
  };

  for (const n of nodes) {
    if (dfs(n)) break;
  }
  return cycle ?? nodes;
}
