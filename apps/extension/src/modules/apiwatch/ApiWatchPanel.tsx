/**
 * APIWatch DevTools panel. Captures the inspected tab's network activity through
 * chrome.devtools.network while DevTools is open. Data stays in this panel's memory.
 */
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { ArrowDownUp, Circle, Download, Pause, Search, Trash2 } from 'lucide-react';
import { send } from '../../core/messaging/client';
import { DEFAULT_SETTINGS, type Settings } from '../../core/storage/settings';
import { StateBlock, formatBytes } from '../../components/common';
import { startCapture } from './capture';
import { RequestStore } from './store';
import { applyFilters, distinct, DEFAULT_FILTER, type FilterState, type KindFilter, type SortKey } from './filters';
import { RequestDetails, statusTone } from './RequestDetails';
import { ExportDialog } from './ExportDialog';
import { decodeContent } from './capture';
import type { ApiRequest, BodyState } from './types';

const KIND_CHIPS: { id: KindFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'fetch', label: 'Fetch/XHR' },
  { id: 'js', label: 'JS' },
  { id: 'css', label: 'CSS' },
  { id: 'img', label: 'Img' },
  { id: 'doc', label: 'Doc' },
  { id: 'other', label: 'Other' },
];

function useApiWatchSettings(): Settings['apiwatch'] & { enabled: boolean; loaded: boolean } {
  const [s, setS] = useState<Settings | null>(null);
  useEffect(() => {
    let alive = true;
    send('settings/get', {})
      .then((v) => alive && setS(v))
      .catch(() => alive && setS(DEFAULT_SETTINGS));
    return () => {
      alive = false;
    };
  }, []);
  const v = s ?? DEFAULT_SETTINGS;
  return { ...v.apiwatch, enabled: v.modules.apiwatch, loaded: s !== null };
}

