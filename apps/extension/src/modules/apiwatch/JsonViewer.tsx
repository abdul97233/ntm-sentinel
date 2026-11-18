/**
 * Lightweight collapsible JSON tree. All values are rendered as React text nodes
 * (auto-escaped). No innerHTML anywhere.
 */
import { useMemo, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown, Search } from 'lucide-react';
import { CopyButton } from '../../components/common';

const SEP = '\u0000';
const CHILD_PAGE = 300;

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

function isContainer(v: unknown): v is Json[] | Record<string, Json> {
  return v !== null && typeof v === 'object';
}

function entriesOf(v: Json[] | Record<string, Json>): [string, Json][] {
  return Array.isArray(v) ? v.map((x, i) => [String(i), x]) : Object.entries(v);
}

/** Collect all container paths (for expand-all). */
export function allContainerPaths(root: unknown, limit = 20000): Set<string> {
  const out = new Set<string>();
  const walk = (v: unknown, path: string) => {
    if (out.size >= limit || !isContainer(v)) return;
    out.add(path);
    for (const [k, c] of entriesOf(v)) walk(c, path + SEP + k);
  };
  walk(root, '$');
  return out;
}

/**
 * Find paths whose key or primitive value contains `query` (case-insensitive).
 * Returns the matching paths and every ancestor path that must be expanded to show them.
 */
export function searchJson(root: unknown, query: string, limit = 2000): { matches: Set<string>; expand: Set<string> } {
  const matches = new Set<string>();
  const expand = new Set<string>();
  const q = query.trim().toLowerCase();
  if (!q) return { matches, expand };
  const walk = (v: unknown, path: string, key: string, ancestors: string[]) => {
    if (matches.size >= limit) return;
    const keyHit = key.toLowerCase().includes(q);
    const valHit = !isContainer(v) && String(v).toLowerCase().includes(q);
    if (keyHit || valHit) {
      matches.add(path);
      ancestors.forEach((a) => expand.add(a));
    }
    if (isContainer(v)) {
      const next = [...ancestors, path];
      for (const [k, c] of entriesOf(v)) walk(c, path + SEP + k, k, next);
    }
  };
  walk(root, '$', '', []);
  return { matches, expand };
}

function Highlight({ text, query }: { text: string; query: string }) {
  const q = query.trim().toLowerCase();
  if (!q) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(q);
  if (idx < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="jv-mark">{text.slice(idx, idx + q.length)}</mark>
      {text.slice(idx + q.length)}
    </>
  );
}

function Primitive({ value, query }: { value: Json; query: string }) {
  if (value === null) return <span className="jv-null">null</span>;
  if (typeof value === 'string')
    return (
      <span className="jv-string">
        &quot;
        <Highlight text={value} query={query} />
        &quot;
      </span>
    );
  if (typeof value === 'number')
    return (
      <span className="jv-number">
        <Highlight text={String(value)} query={query} />
      </span>
    );
  return <span className="jv-bool">{String(value)}</span>;
}

interface NodeProps {
  name: string | null;
  value: Json;
  path: string;
  expanded: Set<string>;
  toggle: (path: string) => void;
  query: string;
  matches: Set<string>;
  isIndex: boolean;
}

