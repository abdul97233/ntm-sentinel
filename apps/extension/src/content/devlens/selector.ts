/** Unique CSS selector generation for an element. Read-only DOM access. */

const cssEscape = (s: string): string =>
  typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
    ? CSS.escape(s)
    : s.replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`);

/** Class names that look generated (hashes) are poor selector anchors. */
function isStableClass(c: string): boolean {
  if (c.length > 40) return false;
  if (/^(css|sc|jsx|emotion|svelte)-[a-z0-9]{4,}$/i.test(c)) return false;
  if (/[0-9a-f]{6,}/i.test(c) && /\d/.test(c)) return false;
  return /^[a-zA-Z_-][\w-]*$/.test(c);
}

function isUnique(selector: string, root: ParentNode): boolean {
  try {
    return root.querySelectorAll(selector).length === 1;
  } catch {
    return false;
  }
}

function segmentFor(el: Element): string {
  const tag = el.tagName.toLowerCase();
  const classes = Array.from(el.classList).filter(isStableClass).slice(0, 2);
  let seg = tag + classes.map((c) => `.${cssEscape(c)}`).join('');
  const parent = el.parentElement;
  if (parent) {
    const sameKind = Array.from(parent.children).filter((c) => c.tagName === el.tagName);
    if (sameKind.length > 1) {
      const idx = Array.from(parent.children).indexOf(el) + 1;
      seg = `${tag}${classes.map((c) => `.${cssEscape(c)}`).join('')}:nth-child(${idx})`;
    }
  }
  return seg;
}

export function uniqueSelector(el: Element): string {
  const doc = el.ownerDocument;
  if (el === doc.documentElement) return 'html';
  if (el === doc.body) return 'body';
  if (el.id && /^[a-zA-Z][\w-]*$/.test(el.id) && isUnique(`#${cssEscape(el.id)}`, doc)) return `#${cssEscape(el.id)}`;

  for (const attr of ['data-testid', 'data-test', 'data-cy']) {
    const v = el.getAttribute(attr);
    if (v && v.length < 80) {
      const s = `${el.tagName.toLowerCase()}[${attr}="${v.replace(/"/g, '\\"')}"]`;
      if (isUnique(s, doc)) return s;
    }
  }

  const parts: string[] = [];
  let cur: Element | null = el;
  while (cur && cur !== doc.documentElement && parts.length < 12) {
    if (cur.id && /^[a-zA-Z][\w-]*$/.test(cur.id) && isUnique(`#${cssEscape(cur.id)}`, doc)) {
      parts.unshift(`#${cssEscape(cur.id)}`);
      break;
    }
    parts.unshift(segmentFor(cur));
    const candidate = parts.join(' > ');
    if (isUnique(candidate, doc)) return candidate;
    cur = cur.parentElement;
  }
  const full = parts.join(' > ');
  return full || el.tagName.toLowerCase();
}
