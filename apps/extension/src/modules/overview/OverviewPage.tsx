import { useEffect, useState } from 'react';
import { Activity, Code2, EyeOff, Globe, History, Layers, RefreshCw, ShieldCheck, Network } from 'lucide-react';
import type { ScanHistoryEntry } from '@ntm/shared';
import { toUnicodeHostname } from '@ntm/shared';
import type { TabContext } from '../../hooks/useTabContext';
import type { RouteId } from '../../app/routes';
import { send } from '../../core/messaging/client';
import { Badge, Card, RiskBadge, StateBlock, StatusPill, formatTime } from '../../components/common';

export function OverviewPage({ ctx, navigate }: { ctx: TabContext; navigate: (r: RouteId) => void }) {
  const [history, setHistory] = useState<ScanHistoryEntry[]>([]);
  useEffect(() => {
    if (ctx.settings.scanHistory) void send('history/get', {}).then(setHistory).catch(() => setHistory([]));
  }, [ctx.settings.scanHistory, ctx.scan?.updatedAt]);

  if (ctx.loading) return <StateBlock kind="loading" title="Loading…" />;
  if (ctx.tabId === null) return <StateBlock title="No active tab" body="Open a website to analyse it." />;

  const s = ctx.scan;
  const sec = s?.security;
  const priv = s?.privacy;
  const stack = s?.stack;
  const scanning = [sec, priv, stack].some((e) => e?.status === 'scanning');
  const lastScan = Math.max(sec?.updatedAt ?? 0, priv?.updatedAt ?? 0, stack?.updatedAt ?? 0);
  const host = ctx.access?.hostname || s?.hostname || '';

  return (
    <div className="stack">
      <Card>
        <div className="row row--between">
          <div className="row" style={{ minWidth: 0 }}>
            <div className="site-icon"><Globe size={18} /></div>
            <div style={{ minWidth: 0 }}>
              <div className="hero-host truncate">{host ? toUnicodeHostname(host) : 'This page'}</div>
              <div className="subtle truncate" title={ctx.access?.url}>{ctx.access?.url || 'Address hidden until access is granted'}</div>
            </div>
          </div>
          <button
            type="button"
            className="btn btn--primary"
            disabled={scanning || !ctx.access?.supported}
            onClick={() => (ctx.access?.canAccess ? void ctx.runScan() : void ctx.requestSiteAccess())}
          >
            <RefreshCw size={14} className={scanning ? 'spin' : ''} />
            {scanning ? 'Scanning…' : ctx.access?.canAccess ? 'Scan page' : 'Grant access & scan'}
          </button>
        </div>
        {ctx.access && !ctx.access.supported && <p className="subtle">{ctx.access.unsupportedReason}</p>}
        <div className="row row--between" style={{ marginTop: 10 }}>
          <span className="subtle">Last scan: {lastScan ? formatTime(lastScan) : 'never'}</span>
          {ctx.access?.canAccess ? <Badge tone="success">Access granted</Badge> : <Badge tone="warning">No access</Badge>}
        </div>
      </Card>

      <div className="engine-grid">
        <EngineTile icon={ShieldCheck} name="ScamLens" desc="Security indicators" status={sec?.status ?? 'not-scanned'} onClick={() => navigate('security')}>
          {sec?.data && (
            <>
              <RiskBadge level={sec.data.riskLevel} />
              <span className="subtle">{sec.data.findings.length} finding(s)</span>
            </>
          )}
        </EngineTile>
        <EngineTile icon={EyeOff} name="PrivacyGuard" desc="Trackers & third parties" status={priv?.status ?? 'not-scanned'} onClick={() => navigate('privacy')}>
          {priv?.data && (
            <>
              <Badge tone={priv.data.totals.knownTrackers ? 'warning' : 'success'}>{priv.data.totals.knownTrackers} known trackers</Badge>
              <span className="subtle">{priv.data.totals.thirdPartyDomains} third-party domains</span>
            </>
          )}
        </EngineTile>
        <EngineTile icon={Layers} name="StackPeek" desc="Technologies" status={stack?.status ?? 'not-scanned'} onClick={() => navigate('technologies')}>
          {stack?.data && (
            <>
              <Badge tone="accent">{stack.data.technologies.length} detected</Badge>
              <span className="subtle truncate">{stack.data.technologies.slice(0, 3).map((t) => t.name).join(', ')}</span>
            </>
          )}
        </EngineTile>
        <EngineTile icon={Code2} name="DevLens" desc="Inspect DOM, CSS, colors" status={ctx.access?.canAccess ? 'completed' : 'permission-required'} statusLabel={ctx.access?.canAccess ? 'Ready' : undefined} onClick={() => navigate('inspector')} />
        <EngineTile icon={Network} name="APIWatch" desc="DevTools network inspector" status="not-scanned" statusLabel={s?.apiRequestCount !== undefined ? `${s.apiRequestCount} requests` : 'Open DevTools'} onClick={() => navigate('api')} />
      </div>

      {ctx.settings.scanHistory && (
        <Card title="Recent scans" icon={History}>
          {history.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>No history yet.</p>
          ) : (
            <table className="table">
              <tbody>
                {history.slice(0, 8).map((h) => (
                  <tr key={h.hostname}>
                    <td className="mono truncate">{h.hostname}</td>
                    <td><RiskBadge level={h.riskLevel} /></td>
                    <td className="subtle">{h.trackerCount} trk · {h.techCount} tech</td>
                    <td className="subtle">{formatTime(h.scannedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}

      <Card title="Local-first" icon={Activity}>
        <p className="subtle" style={{ margin: 0 }}>
          All analysis on this page ran in your browser. Nothing was sent to any server{ctx.settings.cloudReputation ? ' except hostnames you explicitly check with cloud reputation' : ''}.
        </p>
      </Card>
    </div>
  );
}

function EngineTile(props: {
  icon: typeof Globe;
  name: string;
  desc: string;
  status: Parameters<typeof StatusPill>[0]['status'];
  statusLabel?: string;
  onClick: () => void;
  children?: React.ReactNode;
}) {
  const Icon = props.icon;
  return (
    <button type="button" className="engine-tile panel" onClick={props.onClick}>
      <div className="row row--between">
        <span className="row"><Icon size={16} className="engine-tile__icon" /><strong>{props.name}</strong></span>
        {props.statusLabel ? <Badge>{props.statusLabel}</Badge> : <StatusPill status={props.status} />}
      </div>
      <div className="subtle">{props.desc}</div>
      {props.children && <div className="row row--wrap" style={{ marginTop: 4 }}>{props.children}</div>}
    </button>
  );
}
