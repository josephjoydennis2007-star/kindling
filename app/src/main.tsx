import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import ErrorBoundary from './components/ErrorBoundary.tsx'

// Stamp a build marker on window + console so we can see at a glance whether
// the fresh bundle actually loaded. Bump on every deploy with intent.
const KINDLING_BUILD = 'v12-2026.05.30-role-system'
;(window as any).__KINDLING_BUILD__ = KINDLING_BUILD;
// eslint-disable-next-line no-console
console.log(`%c⚙ Kindling ${KINDLING_BUILD}`, 'color:#a855f7;font-weight:bold;font-size:14px');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)

// Register the service worker for offline + installable PWA. Skipped on the
// Vite dev server because HMR doesn't play well with caching.
//
// On every load we also `update()` the registration so a newly-deployed SW
// activates without the user manually purging anything. When an update is
// found and a controller is already active, we reload once so the new
// bundle takes over.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then((reg) => {
      // Poll for updates roughly every 30 min; cheap call, no network if
      // the deployed SW byte-matches the local one.
      setInterval(() => reg.update().catch(() => {}), 30 * 60 * 1000);
      reg.update().catch(() => {});
    }).catch(() => {});

    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return;
      refreshing = true;
      // The SW activated a new version after taking over (clients.claim).
      // Reload so the page picks up the new HTML+JS.
      window.location.reload();
    });
  });
}
