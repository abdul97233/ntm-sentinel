import { useMemo, useState } from 'react';
import { Cookie, Database, Fingerprint, Globe, EyeOff } from 'lucide-react';
import type { PrivacyReport, TrackerCategory } from '@ntm/shared';
import type { TabContext } from '../../hooks/useTabContext';
import { Badge, Callout, Card, ConfidenceBadge, Tabs, formatBytes, formatTime } from '../../components/common';
import { EngineGate } from '../../components/dashboard/EngineGate';
import { FindingList } from '../../components/dashboard/FindingList';

const CAT_TONE: Partial<Record<TrackerCategory, 'danger' | 'warning' | 'info' | 'violet' | 'accent'>> = {
  advertising: 'danger',
  'session-replay': 'warning',
  fingerprinting: 'danger',
  analytics: 'warning',
  'tag-manager': 'violet',
  social: 'info',
};

export function PrivacyPage({ ctx }: { ctx: TabContext }) {
  return (
    <div className="stack">
      <EngineGate ctx={ctx} state={ctx.scan?.privacy} engineName="PrivacyGuard" enabled={ctx.settings.modules.privacyguard}>
        {(r) => <PrivacyView ctx={ctx} report={r} />}
      </EngineGate>
    </div>
  );
}

function PrivacyView({ ctx, report }: { ctx: TabContext; report: PrivacyReport }) {
  const [tab, setTab] = useState<'connections' | 'cookies' | 'storage' | 'fingerprint'>('connections');
  const [filter, setFilter] = useState<'all' | 'known' | 'unknown'>('all');
  const conns = useMemo(
    () => report.connections.filter((c) => (filter === 'all' ? true : filter === 'known' ? !!c.service : !c.service)),
    [report.connections, filter],
  );

  const grantCookies = async () => {
    const origin = ctx.access?.url ? new URL(ctx.access.url).origin + '/*' : undefined;
    await chrome.permissions.request({ permissions: ['cookies'], origins: origin ? [origin] : [] }).catch(() => false);
    await ctx.runScan(['privacy']);
    await ctx.refresh();
  };

  return (
    <>
      <div className="stat-grid">
        <Stat label="Third-party domains" value={report.totals.thirdPartyDomains} />
        <Stat label="Known trackers" value={report.totals.knownTrackers} tone={report.totals.knownTrackers ? 'warning' : undefined} />
        <Stat label="Advertising" value={report.totals.advertising} tone={report.totals.advertising ? 'danger' : undefined} />
        <Stat label="Analytics" value={report.totals.analytics} />
        <Stat label="Unclassified hosts" value={report.totals.unknown} />
      </div>

      <Card title={`Findings (${report.findings.length})`} icon={EyeOff} actions={<button type="button" className="btn btn--sm" onClick={() => void ctx.runScan(['privacy'])}>Rescan</button>}>
        <FindingList findings={report.findings} emptyText="No known tracking services were observed in the resources loaded so far." />
        <p className="subtle" style={{ marginBottom: 0 }}>
          Based on resources the page had loaded at {formatTime(report.scannedAt)}. Requests made later, from service workers, or blocked by the browser are not included. Monitoring is passive — nothing is blocked.
        </p>
      </Card>

      <Tabs
        ariaLabel="Privacy details"
        value={tab}
        onChange={setTab}
        items={[
          { id: 'connections', label: 'Connections', icon: Globe, count: report.connections.length },
          { id: 'cookies', label: 'Cookies', icon: Cookie, count: report.cookies.items.length },
          { id: 'storage', label: 'Storage', icon: Database },
          { id: 'fingerprint', label: 'Fingerprinting', icon: Fingerprint },
        ]}
      />

      {tab === 'connections' && (
        <Card
          title="Third-party connections"
          subtitle={`First party: ${report.firstPartyDomain}`}
          actions={
            <select className="select" value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} aria-label="Filter connections">
              <option value="all">All</option>
              <option value="known">Known services</option>
              <option value="unknown">Unclassified</option>
            </select>
          }
        >
          {conns.length === 0 ? (
            <p className="muted">No third-party connections observed.</p>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Host</th>
                    <th>Service</th>
                    <th>Types</th>
                    <th>Req.</th>
                  </tr>
                </thead>
                <tbody>
                  {conns.map((c) => (
                    <tr key={c.hostname}>
                      <td className="mono break">{c.hostname}</td>
                      <td>
                        {c.service ? (
                          <div className="stack" style={{ gap: 2 }}>
                            <span>{c.service.name}</span>
                            <span className="row row--wrap">
                              <Badge tone={CAT_TONE[c.service.category] ?? 'default'}>{c.service.category}</Badge>
                              <ConfidenceBadge confidence={c.confidence} />
                            </span>
                          </div>
                        ) : (
                          <span className="subtle">Unclassified</span>
                        )}
                      </td>
                      <td className="subtle">{c.resourceTypes.join(', ')}</td>
                      <td>{c.requestCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {tab === 'cookies' && (
        <Card title="Cookies" subtitle="Names and attributes only. Cookie values are never read into the interface or uploaded.">
          {report.cookies.source !== 'cookies-api' && (
            <Callout>
              {report.cookies.source === 'document.cookie'
                ? 'Showing only names of non-HttpOnly first-party cookies visible to the page. '
                : 'Cookie analysis needs the optional "cookies" permission. '}
              <button type="button" className="btn btn--sm" style={{ marginTop: 6 }} onClick={grantCookies}>
                Allow full cookie attribute analysis for this site
              </button>
            </Callout>
          )}
          {report.cookies.items.length > 0 && (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Domain</th>
                    <th>Expires</th>
                    <th>Flags</th>
                  </tr>
                </thead>
                <tbody>
                  {report.cookies.items.map((c, i) => (
                    <tr key={`${c.domain}|${c.name}|${i}`}>
                      <td className="mono break">{c.name}</td>
                      <td className="mono break">
                        {c.domain} {!c.firstParty && <Badge tone="warning">3rd party</Badge>}
                      </td>
                      <td className="subtle">{c.session ? 'Session' : c.expires ? new Date(c.expires * 1000).toLocaleDateString() : '—'}</td>
                      <td>
                        <span className="row row--wrap">
                          {c.secure && <Badge tone="success">Secure</Badge>}
                          {c.httpOnly === true && <Badge tone="success">HttpOnly</Badge>}
                          {c.httpOnly === undefined && <Badge>HttpOnly ?</Badge>}
                          <Badge>SameSite={c.sameSite}</Badge>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {tab === 'storage' && report.storage && (
        <Card title="Site storage" subtitle="Counts and approximate sizes only. Stored values are never extracted.">
          <dl className="kv">
            <dt>localStorage</dt>
            <dd>{report.storage.localStorage.available ? `${report.storage.localStorage.keyCount} keys · ~${formatBytes(report.storage.localStorage.approxBytes)}` : 'Not accessible'}</dd>
            <dt>sessionStorage</dt>
            <dd>{report.storage.sessionStorage.available ? `${report.storage.sessionStorage.keyCount} keys · ~${formatBytes(report.storage.sessionStorage.approxBytes)}` : 'Not accessible'}</dd>
            <dt>IndexedDB</dt>
            <dd>{report.storage.indexedDB.databases.length ? report.storage.indexedDB.databases.join(', ') : 'No databases listed'}</dd>
            <dt>Origin usage</dt>
            <dd>{report.storage.estimate?.usage !== undefined ? formatBytes(report.storage.estimate.usage) : '—'}</dd>
          </dl>
          {report.storage.localStorage.keys.length > 0 && (
            <details style={{ marginTop: 8 }}>
              <summary className="subtle">localStorage key names</summary>
              <div className="row row--wrap" style={{ marginTop: 6 }}>
                {report.storage.localStorage.keys.map((k) => <Badge key={k}>{k}</Badge>)}
              </div>
            </details>
          )}
        </Card>
      )}

      {tab === 'fingerprint' && (
        <Card title="Fingerprinting indicators" icon={Fingerprint}>
          {!report.fingerprinting.monitored ? (
            <Callout>
              The fingerprinting monitor was not active on this page. It must observe the page from the moment it starts loading, so it requires
              all-sites access and the "Fingerprinting monitor" setting. Enable both in Settings, then reload the page and rescan.
            </Callout>
          ) : report.fingerprinting.signals.length === 0 ? (
            <p className="muted">No monitored fingerprinting-capable API calls were observed.</p>
          ) : (
            <table className="table">
              <thead>
                <tr><th>API</th><th>Kind</th><th>Calls</th></tr>
              </thead>
              <tbody>
                {report.fingerprinting.signals.map((s) => (
                  <tr key={s.api}><td className="mono">{s.api}</td><td>{s.kind}</td><td>{s.count}</td></tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="subtle" style={{ marginBottom: 0 }}>Use of these APIs is an indicator only — they have many legitimate uses.</p>
        </Card>
      )}
    </>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'warning' | 'danger' }) {
  return (
    <div className={`stat ${tone ? `stat--${tone}` : ''}`}>
      <div className="stat__value">{value}</div>
      <div className="stat__label">{label}</div>
    </div>
  );
}
