/**
 * DevLens responsive preview: opens the current page in a separate popup window
 * sized so its *viewport* approximates the requested dimensions.
 *
 * chrome.windows.create sizes the outer window, so the browser chrome (title bar,
 * address bar, borders) must be added. The caller measures that offset from the
 * current tab (outerWidth - innerWidth / outerHeight - innerHeight) and passes it.
 * The result is approximate: popup windows have slightly different chrome than
 * normal windows, OS scaling may round, and the OS may clamp the window to the
 * available screen area. The UI displays the real viewport measured afterwards.
 */

const MIN_W = 200;
const MIN_H = 200;
const MAX_W = 7680;
const MAX_H = 4320;
/** Reasonable fallback offsets when no measurement is available. */
const DEFAULT_OFFSET = { w: 16, h: 88 };

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(n)));

export async function openResponsiveWindow(
  tabId: number,
  width: number,
  height: number,
  chromeOffset?: { w: number; h: number },
): Promise<{ windowId: number }> {
  const tab = await chrome.tabs.get(tabId);
  const url = tab.url;
  if (!url || !/^https?:/i.test(url)) {
    throw new Error('Responsive preview is only available for http(s) pages');
  }
  const off = {
    w: chromeOffset && Number.isFinite(chromeOffset.w) ? clamp(chromeOffset.w, 0, 200) : DEFAULT_OFFSET.w,
    h: chromeOffset && Number.isFinite(chromeOffset.h) ? clamp(chromeOffset.h, 0, 300) : DEFAULT_OFFSET.h,
  };
  const win = await chrome.windows.create({
    url,
    type: 'popup',
    width: clamp(width, MIN_W, MAX_W) + off.w,
    height: clamp(height, MIN_H, MAX_H) + off.h,
    focused: true,
  });
  if (win?.id === undefined) throw new Error('Failed to open preview window');
  return { windowId: win.id };
}
