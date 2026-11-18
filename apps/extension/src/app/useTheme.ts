import { useEffect } from 'react';
import type { Settings } from '../core/storage/settings';

export function useTheme(theme: Settings['theme']) {
  useEffect(() => {
    const apply = () => {
      const resolved =
        theme === 'system' ? (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark') : theme;
      document.documentElement.setAttribute('data-theme', resolved);
    };
    apply();
    if (theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme]);
}
