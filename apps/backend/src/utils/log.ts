import { redactUrl } from '@ntm/shared';

/**
 * Structured, sanitised logging. Never logs raw IP addresses, query secrets,
 * request bodies or provider API keys.
 */
export function logEvent(event: string, fields: Record<string, unknown> = {}): void {
  const safe: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (typeof v === 'string' && /^https?:\/\//i.test(v)) safe[k] = redactUrl(v);
    else if (/ip|key|token|secret|authorization|cookie/i.test(k)) safe[k] = '[omitted]';
    else safe[k] = v;
  }
  console.log(JSON.stringify({ event, ...safe }));
}
