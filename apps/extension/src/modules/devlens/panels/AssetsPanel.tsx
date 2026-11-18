import { useMemo, useState } from 'react';
import { Download, Image as ImageIcon, RefreshCw } from 'lucide-react';
import type { AssetItem } from '@ntm/shared';
import { Badge, Card, CopyButton, StateBlock, downloadFile } from '../../../components/common';
import type { QueryState } from '../useDevLensQuery';

type Kind = AssetItem['kind'] | 'all';

const KIND_LABEL: Record<AssetItem['kind'], string> = {
  image: 'Image',
  'background-image': 'Background',
  'svg-inline': 'Inline SVG',
  font: 'Font',
  icon: 'Icon',
  'video-poster': 'Poster',
};

export function AssetsPanel({ query, onRun }: { query: QueryState<AssetItem[]>; onRun: () => void }) {
  const [kind, setKind] = useState<Kind>('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const items = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (query.data ?? []).filter(
      (a) => (kind === 'all' || a.kind === kind) && (!q || a.url.toLowerCase().includes(q)),
    );
  }, [query.data, kind, search]);

  const counts = useMemo(() => {
    const c: Partial<Record<AssetItem['kind'], number>> = {};
    for (const a of query.data ?? []) c[a.kind] = (c[a.kind] ?? 0) + 1;
    return c;
  }, [query.data]);

  const keyOf = (a: AssetItem) => `${a.kind}|${a.url}`;
  const chosen = (query.data ?? []).filter((a) => selected.has(keyOf(a)));
  const exportable = chosen.length > 0 ? chosen : items;

  const toggle = (a: AssetItem) =>
    setSelected((s) => {
      const n = new Set(s);
      const k = keyOf(a);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });

  const allVisibleSelected = items.length > 0 && items.every((a) => selected.has(keyOf(a)));

  return (
    <Card
      title="Asset explorer"
      icon={ImageIcon}
      subtitle="Images, backgrounds, icons and fonts referenced by the page. Previews are not loaded."
      actions={
        <button type="button" className="btn btn--sm btn--primary" onClick={onRun} disabled={query.status === 'loading'}>
          <RefreshCw size={13} /> {query.data ? 'Rescan' : 'Find assets'}
        </button>
      }
    >
      {query.status === 'idle' && <StateBlock title="Not scanned yet" body="Asset discovery runs only when you request it." />}
      {query.status === 'loading' && <StateBlock kind="loading" title="Collecting assets…" />}
      {query.status === 'error' && <StateBlock kind="error" title="Collection failed" body={query.error} />}
      {query.status === 'ready' && (
        <div className="stack">
          <div className="row row--wrap">
            <select className="select" aria-label="Asset type" value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
              <option value="all">All ({query.data?.length ?? 0})</option>
              {(Object.keys(KIND_LABEL) as AssetItem['kind'][]).map((k) => (
                <option key={k} value={k} disabled={!counts[k]}>
                  {KIND_LABEL[k]} ({counts[k] ?? 0})
                </option>
              ))}
            </select>
            <input
              className="input"
              style={{ flex: 1 }}
              placeholder="Filter URLs"
              aria-label="Filter URLs"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="row row--between row--wrap">
            <label className="row subtle">
              <input
                type="checkbox"
                checked={allVisibleSelected}
                onChange={(e) =>
                  setSelected((s) => {
                    const n = new Set(s);
                    for (const a of items) {
                      if (e.target.checked) n.add(keyOf(a));
                      else n.delete(keyOf(a));
                    }
                    return n;
                  })
                }
              />
              Select all shown
            </label>
            <div className="row">
              <span className="subtle">{chosen.length > 0 ? `${chosen.length} selected` : `${items.length} shown`}</span>
              <CopyButton label="URLs" text={exportable.map((a) => a.url).join('\n')} />
              <button
                type="button"
                className="btn btn--sm btn--ghost"
                disabled={exportable.length === 0}
                onClick={() => downloadFile('ntm-assets.json', JSON.stringify(exportable, null, 2))}
              >
                <Download size={13} /> JSON
              </button>
              <button
                type="button"
                className="btn btn--sm btn--ghost"
                disabled={exportable.length === 0}
                onClick={() => downloadFile('ntm-assets.txt', exportable.map((a) => a.url).join('\n') + '\n', 'text/plain')}
              >
                <Download size={13} /> TXT
              </button>
            </div>
          </div>
          {items.length === 0 ? (
            <StateBlock title="No assets" body="Nothing matched the current filter." />
          ) : (
            <div className="dl-assets">
              {items.map((a) => (
                <label key={keyOf(a)} className="dl-asset">
                  <input type="checkbox" checked={selected.has(keyOf(a))} onChange={() => toggle(a)} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="mono truncate" title={a.url}>
                      {a.url}
                    </div>
                    <div className="row row--wrap subtle">
                      <Badge>{KIND_LABEL[a.kind]}</Badge>
                      {a.width && a.height ? (
                        <span>
                          {a.width}×{a.height}
                        </span>
                      ) : null}
                      {a.alt && <span className="truncate">alt: {a.alt}</span>}
                    </div>
                  </div>
                  {a.kind !== 'svg-inline' && <CopyButton text={a.url} />}
                </label>
              ))}
            </div>
          )}
          <p className="subtle">
            Export produces a list of URLs. Files are not downloaded by the extension; open a URL to save it from the
            browser.
          </p>
        </div>
      )}
    </Card>
  );
}
