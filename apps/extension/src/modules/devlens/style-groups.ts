/** Curated computed-style properties, grouped for display. Shared by content script and UI. */
export const STYLE_GROUPS: Record<string, readonly string[]> = {
  Layout: [
    'display',
    'position',
    'top',
    'right',
    'bottom',
    'left',
    'z-index',
    'width',
    'height',
    'min-width',
    'max-width',
    'min-height',
    'max-height',
    'box-sizing',
    'overflow-x',
    'overflow-y',
    'flex-direction',
    'flex-wrap',
    'justify-content',
    'align-items',
    'align-self',
    'flex-grow',
    'flex-shrink',
    'flex-basis',
    'gap',
    'grid-template-columns',
    'grid-template-rows',
    'float',
  ],
  Spacing: [
    'margin-top',
    'margin-right',
    'margin-bottom',
    'margin-left',
    'padding-top',
    'padding-right',
    'padding-bottom',
    'padding-left',
  ],
  Typography: [
    'font-family',
    'font-size',
    'font-weight',
    'font-style',
    'line-height',
    'letter-spacing',
    'text-align',
    'text-transform',
    'text-decoration-line',
    'white-space',
    'color',
  ],
  Background: ['background-color', 'background-image', 'background-size', 'background-position', 'background-repeat'],
  Border: [
    'border-top-width',
    'border-right-width',
    'border-bottom-width',
    'border-left-width',
    'border-top-style',
    'border-top-color',
    'border-right-color',
    'border-bottom-color',
    'border-left-color',
    'border-top-left-radius',
    'border-top-right-radius',
    'border-bottom-right-radius',
    'border-bottom-left-radius',
    'outline-style',
  ],
  Effects: ['opacity', 'box-shadow', 'filter', 'backdrop-filter', 'transform', 'transition', 'cursor', 'visibility'],
};

export const ALL_STYLE_PROPS: readonly string[] = Object.values(STYLE_GROUPS).flat();

/** Values that are browser defaults and add noise when copying CSS. */
const DEFAULTISH = new Set(['none', 'normal', 'auto', '0px', 'static', 'visible', 'rgba(0, 0, 0, 0)', 'start']);

export function isNoiseValue(prop: string, value: string): boolean {
  if (!value) return true;
  if (prop === 'display' || prop === 'position' || prop === 'color' || prop.startsWith('font')) return false;
  return DEFAULTISH.has(value);
}
