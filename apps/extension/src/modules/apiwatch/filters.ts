/** Request filtering and sorting. Pure functions. */
import type { ApiRequest, ResourceKind } from './types';

export type KindFilter = 'all' | 'fetch' | 'js' | 'css' | 'img' | 'doc' | 'other';
export type StatusFilter = 'all' | '2xx' | '3xx' | '4xx' | '5xx' | 'error';
export type SortKey = 'time' | 'duration' | 'status' | 'size';
export type SortDir = 'asc' | 'desc';

export interface FilterState {
  kinds: KindFilter[];
  search: string;
  status: StatusFilter;
  method: string; // 'all' or e.g. 'GET'
  host: string; // 'all' or a host
  sort: SortKey;
  dir: SortDir;
}

export const DEFAULT_FILTER: FilterState = {
  kinds: ['all'],
  search: '',
  status: 'all',
  method: 'all',
  host: 'all',
  sort: 'time',
  dir: 'asc',
};

const OTHER_KINDS: ResourceKind[] = ['font', 'media', 'ws', 'other'];

export function matchesKind(kind: ResourceKind, filters: KindFilter[]): boolean {
  if (!filters.length || filters.includes('all')) return true;
  return filters.some((f) => (f === 'other' ? OTHER_KINDS.includes(kind) : f === kind));
}

export function matchesStatus(status: number, f: StatusFilter): boolean {
  switch (f) {
    case 'all':
      return true;
    case 'error':
      return status === 0 || status >= 400;
    default:
      return Math.floor(status / 100) === Number(f[0]);
  }
}

export function applyFilters(items: readonly ApiRequest[], f: FilterState): ApiRequest[] {
  const q = f.search.trim().toLowerCase();
  const out = items.filter(
    (r) =>
      matchesKind(r.kind, f.kinds) &&
      matchesStatus(r.status, f.status) &&
      (f.method === 'all' || r.method === f.method) &&
      (f.host === 'all' || r.host === f.host) &&
      (!q ||
        r.url.toLowerCase().includes(q) ||
        r.mimeType.toLowerCase().includes(q) ||
        String(r.status).startsWith(q)),
  );
  const mul = f.dir === 'asc' ? 1 : -1;
  const key = (r: ApiRequest) =>
    f.sort === 'duration' ? r.duration : f.sort === 'status' ? r.status : f.sort === 'size' ? r.size : r.startedAt;
  return out.sort((a, b) => (key(a) - key(b)) * mul);
}

export function distinct(items: readonly ApiRequest[], pick: (r: ApiRequest) => string): string[] {
  return Array.from(new Set(items.map(pick).filter(Boolean))).sort();
}
