import { RefreshCw, Type } from 'lucide-react';
import type { TypographyReport } from '@ntm/shared';
import { Badge, Card, CopyButton, StateBlock } from '../../../components/common';
import { primaryFamily, toCssDeclarations } from '../tokens';
import type { QueryState } from '../useDevLensQuery';

export function TypographyPanel({ query, onRun }: { query: QueryState<TypographyReport>; onRun: () => void }) {
  const data = query.data;
  return (
    <div className="stack">
      <Card
        title="Typography detector"
        icon={Type}
        subtitle="Font combinations used by visible text, most frequent first."
        actions={
          <button type="button" className="btn btn--sm btn--primary" onClick={onRun} disabled={query.status === 'loading'}>
            <RefreshCw size={13} /> {data ? 'Rescan' : 'Detect typography'}
          </button>
        }
      >
        {query.status === 'idle' && <StateBlock title="Not scanned yet" body="Detection runs only when you request it." />}
        {query.status === 'loading' && <StateBlock kind="loading" title="Detecting typography…" />}
        {query.status === 'error' && <StateBlock kind="error" title="Detection failed" body={query.error} />}
        {data && data.styles.length === 0 && <StateBlock title="No text found" />}
        {data && data.styles.length > 0 && (
          <div className="stack">
            {data.styles.map((s, i) => {
              const css = toCssDeclarations({
                'font-family': s.fontFamily,
                'font-size': s.fontSize,
                'font-weight': s.fontWeight,
                'line-height': s.lineHeight,
                'letter-spacing': s.letterSpacing,
              });
              return (
                <div key={i} className="dl-typo">
                  <div className="row row--between">
                    <div className="row" style={{ minWidth: 0 }}>
                      <Badge tone="accent">{s.sampleTag}</Badge>
                      <strong className="truncate">{primaryFamily(s.fontFamily)}</strong>
                    </div>
                    <div className="row">
                      <span className="subtle">{s.count}×</span>
                      <CopyButton text={css} />
                    </div>
                  </div>
                  <div className="dl-typo__meta mono">
                    {s.fontSize} / {s.lineHeight} · {s.fontWeight} · ls {s.letterSpacing}
                  </div>
                  <div className="subtle truncate" title={s.fontFamily}>
                    {s.fontFamily}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
      {data && (
        <Card title="Font faces" subtitle="Declared via @font-face (document.fonts).">
          {data.fontFaces.length === 0 ? (
            <p className="subtle">No web fonts declared — the page uses system or locally installed fonts.</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Family</th>
                  <th>Weight</th>
                  <th>Style</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.fontFaces.map((f, i) => (
                  <tr key={i}>
                    <td>{f.family}</td>
                    <td className="mono">{f.weight}</td>
                    <td>{f.style}</td>
                    <td>
                      <Badge tone={f.status === 'loaded' ? 'success' : f.status === 'error' ? 'danger' : 'default'}>
                        {f.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}
    </div>
  );
}
