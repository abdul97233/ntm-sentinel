import { Code2, EyeOff, Layers, Network, PanelRightOpen, RefreshCw, ShieldCheck, ShieldHalf, Settings } from 'lucide-react';
import { toUnicodeHostname } from '@ntm/shared';
import { useTabContext } from '../hooks/useTabContext';
import { useTheme } from '../app/useTheme';
import type { RouteId } from '../app/routes';
import { Badge, RiskBadge, StatusPill } from '../components/common';

/**
 * Toolbar popup. Opening it is a user gesture, which grants activeTab for the current
 * tab — so it scans immediately (locally) without needing persistent host permissions.
 */
export function Popup() {
  const ctx = useTabContext({ follow: false, autoScanOnOpen: true });
  useTheme(ctx.settings.theme);
  const s = ctx.scan;
  const scanning = [s?.security, s?.privacy, s?.stack].some((e) => e?.status === 'scanning');
  const host = ctx.access?.hostname || s?.hostname || '';

  const openPanel = (route: RouteId) => {
    // The side panel shares this origin's localStorage and listens for this key.
    try {
      localStorage.setItem('ntm:lastRoute', route);
    } catch {
      /* ignore */
    }
    // sidePanel.open must be called synchronously in the click handler (user gesture).
    if (chrome.sidePanel?.open && ctx.tabId !== null) {
      chrome.sidePanel
        .open({ tabId: ctx.tabId })
        .then(() => window.close())
        .catch(() => void chrome.tabs.create({ url: chrome.runtime.getURL(`src/sidepanel/index.html#${route}`) }));
    } else {
      void chrome.tabs.create({ url: chrome.runtime.getURL(`src/sidepanel/index.html#${route}`) });
    }
  };

  return (
    <div className="popup">
      <header className="popup__header">
        <div className="row">
          <ShieldHalf size={18} className="brand-icon" />
          <strong>NTM Sentinel</strong>
        </div>
        <button type="button" className="btn btn--ghost btn--icon" title="Settings" aria-label="Settings" onClick={() => openPanel('settings')}>
          <Settings size={14} />
        </button>
      </header>

      <div className="popup__site panel">
        <div className="truncate hero-host" title={host}>{host ? toUnicodeHostname(host) : 'No website'}</div>
        <div className="row row--between">
          {scanning ? <StatusPill status="scanning" /> : <StatusPill status={s?.security.status ?? 'not-scanned'} />}
          <button
            type="button"
            className="btn btn--sm"
            disabled={scanning || !ctx.access?.supported || !ctx.access?.canAccess}
            onClick={() => void ctx.runScan()}
          >
            <RefreshCw size={12} /> Rescan
          </button>
        </div>
        {ctx.access && !ctx.access.supported && <div className="subtle">{ctx.access.unsupportedReason}</div>}
        {s?.security.status === 'failed' && <div className="subtle">{s.security.error}</div>}
      </div>

      <div className="popup__stats">
        <div className="mini panel">
          <span className="subtle">Security</span>
          {s?.security.data ? <RiskBadge level={s.security.data.riskLevel} /> : <Badge>—</Badge>}
        </div>
        <div className="mini panel">
          <span className="subtle">Trackers</span>
          {s?.privacy.data ? (
            <Badge tone={s.privacy.data.totals.knownTrackers ? 'warning' : 'success'}>{s.privacy.data.totals.knownTrackers}</Badge>
          ) : (
            <Badge>—</Badge>
          )}
        </div>
        <div className="mini panel">
          <span className="subtle">Tech</span>
          {s?.stack.data ? <Badge tone="accent">{s.stack.data.technologies.length}</Badge> : <Badge>—</Badge>}
        </div>
      </div>

      <div className="popup__engines">
        <EngineButton icon={ShieldCheck} label="ScamLens" onClick={() => openPanel('security')} />
        <EngineButton icon={EyeOff} label="PrivacyGuard" onClick={() => openPanel('privacy')} />
        <EngineButton icon={Layers} label="StackPeek" onClick={() => openPanel('technologies')} />
        <EngineButton icon={Code2} label="DevLens" onClick={() => openPanel('inspector')} />
        <EngineButton icon={Network} label="APIWatch" onClick={() => openPanel('api')} />
      </div>

      <button type="button" className="btn btn--primary popup__open" onClick={() => openPanel('overview')}>
        <PanelRightOpen size={14} /> Open full dashboard
      </button>
      <div className="subtle" style={{ textAlign: 'center' }}>Local analysis · nothing uploaded</div>
    </div>
  );
}

function EngineButton({ icon: Icon, label, onClick }: { icon: typeof ShieldCheck; label: string; onClick: () => void }) {
  return (
    <button type="button" className="engine-btn" onClick={onClick}>
      <Icon size={16} />
      <span>{label}</span>
    </button>
  );
}
