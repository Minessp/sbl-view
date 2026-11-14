import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { registerServiceWorker } from './pwa/register';
import { startPointerLight } from './ui/pointerLight';
import './ui/base.css';

const root = document.getElementById('root');
if (!root) throw new Error('#root ausente');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

registerServiceWorker();
startPointerLight();
