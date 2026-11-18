/** HAR entry -> ApiRequest mapping. Pure, unit-tested. */
import type { ApiRequest, HarEntryLike, NameValue, ResourceKind } from './types';

let seq = 0;

/** Classify by devtools resource type first, then by mime type, then by URL extension. */
export function classifyKind(resourceType: string | undefined, mimeType: string, url: string): ResourceKind {
  const rt = (resourceType ?? '').toLowerCase();
  switch (rt) {
    case 'fetch':
    case 'xhr':
    case 'eventsource':
      return 'fetch';
    case 'script':
      return 'js';
    case 'stylesheet':
      return 'css';
    case 'image':
      return 'img';
    case 'document':
      return 'doc';
    case 'font':
      return 'font';
    case 'media':
      return 'media';
    case 'websocket':
      return 'ws';
    case '':
      break;
    default:
      return 'other';
  }
  const m = mimeType.toLowerCase();
  if (m.includes('json') || (m.includes('xml') && !m.includes('html'))) return 'fetch';
  if (m.includes('javascript') || m.includes('ecmascript')) return 'js';
  if (m.includes('css')) return 'css';
  if (m.startsWith('image/')) return 'img';
  if (m.includes('html')) return 'doc';
  if (m.startsWith('font/') || m.includes('woff')) return 'font';
  if (m.startsWith('video/') || m.startsWith('audio/')) return 'media';
  const ext = /\.([a-z0-9]{1,5})(?:$|\?)/i.exec(safePath(url))?.[1]?.toLowerCase();
  if (ext) {
    if (['js', 'mjs'].includes(ext)) return 'js';
    if (ext === 'css') return 'css';
    if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif', 'ico'].includes(ext)) return 'img';
    if (['woff', 'woff2', 'ttf', 'otf'].includes(ext)) return 'font';
  }
  return 'other';
}

function safePath(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

export function parseQuery(url: string): NameValue[] {
  try {
    return Array.from(new URL(url).searchParams.entries()).map(([name, value]) => ({ name, value }));
  } catch {
    return [];
  }
}

export function harToRequest(entry: HarEntryLike): ApiRequest {
  const url = entry.request.url;
  let host = '';
  let path = url;
  try {
    const u = new URL(url);
    host = u.host;
    path = u.pathname + u.search;
  } catch {
    /* data: or malformed */
  }
  const mimeType = (entry.response.content?.mimeType ?? '').split(';')[0]!.trim();
  const started = Date.parse(entry.startedDateTime);
  const size =
    typeof entry.response.content?.size === 'number' && entry.response.content.size >= 0
      ? entry.response.content.size
      : typeof entry.response.bodySize === 'number' && entry.response.bodySize >= 0
        ? entry.response.bodySize
        : -1;
  const timings: Record<string, number> = {};
  for (const [k, v] of Object.entries(entry.timings ?? {})) {
    if (typeof v === 'number' && v >= 0 && !k.startsWith('_')) timings[k] = v;
  }
  const query = entry.request.queryString?.length
    ? entry.request.queryString.map((q) => ({ name: q.name, value: q.value }))
    : parseQuery(url);
  const pd = entry.request.postData;
  return {
    id: `r${++seq}-${Number.isFinite(started) ? started : 0}`,
    url,
    host,
    path,
    method: (entry.request.method || 'GET').toUpperCase(),
    status: entry.response.status ?? 0,
    statusText: entry.response.statusText ?? '',
    resourceType: entry._resourceType ?? '',
    kind: classifyKind(entry._resourceType, mimeType, url),
    duration: Math.max(0, entry.time ?? 0),
    startedAt: Number.isFinite(started) ? started : Date.now(),
    mimeType,
    size,
    requestHeaders: entry.request.headers ?? [],
    responseHeaders: entry.response.headers ?? [],
    query,
    postData: pd
      ? {
          mimeType: pd.mimeType ?? '',
          text: pd.text,
          params: pd.params?.map((p) => ({ name: p.name, value: p.value ?? '' })),
        }
      : undefined,
    timings: Object.keys(timings).length ? timings : undefined,
    httpVersion: entry.request.httpVersion,
    serverIp: entry.serverIPAddress,
  };
}
