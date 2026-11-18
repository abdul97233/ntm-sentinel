/**
 * Sensitive-data redaction helpers. Used by APIWatch (headers, URLs, bodies before export)
 * and by the backend (log sanitisation).
 */

export const REDACTED = '[REDACTED]';

/** Header names whose values are always redacted. Compared case-insensitively. */
const SENSITIVE_HEADERS = new Set([
  'authorization',
  'proxy-authorization',
  'cookie',
  'set-cookie',
  'set-cookie2',
  'x-api-key',
  'api-key',
  'x-auth-token',
  'x-access-token',
  'x-csrf-token',
  'x-xsrf-token',
  'x-amz-security-token',
  'x-goog-api-key',
  'x-session-id',
  'x-refresh-token',
]);

const SENSITIVE_HEADER_PATTERN = /(token|secret|session|passw|api[-_]?key|auth|credential|signature)/i;

/** Query/body parameter names that commonly carry credentials. */
const SENSITIVE_PARAM_PATTERN =
  /^(access_token|refresh_token|id_token|token|auth|authorization|api_?key|apikey|key|secret|client_secret|password|passwd|pwd|session|sessionid|sid|sig|signature|code|jwt|bearer|x-amz-signature|x-amz-credential|x-amz-security-token)$/i;

const JWT_PATTERN = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g;
const BEARER_PATTERN = /\b(Bearer|Basic|Token)\s+[A-Za-z0-9._~+/=-]{8,}/gi;

export function isSensitiveHeader(name: string): boolean {
  const n = name.toLowerCase();
  return SENSITIVE_HEADERS.has(n) || SENSITIVE_HEADER_PATTERN.test(n);
}

export function isSensitiveParam(name: string): boolean {
  return SENSITIVE_PARAM_PATTERN.test(name);
}

export interface HeaderLike {
  name: string;
  value: string;
}

export function redactHeaders<T extends HeaderLike>(headers: readonly T[]): T[] {
  return headers.map((h) => (isSensitiveHeader(h.name) ? { ...h, value: REDACTED } : h));
}

/** Redacts sensitive query parameters and any userinfo (user:pass@) from a URL string. */
export function redactUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return redactTokensInText(raw);
  }
  if (url.username || url.password) {
    url.username = url.username ? 'REDACTED' : '';
    url.password = url.password ? 'REDACTED' : '';
  }
  const keys = Array.from(new Set(Array.from(url.searchParams.keys())));
  for (const k of keys) {
    if (isSensitiveParam(k)) {
      const count = url.searchParams.getAll(k).length;
      url.searchParams.delete(k);
      for (let i = 0; i < count; i++) url.searchParams.append(k, REDACTED);
    }
  }
  return url.toString();
}

/** Replace JWTs and bearer-style credentials anywhere in free text. */
export function redactTokensInText(text: string): string {
  return text.replace(BEARER_PATTERN, (_m, scheme: string) => `${scheme} ${REDACTED}`).replace(JWT_PATTERN, REDACTED);
}

/**
 * Deep-redacts a parsed JSON value: sensitive keys get REDACTED, string values
 * are scanned for embedded tokens. Never mutates the input.
 */
export function redactJson(value: unknown, depth = 0): unknown {
  if (depth > 64) return '[TRUNCATED]';
  if (typeof value === 'string') return redactTokensInText(value);
  if (Array.isArray(value)) return value.map((v) => redactJson(v, depth + 1));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = isSensitiveParam(k) || isSensitiveHeader(k) ? REDACTED : redactJson(v, depth + 1);
    }
    return out;
  }
  return value;
}

/** Redact a request/response body string: JSON-aware when possible, form-encoded aware, else token scan. */
export function redactBody(body: string, mimeType = ''): string {
  const trimmed = body.trim();
  if (mimeType.includes('json') || trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      return JSON.stringify(redactJson(JSON.parse(trimmed)), null, 2);
    } catch {
      /* fall through */
    }
  }
  if (mimeType.includes('x-www-form-urlencoded')) {
    try {
      const params = new URLSearchParams(trimmed);
      const out = new URLSearchParams();
      for (const [k, v] of params) out.append(k, isSensitiveParam(k) ? REDACTED : v);
      return out.toString();
    } catch {
      /* fall through */
    }
  }
  return redactTokensInText(body);
}