export function ApiWatchPanel({ store: injected }: { store?: RequestStore }) {
  const settings = useApiWatchSettings();
  const storeRef = useRef<RequestStore>(injected ?? new RequestStore(DEFAULT_SETTINGS.apiwatch.maxRequests));
  const store = storeRef.current;
  const items = useSyncExternalStore(
    useCallback((fn) => store.subscribe(fn), [store]),
    () => store.all(),
  );

  const [recording, setRecording] = useState(true);
  const [preserve, setPreserve] = useState(false);
  const recRef = useRef(recording);
  recRef.current = recording;
  const preserveRef = useRef(preserve);
  preserveRef.current = preserve;

  const [filter, setFilter] = useState<FilterState>(DEFAULT_FILTER);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [bodies, setBodies] = useState<Map<string, BodyState>>(new Map());
  const [exportOpen, setExportOpen] = useState(false);
  const [split, setSplit] = useState(55);

  useEffect(() => {
    store.setMax(settings.maxRequests);
  }, [settings.maxRequests, store]);

  useEffect(() => {
    if (!settings.loaded || !settings.enabled || injected) return;
    return startCapture(store, {
      isRecording: () => recRef.current,
      onNavigated: () => {
        if (!preserveRef.current) {
          store.clear();
          setSelectedId(null);
          setChecked(new Set());
          setBodies(new Map());
        }
      },
    });
  }, [settings.loaded, settings.enabled, store, injected]);

  // Report the observed count to the background (Overview dashboard), throttled to ~1/s.
  useEffect(() => {
    const tabId = chrome.devtools?.inspectedWindow?.tabId;
    if (typeof tabId !== 'number' || tabId < 0) return;
    const t = setTimeout(() => {
      send('apiwatch/count', { tabId, count: store.observed }).catch(() => undefined);
    }, 1000);
    return () => clearTimeout(t);
  }, [items, store]);

  const filtered = useMemo(() => applyFilters(items, filter), [items, filter]);
  const hosts = useMemo(() => distinct(items, (r) => r.host), [items]);
  const methods = useMemo(() => distinct(items, (r) => r.method), [items]);
  const selected = selectedId ? items.find((r) => r.id === selectedId) : undefined;

  const loadBody = useCallback(
    async (req: ApiRequest) => {
      if (!req.loadBody) return;
      setBodies((m) => new Map(m).set(req.id, { state: 'loading' }));
      const { content, encoding } = await req.loadBody();
      setBodies((m) =>
        new Map(m).set(
          req.id,
          content == null
            ? { state: 'unavailable', reason: 'DevTools returned no content (e.g. redirect, cached, or evicted from DevTools memory).' }
            : { state: 'loaded', text: content, encoding },
        ),
      );
    },
    [],
  );

  const cachedBodies = useMemo(() => {
    const m = new Map<string, string>();
    for (const [id, b] of bodies) {
      if (b.state !== 'loaded') continue;
      const req = items.find((r) => r.id === id);
      const text = b.encoding === 'base64' ? decodeContent(b.text, 'base64', req?.mimeType ?? '') : b.text;
      if (text !== null) m.set(id, text);
    }
    return m;
  }, [bodies, items]);

  const toggleKind = (k: KindFilter) =>
    setFilter((f) => {
      if (k === 'all') return { ...f, kinds: ['all'] };
      const set = new Set(f.kinds.filter((x) => x !== 'all'));
      if (set.has(k)) set.delete(k);
      else set.add(k);
      return { ...f, kinds: set.size ? Array.from(set) : ['all'] };
    });

  const onDragStart = (e: React.MouseEvent) => {
    e.preventDefault();
    const container = (e.currentTarget as HTMLElement).parentElement;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const move = (ev: MouseEvent) => setSplit(Math.min(80, Math.max(25, ((ev.clientX - rect.left) / rect.width) * 100)));
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  if (settings.loaded && !settings.enabled) {
    return (
      <div className="aw-root">
        <StateBlock title="APIWatch is disabled" body="Enable the APIWatch module in NTM Sentinel Settings, then reopen DevTools." />
      </div>
    );
  }

  const allVisibleChecked = filtered.length > 0 && filtered.every((r) => checked.has(r.id));

  return (
    <div className="aw-root">
      <div className="aw-toolbar">
        <button
          type="button"
          className={`btn btn--sm btn--icon ${recording ? 'aw-rec--on' : ''}`}
          aria-label={recording ? 'Pause recording' : 'Resume recording'}
          title={recording ? 'Pause recording' : 'Resume recording'}
          onClick={() => setRecording((r) => !r)}
        >
          {recording ? <Circle size={12} fill="currentColor" /> : <Pause size={12} />}
        </button>
        <button
          type="button"
          className="btn btn--sm btn--icon"
          aria-label="Clear requests"
          title="Clear"
          onClick={() => {
            store.clear();
            setSelectedId(null);
            setChecked(new Set());
            setBodies(new Map());
          }}
        >
          <Trash2 size={12} />
        </button>
        <label className="row aw-check">
          <input type="checkbox" checked={preserve} onChange={(e) => setPreserve(e.target.checked)} />
          Preserve log
        </label>
        <span className="aw-sep" />
        <label className="aw-search">
          <Search size={12} aria-hidden />
          <input
            className="input"
            placeholder="Filter URL, type, status"
            aria-label="Search requests"
            value={filter.search}
            onChange={(e) => setFilter((f) => ({ ...f, search: e.target.value }))}
          />
        </label>
        <select
          className="select"
          aria-label="Status filter"
          value={filter.status}
          onChange={(e) => setFilter((f) => ({ ...f, status: e.target.value as FilterState['status'] }))}
        >
          <option value="all">All status</option>
          <option value="2xx">2xx</option>
          <option value="3xx">3xx</option>
          <option value="4xx">4xx</option>
          <option value="5xx">5xx</option>
          <option value="error">Errors (4xx/5xx/failed)</option>
        </select>
        <select
          className="select"
          aria-label="Method filter"
          value={filter.method}
          onChange={(e) => setFilter((f) => ({ ...f, method: e.target.value }))}
        >
          <option value="all">All methods</option>
          {methods.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <select
          className="select aw-host-select"
          aria-label="Host filter"
          value={filter.host}
          onChange={(e) => setFilter((f) => ({ ...f, host: e.target.value }))}
        >
          <option value="all">All hosts</option>
          {hosts.map((h) => (
            <option key={h} value={h}>
              {h}
            </option>
          ))}
        </select>
        <select
          className="select"
          aria-label="Sort by"
          value={filter.sort}
          onChange={(e) => setFilter((f) => ({ ...f, sort: e.target.value as SortKey }))}
        >
          <option value="time">Sort: time</option>
          <option value="duration">Sort: duration</option>
          <option value="status">Sort: status</option>
          <option value="size">Sort: size</option>
        </select>
        <button
          type="button"
          className="btn btn--sm btn--icon"
          aria-label={`Sort ${filter.dir === 'asc' ? 'descending' : 'ascending'}`}
          title={filter.dir === 'asc' ? 'Ascending' : 'Descending'}
          onClick={() => setFilter((f) => ({ ...f, dir: f.dir === 'asc' ? 'desc' : 'asc' }))}
        >
          <ArrowDownUp size={12} />
        </button>
        <span className="aw-sep" />
        <button type="button" className="btn btn--sm" disabled={!filtered.length} onClick={() => setExportOpen(true)}>
          <Download size={12} /> Export
        </button>
      </div>
      <div className="aw-chips" role="group" aria-label="Resource type filter">
        {KIND_CHIPS.map((c) => (
          <button
            key={c.id}
            type="button"
            className={`aw-chip ${filter.kinds.includes(c.id) ? 'aw-chip--active' : ''}`}
            aria-pressed={filter.kinds.includes(c.id)}
            onClick={() => toggleKind(c.id)}
          >
            {c.label}
          </button>
        ))}
        <span className="subtle aw-count">
          {filtered.length} / {items.length} requests
          {store.observed > items.length ? ` · ${store.observed - items.length} older dropped (limit ${store.maxRequests})` : ''}
          {!recording ? ' · paused' : ''}
        </span>
      </div>
      <div className="aw-main">
        <div className="aw-table-wrap" style={selected ? { width: `${split}%` } : undefined}>
          {!items.length ? (
            <StateBlock
              title={recording ? 'Waiting for network activity' : 'Recording paused'}
              body="Requests from the inspected tab appear here while DevTools is open. Reload the page to capture its full load."
            />
          ) : (
            <table className="table aw-table">
              <thead>
                <tr>
                  <th className="aw-col-check">
                    <input
                      type="checkbox"
                      aria-label="Select all visible"
                      checked={allVisibleChecked}
                      onChange={(e) =>
                        setChecked(e.target.checked ? new Set(filtered.map((r) => r.id)) : new Set())
                      }
                    />
                  </th>
                  <th>Name</th>
                  <th>Method</th>
                  <th>Status</th>
                  <th>Type</th>
                  <th className="aw-num">Time</th>
                  <th className="aw-num">Size</th>
                  <th>Started</th>
                  <th>Content type</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr
                    key={r.id}
                    className={r.id === selectedId ? 'aw-row--selected' : r.status === 0 || r.status >= 400 ? 'aw-row--error' : ''}
                    onClick={() => setSelectedId(r.id)}
                  >
                    <td className="aw-col-check" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        aria-label={`Select ${r.path}`}
                        checked={checked.has(r.id)}
                        onChange={(e) =>
                          setChecked((s) => {
                            const n = new Set(s);
                            if (e.target.checked) n.add(r.id);
                            else n.delete(r.id);
                            return n;
                          })
                        }
                      />
                    </td>
                    <td className="aw-name" title={r.url}>
                      <span className="truncate mono">{r.path || r.url}</span>
                      <span className="aw-host truncate">{r.host}</span>
                    </td>
                    <td className="mono">{r.method}</td>
                    <td>
                      <span className={`aw-status ${statusTone(r.status)}`}>{r.status || 'ERR'}</span>
                    </td>
                    <td>{r.resourceType || r.kind}</td>
                    <td className="aw-num mono">{r.duration < 1000 ? `${r.duration.toFixed(0)} ms` : `${(r.duration / 1000).toFixed(2)} s`}</td>
                    <td className="aw-num mono">{r.size >= 0 ? formatBytes(r.size) : '—'}</td>
                    <td className="mono">{new Date(r.startedAt).toLocaleTimeString()}</td>
                    <td className="truncate">{r.mimeType || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {selected && (
          <>
            <div className="aw-splitter" role="separator" aria-orientation="vertical" onMouseDown={onDragStart} />
            <div className="aw-details-wrap">
              <RequestDetails
                key={selected.id}
                req={selected}
                captureBodies={settings.captureBodies}
                redactByDefault={settings.redactByDefault}
                body={bodies.get(selected.id) ?? { state: 'idle' }}
                onLoadBody={() => void loadBody(selected)}
                onClose={() => setSelectedId(null)}
              />
            </div>
          </>
        )}
      </div>
      <ExportDialog
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        selected={items.filter((r) => checked.has(r.id))}
        filtered={filtered}
        redactByDefault={settings.redactByDefault}
        captureBodies={settings.captureBodies}
        cachedBodies={cachedBodies}
      />
    </div>
  );
}
