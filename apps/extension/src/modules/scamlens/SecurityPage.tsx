import { useState } from 'react';
import { CheckCircle2, CircleSlash, Cloud, Route, ShieldAlert, ShieldCheck } from 'lucide-react';
import type { SecurityReport } from '@ntm/shared';
import { toUnicodeHostname } from '@ntm/shared';
import type { TabContext } from '../../hooks/useTabContext';
import { send } from '../../core/messaging/client';
import { Badge, Callout, Card, RiskBadge, Spinner, formatTime } from '../../components/common';
import { EngineGate } from '../../components/dashboard/EngineGate';
import { FindingList } from '../../components/dashboard/FindingList';

export function SecurityPage({ ctx }: { ctx: TabContext }) {
  return (
    <div className="stack">
      <EngineGate ctx={ctx} state={ctx.scan?.security} engineName="ScamLens" enabled={ctx.settings.modules.scamlens}>
        {(report) => <SecurityReportView ctx={ctx} report={report} />}
      </EngineGate>
    </div>
  );
}

function SecurityReportView({ ctx, report }: { ctx: TabContext; report: SecurityReport }) {
  const [repBusy, setRepBusy] = useState(false);
  const [repError, setRepError] = useState<string | null>(null);
  const unicode = toUnicodeHostname(report.hostname);
  const rep = report.reputation;

  const checkReputation = async () => {
    if (ctx.tabId === null) return;
    setRepBusy(true);
    setRepError(null);
    try {
      await send('reputation/check', { tabId: ctx.tabId });
    } catch (e) {
      setRepError(e instanceof Error ? e.message : String(e));
    } finally {
      setRepBusy(false);
    }
  };

  return (
    <>
      <Card
        title="Risk assessment"
        icon={report.riskLevel === 'low' ? ShieldCheck : ShieldAlert}
        actions={<button type="button" className="btn btn--sm" onClick={() => void ctx.runScan(['security'])}>Rescan</button>}
      >
        <div className="row row--between">
          <div style={{ minWidth: 0 }}>
            <div className="hero-host truncate" title={report.hostname}>{unicode}</div>
            {unicode !== report.hostname && <div className="subtle mono">{report.hostname}</div>}
          </div>
          <RiskBadge level={report.riskLevel} />
        </div>
        <p className="subtle" style={{ marginBottom: 0 }}>
          Risk is derived from the indicators listed below. No indicator does not mean a site is safe — NTM Sentinel never
          guarantees safety. Scanned {formatTime(report.scannedAt)}.
        </p>
      </Card>

      <Card title={`Findings (${report.findings.length})`} icon={ShieldAlert}>
        <FindingList findings={report.findings} emptyText="No suspicious indicators were observed by the checks that ran." />
      </Card>

      <Card title="Cloud reputation" icon={Cloud} subtitle="Optional. Sends only the hostname to the NTM backend, which queries configured threat-intelligence providers.">
        {!ctx.settings.cloudReputation ? (
          <Callout>Cloud reputation is off. Turn it on in Settings → Privacy &amp; cloud to check this hostname against external threat lists.</Callout>
        ) : (
          <div className="stack">
            <div className="row">
              <button type="button" className="btn btn--primary btn--sm" disabled={repBusy} onClick={checkReputation}>
                Check {report.hostname}
              </button>
              {repBusy && <Spinner label="Querying providers…" />}
            </div>
            {repError && <Callout tone="danger">{repError}</Callout>}
            {rep && (
              <div className="stack">
                {rep.status !== 'ok' && <Callout tone="warning">{rep.message ?? `Reputation status: ${rep.status}`}. Local checks above are unaffected.</Callout>}
                {rep.verdicts.map((v) => (
                  <div key={v.provider} className="row row--between">
                    <span>{v.provider}</span>
                    <Badge tone={v.verdict === 'malicious' ? 'critical' : v.verdict === 'suspicious' ? 'warning' : v.verdict === 'clean' ? 'success' : 'default'}>
                      {v.verdict === 'clean' ? 'no threat listed' : v.verdict}
                    </Badge>
                  </div>
                ))}
                {rep.status === 'ok' && <div className="subtle">{rep.cached ? 'Cached result. ' : ''}"No threat listed" means the provider has no record, not that the site is safe.</div>}
              </div>
            )}
          </div>
        )}
      </Card>

      {report.redirects.length > 0 && (
        <Card title="Observed navigation" icon={Route}>
          <ol className="redirects">
            {report.redirects.map((r, i) => (
              <li key={i}>
                <span className="mono break">{r.url}</span>
                <span className="subtle"> {r.qualifiers.join(', ')}</span>
              </li>
            ))}
          </ol>
        </Card>
      )}

      <Card title="Coverage" subtitle="What was and was not checked for this report">
        <ul className="coverage">
          {report.coverage.map((c) => (
            <li key={c.name}>
              {c.ran ? <CheckCircle2 size={14} className="ok" /> : <CircleSlash size={14} className="no" />}
              <span>{c.name}</span>
              {c.note && <span className="subtle"> — {c.note}</span>}
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
