import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import ErrorBoundary from './components/ErrorBoundary.tsx'

// Stamp a build marker on window + console so we can see at a glance whether
// the fresh bundle actually loaded. Bump on every deploy with intent.
const KINDLING_BUILD = 'v84-2026.06.09-search-bar-youtube-connector'
;(window as any).__KINDLING_BUILD__ = KINDLING_BUILD;
// eslint-disable-next-line no-console
console.log(`%c⚙ Kindling ${KINDLING_BUILD}`, 'color:#a855f7;font-weight:bold;font-size:14px');

// Global error handlers — log the FULL stack + source so we can pinpoint
// any TypeError/permission-denied/etc. without spelunking through minified
// bundles. Source maps are now emitted by Vite so file:line are real.
window.addEventListener('error', (e: ErrorEvent) => {
  // eslint-disable-next-line no-console
  console.error(
    '%c⚠ Kindling — uncaught error',
    'color:#ef4444;font-weight:bold',
    {
      message: e.message,
      file: e.filename,
      line: e.lineno,
      col: e.colno,
      stack: e.error?.stack,
      raw: e.error,
    },
  );
});
window.addEventListener('unhandledrejection', (e: PromiseRejectionEvent) => {
  // eslint-disable-next-line no-console
  console.error(
    '%c⚠ Kindling — unhandled promise rejection',
    'color:#ef4444;font-weight:bold',
    {
      reason: e.reason,
      stack: e.reason?.stack,
      code: e.reason?.code,
      message: e.reason?.message,
    },
  );
});

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

// ─── Force-update + version watcher ────────────────────────────────────────
//
// Belt-and-braces against "I deployed but the user still sees the old app".
// `forceUpdate()` nukes every cache + service worker and hard-reloads — the
// reliable escape hatch. The watcher compares the build this page is running
// (KINDLING_BUILD) against the deployed /version.json and, if they differ,
// shows a clear, clickable "Update ready — Reload" toast instead of silently
// hoping the SW reload fires.
async function forceUpdate() {
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
  } catch { /* ignore */ }
  try {
    if (window.caches) {
      const names = await caches.keys();
      await Promise.all(names.map((n) => caches.delete(n)));
    }
  } catch { /* ignore */ }
  // Cache-busting reload.
  location.replace(location.pathname + '?u=' + Date.now());
}
(window as any).__kindlingForceUpdate = forceUpdate;

if (import.meta.env.PROD) {
  const checkVersion = async () => {
    try {
      const r = await fetch('/version.json?ts=' + Date.now(), { cache: 'no-store' });
      if (!r.ok) return;
      const j = await r.json();
      if (j?.build && j.build !== KINDLING_BUILD) {
        const { toast } = await import('sonner');
        toast.message('A new version of Kindling is ready', {
          description: 'Your browser is showing an older copy. Click to load the latest.',
          duration: Infinity,
          action: { label: 'Reload now', onClick: () => forceUpdate() },
        });
      }
    } catch { /* offline / not deployed yet — ignore */ }
  };
  // Check shortly after load, then hourly.
  setTimeout(checkVersion, 4000);
  setInterval(checkVersion, 60 * 60 * 1000);
}
