import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import PanelApp from './PanelApp.tsx';

const root = document.getElementById('root');
if (!root) throw new Error('Drop panel mount point missing');
createRoot(root).render(
  <StrictMode>
    <PanelApp />
  </StrictMode>,
);
