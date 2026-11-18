import { useEffect, useState, type ReactNode } from 'react';
import { Crosshair, MousePointerClick, Square, X } from 'lucide-react';
import type { Box, ElementInspection, NodeRef } from '@ntm/shared';
import { Badge, Card, CopyButton, StateBlock } from '../../../components/common';
import { onEvent, send } from '../../../core/messaging/client';
import { STYLE_GROUPS, isNoiseValue } from '../style-groups';
import { toCssDeclarations, toCssRule } from '../tokens';
import { parseColor, toHex } from '../color';

function meaningfulStyles(styles: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(styles)) if (!isNoiseValue(k, v)) out[k] = v;
  return out;
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function BoxModel({ el }: { el: ElementInspection }) {
  const side = (b: Box, s: keyof Box) => <span className="dl-box__v">{fmt(b[s]) === '0' ? '–' : fmt(b[s])}</span>;
  const ring = (label: string, b: Box, cls: string, inner: ReactNode) => (
    <div className={`dl-box__ring ${cls}`}>
      <span className="dl-box__label">{label}</span>
      <div className="dl-box__top">{side(b, 'top')}</div>
      <div className="dl-box__mid">
        {side(b, 'left')}
        {inner}
        {side(b, 'right')}
      </div>
      <div className="dl-box__bottom">{side(b, 'bottom')}</div>
    </div>
  );
  const contentW = el.rect.width - el.padding.left - el.padding.right - el.border.left - el.border.right;
  const contentH = el.rect.height - el.padding.top - el.padding.bottom - el.border.top - el.border.bottom;
  return (
    <div className="dl-box" aria-label="Box model">
      {ring(
        'margin',
        el.margin,
        'dl-box--margin',
        ring(
          'border',
          el.border,
          'dl-box--border',
          ring(
            'padding',
            el.padding,
            'dl-box--padding',
            <div className="dl-box__content">
              {fmt(Math.max(0, contentW))} × {fmt(Math.max(0, contentH))}
            </div>,
          ),
        ),
      )}
    </div>
  );
}

function Crumb({ node, onPick }: { node: NodeRef; onPick: (sel: string) => void }) {
  return (
    <button type="button" className="dl-crumb" title={node.selector} onClick={() => onPick(node.selector)}>
      {node.tag}
      {node.id ? `#${node.id}` : ''}
      {node.classes[0] ? `.${node.classes[0]}` : ''}
    </button>
  );
}

function ColorChip({ value }: { value: string }) {
  const c = parseColor(value);
  if (!c) return null;
  return <span className="dl-chip" style={{ background: toHex(c) }} aria-hidden />;
}

