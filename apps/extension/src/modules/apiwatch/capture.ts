/**
 * Network capture using the supported DevTools API (chrome.devtools.network).
 * Only works inside a DevTools page/panel, and only sees traffic of the inspected
 * tab while DevTools is open. Nothing captured here is persisted or transmitted.
 */
import { harToRequest } from './har';
import type { RequestStore } from './store';
import type { HarEntryLike } from './types';

export interface CaptureOptions {
  isRecording: () => boolean;
  onNavigated?: (url: string) => void;
}

function entryKey(e: HarEntryLike): string {
  return `${e.startedDateTime}|${e.request.method}|${e.request.url}|${e.time}`;
}

/** Decode a getContent() result into displayable text, or null for binary data. */
export function decodeContent(content: string | null, encoding: string, mimeType: string): string | null {
  if (content == null) return null;
  if (encoding !== 'base64') return content;
  const m = mimeType.toLowerCase();
  const texty =
    m.startsWith('text/') || m.includes('json') || m.includes('xml') || m.includes('javascript') || m.includes('svg');
  if (!texty) return null;
  try {
    const bin = atob(content);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  } catch {
    return null;
  }
}

export function startCapture(store: RequestStore, opts: CaptureOptions): () => void {
  const net = typeof chrome !== 'undefined' ? chrome.devtools?.network : undefined;
  if (!net) return () => undefined;

  const seen = new Set<string>();
  const remember = (e: HarEntryLike) => {
    const k = entryKey(e);
    if (seen.has(k)) return false;
    seen.add(k);
    if (seen.size > store.maxRequests * 4) {
      // Bound memory: drop the oldest half of the dedupe keys.
      Array.from(seen)
        .slice(0, seen.size >> 1)
        .forEach((x) => seen.delete(x));
    }
    return true;
  };

  // Backfill requests that finished before the panel was opened (bodies not retrievable for these).
  net.getHAR((har) => {
    if (!opts.isRecording()) return;
    const entries = ((har?.entries ?? []) as unknown as HarEntryLike[]).filter(remember);
    store.addMany(entries.map(harToRequest));
  });

  const onFinished = (request: chrome.devtools.network.Request) => {
    if (!opts.isRecording()) return;
    const entry = request as unknown as HarEntryLike;
    if (!remember(entry)) return;
    const req = harToRequest(entry);
    req.loadBody = () =>
      new Promise((resolve) => {
        try {
          request.getContent((content, encoding) => resolve({ content: content ?? null, encoding: encoding ?? '' }));
        } catch {
          resolve({ content: null, encoding: '' });
        }
      });
    store.add(req);
  };
  const onNavigated = (url: string) => opts.onNavigated?.(url);

  net.onRequestFinished.addListener(onFinished);
  net.onNavigated.addListener(onNavigated);
  return () => {
    net.onRequestFinished.removeListener(onFinished);
    net.onNavigated.removeListener(onNavigated);
  };
}
