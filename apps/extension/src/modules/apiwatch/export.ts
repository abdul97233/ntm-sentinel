/**
 * Export helpers: cURL, JSON metadata export, Postman Collection v2.1.
 * Redaction is ON by default everywhere; callers must opt out explicitly.
 */
import { REDACTED, isSensitiveParam, redactBody, redactHeaders, redactUrl } from '@ntm/shared';
import type { ApiRequest, NameValue } from './types';

export interface ExportOptions {
  redact: boolean;
  includeBodies: boolean;
}

export const DEFAULT_EXPORT: ExportOptions = { redact: true, includeBodies: false };

/** Headers curl/fetch manage themselves or that are HTTP/2 pseudo headers. */
const SKIP_CURL_HEADERS = new Set(['content-length', 'host', 'connection', 'accept-encoding']);

/** POSIX shell single-quote escaping: abc'd -> 'abc'\''d' */
export function shellQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

function headersFor(list: NameValue[], redact: boolean): NameValue[] {
  return redact ? redactHeaders(list) : list;
}

function bodyText(req: ApiRequest): string | undefined {
  const pd = req.postData;
  if (!pd) return undefined;
  if (pd.text !== undefined) return pd.text;
  if (pd.params?.length) {
    return new URLSearchParams(pd.params.map((p) => [p.name, p.value] as [string, string])).toString();
  }
  return undefined;
}

export interface CurlResult {
  command: string;
  /** True when the request had a body we could not see (e.g. multipart / binary). */
  bodyUnavailable: boolean;
}

export function toCurl(req: ApiRequest, opts: Pick<ExportOptions, 'redact'> = DEFAULT_EXPORT): CurlResult {
  const parts = ['curl', shellQuote(opts.redact ? redactUrl(req.url) : req.url)];
  if (req.method !== 'GET') parts.push('-X', shellQuote(req.method));
  let compressed = false;
  for (const h of headersFor(req.requestHeaders, opts.redact)) {
    const n = h.name.toLowerCase();
    if (n.startsWith(':')) continue;
    if (n === 'accept-encoding') compressed = true;
    if (SKIP_CURL_HEADERS.has(n)) continue;
    parts.push('-H', shellQuote(`${h.name}: ${h.value}`));
  }
  const body = bodyText(req);
  let bodyUnavailable = false;
  if (body !== undefined) {
    const out = opts.redact ? redactBody(body, req.postData?.mimeType ?? '') : body;
    parts.push('--data-raw', shellQuote(out));
  } else if (req.postData) {
    bodyUnavailable = true;
  }
  if (compressed) parts.push('--compressed');
  return { command: parts.join(' '), bodyUnavailable };
}

export interface ExportedRequest {
  url: string;
  method: string;
  status: number;
  statusText: string;
  resourceType: string;
  mimeType: string;
  durationMs: number;
  startedAt: string;
  size: number;
  requestHeaders: NameValue[];
  responseHeaders: NameValue[];
  query: NameValue[];
  requestBody?: string;
  responseBody?: string;
}

function redactQuery(q: NameValue[], redact: boolean): NameValue[] {
  if (!redact) return q;
  return q.map((p) => (isSensitiveParam(p.name) ? { ...p, value: REDACTED } : p));
}

export function toExportedRequest(
  req: ApiRequest,
  opts: ExportOptions,
  responseBody?: string,
): ExportedRequest {
  const out: ExportedRequest = {
    url: opts.redact ? redactUrl(req.url) : req.url,
    method: req.method,
    status: req.status,
    statusText: req.statusText,
    resourceType: req.resourceType || req.kind,
    mimeType: req.mimeType,
    durationMs: Math.round(req.duration),
    startedAt: new Date(req.startedAt).toISOString(),
    size: req.size,
    requestHeaders: headersFor(req.requestHeaders, opts.redact),
    responseHeaders: headersFor(req.responseHeaders, opts.redact),
    query: redactQuery(req.query, opts.redact),
  };
  if (opts.includeBodies) {
    const b = bodyText(req);
    if (b !== undefined) out.requestBody = opts.redact ? redactBody(b, req.postData?.mimeType ?? '') : b;
    if (responseBody !== undefined) out.responseBody = opts.redact ? redactBody(responseBody, req.mimeType) : responseBody;
  }
  return out;
}

export function toJsonExport(
  reqs: readonly ApiRequest[],
  opts: ExportOptions,
  bodies: ReadonlyMap<string, string> = new Map(),
): string {
  return JSON.stringify(
    {
      tool: 'NTM Sentinel APIWatch',
      exportedAt: new Date().toISOString(),
      redacted: opts.redact,
      count: reqs.length,
      requests: reqs.map((r) => toExportedRequest(r, opts, bodies.get(r.id))),
    },
    null,
    2,
  );
}

/* --------------------------- Postman v2.1 --------------------------- */

interface PostmanUrl {
  raw: string;
  protocol?: string;
  host?: string[];
  port?: string;
  path?: string[];
  query?: { key: string; value: string }[];
}

function postmanUrl(raw: string): PostmanUrl {
  try {
    const u = new URL(raw);
    return {
      raw,
      protocol: u.protocol.replace(':', ''),
      host: u.hostname.split('.'),
      ...(u.port ? { port: u.port } : {}),
      path: u.pathname.split('/').filter(Boolean),
      ...(u.search
        ? { query: Array.from(u.searchParams.entries()).map(([key, value]) => ({ key, value })) }
        : {}),
    };
  } catch {
    return { raw };
  }
}

export function toPostmanCollection(reqs: readonly ApiRequest[], opts: ExportOptions, name = 'APIWatch export'): string {
  const items = reqs.map((r) => {
    const url = opts.redact ? redactUrl(r.url) : r.url;
    const body = opts.includeBodies ? bodyText(r) : undefined;
    let path = r.path;
    try {
      path = new URL(url).pathname;
    } catch {
      /* keep */
    }
    return {
      name: `${r.method} ${path}`.slice(0, 200),
      request: {
        method: r.method,
        header: headersFor(r.requestHeaders, opts.redact)
          .filter((h) => !h.name.startsWith(':'))
          .map((h) => ({ key: h.name, value: h.value })),
        url: postmanUrl(url),
        ...(body !== undefined
          ? {
              body: {
                mode: 'raw',
                raw: opts.redact ? redactBody(body, r.postData?.mimeType ?? '') : body,
                ...(r.postData?.mimeType.includes('json') ? { options: { raw: { language: 'json' } } } : {}),
              },
            }
          : {}),
      },
      response: [],
    };
  });
  return JSON.stringify(
    {
      info: {
        name,
        description: `Exported by NTM Sentinel APIWatch on ${new Date().toISOString()}${opts.redact ? ' (sensitive values redacted)' : ''}`,
        schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
      },
      item: items,
    },
    null,
    2,
  );
}
