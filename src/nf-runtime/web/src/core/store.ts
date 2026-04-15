class Store {
  listeners: Map<string, Set<(value: unknown) => void>>;
  state: Record<string, unknown>;
  constructor(initial: Record<string, unknown> = {}) {
    this.state = Object.assign({}, initial);
    this.listeners = new Map();
  }

  get(key: string): unknown {
    return this.state[key];
  }

  set(key: string, value: unknown): void {
    if (this.state[key] === value) return;
    this.state[key] = value;
    const handlers = this.listeners.get(key);
    if (handlers) handlers.forEach((handler: (value: unknown) => void) => handler(value));
  }

  on(key: string, handler: (value: unknown) => void): () => void {
    if (!this.listeners.has(key)) this.listeners.set(key, new Set());
    this.listeners.get(key)!.add(handler);
    return () => {
      const handlers = this.listeners.get(key);
      if (handlers) handlers.delete(handler);
    };
  }
}

window.Store = Store;
