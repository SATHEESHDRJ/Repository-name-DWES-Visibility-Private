import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import ErrorBoundary from './components/ErrorBoundary.tsx';
import { registerDwesServiceWorker } from './pwa/registerServiceWorker.ts';
import GlobalFieldIcons from './components/ui/GlobalFieldIcons.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
      <GlobalFieldIcons />
    </ErrorBoundary>
  </StrictMode>,
);

registerDwesServiceWorker();
