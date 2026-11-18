/** Worker bindings and Hono context variables. */

/** Minimal subset of the Workers Rate Limiting binding we rely on. */
export interface RateLimiterBinding {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

/** Minimal KV surface used by the backend (lets tests use an in-memory fake). */
export interface KVLike {
  get(key: string, type: 'json'): Promise<unknown>;
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

export interface Env {
  DB?: D1Database;
  CACHE?: KVLike;
  RATE_LIMITER?: RateLimiterBinding;
  ENVIRONMENT?: string;
  /** Comma-separated origin allow-list, e.g. "chrome-extension://abc,extension://def" */
  ALLOWED_ORIGINS?: string;
  /** Comma-separated provider ids: mock, gsb, virustotal */
  REPUTATION_PROVIDERS?: string;
  BUILD_ID?: string;
  GSB_API_KEY?: string;
  VT_API_KEY?: string;
  ADMIN_TOKEN?: string;
}

export interface Variables {
  requestId: string;
}

export interface AppBindings {
  Bindings: Env;
  Variables: Variables;
}
