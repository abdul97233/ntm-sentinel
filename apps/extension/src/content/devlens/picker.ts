/**
 * DevLens element picker.
 *
 * Renders a highlight overlay inside a closed Shadow DOM so page CSS cannot affect it
 * and page scripts cannot reach into it. The overlay never intercepts pointer events;
 * the click that selects an element is captured and cancelled so the page does not
 * react to it (no link navigation, no button handlers).
 */
import { inspectElement } from './inspect';

const HOST_ATTR = 'data-ntm-devlens';

interface Overlay {
  host: HTMLElement;
  hover: Layer;
  selected: Layer;
}

interface Layer {
  root: HTMLDivElement;
  margin: HTMLDivElement;
  border: HTMLDivElement;
  padding: HTMLDivElement;
  content: HTMLDivElement;
  label: HTMLDivElement;
}

let overlay: Overlay | null = null;
let picking = false;
let hoverEl: Element | null = null;
let selectedEl: Element | null = null;
let rafId = 0;

const STYLE = `
:host { all: initial; }
.layer { position: fixed; inset: 0; pointer-events: none; z-index: 2147483647; display: none; }
.layer.on { display: block; }
.box { position: fixed; pointer-events: none; box-sizing: border-box; }
.margin { background: rgba(245, 158, 11, 0.22); }
.border { background: rgba(250, 204, 21, 0.25); }
.padding { background: rgba(34, 197, 94, 0.22); }
.content { background: rgba(59, 130, 246, 0.32); outline: 1px solid rgba(59, 130, 246, 0.9); }
.selected .content { background: rgba(139, 92, 246, 0.14); outline: 2px solid #8b5cf6; }
.selected .margin, .selected .padding, .selected .border { background: transparent; }
.label { position: fixed; pointer-events: none; font: 600 11px/1.4 ui-monospace, Consolas, monospace;
  background: #0d1525; color: #f1f5f9; border: 1px solid rgba(148,163,184,.3); border-radius: 4px;
  padding: 2px 6px; white-space: nowrap; max-width: 60vw; overflow: hidden; text-overflow: ellipsis; }
.label b { color: #60a5fa; font-weight: 600; }
.label span { color: #94a3b8; }
`;

function makeLayer(shadow: ShadowRoot, extraClass: string): Layer {
  const root = document.createElement('div');
  root.className = `layer ${extraClass}`;
  const mk = (cls: string) => {
    const d = document.createElement('div');
    d.className = `box ${cls}`;
    root.appendChild(d);
    return d;
  };
  const layer: Layer = {
    root,
    margin: mk('margin'),
    border: mk('border'),
    padding: mk('padding'),
    content: mk('content'),
    label: document.createElement('div'),
  };
  layer.label.className = 'label';
  root.appendChild(layer.label);
  shadow.appendChild(root);
  return layer;
}

function ensureOverlay(): Overlay {
  if (overlay && overlay.host.isConnected) return overlay;
  const host = document.createElement('div');
  host.setAttribute(HOST_ATTR, '');
  host.style.cssText = 'all: initial; position: fixed; inset: 0; pointer-events: none; z-index: 2147483647;';
  const shadow = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = STYLE;
  shadow.appendChild(style);
  const hover = makeLayer(shadow, 'hover');
  const selected = makeLayer(shadow, 'selected');
  document.documentElement.appendChild(host);
  overlay = { host, hover, selected };
  return overlay;
}

function place(d: HTMLElement, x: number, y: number, w: number, h: number) {
  d.style.left = `${x}px`;
  d.style.top = `${y}px`;
  d.style.width = `${Math.max(0, w)}px`;
  d.style.height = `${Math.max(0, h)}px`;
}

