import type { MiddlewareHandler } from 'hono';
import type { AppBindings, Env } from '../types/env';
import { errorResponse } from '../utils/errors';
import { hashKey } from '../security/crypto';
import { logEvent } from '../utils/log';

export const MAX_BODY_BYTES = 16 * 1024;
/** Admin signature uploads may be larger, but are still bounded. */
export const MAX_ADMIN_BODY_BYTES = 1024 * 1024;

/* ------------------------------ Request id ------------------------------ */

export const requestId: MiddlewareHandler<AppBindings> = async (c, next) => {
  const id = crypto.randomUUID();
  c.set('requestId', id);
  await next();
  c.header('X-Request-Id', id);
};

/* ---------------------------- Security headers ---------------------------- */

export const securityHeaders: MiddlewareHandler<AppBindings> = async (c, next) => {
  await next();
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'DENY');
  c.header('Referrer-Policy', 'no-referrer');
  c.header('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
  c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  c.header('Cross-Origin-Resource-Policy', 'cross-origin');
  if (!c.res.headers.has('Cache-Control')) c.header('Cache-Control', 'no-store');
};

/* --------------------------------- CORS --------------------------------- */

const EXTENSION_ORIGIN_RE = /^(chrome-extension|extension):\/\/[a-p]{32}$/;
const DEV_ORIGIN_RE = /^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/;

export function isOriginAllowed(origin: string, env: Env): boolean {
  const list = (env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (list.includes(origin)) return true;
  // In development, any well-formed unpacked extension id and localhost are allowed.
  if (env.ENVIRONMENT === 'development') {
    return EXTENSION_ORIGIN_RE.test(origin) || DEV_ORIGIN_RE.test(origin);
  }
  return false;
}

/**
 * Strict CORS: requests carrying an Origin that is not allow-listed are rejected
 * (403), not merely denied CORS headers. Requests without an Origin header
 * (server-to-server, curl) are permitted and remain rate limited.
 */
export const cors: MiddlewareHandler<AppBindings> = async (c, next) => {
  const origin = c.req.header('Origin');
  if (origin && !isOriginAllowed(origin, c.env)) {
    return errorResponse(c, 403, 'origin_not_allowed', 'Origin is not allowed');
  }
  if (origin) {
    c.header('Access-Control-Allow-Origin', origin);
    c.header('Vary', 'Origin');
  }
  if (c.req.method === 'OPTIONS') {
    c.header('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
    c.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, If-None-Match');
    c.header('Access-Control-Max-Age', '600');
    return c.body(null, 204);
  }
  await next();
  if (origin) c.header('Access-Control-Expose-Headers', 'ETag, X-Request-Id, Retry-After');
};

/* ------------------------------ Body limits ------------------------------ */

export function bodyLimit(maxBytes: number): MiddlewareHandler<AppBindings> {
  return async (c, next) => {
    if (c.req.method === 'GET' || c.req.method === 'HEAD' || c.req.method === 'OPTIONS') {
      return next();
    }
    const declared = Number(c.req.header('Content-Length') ?? NaN);
    if (Number.isFinite(declared) && declared > maxBytes) {
      return errorResponse(c, 413, 'payload_too_large', `Request body exceeds ${maxBytes} bytes`);
    }
    // Content-Length may be absent (chunked) — enforce on the actual bytes too.
    const buf = await c.req.raw.clone().arrayBuffer();
    if (buf.byteLength > maxBytes) {
      return errorResponse(c, 413, 'payload_too_large', `Request body exceeds ${maxBytes} bytes`);
    }
    return next();
  };
}

/* ------------------------------ Rate limiting ------------------------------ */

/**
 * In-memory fixed-window fallback used only when the RATE_LIMITER binding is
 * absent (unit tests, misconfigured environments). It is per-isolate and
 * therefore best-effort; production relies on the Workers Rate Limiting binding.
 */
export class MemoryRateLimiter {
  private hits = new Map<string, { count: number; resetAt: number }>();
  constructor(
    private readonly limitPerWindow = 60,
    private readonly windowMs = 60_000,
  ) {}
  async limit({ key }: { key: string }): Promise<{ success: boolean }> {
    const now = Date.now();
    const entry = this.hits.get(key);
    if (!entry || entry.resetAt <= now) {
      this.hits.set(key, { count: 1, resetAt: now + this.windowMs });
      if (this.hits.size > 10_000) this.hits.clear();
      return { success: true };
    }
    entry.count++;
    return { success: entry.count <= this.limitPerWindow };
  }
}

const fallbackLimiter = new MemoryRateLimiter();

export const rateLimit: MiddlewareHandler<AppBindings> = async (c, next) => {
  if (c.req.method === 'OPTIONS') return next();
  const ip = c.req.header('CF-Connecting-IP') ?? 'unknown';
  const key = await hashKey(ip);
  const limiter = c.env.RATE_LIMITER ?? fallbackLimiter;
  let allowed = true;
  try {
    allowed = (await limiter.limit({ key })).success;
  } catch (err) {
    // Fail open on limiter infrastructure errors, but record it.
    logEvent('rate_limiter_error', { message: String(err) });
  }
  if (!allowed) {
    c.header('Retry-After', '60');
    return errorResponse(c, 429, 'rate_limited', 'Too many requests, retry later');
  }
  return next();
};
