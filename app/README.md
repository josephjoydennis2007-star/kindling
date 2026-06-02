# Kindling app

See the **root README** ([../README.md](../README.md)) for product overview, features, and running instructions.

This directory is the React + Vite app — most day-to-day work happens in `src/`.

## Quick commands

```bash
npm install               # one-time
npm run dev               # local dev server on :3000
npm run build             # production bundle into dist/
npm run preview           # serve the production bundle locally
npm run test:e2e          # Playwright smoke test
npm run test:e2e:ui       # interactive Playwright UI
```

## Source layout

| Path             | What's in it                                              |
| ---------------- | --------------------------------------------------------- |
| `src/App.tsx`    | Root layout, keyboard shortcuts, context menus            |
| `src/main.tsx`   | Entrypoint, error handlers, service worker registration   |
| `src/components/`| All UI — writer / director / plot / collab / comments…   |
| `src/lib/`       | Firestore data layer, importers, exporters, AI, sync     |
| `src/hooks/`     | Custom hooks (useIndexedDB, useStoryRole, useNotifications)|
| `src/store/`     | Zustand store + persist                                   |
| `src/types/`     | Shared TypeScript types                                   |
| `public/`        | Service worker, manifest, icons, reset.html escape hatch  |
| `tests/`         | Playwright smoke test                                     |

## Conventions

- New features land as components in `src/components/<feature>.tsx` + a small data hook in `src/hooks/` if they need to subscribe to Firestore
- Cloud writes go through `src/lib/cloudStories.ts` (wrapped in `withRecovery` for the stuck-offline auto-fix)
- TopBar visibility-gated actions check `useStoryRole()` for cloud collab permissions
- Every keyboard handler must guard `if (typeof e.key !== 'string' || !e.key) return;` (see App.tsx onKey) — some IME / extension events arrive without a `.key`
