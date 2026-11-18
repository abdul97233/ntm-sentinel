/**
 * StackPeek signature engine. Evaluates data-only signatures against a PageSnapshot.
 * Every reported technology carries the evidence that matched.
 */
import type { Confidence, DetectedTechnology } from './types';
import type { PageSnapshot } from './snapshot';
import type { TechSignature, TechSignatureBundle } from './schemas';

export const DETECTION_THRESHOLD = 30;

export interface SignatureRequirements {
  globals: string[];
  selectors: string[];
  selectorAttrs: { selector: string; attr: string }[];
}

/** What the content script / MAIN-world probe must collect for this bundle. */
export function collectRequirements(bundle: TechSignatureBundle): SignatureRequirements {
  const globals = new Set<string>();
  const selectors = new Set<string>();
  const attrs = new Map<string, { selector: string; attr: string }>();
  for (const sig of bundle.signatures) {
    for (const r of sig.rules) {
      if (r.type === 'global') globals.add(r.path);
      if (r.type === 'selector') selectors.add(r.selector);
    }
    for (const v of sig.version ?? []) {
      if (v.from === 'global') globals.add(v.path);
      if (v.from === 'selectorAttr') attrs.set(`${v.selector}|${v.attr}`, { selector: v.selector, attr: v.attr });
    }
  }
  return { globals: [...globals], selectors: [...selectors], selectorAttrs: [...attrs.values()] };
}

const regexCache = new Map<string, RegExp | null>();
function re(pattern: string): RegExp | null {
  let r = regexCache.get(pattern);
  if (r === undefined) {
    try {
      r = new RegExp(pattern, 'i');
    } catch {
      r = null;
    }
    regexCache.set(pattern, r);
  }
  return r;
}

function short(s: string, n = 90) {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

function confidenceFor(score: number): Confidence {
  return score >= 80 ? 'high' : score >= 50 ? 'medium' : 'low';
}

function evaluate(sig: TechSignature, s: PageSnapshot): { score: number; evidence: string[] } {
  let score = 0;
  const evidence: string[] = [];
  for (const rule of sig.rules) {
    let hit: string | null = null;
    switch (rule.type) {
      case 'global':
        if (rule.path in s.globals) hit = `window.${rule.path} is defined`;
        break;
      case 'selector':
        if (s.matchedSelectors.includes(rule.selector)) hit = `DOM matches ${rule.selector}`;
        break;
      case 'scriptSrc': {
        const r = re(rule.pattern);
        const m = r && s.scripts.find((src) => r.test(src));
        if (m) hit = `script ${short(m)}`;
        break;
      }
      case 'resource': {
        const r = re(rule.pattern);
        const m = r && (s.resources.find((e) => r.test(e.url))?.url ?? s.scripts.find((src) => r.test(src)));
        if (m) hit = `resource ${short(m)}`;
        break;
      }
      case 'meta': {
        const v = s.meta[rule.name.toLowerCase()];
        const r = re(rule.pattern);
        if (v !== undefined && r?.test(v)) hit = `<meta name="${rule.name}" content="${short(v, 60)}">`;
        break;
      }
      case 'header': {
        const v = s.headerProbe.headers[rule.name.toLowerCase()];
        const r = re(rule.pattern);
        if (v !== undefined && r?.test(v)) hit = `header ${rule.name}: ${short(v, 60)}`;
        break;
      }
      case 'cookie': {
        const r = re(rule.pattern);
        const m = r && s.cookieNames.find((n) => r.test(n));
        if (m) hit = `cookie name "${m}"`;
        break;
      }
      case 'classPattern': {
        const r = re(rule.pattern);
        const m = r && s.classSample.find((c) => r.test(c));
        if (m) hit = `class "${short(m, 50)}"`;
        break;
      }
    }
    if (hit) {
      score += rule.weight;
      evidence.push(hit);
    }
  }
  return { score, evidence };
}

function extractVersion(sig: TechSignature, s: PageSnapshot): string | undefined {
  for (const v of sig.version ?? []) {
    let candidate: string | undefined;
    if (v.from === 'global') {
      const val = s.globals[v.path];
      if (typeof val === 'string') candidate = val;
    } else if (v.from === 'scriptSrc') {
      const r = re(v.pattern);
      for (const src of s.scripts) {
        const m = r?.exec(src);
        if (m?.[1]) {
          candidate = m[1];
          break;
        }
      }
    } else if (v.from === 'meta') {
      const val = s.meta[v.name.toLowerCase()];
      candidate = val ? re(v.pattern)?.exec(val)?.[1] : undefined;
    } else if (v.from === 'header') {
      const val = s.headerProbe.headers[v.name.toLowerCase()];
      candidate = val ? re(v.pattern)?.exec(val)?.[1] : undefined;
    } else if (v.from === 'selectorAttr') {
      const val = s.selectorAttrs[`${v.selector}|${v.attr}`];
      candidate = val ? re(v.pattern)?.exec(val)?.[1] : undefined;
    }
    if (candidate && /^[\w.+-]{1,40}$/.test(candidate)) return candidate;
  }
  return undefined;
}

export function detectTechnologies(snapshot: PageSnapshot, bundle: TechSignatureBundle): DetectedTechnology[] {
  const found = new Map<string, DetectedTechnology>();
  for (const sig of bundle.signatures) {
    const { score, evidence } = evaluate(sig, snapshot);
    if (score < DETECTION_THRESHOLD) continue;
    found.set(sig.id, {
      id: sig.id,
      name: sig.name,
      category: sig.category,
      confidence: confidenceFor(score),
      version: extractVersion(sig, snapshot),
      evidence,
      website: sig.website,
    });
  }
  // Implied technologies (e.g. Next.js -> React), only added if not detected directly.
  for (const sig of bundle.signatures) {
    if (!found.has(sig.id)) continue;
    for (const impliedId of sig.implies ?? []) {
      if (found.has(impliedId)) continue;
      const implied = bundle.signatures.find((x) => x.id === impliedId);
      if (!implied) continue;
      found.set(impliedId, {
        id: implied.id,
        name: implied.name,
        category: implied.category,
        confidence: 'medium',
        evidence: [`implied by ${sig.name}`],
        website: implied.website,
      });
    }
  }
  const rank: Record<Confidence, number> = { high: 0, medium: 1, low: 2 };
  return [...found.values()].sort((a, b) => rank[a.confidence] - rank[b.confidence] || a.name.localeCompare(b.name));
}
