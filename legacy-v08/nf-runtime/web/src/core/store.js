"use strict";
class Store {
    listeners;
    state;
    constructor(initial = {}) {
        this.state = Object.assign({}, initial);
        this.listeners = new Map();
    }
    get(key) {
        return this.state[key];
    }
    set(key, value) {
        if (this.state[key] === value)
            return;
        this.state[key] = value;
        const handlers = this.listeners.get(key);
        if (handlers)
            handlers.forEach((handler) => handler(value));
    }
    on(key, handler) {
        if (!this.listeners.has(key))
            this.listeners.set(key, new Set());
        this.listeners.get(key).add(handler);
        return () => {
            const handlers = this.listeners.get(key);
            if (handlers)
                handlers.delete(handler);
        };
    }
}
window.Store = Store;