export function InspectPanel({ tabId }: { tabId: number }) {
  const [picking, setPicking] = useState(false);
  const [el, setEl] = useState<ElementInspection | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    const off = onEvent((ev) => {
      if (ev.type === 'devlens/elementSelected') {
        if (ev.tabId !== undefined && ev.tabId !== tabId) return;
        setEl(ev.inspection);
        setPicking(false);
      } else if (ev.type === 'devlens/pickerClosed') {
        setPicking(false);
      }
    });
    return () => {
      off();
      // Best effort: remove page overlay when leaving the panel or switching tabs.
      send('devlens/pickerStop', { tabId }).catch(() => undefined);
    };
  }, [tabId]);

  useEffect(() => {
    setEl(null);
    setPicking(false);
    setError(null);
  }, [tabId]);

  const start = async () => {
    setError(null);
    try {
      await send('devlens/pickerStart', { tabId });
      setPicking(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  const stop = async () => {
    setPicking(false);
    await send('devlens/pickerStop', { tabId }).catch(() => undefined);
  };
  const inspect = async (selector: string) => {
    setError(null);
    try {
      const res = await send('devlens/inspectSelector', { tabId, selector });
      if (res) setEl(res);
      else setError('Element no longer exists on the page.');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const styles = el ? (showAll ? el.styles : meaningfulStyles(el.styles)) : {};

  return (
    <div className="stack">
      <Card
        title="Element inspector"
        icon={Crosshair}
        subtitle={picking ? 'Hover the page and click an element. Press Esc to cancel.' : 'Select an element on the page to inspect it.'}
        actions={
          picking ? (
            <button type="button" className="btn btn--sm" onClick={stop}>
              <X size={13} /> Cancel
            </button>
          ) : (
            <>
              {el && (
                <button type="button" className="btn btn--sm btn--ghost" onClick={stop} title="Remove page highlight">
                  <Square size={13} /> Clear
                </button>
              )}
              <button type="button" className="btn btn--sm btn--primary" onClick={start}>
                <MousePointerClick size={13} /> Pick element
              </button>
            </>
          )
        }
      >
        {error && <p className="subtle" role="alert">{error}</p>}
        {!el && !error && (
          <StateBlock
            title={picking ? 'Picker active' : 'No element selected'}
            body={picking ? 'Click any element on the page.' : 'Use “Pick element”, then click something on the page.'}
            kind={picking ? 'loading' : 'empty'}
          />
        )}
      </Card>

      {el && (
        <>
          <Card
            title={
              <span className="mono truncate">
                &lt;{el.tag}
                {el.id ? `#${el.id}` : ''}&gt;
              </span>
            }
            actions={<CopyButton text={el.selector} label="Selector" />}
          >
            <dl className="kv">
              <dt>Selector</dt>
              <dd className="mono break">{el.selector}</dd>
              <dt>Size</dt>
              <dd>
                {fmt(el.rect.width)} × {fmt(el.rect.height)} px
              </dd>
              <dt>Position</dt>
              <dd>
                x {fmt(el.rect.x)}, y {fmt(el.rect.y)} (viewport)
              </dd>
              {el.classes.length > 0 && (
                <>
                  <dt>Classes</dt>
                  <dd className="row row--wrap">
                    {el.classes.map((c) => (
                      <Badge key={c} tone="accent">
                        .{c}
                      </Badge>
                    ))}
                  </dd>
                </>
              )}
            </dl>
            {el.parents.length > 0 && (
              <>
                <div className="divider" />
                <div className="subtle">Parents (click to inspect)</div>
                <div className="dl-crumbs">
                  {[...el.parents].reverse().map((p) => (
                    <Crumb key={p.selector} node={p} onPick={inspect} />
                  ))}
                  <span className="dl-crumb dl-crumb--current">{el.tag}</span>
                </div>
              </>
            )}
          </Card>

          <Card title="Box model">
            <BoxModel el={el} />
          </Card>

          <Card
            title="Typography"
            actions={
              <CopyButton
                label="Copy"
                text={toCssDeclarations({
                  'font-family': el.typography.fontFamily,
                  'font-size': el.typography.fontSize,
                  'font-weight': el.typography.fontWeight,
                  'line-height': el.typography.lineHeight,
                  'letter-spacing': el.typography.letterSpacing,
                  color: el.typography.color,
                })}
              />
            }
          >
            <dl className="kv">
              <dt>Family</dt>
              <dd>{el.typography.fontFamily}</dd>
              <dt>Size</dt>
              <dd>{el.typography.fontSize}</dd>
              <dt>Weight</dt>
              <dd>{el.typography.fontWeight}</dd>
              <dt>Line height</dt>
              <dd>{el.typography.lineHeight}</dd>
              <dt>Letter spacing</dt>
              <dd>{el.typography.letterSpacing}</dd>
              <dt>Color</dt>
              <dd className="row">
                <ColorChip value={el.typography.color} />
                <span className="mono">{el.typography.color}</span>
              </dd>
            </dl>
          </Card>

          <Card
            title="Computed styles"
            subtitle={showAll ? 'All curated properties' : 'Non-default values'}
            actions={
              <>
                <button type="button" className="btn btn--sm btn--ghost" onClick={() => setShowAll((v) => !v)}>
                  {showAll ? 'Hide defaults' : 'Show all'}
                </button>
                <CopyButton label="CSS" text={toCssDeclarations(styles)} />
                <CopyButton label="Rule" text={toCssRule(el.selector, styles)} />
              </>
            }
          >
            {Object.entries(STYLE_GROUPS).map(([group, props]) => {
              const rows = props.filter((p) => p in styles);
              if (rows.length === 0) return null;
              return (
                <div key={group} className="dl-group">
                  <div className="dl-group__title">{group}</div>
                  <table className="table">
                    <tbody>
                      {rows.map((p) => (
                        <tr key={p}>
                          <td className="mono muted" style={{ width: '42%' }}>
                            {p}
                          </td>
                          <td className="mono break">
                            <span className="row">
                              {(p.includes('color') || p === 'color') && <ColorChip value={styles[p]!} />}
                              {styles[p]}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })}
          </Card>

          <Card title="Children" subtitle={`${el.childCount} direct child element${el.childCount === 1 ? '' : 's'}`}>
            {el.children.length === 0 ? (
              <p className="subtle">No child elements.</p>
            ) : (
              <div className="dl-crumbs">
                {el.children.map((c) => (
                  <Crumb key={c.selector} node={c} onPick={inspect} />
                ))}
                {el.childCount > el.children.length && (
                  <span className="subtle">+{el.childCount - el.children.length} more</span>
                )}
              </div>
            )}
          </Card>

          {el.attributes.length > 0 && (
            <Card title="Attributes" subtitle="Values of non-allow-listed attributes are hidden.">
              <table className="table">
                <tbody>
                  {el.attributes.map((a) => (
                    <tr key={a.name}>
                      <td className="mono muted" style={{ width: '35%' }}>
                        {a.name}
                      </td>
                      <td className="mono break">{a.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
