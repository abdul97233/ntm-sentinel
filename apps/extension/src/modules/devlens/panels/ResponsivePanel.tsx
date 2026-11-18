import { useState } from 'react';
import { ExternalLink, Monitor, RefreshCw, Smartphone, Tablet } from 'lucide-react';
import type { ViewportInfo } from '@ntm/shared';
import { Callout, Card, StateBlock } from '../../../components/common';
import { send } from '../../../core/messaging/client';
import type { QueryState } from '../useDevLensQuery';

export const VIEWPORT_PRESETS = [
  { label: 'iPhone SE', w: 320, h: 568, kind: 'phone' },
  { label: 'iPhone X', w: 375, h: 812, kind: 'phone' },
  { label: 'iPhone 14', w: 390, h: 844, kind: 'phone' },
  { label: 'Large phone', w: 414, h: 896, kind: 'phone' },
  { label: 'Tablet portrait', w: 768, h: 1024, kind: 'tablet' },
  { label: 'Tablet landscape', w: 1024, h: 768, kind: 'tablet' },
  { label: 'Laptop', w: 1280, h: 800, kind: 'desktop' },
  { label: 'Desktop', w: 1440, h: 900, kind: 'desktop' },
  { label: 'Full HD', w: 1920, h: 1080, kind: 'desktop' },
] as const;

const ICONS = { phone: Smartphone, tablet: Tablet, desktop: Monitor };

export function ResponsivePanel({
  tabId,
  viewport,
  onRefresh,
}: {
  tabId: number;
  viewport: QueryState<ViewportInfo>;
  onRefresh: () => void;
}) {
  const [w, setW] = useState(375);
  const [h, setH] = useState(812);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const open = async (width: number, height: number) => {
    setBusy(true);
    setStatus(null);
    try {
      await send('devlens/openResponsive', { tabId, width, height });
      setStatus(`Opened a ${width}×${height} preview window.`);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const valid = (n: number, max: number) => Number.isInteger(n) && n >= 200 && n <= max;
  const v = viewport.data;

  return (
    <div className="stack">
      <Card
        title="Current viewport"
        icon={Monitor}
        actions={
          <button type="button" className="btn btn--sm btn--ghost" onClick={onRefresh} disabled={viewport.status === 'loading'}>
            <RefreshCw size={13} /> Measure
          </button>
        }
      >
        {viewport.status === 'error' && <StateBlock kind="error" title="Could not measure" body={viewport.error} />}
        {!v && viewport.status !== 'error' && <p className="subtle">Click “Measure” to read the page’s viewport size.</p>}
        {v && (
          <dl className="kv">
            <dt>Viewport</dt>
            <dd className="mono">
              {v.innerWidth} × {v.innerHeight}
            </dd>
            <dt>Window</dt>
            <dd className="mono">
              {v.outerWidth} × {v.outerHeight}
            </dd>
            <dt>Pixel ratio</dt>
            <dd className="mono">{v.devicePixelRatio}</dd>
          </dl>
        )}
      </Card>

      <Card title="Responsive preview" subtitle="Opens this page in a separate window sized to the chosen viewport.">
        <div className="dl-presets">
          {VIEWPORT_PRESETS.map((p) => {
            const Icon = ICONS[p.kind];
            return (
              <button key={p.label} type="button" className="dl-preset" disabled={busy} onClick={() => open(p.w, p.h)}>
                <Icon size={16} aria-hidden />
                <span>{p.label}</span>
                <span className="mono subtle">
                  {p.w}×{p.h}
                </span>
              </button>
            );
          })}
        </div>
        <div className="divider" />
        <form
          className="row row--wrap"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid(w, 7680) && valid(h, 4320)) void open(w, h);
          }}
        >
          <label className="row subtle">
            W
            <input
              className="input"
              type="number"
              min={200}
              max={7680}
              value={w}
              style={{ width: 90 }}
              aria-label="Width"
              onChange={(e) => setW(Number(e.target.value))}
            />
          </label>
          <label className="row subtle">
            H
            <input
              className="input"
              type="number"
              min={200}
              max={4320}
              value={h}
              style={{ width: 90 }}
              aria-label="Height"
              onChange={(e) => setH(Number(e.target.value))}
            />
          </label>
          <button type="submit" className="btn btn--sm btn--primary" disabled={busy || !valid(w, 7680) || !valid(h, 4320)}>
            <ExternalLink size={13} /> Open custom size
          </button>
        </form>
        {status && <p className="subtle" role="status">{status}</p>}
        <div style={{ marginTop: 12 }}>
          <Callout>
            Window size is approximate: browser UI height varies and the OS may limit windows to the screen size. Use
            “Measure” in the preview window’s side panel to confirm the exact viewport, or DevTools device mode for
            pixel-exact emulation.
          </Callout>
        </div>
      </Card>
    </div>
  );
}
