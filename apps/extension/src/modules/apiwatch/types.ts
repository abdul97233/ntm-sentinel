/** APIWatch data model. Everything here lives only in the DevTools panel's memory. */

export interface NameValue {
  name: string;
  value: string;
}

export type ResourceKind = 'fetch' | 'js' | 'css' | 'img' | 'doc' | 'font' | 'media' | 'ws' | 'other';

export interface ApiRequest {
  id: string;
  url: string;
  host: string;
  path: string;
  method: string;
  /** 0 when the request failed / was blocked / has no response. */
  status: number;
  statusText: string;
  /** Raw devtools resource type when available (fetch, xhr, script, ...). */
  resourceType: string;
  kind: ResourceKind;
  /** Total time in ms (HAR entry.time). */
  duration: number;
  startedAt: number;
  mimeType: string;
  /** Response body size in bytes when known, else -1. */
  size: number;
  requestHeaders: NameValue[];
  responseHeaders: NameValue[];
  query: NameValue[];
  postData?: { mimeType: string; text?: string; params?: NameValue[] };
  timings?: Record<string, number>;
  httpVersion?: string;
  serverIp?: string;
  /**
   * Lazily reads the response body through chrome.devtools.network.Request.getContent().
   * Only present for requests observed live via onRequestFinished (not for getHAR() backfill).
   */
  loadBody?: () => Promise<{ content: string | null; encoding: string }>;
}

/** Minimal subset of a HAR 1.2 entry that APIWatch reads (Chrome adds _resourceType). */
export interface HarEntryLike {
  startedDateTime: string;
  time: number;
  _resourceType?: string;
  serverIPAddress?: string;
  request: {
    method: string;
    url: string;
    httpVersion?: string;
    headers: NameValue[];
    queryString?: NameValue[];
    postData?: { mimeType: string; text?: string; params?: { name: string; value?: string }[] };
  };
  response: {
    status: number;
    statusText?: string;
    headers: NameValue[];
    content?: { size?: number; mimeType?: string };
    bodySize?: number;
    _transferSize?: number;
  };
  timings?: Record<string, number | undefined>;
}

export type BodyState =
  | { state: 'idle' }
  | { state: 'loading' }
  | { state: 'loaded'; text: string; encoding?: string }
  | { state: 'unavailable'; reason: string };
