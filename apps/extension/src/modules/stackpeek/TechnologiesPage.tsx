import { useMemo } from 'react';
import { Layers, ExternalLink } from 'lucide-react';
import type { DetectedTechnology, StackReport, TechCategory } from '@ntm/shared';
import type { TabContext } from '../../hooks/useTabContext';
import { Card, ConfidenceBadge, CopyButton, formatTime } from '../../components/common';
import { EngineGate } from '../../components/dashboard/EngineGate';

const CATEGORY_LABEL: Record<TechCategory, string> = {
  'frontend-framework': 'Frontend frameworks',
  'meta-framework': 'Meta-frameworks',
  cms: 'CMS',
  ecommerce: 'E-commerce',
  'js-library': 'JavaScript libraries',
  'css-framework': 'CSS frameworks & UI kits',
  analytics: 'Analytics',
  'tag-manager': 'Tag managers',
  cdn: 'CDN',
  hosting: 'Hosting / PaaS',
  server: 'Server & backend indicators',
  security: 'Security',
  font: 'Fonts & icons',
  other: 'Other',
};

export function TechnologiesPage({ ctx }: { ctx: TabContext }) {
  return (
    <div className="stack">
      <EngineGate ctx={ctx} state={ctx.scan?.stack} engineName="StackPeek" enabled={ctx.settings.modules.stackpeek}>
        {(r) => <StackView ctx={ctx} report={r} />}
      </EngineGate>
    </div>
  );
}

function StackView({ ctx, report }: { ctx: TabContext; report: StackReport }) {
  const groups = useMemo(() => {
    const m = new Map<TechCategory, DetectedTechnology[]>();
    for (const t of report.technologies) m.set(t.category, [...(m.get(t.category) ?? []), t]);
    return [...m.entries()];
  }, [report.technologies]);

  const asText = report.technologies.map((t) => `${t.name}${t.version ? ' ' + t.version : ''} (${t.category}, ${t.confidence})`).join('\n');

  return (
    <>
      <Card
        title={`${report.technologies.length} technologies detected`}
        icon={Layers}
        subtitle={`Signatures v${report.signatureVersion} · ${formatTime(report.scannedAt)}`}
        actions={
          <>
            <CopyButton text={asText} label="Copy" />
            <button type="button" className="btn btn--sm" onClick={() => void ctx.runScan(['stack'])}>Rescan</button>
          </>
        }
      >
        <p className="subtle" style={{ margin: 0 }}>
          Detected from observable evidence only (DOM, scripts, loaded resources, meta tags, cookie names, same-origin response headers).
          Hidden backend technologies cannot be identified without evidence.
        </p>
      </Card>
      {report.technologies.length === 0 && <Card><p className="muted" style={{ margin: 0 }}>No known technology signatures matched this page.</p></Card>}
      {groups.map(([cat, techs]) => (
        <Card key={cat} title={CATEGORY_LABEL[cat]}>
          <ul className="tech-list">
            {techs.map((t) => (
              <li key={t.id} className="tech">
                <div className="row row--between">
                  <div className="row" style={{ minWidth: 0 }}>
                    <span className="tech__avatar" aria-hidden>{t.name.slice(0, 1)}</span>
                    <strong className="truncate">{t.name}</strong>
                    {t.version && <span className="badge badge--accent">v{t.version}</span>}
                  </div>
                  <div className="row">
                    <ConfidenceBadge confidence={t.confidence} />
                    {t.website && (
                      <a href={t.website} target="_blank" rel="noreferrer noopener" className="btn btn--ghost btn--icon btn--sm" title={`${t.name} website`}>
                        <ExternalLink size={12} />
                      </a>
                    )}
                  </div>
                </div>
                <details className="tech__evidence">
                  <summary className="subtle">Evidence ({t.evidence.length})</summary>
                  <ul>
                    {t.evidence.map((e, i) => <li key={i} className="mono break">{e}</li>)}
                  </ul>
                </details>
              </li>
            ))}
          </ul>
        </Card>
      ))}
    </>
  );
}
