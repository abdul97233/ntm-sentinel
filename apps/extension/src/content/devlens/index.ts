/**
 * DevLens content-script entry. The scanner content script forwards every
 * ContentRequest here; returns undefined for messages that are not DevLens's.
 */
import type { ContentRequest } from '../../core/messaging/contract';
import { inspectElement } from './inspect';
import { highlightSelected, startPicker, stopPicker } from './picker';
import { extractAssets, extractColors, extractTypography, viewportInfo } from './scan';

export function handleDevLensRequest(msg: ContentRequest): Promise<unknown> | undefined {
  switch (msg.type) {
    case 'devlens/pickerStart':
      startPicker();
      return Promise.resolve({ ok: true });
    case 'devlens/pickerStop':
      stopPicker();
      return Promise.resolve({ ok: true });
    case 'devlens/inspectSelector': {
      let el: Element | null = null;
      try {
        el = document.querySelector(msg.selector);
      } catch {
        el = null;
      }
      if (!el) return Promise.resolve(null);
      highlightSelected(el);
      el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      return Promise.resolve(inspectElement(el));
    }
    case 'devlens/colors':
      return Promise.resolve(extractColors());
    case 'devlens/typography':
      return Promise.resolve(extractTypography());
    case 'devlens/assets':
      return Promise.resolve(extractAssets());
    case 'devlens/viewport':
      return Promise.resolve(viewportInfo());
    default:
      return undefined;
  }
}

export { stopPicker };