function paint(layer: Layer, el: Element | null) {
  if (!el || !el.isConnected) {
    layer.root.classList.remove('on');
    return;
  }
  const r = el.getBoundingClientRect();
  const cs = getComputedStyle(el);
  const n = (p: string) => parseFloat(cs.getPropertyValue(p)) || 0;
  const m = { t: n('margin-top'), r: n('margin-right'), b: n('margin-bottom'), l: n('margin-left') };
  const b = { t: n('border-top-width'), r: n('border-right-width'), b: n('border-bottom-width'), l: n('border-left-width') };
  const p = { t: n('padding-top'), r: n('padding-right'), b: n('padding-bottom'), l: n('padding-left') };

  place(layer.margin, r.left - m.l, r.top - m.t, r.width + m.l + m.r, r.height + m.t + m.b);
  place(layer.border, r.left, r.top, r.width, r.height);
  place(layer.padding, r.left + b.l, r.top + b.t, r.width - b.l - b.r, r.height - b.t - b.b);
  place(
    layer.content,
    r.left + b.l + p.l,
    r.top + b.t + p.t,
    r.width - b.l - b.r - p.l - p.r,
    r.height - b.t - b.b - p.t - p.b,
  );

  // Label: text nodes only (page-derived strings are never parsed as HTML).
  layer.label.textContent = '';
  const tag = document.createElement('b');
  tag.textContent = el.tagName.toLowerCase();
  const extra = document.createElement('span');
  const id = el.id ? `#${el.id}` : '';
  const cls = el.classList.length ? `.${Array.from(el.classList).slice(0, 2).join('.')}` : '';
  extra.textContent = `${id}${cls}  ${Math.round(r.width)}×${Math.round(r.height)}`;
  layer.label.append(tag, extra);
  const labelY = r.top - 24 >= 0 ? r.top - 24 : Math.min(window.innerHeight - 22, r.bottom + 4);
  layer.label.style.left = `${Math.max(2, Math.min(r.left, window.innerWidth - 200))}px`;
  layer.label.style.top = `${labelY}px`;
  layer.root.classList.add('on');
}

function isOwn(el: Element | null): boolean {
  return !!el && !!overlay && (el === overlay.host || el.hasAttribute?.(HOST_ATTR));
}

function schedulePaint() {
  if (rafId) return;
  rafId = requestAnimationFrame(() => {
    rafId = 0;
    if (!overlay) return;
    paint(overlay.hover, picking ? hoverEl : null);
    paint(overlay.selected, selectedEl);
  });
}

function onMove(e: MouseEvent) {
  const t = e.target instanceof Element ? e.target : null;
  if (!t || isOwn(t)) return;
  if (t !== hoverEl) {
    hoverEl = t;
    schedulePaint();
  }
}

function swallow(e: Event) {
  if (!picking) return;
  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();
}

function onClick(e: MouseEvent) {
  if (!picking) return;
  swallow(e);
  const t = e.target instanceof Element ? e.target : hoverEl;
  if (!t || isOwn(t)) return;
  selectedEl = t;
  endPicking();
  schedulePaint();
  let inspection;
  try {
    inspection = inspectElement(t);
  } catch {
    return;
  }
  chrome.runtime
    .sendMessage({ channel: 'ntm-event', type: 'devlens/elementSelected', inspection })
    .catch(() => undefined);
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    swallow(e);
    stopPicker();
  }
}

function onViewportChange() {
  schedulePaint();
}

function endPicking() {
  picking = false;
  hoverEl = null;
  window.removeEventListener('mousemove', onMove, true);
  window.removeEventListener('click', onClick, true);
  window.removeEventListener('mousedown', swallow, true);
  window.removeEventListener('mouseup', swallow, true);
  window.removeEventListener('pointerdown', swallow, true);
  window.removeEventListener('pointerup', swallow, true);
  window.removeEventListener('keydown', onKey, true);
  document.documentElement.style.removeProperty('cursor');
}

export function startPicker(): void {
  ensureOverlay();
  if (picking) return;
  picking = true;
  window.addEventListener('mousemove', onMove, true);
  window.addEventListener('click', onClick, true);
  window.addEventListener('mousedown', swallow, true);
  window.addEventListener('mouseup', swallow, true);
  window.addEventListener('pointerdown', swallow, true);
  window.addEventListener('pointerup', swallow, true);
  window.addEventListener('keydown', onKey, true);
  window.addEventListener('scroll', onViewportChange, { capture: true, passive: true });
  window.addEventListener('resize', onViewportChange, { passive: true });
  document.documentElement.style.setProperty('cursor', 'crosshair', 'important');
}

/** Stops picking and removes every overlay and listener. */
export function stopPicker(): void {
  const wasActive = picking || !!overlay;
  endPicking();
  window.removeEventListener('scroll', onViewportChange, true);
  window.removeEventListener('resize', onViewportChange);
  if (rafId) cancelAnimationFrame(rafId);
  rafId = 0;
  selectedEl = null;
  overlay?.host.remove();
  overlay = null;
  if (wasActive) {
    chrome.runtime.sendMessage({ channel: 'ntm-event', type: 'devlens/pickerClosed' }).catch(() => undefined);
  }
}

/** Outline an element chosen from the side panel (e.g. breadcrumb navigation). */
export function highlightSelected(el: Element | null): void {
  if (!el) return;
  ensureOverlay();
  selectedEl = el;
  window.addEventListener('scroll', onViewportChange, { capture: true, passive: true });
  window.addEventListener('resize', onViewportChange, { passive: true });
  schedulePaint();
}

export function isPicking(): boolean {
  return picking;
}
