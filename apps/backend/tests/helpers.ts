import { createApp } from '../src/app';
import type { AppDeps } from '../src/app';
import type { Env, KVLike } from '../src/types/env';
import { MemorySignatureRepository } from '../src/database/signatures-repo';
import { MockProvider } from '../src/providers';

export class FakeKV implements KVLike {
  store = new Map<string, string>();
  puts: { key: string; ttl?: number }[] = [];
  async get(key: string, type?: 'json'): Promise<any> {
    const v = this.store.get(key);
    if (v === undefined) return null;
    return type === 'json' ? JSON.parse(v) : v;
  }
  async put(key: string, value: string, options?: { expirationTtl?: number }) {
    this.store.set(key, value);
    this.puts.push({ key, ttl: options?.expirationTtl });
  }
}

export class CountingLimiter {
  calls = 0;
  constructor(private readonly max: number) {}
  async limit() {
    this.calls++;
    return { success: this.calls <= this.max };
  }
}

export const ADMIN_TOKEN = 'a'.repeat(40);
export const EXT_ORIGIN = 'chrome-extension://abcdefghijklmnopabcdefghijklmnop';

export function setup(opts: { env?: Partial<Env>; deps?: AppDeps } = {}) {
  const repo = new MemorySignatureRepository();
  const kv = new FakeKV();
  const env: Env = {
    ENVIRONMENT: 'test',
    ALLOWED_ORIGINS: EXT_ORIGIN,
    REPUTATION_PROVIDERS: 'mock',
    CACHE: kv,
    RATE_LIMITER: new CountingLimiter(1000),
    ADMIN_TOKEN,
    ...opts.env,
  };
  const app = createApp({
    signatureRepo: () => repo,
    providers: () => [new MockProvider()],
    ...opts.deps,
  });
  const call = (path: string, init: RequestInit = {}) => app.request(path, init, env);
  const postJson = (path: string, body: unknown, headers: Record<string, string> = {}) =>
    call(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    });
  return { app, env, repo, kv, call, postJson };
}
