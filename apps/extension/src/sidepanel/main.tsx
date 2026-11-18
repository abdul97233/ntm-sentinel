import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../styles/global.scss';
import '../styles/layout.scss';
import { SidePanelApp } from './SidePanelApp';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SidePanelApp />
  </StrictMode>,
);
