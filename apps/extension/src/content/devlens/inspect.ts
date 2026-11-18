/** Builds an ElementInspection for a DOM element. Read-only; never reads form values. */
import type { Box, ElementInspection, NodeRef } from '@ntm/shared';
import { ALL_STYLE_PROPS } from '../../modules/devlens/style-groups';
import { uniqueSelector } from './selector';

const SAFE_ATTR_VALUES = new Set(['href', 'src', 'alt', 'role', 'type', 'name', 'title', 'rel', 'target', 'lang', 'for', 'width', 'height', 'loading', 'id', 'class']);
const SAFE_ATTR_PREFIXES = ['aria-', 'data-testid', 'data-test', 'data-cy'];
const MAX_ATTR = 40;
const MAX_VALUE = 200;

function isSafeAttr(name: string): boolean {
  return SAFE_ATTR_VALUES.has(name) || SAFE_ATTR_PREFIXES.some((p) => name.startsWith(p));
}

function px(v: string): number {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

function box(cs: CSSStyleDeclaration, prefix: string, suffix = ''): Box {
  return {
    top: px(cs.getPropertyValue(`${prefix}-top${suffix}`)),
    right: px(cs.getPropertyValue(`${prefix}-right${suffix}`)),
    bottom: px(cs.getPropertyValue(`${prefix}-bottom${suffix}`)),
    left: px(cs.getPropertyValue(`${prefix}-left${suffix}`)),
  };
}

export function nodeRef(el: Element): NodeRef {
  const ref: NodeRef = {
    tag: el.tagName.toLowerCase(),
    classes: Array.from(el.classList).slice(0, 8),
    selector: uniqueSelector(el),
  };
  if (el.id) ref.id = el.id.slice(0, 100);
  return ref;
}

function truncate(s: string, n = MAX_VALUE): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

export function inspectElement(el: Element): ElementInspection {
  const win = el.ownerDocument.defaultView ?? window;
  const cs = win.getComputedStyle(el);
  const rect = el.getBoundingClientRect();

  const styles: Record<string, string> = {};
  for (const prop of ALL_STYLE_PROPS) {
    const v = cs.getPropertyValue(prop);
    if (v !== '') styles[prop] = truncate(v, 300);
  }

  const parents: NodeRef[] = [];
  let p = el.parentElement;
  while (p && parents.length < 6) {
    parents.push(nodeRef(p));
    p = p.parentElement;
  }

  const childEls = Array.from(el.children);
  const children = childEls.slice(0, 30).map(nodeRef);

  const attributes = Array.from(el.attributes)
    .slice(0, MAX_ATTR)
    .map((a) => {
      const name = a.name.toLowerCase();
      // Never expose input values or event-handler source.
      const hidden = !isSafeAttr(name) || name === 'value' || name.startsWith('on');
      return { name, value: hidden ? '(hidden)' : truncate(a.value) };
    });

  const result: ElementInspection = {
    selector: uniqueSelector(el),
    tag: el.tagName.toLowerCase(),
    classes: Array.from(el.classList).slice(0, 30),
    rect: {
      x: Math.round(rect.x * 100) / 100,
      y: Math.round(rect.y * 100) / 100,
      width: Math.round(rect.width * 100) / 100,
      height: Math.round(rect.height * 100) / 100,
    },
    margin: box(cs, 'margin'),
    padding: box(cs, 'padding'),
    border: box(cs, 'border', '-width'),
    styles,
    typography: {
      fontFamily: cs.getPropertyValue('font-family'),
      fontSize: cs.getPropertyValue('font-size'),
      fontWeight: cs.getPropertyValue('font-weight'),
      lineHeight: cs.getPropertyValue('line-height'),
      letterSpacing: cs.getPropertyValue('letter-spacing'),
      color: cs.getPropertyValue('color'),
    },
    parents,
    children,
    childCount: childEls.length,
    attributes,
  };
  if (el.id) result.id = el.id.slice(0, 200);
  return result;
}

export function inspectSelector(selector: string): ElementInspection | null {
  let el: Element | null = null;
  try {
    el = document.querySelector(selector);
  } catch {
    return null;
  }
  return el ? inspectElement(el) : null;
}
