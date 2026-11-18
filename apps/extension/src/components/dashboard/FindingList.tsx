import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { Finding } from '@ntm/shared';
import { SeverityBadge } from '../common';

export function FindingList({ findings, emptyText }: { findings: Finding[]; emptyText: string }) {
  if (findings.length === 0) return <p className="muted" style={{ margin: 0 }}>{emptyText}</p>;
  return (
    <ul className="findings">
      {findings.map((f) => (
        <FindingItem key={f.id} f={f} />
      ))}
    </ul>
  );
}

function FindingItem({ f }: { f: Finding }) {
  const [open, setOpen] = useState(f.severity === 'critical' || f.severity === 'high');
  return (
    <li className={`finding finding--${f.severity}`}>
      <button type="button" className="finding__head" onClick={() => setOpen(!open)} aria-expanded={open}>
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span className="finding__title">{f.title}</span>
        <SeverityBadge severity={f.severity} />
      </button>
      {open && (
        <div className="finding__body">
          <div className="finding__label">Evidence</div>
          <pre className="finding__evidence">{f.evidence}</pre>
          <div className="finding__label">Why it matters</div>
          <p>{f.explanation}</p>
          {f.recommendation && (
            <>
              <div className="finding__label">Recommendation</div>
              <p>{f.recommendation}</p>
            </>
          )}
          <div className="subtle">Source: {f.source}</div>
        </div>
      )}
    </li>
  );
}
