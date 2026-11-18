import { useEffect, useState, type ReactNode } from 'react';
import { Boxes, Cloud, Database, KeyRound, Palette, ShieldCheck, Trash2 } from 'lucide-react';
import type { TabContext } from '../../hooks/useTabContext';
import type { BackendStatus } from '../../core/messaging/contract';
import { send } from '../../core/messaging/client';
import { ALL_SITES } from '../../core/browser';
import { Badge, Callout, Card, Modal, Switch, formatTime } from '../../components/common';

function Row({ title, desc, control }: { title: string; desc?: ReactNode; control: ReactNode }) {
  return (
    <div className="setting-row">
      <div style={{ minWidth: 0 }}>
        <div className="setting-row__title">{title}</div>
        {desc && <div className="subtle">{desc}</div>}
      </div>
      {control}
    </div>
  );
}

export function SettingsPage({ ctx }: { ctx: TabContext }) {
  const s = ctx.settings;
  const [backend, setBackend] = useState<BackendStatus | null>(null);
  const [sigInfo, setSigInfo] = useState<{ technologies: string; trackers: string; source: string; lastCheckedAt?: number } | null>(null);
  const [sigMsg, setSigMsg] = useState<string | null>(null);
  const [perms, setPerms] = useState({ allSites: false, cookies: false, webNavigation: false });
  const [confirmClear, setConfirmClear] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const loadPerms = async () => {
    const [allSites, cookies, webNavigation] = await Promise.all([
      chrome.permissions.contains({ origins: ALL_SITES }),
      chrome.permissions.contains({ permissions: ['cookies'] }),
      chrome.permissions.contains({ permissions: ['webNavigation'] }),
    ]);
    setPerms({ allSites, cookies, webNavigation });
  };

  useEffect(() => {
    void loadPerms();
    void send('backend/status', {}).then(setBackend).catch(() => undefined);
    void send('signatures/info', {}).then(setSigInfo).catch(() => undefined);
  }, []);

  const toggleOptional = async (kind: 'allSites' | 'cookies' | 'webNavigation', on: boolean) => {
    const req: chrome.permissions.Permissions =
      kind === 'allSites' ? { origins: ALL_SITES } : { permissions: [kind] };
    try {
      if (on) await chrome.permissions.request(req);
      else await chrome.permissions.remove(req);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : String(e));
    }
    await loadPerms();
    await send('fingerprint/sync', {}).catch(() => undefined);
    await ctx.refresh();
  };

  return (
    <div className="stack">
      {notice && <Callout tone="warning">{notice}</Callout>}

      <Card title="Modules" icon={Boxes} subtitle="Disabled modules never run.">
        {(
          [
            ['scamlens', 'ScamLens', 'Local URL & page security indicators'],
            ['privacyguard', 'PrivacyGuard', 'Third-party & tracker observation'],
            ['stackpeek', 'StackPeek', 'Technology detection'],
            ['devlens', 'DevLens', 'DOM/CSS inspector, colors, assets'],
            ['apiwatch', 'APIWatch', 'DevTools network inspector'],
          ] as const
        ).map(([id, name, desc]) => (
          <Row key={id} title={name} desc={desc} control={<Switch label={name} checked={s.modules[id]} onChange={(v) => void ctx.updateSettings({ modules: { [id]: v } })} />} />
        ))}
      </Card>

      <Card title="Permissions" icon={KeyRound} subtitle="All are optional and can be revoked at any time. See PERMISSIONS.md for details.">
        <Row
          title="Access to all websites"
          desc="Lets scans and auto-scan run without clicking the toolbar icon first, and enables the fingerprinting monitor. Without it, NTM Sentinel only reads a page after you click its icon (activeTab) or grant that one site."
          control={<Switch label="All-sites access" checked={perms.allSites} onChange={(v) => void toggleOptional('allSites', v)} />}
        />
        <Row
          title="Cookies"
          desc="Read cookie names and attributes (never values) for PrivacyGuard. Requires site access too."
          control={<Switch label="Cookies permission" checked={perms.cookies} onChange={(v) => void toggleOptional('cookies', v)} />}
        />
        <Row
          title="Navigation (redirect observation)"
          desc="Observe top-level navigations to show redirect chains in ScamLens. Kept in memory per tab and cleared when the tab or browser closes."
          control={<Switch label="webNavigation permission" checked={perms.webNavigation} onChange={(v) => void toggleOptional('webNavigation', v)} />}
        />
      </Card>

      <Card title="Scanning" icon={ShieldCheck}>
        <Row
          title="Header probe"
          desc="Send one HEAD request to the scanned page's own origin to read response headers (security headers, server/CDN indicators)."
          control={<Switch label="Header probe" checked={s.headerProbe} onChange={(v) => void ctx.updateSettings({ headerProbe: v })} />}
        />
        <Row
          title="Auto-scan on page load"
          desc={perms.allSites ? 'Re-run local scans when a page finishes loading.' : 'Requires all-sites access.'}
          control={<Switch label="Auto-scan" disabled={!perms.allSites} checked={s.autoScan && perms.allSites} onChange={(v) => void ctx.updateSettings({ autoScan: v })} />}
        />
        <Row
          title="Fingerprinting monitor"
          desc={perms.allSites ? 'Counts calls to canvas/WebGL/audio fingerprinting-capable APIs from page start. Wraps APIs in the page; values are never read.' : 'Requires all-sites access.'}
          control={<Switch label="Fingerprinting monitor" disabled={!perms.allSites} checked={s.fingerprintMonitor && perms.allSites} onChange={(v) => void ctx.updateSettings({ fingerprintMonitor: v })} />}
        />
      </Card>

      <Card title="Privacy & cloud" icon={Cloud} subtitle="Cloud features are off by default. Core features never need the backend.">
        <Row
          title="Cloud reputation checks"
          desc="When you click “Check” on the Security page, the hostname only (no path, query, cookies or page content) is sent to the NTM backend, which queries configured threat-intelligence providers."
          control={<Switch label="Cloud reputation" disabled={!backend?.configured} checked={s.cloudReputation} onChange={(v) => void ctx.updateSettings({ cloudReputation: v })} />}
        />
        <Row
          title="Signature updates"
          desc="Download updated technology/tracker signatures. No browsing data is sent."
          control={<Switch label="Signature updates" disabled={!backend?.configured} checked={s.cloudSignatureUpdates} onChange={(v) => void ctx.updateSettings({ cloudSignatureUpdates: v })} />}
        />
        <div className="row row--between row--wrap" style={{ marginTop: 8 }}>
          <span className="subtle">
            Backend:{' '}
            {!backend ? '…' : !backend.configured ? (
              <Badge>Not configured (local-only build)</Badge>
            ) : backend.reachable === null ? (
              <Badge>Not checked</Badge>
            ) : backend.reachable ? (
              <Badge tone="success">Online</Badge>
            ) : (
              <Badge tone="danger">Unreachable</Badge>
            )}{' '}
            {backend?.message && <span>{backend.message}</span>}
          </span>
          {backend?.configured && (
            <button type="button" className="btn btn--sm" onClick={() => void send('backend/status', { refresh: true }).then(setBackend)}>
              Test connection
            </button>
          )}
        </div>
        <div className="divider" />
        <div className="row row--between row--wrap">
          <span className="subtle">
            Signatures: tech v{sigInfo?.technologies ?? '…'} · trackers v{sigInfo?.trackers ?? '…'} ({sigInfo?.source ?? '…'})
            {sigInfo?.lastCheckedAt ? ` · checked ${formatTime(sigInfo.lastCheckedAt)}` : ''}
          </span>
          <button
            type="button"
            className="btn btn--sm"
            disabled={!s.cloudSignatureUpdates}
            onClick={async () => {
              const r = await send('signatures/update', {}).catch((e: Error) => ({ message: e.message }) as { message?: string });
              setSigMsg(r.message ?? 'Signatures updated.');
              setSigInfo(await send('signatures/info', {}));
            }}
          >
            Check for updates
          </button>
        </div>
        {sigMsg && <div className="subtle">{sigMsg}</div>}
      </Card>

      <Card title="Data & history" icon={Database}>
        <Row
          title="Keep scan history"
          desc="Stores hostname, risk level and counts locally. Never uploaded."
          control={<Switch label="Scan history" checked={s.scanHistory} onChange={(v) => void ctx.updateSettings({ scanHistory: v })} />}
        />
        <Row
          title="History size"
          control={
            <select className="select" value={s.historyLimit} onChange={(e) => void ctx.updateSettings({ historyLimit: Number(e.target.value) })} aria-label="History size">
              {[25, 50, 100, 250, 500].map((n) => <option key={n} value={n}>{n} sites</option>)}
            </select>
          }
        />
        <Row
          title="APIWatch retention"
          desc="Maximum requests kept in memory per DevTools session. Nothing is persisted to disk."
          control={
            <select className="select" value={s.apiwatch.maxRequests} onChange={(e) => void ctx.updateSettings({ apiwatch: { maxRequests: Number(e.target.value) } })} aria-label="APIWatch retention">
              {[200, 500, 1000, 2000, 5000].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          }
        />
        <Row
          title="APIWatch: load response bodies"
          desc="Fetch bodies from DevTools on demand when you open a request."
          control={<Switch label="Capture bodies" checked={s.apiwatch.captureBodies} onChange={(v) => void ctx.updateSettings({ apiwatch: { captureBodies: v } })} />}
        />
        <Row
          title="APIWatch: redact sensitive values"
          desc="Hide Authorization, Cookie and token values by default."
          control={<Switch label="Redact by default" checked={s.apiwatch.redactByDefault} onChange={(v) => void ctx.updateSettings({ apiwatch: { redactByDefault: v } })} />}
        />
        <div className="row" style={{ marginTop: 8 }}>
          <button type="button" className="btn btn--sm" onClick={() => void send('history/clear', {}).then(() => setNotice('History cleared.'))}>
            Clear history
          </button>
          <button type="button" className="btn btn--sm btn--danger" onClick={() => setConfirmClear(true)}>
            <Trash2 size={13} /> Delete all local data
          </button>
        </div>
      </Card>

      <Card title="Appearance" icon={Palette}>
        <Row
          title="Theme"
          control={
            <select className="select" value={s.theme} onChange={(e) => void ctx.updateSettings({ theme: e.target.value as typeof s.theme })} aria-label="Theme">
              <option value="dark">Dark</option>
              <option value="light">Light</option>
              <option value="system">System</option>
            </select>
          }
        />
      </Card>

      <p className="subtle" style={{ textAlign: 'center' }}>NTM Sentinel v{__NTM_VERSION__} · No accounts · No ads · No telemetry</p>

      <Modal
        open={confirmClear}
        title="Delete all local data?"
        onClose={() => setConfirmClear(false)}
        actions={
          <>
            <button type="button" className="btn" onClick={() => setConfirmClear(false)}>Cancel</button>
            <button
              type="button"
              className="btn btn--danger"
              onClick={async () => {
                await send('data/clearAll', {});
                setConfirmClear(false);
                await ctx.refresh();
                setNotice('All local data deleted. Settings were reset to defaults.');
              }}
            >
              Delete
            </button>
          </>
        }
      >
        <p className="muted" style={{ margin: 0 }}>This removes settings, scan results, history and cached signatures from this browser. Granted permissions are not changed.</p>
      </Modal>
    </div>
  );
}
