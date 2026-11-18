/**
 * Opt-in fingerprinting API monitor. Registered dynamically (MAIN world, document_start)
 * ONLY when the user enables it in Settings and has granted all-sites access.
 *
 * It wraps a handful of APIs to COUNT calls; arguments and return values are never
 * read or stored. Behaviour of the wrapped APIs is unchanged. Counts are exposed to
 * the isolated content script via a data attribute on <html>, debounced.
 */
(() => {
  const w = window as unknown as Record<string, any>;
  if (w.__ntmFpMonitor) return;
  Object.defineProperty(w, '__ntmFpMonitor', { value: true, enumerable: false });

  const counts: Record<string, number> = {};
  let timer: number | undefined;
  const flush = () => {
    timer = undefined;
    try {
      document.documentElement?.setAttribute('data-ntm-fp', JSON.stringify(counts));
    } catch {
      /* ignore */
    }
  };
  const bump = (key: string) => {
    counts[key] = (counts[key] ?? 0) + 1;
    if (timer === undefined) timer = window.setTimeout(flush, 500);
  };

  function wrapMethod(ctorName: string, method: string) {
    const ctor = w[ctorName];
    const proto = ctor?.prototype;
    const original = proto?.[method];
    if (typeof original !== 'function') return;
    const key = `${ctorName}.${method}`;
    const wrapped = function (this: unknown, ...args: unknown[]) {
      bump(key);
      return original.apply(this, args);
    };
    try {
      Object.defineProperty(wrapped, 'name', { value: original.name });
      Object.defineProperty(proto, method, { value: wrapped, writable: true, configurable: true, enumerable: false });
    } catch {
      /* non-configurable: skip */
    }
  }

  function wrapGetter(ctorName: string, prop: string) {
    const proto = w[ctorName]?.prototype;
    if (!proto) return;
    const desc = Object.getOwnPropertyDescriptor(proto, prop);
    if (!desc?.get || !desc.configurable) return;
    const get = desc.get;
    const key = `${ctorName}.${prop}`;
    Object.defineProperty(proto, prop, {
      ...desc,
      get(this: unknown) {
        bump(key);
        return get.call(this);
      },
    });
  }

  wrapMethod('HTMLCanvasElement', 'toDataURL');
  wrapMethod('HTMLCanvasElement', 'toBlob');
  wrapMethod('CanvasRenderingContext2D', 'getImageData');
  wrapMethod('CanvasRenderingContext2D', 'measureText');
  wrapMethod('WebGLRenderingContext', 'getParameter');
  wrapMethod('WebGL2RenderingContext', 'getParameter');
  wrapMethod('WebGLRenderingContext', 'getExtension');
  wrapMethod('OfflineAudioContext', 'startRendering');
  wrapMethod('AudioContext', 'createOscillator');
  wrapMethod('AnalyserNode', 'getFloatFrequencyData');
  wrapGetter('Navigator', 'plugins');
  wrapGetter('Navigator', 'hardwareConcurrency');
  wrapGetter('Navigator', 'deviceMemory');
})();

export {};
