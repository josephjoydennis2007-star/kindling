/**
 * Kindling router — real multi-page URLs without a framework rewrite.
 *
 * Every workspace gets an address:
 *   /                     → home (dashboard / Creator OS)
 *   /youtube              → YouTube studio (launcher or active video)
 *   /s/:storyId/:tab      → a specific story open on a specific page
 *                           (e.g. /s/abc123/storyboard, /s/abc123/writer)
 *
 * What this buys (the "professional app" behaviors):
 *   - Browser back/forward move between pages and stories
 *   - Bookmark/share a link straight to a story's storyboard
 *   - Open two different stories in two browser tabs
 *
 * Design: a tiny two-way sync between the URL and the Zustand store
 * (activeStoryId + activeTab). No react-router dependency — the app keeps its
 * existing render logic; we only translate state ↔ location. An `applying`
 * flag prevents pushState/popstate feedback loops. Firebase hosting already
 * rewrites every path to index.html, and Vite's dev server does the same, so
 * deep links load fine.
 */

import { useAppStore } from '@/store/useAppStore';
import type { AppTab } from '@/types';

const TABS: AppTab[] = [
  'dashboard', 'writer', 'outline', 'world', 'research',
  'director', 'plot', 'storyboard', 'calendar', 'locations',
  'youtube', 'workspace',
];

function isTab(v: string): v is AppTab {
  return (TABS as string[]).includes(v);
}

/** Build the canonical path for a given app state. */
export function routeFor(storyId: string | null, tab: AppTab): string {
  if (storyId) return `/s/${encodeURIComponent(storyId)}/${tab}`;
  if (tab === 'youtube') return '/youtube';
  return '/';
}

/** Parse a pathname into { storyId, tab } (null = no opinion). */
export function parseRoute(pathname: string): { storyId: string | null; tab: AppTab | null } {
  const parts = pathname.split('/').filter(Boolean);
  if (parts.length === 0) return { storyId: null, tab: 'dashboard' };
  if (parts[0] === 'youtube') return { storyId: null, tab: 'youtube' };
  if (parts[0] === 's' && parts[1]) {
    const storyId = decodeURIComponent(parts[1]);
    const tab = parts[2] && isTab(parts[2]) ? (parts[2] as AppTab) : 'writer';
    return { storyId, tab };
  }
  return { storyId: null, tab: null }; // unknown path — leave state alone
}

let applying = false;
let installed = false;

/** Apply a URL to the store (used on first load + back/forward). */
function applyLocation(isFirstLoad = false) {
  const { storyId, tab } = parseRoute(location.pathname);
  const st = useAppStore.getState();

  // First load at the bare root: keep the user's persisted resume-where-I-was
  // behavior (last story + tab restored by zustand/persist) and seed the URL
  // from state instead of resetting state from the URL.
  if (isFirstLoad && location.pathname === '/' && st.activeStoryId) {
    history.replaceState(null, '', routeFor(st.activeStoryId, st.activeTab));
    return;
  }

  applying = true;
  try {
    if (storyId && st.stories.some((s) => s.id === storyId)) {
      if (st.activeStoryId !== storyId) st.loadStory(storyId);
      if (tab && st.activeTab !== tab) st.setTab(tab);
    } else if (storyId) {
      // Unknown story id (maybe not recovered from cloud yet) — go home rather
      // than show a broken shell. The link works once the story exists.
      if (tab && st.activeTab !== tab) st.setTab(tab);
    } else if (tab) {
      if (st.activeTab !== tab) st.setTab(tab);
    }
  } finally {
    // Release on the next tick so the store-subscription below ignores the
    // changes we just made.
    setTimeout(() => { applying = false; }, 0);
  }
}

/**
 * Install the URL ↔ state sync. Call ONCE at app boot (after the store has
 * rehydrated from localStorage, which is synchronous with zustand/persist).
 */
export function installRouter(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  // 1) URL → state on first load (deep link).
  applyLocation(true);

  // 2) URL → state on back/forward.
  window.addEventListener('popstate', () => applyLocation());

  // 3) State → URL on navigation inside the app.
  let prevStory = useAppStore.getState().activeStoryId;
  let prevTab = useAppStore.getState().activeTab;
  useAppStore.subscribe((s) => {
    if (s.activeStoryId === prevStory && s.activeTab === prevTab) return;
    prevStory = s.activeStoryId;
    prevTab = s.activeTab;
    if (applying) return;
    const path = routeFor(s.activeStoryId, s.activeTab);
    if (location.pathname !== path) {
      history.pushState(null, '', path);
    }
  });
}
