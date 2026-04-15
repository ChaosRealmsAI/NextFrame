class Store {
  listeners: any;
  state: any;
  constructor(initial = {}) {
    this.state = Object.assign({}, initial);
    this.listeners = new Map();
  }

  get(key: any) {
    return this.state[key];
  }

  set(key: any, value: any) {
    if (this.state[key] === value) return;
    this.state[key] = value;
    const handlers = this.listeners.get(key);
    if (handlers) handlers.forEach((handler: any) => handler(value));
  }

  on(key: any, handler: any) {
    if (!this.listeners.has(key)) this.listeners.set(key, new Set());
    this.listeners.get(key).add(handler);
    return () => {
      const handlers = this.listeners.get(key);
      if (handlers) handlers.delete(handler);
    };
  }
}

window.Store = Store;
