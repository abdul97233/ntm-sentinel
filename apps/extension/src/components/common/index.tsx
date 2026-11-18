/**
 * Shared UI primitives. Styling lives in styles/global.scss (BEM-ish class names).
 * All page-derived strings are rendered as React text nodes (auto-escaped); never
 * use dangerouslySetInnerHTML with page content.
 */
import { useEffect, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  Check,
  Copy,
  Inbox,
  Info,
  Lock,
  OctagonAlert,
  ShieldQuestion,
  type LucideIcon,
} from 'lucide-react';
import type { Confidence, RiskLevel, ScanStatus, Severity } from '@ntm/shared';

export function Card(props: {
  title?: ReactNode;
  icon?: LucideIcon;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  const Icon = props.icon;
  return (
    <section className={`card ${props.className ?? ''}`}>
      {(props.title || props.actions) && (
        <header className="card__header">
          <div style={{ minWidth: 0 }}>
            {props.title && (
              <h3 className="card__title">
                {Icon && <Icon size={16} aria-hidden />}
                {props.title}
              </h3>
            )}
            {props.subtitle && <p className="card__subtitle">{props.subtitle}</p>}
          </div>
          {props.actions && <div className="row">{props.actions}</div>}
        </header>
      )}
      {props.children}
    </section>
  );
}

type BadgeTone = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'accent' | 'violet' | Severity | RiskLevel;

export function Badge({ tone = 'default', children, title }: { tone?: BadgeTone; children: ReactNode; title?: string }) {
  return (
    <span className={`badge badge--${tone}`} title={title}>
      {children}
    </span>
  );
}

const RISK_LABEL: Record<RiskLevel, string> = {
  low: 'Low risk',
  moderate: 'Moderate risk',
  high: 'High risk',
  critical: 'Critical risk',
  unknown: 'Unknown',
};

export function RiskBadge({ level }: { level: RiskLevel }) {
  return <Badge tone={level === 'unknown' ? 'default' : level}>{RISK_LABEL[level]}</Badge>;
}

const SEVERITY_TONE: Record<Severity, BadgeTone> = {
  info: 'info',
  low: 'low',
  moderate: 'moderate',
  high: 'high',
  critical: 'critical',
};

export function SeverityBadge({ severity }: { severity: Severity }) {
  return <Badge tone={SEVERITY_TONE[severity]}>{severity.toUpperCase()}</Badge>;
}

export function ConfidenceBadge({ confidence }: { confidence: Confidence }) {
  const tone = confidence === 'high' ? 'success' : confidence === 'medium' ? 'warning' : 'default';
  return (
    <Badge tone={tone} title="Detection confidence">
      {confidence} confidence
    </Badge>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <span className="row" role="status">
      <span className="spinner" aria-hidden />
      {label && <span className="muted">{label}</span>}
    </span>
  );
}

export function StateBlock(props: {
  kind?: 'empty' | 'error' | 'permission' | 'loading' | 'unsupported';
  title: string;
  body?: ReactNode;
  action?: ReactNode;
  icon?: LucideIcon;
}) {
  const kind = props.kind ?? 'empty';
  const Icon =
    props.icon ??
    (kind === 'error' ? OctagonAlert : kind === 'permission' ? Lock : kind === 'unsupported' ? ShieldQuestion : Inbox);
  return (
    <div className={`state state--${kind}`}>
      <div className="state__icon">{kind === 'loading' ? <span className="spinner" /> : <Icon size={20} />}</div>
      <div className="state__title">{props.title}</div>
      {props.body && <div className="state__body">{props.body}</div>}
      {props.action}
    </div>
  );
}

const STATUS_LABEL: Record<ScanStatus, string> = {
  'not-scanned': 'Not scanned',
  scanning: 'Scanning',
  completed: 'Completed',
  failed: 'Failed',
  unsupported: 'Unsupported',
  'permission-required': 'Permission required',
};

export function StatusPill({ status }: { status: ScanStatus }) {
  const tone: BadgeTone =
    status === 'completed'
      ? 'success'
      : status === 'failed'
        ? 'danger'
        : status === 'permission-required'
          ? 'warning'
          : status === 'scanning'
            ? 'accent'
            : 'default';
  return <Badge tone={tone}>{STATUS_LABEL[status]}</Badge>;
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for contexts where the async clipboard API is unavailable (e.g. DevTools panels).
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

export function CopyButton({ text, label, small = true }: { text: string; label?: string; small?: boolean }) {
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => setDone(false), 1200);
    return () => clearTimeout(t);
  }, [done]);
  return (
    <button
      type="button"
      className={`btn btn--ghost ${small ? 'btn--sm' : ''} ${label ? '' : 'btn--icon'}`}
      title={label ?? 'Copy'}
      aria-label={label ?? 'Copy'}
      onClick={async () => setDone(await copyText(text))}
    >
      {done ? <Check size={13} /> : <Copy size={13} />}
      {label && <span>{done ? 'Copied' : label}</span>}
    </button>
  );
}

export function Callout({
  tone = 'info',
  children,
}: {
  tone?: 'info' | 'warning' | 'danger';
  children: ReactNode;
}) {
  const Icon = tone === 'info' ? Info : AlertTriangle;
  return (
    <div className={`callout ${tone !== 'info' ? `callout--${tone}` : ''}`}>
      <Icon size={15} aria-hidden />
      <div>{children}</div>
    </div>
  );
}

export function Tabs<T extends string>(props: {
  value: T;
  onChange: (v: T) => void;
  items: { id: T; label: string; icon?: LucideIcon; count?: number }[];
  ariaLabel: string;
}) {
  return (
    <div className="tabs" role="tablist" aria-label={props.ariaLabel}>
      {props.items.map((it) => {
        const Icon = it.icon;
        const active = it.id === props.value;
        return (
          <button
            key={it.id}
            type="button"
            role="tab"
            aria-selected={active}
            className={`tabs__tab ${active ? 'tabs__tab--active' : ''}`}
            onClick={() => props.onChange(it.id)}
          >
            {Icon && <Icon size={13} aria-hidden />}
            {it.label}
            {typeof it.count === 'number' && <span className="subtle">{it.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function Switch(props: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <label className="switch" title={props.label}>
      <input
        type="checkbox"
        checked={props.checked}
        disabled={props.disabled}
        aria-label={props.label}
        onChange={(e) => props.onChange(e.target.checked)}
      />
      <span />
    </label>
  );
}

export function Modal(props: { open: boolean; title: string; children: ReactNode; onClose: () => void; actions?: ReactNode }) {
  useEffect(() => {
    if (!props.open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && props.onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [props.open, props.onClose]);
  if (!props.open) return null;
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={props.title}>
        <h2>{props.title}</h2>
        <div className="stack">{props.children}</div>
        {props.actions && (
          <div className="row" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
            {props.actions}
          </div>
        )}
      </div>
    </div>
  );
}

export function formatTime(ts?: number): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export function formatBytes(n?: number): string {
  if (n === undefined || !Number.isFinite(n)) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** Trigger a local file download from an extension page. Data never leaves the device. */
export function downloadFile(filename: string, content: string, mime = 'application/json') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