function Node({ name, value, path, expanded, toggle, query, matches, isIndex }: NodeProps): ReactNode {
  const [shown, setShown] = useState(CHILD_PAGE);
  const hit = matches.has(path);
  const label =
    name === null ? null : (
      <span className={isIndex ? 'jv-index' : 'jv-key'}>
        {isIndex ? name : <Highlight text={name} query={query} />}
        <span className="jv-punct">: </span>
      </span>
    );
  if (!isContainer(value)) {
    return (
      <div className={`jv-row ${hit ? 'jv-row--hit' : ''}`} role="treeitem" aria-selected={false}>
        <span className="jv-spacer" />
        {label}
        <Primitive value={value} query={query} />
      </div>
    );
  }
  const entries = entriesOf(value);
  const open = expanded.has(path);
  const isArr = Array.isArray(value);
  return (
    <div role="treeitem" aria-expanded={open} aria-selected={false}>
      <div className={`jv-row jv-row--toggle ${hit ? 'jv-row--hit' : ''}`} onClick={() => toggle(path)}>
        <span className="jv-caret">{open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}</span>
        {label}
        <span className="jv-punct">{isArr ? '[' : '{'}</span>
        {!open && (
          <span className="jv-summary">
            {entries.length} {isArr ? (entries.length === 1 ? 'item' : 'items') : entries.length === 1 ? 'key' : 'keys'}
          </span>
        )}
        {!open && <span className="jv-punct">{isArr ? ']' : '}'}</span>}
      </div>
      {open && (
        <div className="jv-children" role="group">
          {entries.slice(0, shown).map(([k, v]) => (
            <Node
              key={k}
              name={k}
              value={v}
              path={path + SEP + k}
              expanded={expanded}
              toggle={toggle}
              query={query}
              matches={matches}
              isIndex={isArr}
            />
          ))}
          {entries.length > shown && (
            <button type="button" className="btn btn--sm btn--ghost" onClick={() => setShown((s) => s + CHILD_PAGE)}>
              Show {Math.min(CHILD_PAGE, entries.length - shown)} more of {entries.length - shown} remaining
            </button>
          )}
          <div className="jv-row">
            <span className="jv-spacer" />
            <span className="jv-punct">{isArr ? ']' : '}'}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export function JsonTree({ value, initialDepth = 1 }: { value: unknown; initialDepth?: number }) {
  const initial = useMemo(() => {
    const s = new Set<string>();
    const walk = (v: unknown, path: string, depth: number) => {
      if (!isContainer(v) || depth > initialDepth) return;
      s.add(path);
      for (const [k, c] of entriesOf(v)) walk(c, path + SEP + k, depth + 1);
    };
    walk(value, '$', 1);
    return s;
  }, [value, initialDepth]);
  const [expanded, setExpanded] = useState<Set<string>>(initial);
  const [query, setQuery] = useState('');
  const { matches, expand } = useMemo(() => searchJson(value, query), [value, query]);
  const effective = useMemo(() => {
    if (!expand.size) return expanded;
    const s = new Set(expanded);
    expand.forEach((p) => s.add(p));
    return s;
  }, [expanded, expand]);

  const toggle = (path: string) =>
    setExpanded(() => {
      const s = new Set(effective);
      if (s.has(path)) s.delete(path);
      else s.add(path);
      return s;
    });

  return (
    <div className="jv">
      <div className="jv-toolbar row">
        <label className="jv-search row">
          <Search size={12} aria-hidden />
          <input
            className="input"
            placeholder="Search JSON keys and values"
            aria-label="Search JSON"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        {query.trim() && (
          <span className="subtle" data-testid="jv-match-count">
            {matches.size} {matches.size === 1 ? 'match' : 'matches'}
          </span>
        )}
        <button type="button" className="btn btn--sm btn--ghost" onClick={() => setExpanded(allContainerPaths(value))}>
          <ChevronsUpDown size={12} /> Expand all
        </button>
        <button type="button" className="btn btn--sm btn--ghost" onClick={() => setExpanded(new Set())}>
          <ChevronsDownUp size={12} /> Collapse all
        </button>
      </div>
      <div className="jv-tree mono" role="tree" aria-label="JSON tree">
        <Node
          name={null}
          value={value as Json}
          path="$"
          expanded={effective}
          toggle={toggle}
          query={query}
          matches={matches}
          isIndex={false}
        />
      </div>
    </div>
  );
}

export const MAX_BODY_PREVIEW = 2 * 1024 * 1024;

/**
 * Body viewer: JSON tree / pretty / raw modes for JSON, plain text otherwise.
 * Bodies above MAX_BODY_PREVIEW are truncated and not parsed.
 */
export function BodyViewer({ text, mimeType }: { text: string; mimeType: string }) {
  const tooLarge = text.length > MAX_BODY_PREVIEW;
  const parsed = useMemo(() => {
    if (tooLarge) return { ok: false as const };
    const t = text.trim();
    if (!(mimeType.includes('json') || t.startsWith('{') || t.startsWith('['))) return { ok: false as const };
    try {
      return { ok: true as const, value: JSON.parse(t) as unknown };
    } catch {
      return { ok: false as const };
    }
  }, [text, mimeType, tooLarge]);
  const [mode, setMode] = useState<'tree' | 'pretty' | 'raw'>('tree');
  const preview = tooLarge ? text.slice(0, MAX_BODY_PREVIEW) : text;

  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="row row--between">
        <div className="row">
          {parsed.ok &&
            (['tree', 'pretty', 'raw'] as const).map((m) => (
              <button
                key={m}
                type="button"
                className={`btn btn--sm ${mode === m ? 'btn--primary' : ''}`}
                onClick={() => setMode(m)}
              >
                {m === 'tree' ? 'Tree' : m === 'pretty' ? 'Pretty' : 'Raw'}
              </button>
            ))}
        </div>
        <CopyButton text={text} label="Copy response" />
      </div>
      {tooLarge && (
        <div className="callout callout--warning">
          Body is {(text.length / 1024 / 1024).toFixed(1)} MB. Showing the first 2 MB as plain text; parsing is disabled
          to keep DevTools responsive. Use “Copy response” for the full body.
        </div>
      )}
      {parsed.ok && mode === 'tree' ? (
        <JsonTree value={parsed.value} />
      ) : (
        <pre className="aw-pre">{parsed.ok && mode === 'pretty' ? JSON.stringify(parsed.value, null, 2) : preview}</pre>
      )}
    </div>
  );
}
