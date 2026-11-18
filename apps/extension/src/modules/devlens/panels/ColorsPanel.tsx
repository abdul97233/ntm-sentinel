import { useMemo, useState } from 'react';
import { Download, Palette, RefreshCw } from 'lucide-react';
import type { ColorSwatch } from '@ntm/shared';
import { Badge, Card, CopyButton, StateBlock, downloadFile } from '../../../components/common';
import { parseColor, readableTextOn } from '../color';
import type { QueryState } from '../useDevLensQuery';

type Format = 'hex' | 'rgb' | 'hsl';
type UsageFilter = 'all' | 'text' | 'background' | 'border';

export function ColorsPanel({ query, onRun }: { query: QueryState<ColorSwatch[]>; onRun: () => void }) {
  const [format, setFormat] = useState<Format>('hex');
  const [usage, setUsage] = useState<UsageFilter>('all');
  const colors = useMemo(
    () => (query.data ?? []).filter((c) => usage === 'all' || c.usages.includes(usage)),
    [query.data, usage],
  );

  const palette = colors.slice(0, 12);
  const valueOf = (c: ColorSwatch) => (format === 'hex' ? c.hex : format === 'rgb' ? c.rgb : c.hsl);

  return (
    <Card
      title="Color extractor"
      icon={Palette}
      subtitle="Computed colors of visible elements (text, background, border)."
      actions={
        <>
          {query.data && query.data.length > 0 && (
            <button
              type="button"
              className="btn btn--sm btn--ghost"
              onClick={() => downloadFile('ntm-colors.json', JSON.stringify(query.data, null, 2))}
            >
              <Download size={13} /> JSON
            </button>
          )}
          <button type="button" className="btn btn--sm btn--primary" onClick={onRun} disabled={query.status === 'loading'}>
            <RefreshCw size={13} /> {query.data ? 'Rescan' : 'Extract colors'}
          </button>
        </>
      }
    >
      {query.status === 'idle' && <StateBlock title="Not extracted yet" body="Extraction runs only when you request it." />}
      {query.status === 'loading' && <StateBlock kind="loading" title="Extracting colors…" />}
      {query.status === 'error' && <StateBlock kind="error" title="Extraction failed" body={query.error} />}
      {query.status === 'ready' && (
        <div className="stack">
          <div className="row row--between row--wrap">
            <div className="row">
              {(['hex', 'rgb', 'hsl'] as Format[]).map((f) => (
                <button
                  key={f}
                  type="button"
                  className={`btn btn--sm ${format === f ? 'btn--primary' : 'btn--ghost'}`}
                  onClick={() => setFormat(f)}
                >
                  {f.toUpperCase()}
                </button>
              ))}
            </div>
            <select
              className="select"
              aria-label="Filter by usage"
              value={usage}
              onChange={(e) => setUsage(e.target.value as UsageFilter)}
            >
              <option value="all">All usages</option>
              <option value="text">Text</option>
              <option value="background">Background</option>
              <option value="border">Border</option>
            </select>
          </div>

          {colors.length === 0 ? (
            <StateBlock title="No colors found" body="No visible elements matched this filter." />
          ) : (
            <>
              <div className="dl-palette" aria-label="Generated palette">
                {palette.map((c) => (
                  <span key={c.hex} className="dl-palette__cell" style={{ background: c.hex }} title={c.hex} />
                ))}
              </div>
              <CopyButton label="Copy palette" text={palette.map(valueOf).join('\n')} />
              <div className="dl-swatches">
                {colors.map((c) => {
                  const rgba = parseColor(c.hex);
                  return (
                    <div key={c.hex} className="dl-swatch">
                      <div
                        className="dl-swatch__color"
                        style={{ background: c.rgb, color: rgba ? readableTextOn(rgba) : undefined }}
                      >
                        {c.count}×
                      </div>
                      <div className="dl-swatch__meta">
                        <div className="row row--between">
                          <span className="mono truncate">{valueOf(c)}</span>
                          <CopyButton text={valueOf(c)} />
                        </div>
                        <div className="row row--wrap">
                          {c.usages.map((u) => (
                            <Badge key={u}>{u}</Badge>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}
    </Card>
  );
}
