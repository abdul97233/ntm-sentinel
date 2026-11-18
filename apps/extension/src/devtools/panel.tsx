import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../styles/global.scss';
import '../modules/apiwatch/apiwatch.scss';
import { ApiWatchPanel } from '../modules/apiwatch/ApiWatchPanel';

// Follow the DevTools theme (light/dark) when it is exposed.
if (chrome.devtools?.panels?.themeName === 'default') {
  document.documentElement.dataset.theme = 'light';
}

const el = document.getElementById('root');
if (el) {
  createRoot(el).render(
    <StrictMode>
      <ApiWatchPanel />
    </StrictMode>,
  );
}
