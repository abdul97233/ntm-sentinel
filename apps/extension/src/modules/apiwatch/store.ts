/**
 * In-memory request store for one DevTools panel instance. FIFO-capped.
 * Nothing is persisted or transmitted.
 */
import type { ApiRequest } from './types';

export class RequestStore {
  private items: ApiRequest[] = [];
  private listeners = new Set<() => void>();
  /** Total requests ever observed (including evicted), for the Overview counter. */
  observed = 0;

  constructor(private max: number) {}

  setMax(max: number) {
    this.max = Math.max(1, max);
    this.trim();
    this.notify();
  }

  get maxRequests() {
    return this.max;
  }

  add(req: ApiRequest) {
    this.items.push(req);
    this.observed++;
    this.trim();
    this.notify();
  }

  addMany(reqs: ApiRequest[]) {
    if (!reqs.length) return;
    this.items.push(...reqs);
    this.observed += reqs.length;
    this.trim();
    this.notify();
  }

  clear() {
    this.items = [];
    this.observed = 0;
    this.notify();
  }

  all(): readonly ApiRequest[] {
    return this.items;
  }

  get(id: string): ApiRequest | undefined {
    return this.items.find((r) => r.id === id);
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private trim() {
    if (this.items.length > this.max) this.items = this.items.slice(this.items.length - this.max);
  }

  private notify() {
    // New array identity per change so React's useSyncExternalStore picks it up.
    this.items = this.items.slice();
    for (const l of this.listeners) l();
  }
}
