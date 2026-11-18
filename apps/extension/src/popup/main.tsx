import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../styles/global.scss';
import '../styles/layout.scss';
import { Popup } from './Popup';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Popup />
  </StrictMode>,
);
