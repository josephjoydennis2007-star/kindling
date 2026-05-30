import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Toaster, toast } from 'sonner';
import { Users, Zap } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { useIndexedDB } from '@/hooks/useIndexedDB';
import { watchAuth, getProfile, upsertProfile, type UserProfile } from '@/firebase';
import AuthWall from '@/components/AuthWall';
import ProfileEditor from '@/components/ProfileEditor';
import type { User as FirebaseUser } from 'firebase/auth';
// Sidebar / CharacterBar / StatusBar / SocialBar replaced by IconRail +
// ContextPanel + StatusLine in the layout rewrite. Old files kept on disk
// for reference but no longer mounted anywhere.
import IconRail from '@/components/IconRail';
import ContextPanel from '@/components/ContextPanel';
import StatusLine from '@/components/StatusLine';
import TopBar from '@/components/TopBar';
import UserMenu from '@/components/UserMenu';
import Toolbar from '@/components/Toolbar';
import WriterView from '@/components/WriterView';
import DirectorView from '@/components/DirectorView';
import PlotBoardView from '@/components/PlotBoardView';
import RightPanel from '@/components/RightPanel';
import StorySelector from '@/components/StorySelector';
import WorkspaceView from '@/components/WorkspaceView';
import StoryDashboard from '@/components/StoryDashboard';
import CalendarView from '@/components/CalendarView';
import CommandPalette from '@/components/CommandPalette';
import Onboarding from '@/components/Onboarding';
import FindReplace from '@/components/FindReplace';
import StylePane from '@/components/StylePane';
import CompareOverlay from '@/components/CompareOverlay';
import DialogueCoach from '@/components/DialogueCoach';
import TableRead from '@/components/TableRead';
import AltTakeOverlay from '@/components/AltTakeOverlay';
import ExportDialog from '@/components/ExportDialog';
import SettingsOverlay from '@/components/SettingsOverlay';
import FloatingActionButton from '@/components/FloatingActionButton';
import './App.css';

function App() {
  const {
    activeTab,
    isFocusMode,
    settings,
    activeStoryId,
    stories,
    screenplay,
    scenes,
    shots,
    bRolls,
    characters,
    plotBoard,
    beats,
    notes,
    history,
    rightPanel,
    focusCharacterId,
    updateSettings,
    setTab,
    updateScreenplayField,
    setActiveDirectorScene,
    addBeat,
    addNote,
    deleteNote,
    addHistory,
    togglePanel,
    closePanel,
    toggleFocusMode,
    toggleSidebar,
    createStory,
    loadStory,
  } = useAppStore();

  const { ready, saveState, loadState } = useIndexedDB();
  const [initialized, setInitialized] = useState(false);
  const [showStorySelector, setShowStorySelector] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showPalette, setShowPalette] = useState(false);
  const [showCoach, setShowCoach] = useState(false);
  const [showTableRead, setShowTableRead] = useState(false);
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  // skippedAuth is persisted so "Continue without account" is a one-time
  // decision — the user shouldn't see the sign-in wall on every refresh.
  const [skippedAuth, _setSkippedAuth] = useState<boolean>(() => {
    try { return localStorage.getItem('kindling-auth-skipped') === '1'; } catch { return false; }
  });
  const setSkippedAuth = useCallback((v: boolean) => {
    _setSkippedAuth(v);
    try {
      if (v) localStorage.setItem('kindling-auth-skipped', '1');
      else localStorage.removeItem('kindling-auth-skipped');
    } catch {}
  }, []);
  const [showProfile, setShowProfile] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);

  // On mount: if user already skipped auth, mark as checked immediately (don't wait for Firebase)
  // Also restore any cached profile from localStorage
  useEffect(() => {
    try {
      if (localStorage.getItem('kindling-auth-skipped') === '1') {
        const cachedProfile = localStorage.getItem('kindling-cached-profile');
        if (cachedProfile) {
          const profile = JSON.parse(cachedProfile);
          setProfile(profile);
          updateSettings({ userId: profile.uid, userDisplayName: profile.displayName });
          setUser(null); // local mode
        }
        setAuthChecked(true);
      }
    } catch {
      // Silent fail
    }
  }, [updateSettings]);

  // Watch Firebase auth state; load (or auto-create) profile.
  //
  // FIX: setAuthChecked(true) used to live ONLY at the end of the async
  // callback, so if Firestore rules blocked getProfile()/upsertProfile()
  // or the request hung, the splash screen ("Lighting Kindling…") would
  // never go away. We now set it FIRST so the UI moves on regardless of
  // profile-fetch outcome, and wrap the Firestore calls in try/catch so
  // a missing/locked Firestore database doesn't block sign-in.
  useEffect(() => {
    const unsub = watchAuth(async (u) => {
      setUser(u);
      setAuthChecked(true); // unblock the UI immediately
      if (!u) return;
      try {
        const existing = await getProfile(u.uid);
        if (existing) {
          setProfile(existing);
          updateSettings({ userId: u.uid, userDisplayName: existing.displayName });
          try { localStorage.setItem('kindling-cached-profile', JSON.stringify(existing)); } catch {}
        } else if (!u.isAnonymous) {
          // Auto-create skeleton profile + show editor.
          const skeleton: UserProfile = {
            uid: u.uid,
            email: u.email,
            displayName: u.displayName || (u.email?.split('@')[0]) || 'You',
            role: 'writer',
            avatar: u.photoURL || null,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          };
          try {
            await upsertProfile(skeleton);
          } catch (err) {
            // Firestore unreachable or rules block writes — keep the
            // profile in memory + cached locally so sign-in still works.
            // eslint-disable-next-line no-console
            console.warn('[Kindling] Could not save profile to Firestore (using local cache instead):', err);
          }
          setProfile(skeleton);
          updateSettings({ userId: u.uid, userDisplayName: skeleton.displayName });
          try { localStorage.setItem('kindling-cached-profile', JSON.stringify(skeleton)); } catch {}
          setShowProfile(true);
        }
      } catch (err) {
        // Firestore probably isn't enabled or rules block reads. Fall back
        // to the locally-cached profile if we have one — the user can
        // still use the app, they just can't sync profile metadata.
        // eslint-disable-next-line no-console
        console.warn('[Kindling] Could not load profile from Firestore (using local cache):', err);
        try {
          const cached = localStorage.getItem('kindling-cached-profile');
          if (cached) setProfile(JSON.parse(cached));
        } catch {}
      }
    });
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load story data
  useEffect(() => {
    if (!ready) return;
    if (activeStoryId) {
      loadState(activeStoryId).then(state => {
        if (state) {
          useAppStore.setState(state);
        }
        setInitialized(true);
      });
    } else {
      setInitialized(true);
      if (stories.length === 0) {
        setShowStorySelector(true);
      }
    }
  }, [ready, activeStoryId, stories.length, loadState]);

  // ── Manual-save model ──────────────────────────────────────────────────
  //
  // The previous timer-based autosave (a setInterval that wrote to IndexedDB
  // every X seconds) was filling the browser's storage and slowing the app
  // down. Replaced with a Word/Docs-style dirty tracker:
  //
  //   - The editor's built-in undo/redo (Ctrl+Z / Ctrl+Shift+Z) handles
  //     in-document history — TipTap StarterKit ships the History extension.
  //   - We subscribe to store mutations and mark a `dirty` flag. The
  //     StatusLine renders an "Unsaved" dot when dirty.
  //   - Manual save (Ctrl+S or clicking Save) is the ONLY thing that
  //     writes to IndexedDB.
  //   - A beforeunload guard prompts the user when they try to close the
  //     tab with unsaved work so nothing is lost by accident.
  //
  // Auth-skip state stays in localStorage as before — that's a separate
  // concern from per-story document persistence.
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (!activeStoryId) return;
    // The initial story load mutates screenplay/scenes/etc. as the data
    // hydrates from IndexedDB, which would falsely mark the story dirty.
    // Skip the first ~700 ms of changes after activeStoryId switches.
    let armed = false;
    const armTimer = setTimeout(() => { armed = true; }, 700);
    setDirty(false); // reset when switching stories — they start clean

    const unsub = useAppStore.subscribe((s, prev) => {
      if (!armed) return;
      if (s.activeStoryId !== activeStoryId) return;
      if (s.screenplay !== prev.screenplay ||
          s.scenes !== prev.scenes ||
          s.shots !== prev.shots ||
          s.bRolls !== prev.bRolls ||
          s.characters !== prev.characters ||
          s.plotBoard !== prev.plotBoard ||
          s.beats !== prev.beats ||
          s.notes !== prev.notes) {
        setDirty(true);
      }
    });
    return () => { clearTimeout(armTimer); unsub(); };
  }, [activeStoryId]);

  // beforeunload guard — only warns when there's actually unsaved work.
  // Browsers ignore custom messages; just calling preventDefault triggers
  // the native confirm dialog.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Some browsers (older Chrome) still need returnValue set.
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  // Handle new story creation
  const handleCreateStory = useCallback((title: string, type?: any) => {
    const storyId = createStory(title, type);
    setShowStorySelector(false);
    return storyId;
  }, [createStory]);

  // Handle story selection
  const handleSelectStory = useCallback((storyId: string) => {
    loadStory(storyId);
    setShowStorySelector(false);
  }, [loadStory]);

  const handleManualSave = useCallback(async () => {
    if (!activeStoryId) return;
    document.dispatchEvent(new CustomEvent('writer:saving'));
    addHistory('Manual save', activeStoryId);
    const state = useAppStore.getState();
    saveState(activeStoryId, {
      screenplay: state.screenplay,
      scenes: state.scenes,
      shots: state.shots,
      bRolls: state.bRolls,
      characters: state.characters,
      plotBoard: state.plotBoard,
      beats: state.beats,
      notes: state.notes,
      history: state.history,
    });
    setDirty(false); // mark clean — Ctrl+S succeeded
    toast.success('Story saved');
    document.dispatchEvent(new CustomEvent('writer:saved'));

    // Record today's word count for the streak tracker.
    try {
      const { recordWords } = await import('@/lib/writingStats');
      const strip = (h: string) => h.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ');
      const words = (state.screenplay.elements || []).reduce((acc, el) => {
        const text = strip(el.content || '').trim();
        return text ? acc + text.split(/\s+/).filter(Boolean).length : acc;
      }, 0);
      recordWords(words);
    } catch {/* localStorage disabled */}

    // If a cloud provider is configured, also push there.
    // Errors are surfaced as toasts but don't block the save.
    const s = state.settings as any;
    const json = state.exportStory();
    try {
      const { gistPush, jsonbinPush, dropboxPush, supabasePush, webdavPush, isOnline } = await import('@/lib/cloudSync');
      if (!isOnline()) return;
      const stamp = () => new Date().toISOString();
      if (s.githubGistToken) {
        const r = await gistPush(s.githubGistToken, json, s.githubGistId);
        if (r.ok) updateSettings({ githubGistId: r.remoteId || s.githubGistId, lastCloudSyncAt: stamp() } as any);
        else toast.error(`Gist sync: ${r.error}`);
      }
      if (s.jsonbinKey) {
        const r = await jsonbinPush(s.jsonbinKey, json, s.jsonbinId);
        if (r.ok) updateSettings({ jsonbinId: r.remoteId || s.jsonbinId, lastCloudSyncAt: stamp() } as any);
        else toast.error(`JSONBin sync: ${r.error}`);
      }
      if (s.dropboxToken) {
        const r = await dropboxPush(s.dropboxToken, json);
        if (r.ok) updateSettings({ lastCloudSyncAt: stamp() } as any);
        else toast.error(`Dropbox sync: ${r.error}`);
      }
      if (s.supabaseUrl && s.supabaseAnonKey) {
        const r = await supabasePush(s.supabaseUrl, s.supabaseAnonKey, json);
        if (r.ok) updateSettings({ lastCloudSyncAt: stamp() } as any);
        else toast.error(`Supabase sync: ${r.error}`);
      }
      if (s.webdavUrl && s.webdavAuth) {
        const r = await webdavPush(s.webdavUrl, s.webdavAuth, json);
        if (r.ok) updateSettings({ lastCloudSyncAt: stamp() } as any);
        else toast.error(`WebDAV sync: ${r.error}`);
      }
    } catch {/* network or import error — silent, local save already succeeded */}
  }, [activeStoryId, addHistory, saveState, updateSettings]);

  // Kept exported via a custom event so the Command Palette + Settings can
  // call it. The rail/context layout no longer surfaces an "Import" button
  // directly; the user reaches it via Cmd+K or Settings → Files.
  const handleImport = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,.txt,.md,.markdown,.fountain,.fdx,.html,.htm';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const { importFromFile } = await import('@/lib/importers');
        const data = await importFromFile(file);
        if (!data) { toast.error('Could not parse file'); return; }
        useAppStore.setState((prev) => ({ ...prev, ...data }));
        toast.success(`Imported ${file.name}`);
      } catch (err: any) {
        toast.error(`Import failed: ${err?.message || err}`);
      }
    };
    input.click();
  }, []);

  // Re-route the legacy `app:import` custom event to the same handler so the
  // Command Palette / Settings can trigger it without prop-drilling.
  useEffect(() => {
    const onImport = () => handleImport();
    document.addEventListener('app:import', onImport);
    return () => document.removeEventListener('app:import', onImport);
  }, [handleImport]);

  // Live-sync poller — when settings.liveSync is on AND a cloud provider is
  // configured, pull every 15 seconds. Cheap polling-based "collab" without a
  // dedicated backend.
  useEffect(() => {
    const s = settings as any;
    if (!(settings as any).liveSync) return;
    const haveProvider = !!(s.githubGistToken && s.githubGistId)
      || !!(s.jsonbinKey && s.jsonbinId)
      || !!s.dropboxToken
      || !!(s.supabaseUrl && s.supabaseAnonKey)
      || !!(s.webdavUrl && s.webdavAuth);
    if (!haveProvider) return;

    let cancelled = false;
    const interval = setInterval(async () => {
      if (cancelled) return;
      try {
        const cs = await import('@/lib/cloudSync');
        if (!cs.isOnline()) return;
        let res: Awaited<ReturnType<typeof cs.gistPull>> | null = null;
        if (s.githubGistToken && s.githubGistId)         res = await cs.gistPull(s.githubGistToken, s.githubGistId);
        else if (s.jsonbinKey && s.jsonbinId)            res = await cs.jsonbinPull(s.jsonbinKey, s.jsonbinId);
        else if (s.dropboxToken)                         res = await cs.dropboxPull(s.dropboxToken);
        else if (s.webdavUrl && s.webdavAuth)            res = await cs.webdavPull(s.webdavUrl, s.webdavAuth);
        else if (s.supabaseUrl && s.supabaseAnonKey)     res = await cs.supabasePull(s.supabaseUrl, s.supabaseAnonKey);
        if (!res || !res.ok || !res.data) return;
        // Only import if the cloud data is newer than what we have. We use the
        // exportedAt field that exportStory writes; on first pull we always
        // accept.
        try {
          const remote = JSON.parse(res.data);
          const local = JSON.parse(useAppStore.getState().exportStory());
          if (typeof remote.exportedAt === 'number' && typeof local.exportedAt === 'number' && remote.exportedAt <= local.exportedAt) return;
          useAppStore.getState().importStory(res.data);
        } catch {/* malformed remote */}
      } catch {/* network glitch */}
    }, 15_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [settings]);

  // Listen for explicit "open this panel" events dispatched by buttons in
  // the sidebar / toolbar. We can't bind onClick directly on those because
  // the state lives here in App.tsx, and they don't know about it.
  useEffect(() => {
    const openCoach = () => setShowCoach(true);
    const openTableRead = () => setShowTableRead(true);
    document.addEventListener('writer:openCoach', openCoach);
    document.addEventListener('writer:openTableRead', openTableRead);
    return () => {
      document.removeEventListener('writer:openCoach', openCoach);
      document.removeEventListener('writer:openTableRead', openTableRead);
    };
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); handleManualSave(); }
      else if (mod && e.key === '\\') { e.preventDefault(); toggleSidebar(); }
      else if (mod && e.key === '.') { e.preventDefault(); toggleFocusMode(); }
      else if (mod && e.shiftKey && e.key.toLowerCase() === 'e') { e.preventDefault(); setShowExport(true); }
      else if (mod && e.key === ',') { e.preventDefault(); setShowSettings(true); }
      else if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); setShowPalette((v) => !v); }
      else if (mod && e.key.toLowerCase() === 'f' && useAppStore.getState().activeTab === 'writer') {
        e.preventDefault();
        document.dispatchEvent(new CustomEvent('writer:findOpen'));
      }
      else if (mod && e.shiftKey && e.key.toLowerCase() === 's' && useAppStore.getState().activeTab === 'writer') {
        // Ctrl/Cmd+Shift+S → toggle Style assistant
        e.preventDefault();
        document.dispatchEvent(new CustomEvent('writer:openStyle'));
      }
      else if (mod && e.shiftKey && e.key.toLowerCase() === 'c') {
        // Ctrl/Cmd+Shift+C → toggle Compare overlay
        e.preventDefault();
        document.dispatchEvent(new CustomEvent('writer:openCompare'));
      }
      else if (mod && e.shiftKey && e.key.toLowerCase() === 'd' && useAppStore.getState().activeTab === 'writer') {
        // Ctrl/Cmd+Shift+D → toggle AI Dialogue Coach
        e.preventDefault();
        setShowCoach((v) => !v);
      }
      else if (mod && e.shiftKey && e.key.toLowerCase() === 'r' && useAppStore.getState().activeTab === 'writer') {
        // Ctrl/Cmd+Shift+R → toggle Table Read mode
        e.preventDefault();
        setShowTableRead((v) => !v);
      }
      else if (mod && e.shiftKey && e.key.toLowerCase() === 'w' && useAppStore.getState().activeTab === 'writer') {
        // Ctrl/Cmd+Shift+W → "What if?" — open the AltTakeOverlay with whatever
        // the user has selected in the editor. If nothing is selected, show
        // a toast pointing them at the right gesture.
        e.preventDefault();
        const sel = window.getSelection();
        const text = sel?.toString().trim() || '';
        if (!text) {
          toast.error('Select a passage in the script first, then press Ctrl/⌘+Shift+W');
          return;
        }
        document.dispatchEvent(new CustomEvent('writer:openAltTake', {
          detail: { text, label: 'Selection' },
        }));
      }
      else if (mod && e.shiftKey && e.key.toLowerCase() === 'l' && useAppStore.getState().activeTab === 'writer') {
        // Ctrl/Cmd+Shift+L → coach the current dialogue line under cursor.
        // Walk the live DOM (TipTap paragraphs render with the screenplay
        // format as the class name) to find the dialogue paragraph the
        // selection is inside, then walk backwards to find the preceding
        // CHARACTER cue.
        e.preventDefault();
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) {
          toast.error('Put the cursor inside a dialogue line first');
          return;
        }
        let node: Node | null = sel.getRangeAt(0).startContainer;
        while (node && node.nodeType !== 1) node = node.parentNode;
        let dialogueEl: HTMLElement | null = null;
        for (let cur = node as HTMLElement | null; cur; cur = cur.parentElement) {
          if (cur.classList?.contains('dialogue')) { dialogueEl = cur; break; }
        }
        if (!dialogueEl) {
          toast.error('Cursor isn’t inside a dialogue line — try clicking one first');
          return;
        }
        // Walk previous siblings (and their previous siblings via parent walk)
        // to find the most recent CHARACTER cue paragraph.
        let speaker = '';
        let prev: Element | null = dialogueEl.previousElementSibling;
        while (prev) {
          if (prev.classList.contains('character')) {
            speaker = (prev.textContent || '').replace(/\(.+?\)/g, '').trim().toUpperCase();
            break;
          }
          if (prev.classList.contains('scene-heading') || prev.classList.contains('transition')) break;
          prev = prev.previousElementSibling;
        }
        if (!speaker) speaker = 'UNKNOWN';
        const line = (dialogueEl.textContent || '').trim();
        if (!line) { toast.error('Dialogue line is empty'); return; }
        setShowCoach(true);
        // Defer the event so the coach mounts and registers its listener first.
        setTimeout(() => {
          document.dispatchEvent(new CustomEvent('writer:coachLine', { detail: { speaker, line } }));
        }, 40);
      }
      // 'b' on the Plot tab quick-adds a beat to the first act, unless typing
      // in an input.
      else if (
        e.key.toLowerCase() === 'b' && !mod &&
        useAppStore.getState().activeTab === 'plot' &&
        !(document.activeElement && /INPUT|TEXTAREA/.test(document.activeElement.tagName))
      ) {
        const state = useAppStore.getState();
        const firstActId = state.plotBoard?.acts?.[0]?.id;
        if (firstActId) {
          e.preventDefault();
          state.addBeat(firstActId);
          toast('Beat added — type to name it');
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleManualSave, toggleSidebar, toggleFocusMode]);

  // Apply theme (mode + accent) — single source of truth.
  //
  // We set `theme-light` on documentElement when light is chosen (the dark
  // palette is the default, so dark needs no class). The accent is exposed
  // as a `data-accent` attribute the index.css palette overrides read from.
  // System mode listens to prefers-color-scheme and re-applies.
  useEffect(() => {
    const root = document.documentElement;
    const apply = () => {
      const mode = settings.theme === 'light' ? 'light'
        : settings.theme === 'dark' ? 'dark'
        : (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
      root.classList.toggle('theme-light', mode === 'light');
      // Legacy classes left for any components still keying off them.
      document.body.classList.remove('theme-light', 'theme-dark', 'theme-custom');
      document.body.classList.add(mode === 'light' ? 'theme-light' : 'theme-dark');

      const accent = (settings as any).accent;
      if (accent && accent !== 'indigo') {
        root.setAttribute('data-accent', accent);
      } else {
        root.removeAttribute('data-accent');
      }
    };
    apply();
    // Re-apply when the system theme changes (only relevant when mode === 'system').
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const onChange = () => { if (!settings.theme || (settings.theme as string) === 'auto' || (settings.theme as string) === 'system') apply(); };
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, [settings.theme, (settings as any).accent]);

  // Sweep away any legacy custom CSS variables that may linger from older
  // settings shapes. The new design system reads from index.css only.
  useEffect(() => {
    const root = document.documentElement;
    ['--primary', '--bg', '--sidebar', '--panel', '--card', '--hover', '--active',
     '--text', '--text-secondary', '--text-muted', '--border', '--border-light'].forEach((k) => {
      root.style.removeProperty(k);
    });
  }, []);

  // Focus mode: allow exit via the Escape key
  useEffect(() => {
    if (!isFocusMode) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        toggleFocusMode();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isFocusMode, toggleFocusMode]);

  // Auth wall first: until checked, show splash; if no user and not skipped, show sign in
  if (!authChecked) {
    return (
      <div className="flex items-center justify-center h-screen w-screen bg-[var(--bg)]">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center">
          <div className="w-12 h-12 rounded-md bg-[var(--accent)] mx-auto mb-3 animate-pulse" />
          <p className="text-xs text-[var(--text-muted)]">Lighting Kindling…</p>
        </motion.div>
      </div>
    );
  }

  if (!user && !skippedAuth) {
    return (
      <AuthWall
        onSignedIn={(u, mode) => {
          setUser(u);
          if (mode === 'local') setSkippedAuth(true);
        }}
      />
    );
  }

  if (!initialized) {
    return (
      <div className="flex items-center justify-center h-screen w-screen bg-[var(--bg)]">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center"
        >
          <div className="w-16 h-16 rounded-md bg-[var(--accent)] flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-[var(--accent-ink)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-[var(--text)] mb-2">Kindling</h1>
          <p className="text-sm text-[var(--text-muted)]">Loading your workspace...</p>
          <motion.div
            className="mt-4 w-48 h-1 bg-[var(--border)] rounded-full mx-auto overflow-hidden"
          >
            <motion.div
              className="h-full bg-[var(--accent)]"
              initial={{ width: 0 }}
              animate={{ width: '100%' }}
              transition={{ duration: 1, ease: 'easeInOut' }}
            />
          </motion.div>
        </motion.div>
      </div>
    );
  }

  if (showStorySelector) {
    return (
      <StorySelector
        stories={stories}
        onSelectStory={handleSelectStory}
        onCreateStory={handleCreateStory}
      />
    );
  }

  const activeDirectorSceneId = useAppStore.getState().activeDirectorSceneId;

  return (
    <div className={`app-container ${isFocusMode ? 'focus-mode' : ''}`}>
      <a href="#main-content" className="skip-link">Skip to content</a>
      <Toaster theme={settings.theme === 'light' ? 'light' : 'dark'} position="bottom-right" richColors />
      {isFocusMode && (
        <button
          onClick={toggleFocusMode}
          title="Exit Focus Mode (Esc)"
          className="fixed top-4 right-4 z-[200] flex items-center gap-1.5 px-3 py-1.5 bg-[var(--card)] border border-[var(--border)] rounded-lg text-xs text-[var(--text-secondary)] shadow-lg hover:border-[var(--accent)] hover:text-[var(--text)] transition-all"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
          Exit Focus
          <span className="text-[10px] text-[var(--text-muted)]">Esc</span>
        </button>
      )}

      {mobileSidebarOpen && (
        <div className="mobile-backdrop md:hidden" onClick={() => setMobileSidebarOpen(false)} />
      )}

      {/* New layout: 56px IconRail + (in production modes) a 240px ContextPanel.
          The Writer view gets Focus Paper mode — neither show, only the
          editor breathes. */}
      {!isFocusMode && (
        <IconRail
          activeTab={activeTab}
          onTabChange={(tab) => setTab(tab as any)}
          stories={stories}
          activeStoryId={activeStoryId}
          onStoryChange={handleSelectStory}
          onNewStory={() => setShowStorySelector(true)}
          onOpenSettings={() => setShowSettings(true)}
          onOpenProfile={() => setShowUserMenu((v) => !v)}
          user={user ? { displayName: profile?.displayName || user.displayName, photoURL: profile?.avatar || user.photoURL, email: user.email } : null}
        />
      )}
      {!isFocusMode && activeTab !== 'writer' && (
        <ContextPanel
          activeTab={activeTab}
          rightPanel={rightPanel}
          onTogglePanel={(p) => togglePanel(p as any)}
        />
      )}

      <div className="main-area" id="main-content" role="main">
        {/* New thin TopBar — story title + ⋯ menu. The Toolbar still
            renders below for the writer-only format buttons row. */}
        {!isFocusMode && (
          <TopBar
            activeTab={activeTab}
            isFocusMode={isFocusMode}
            onToggleFocusMode={toggleFocusMode}
            onOpenExport={() => setShowExport(true)}
            onOpenSettings={() => setShowSettings(true)}
            onSignOut={user ? async () => {
              const { signOutUser } = await import('@/firebase');
              await signOutUser();
              setUser(null);
              setProfile(null);
              setSkippedAuth(false);
            } : undefined}
            storyTitle={stories.find((s) => s.id === activeStoryId)?.title}
          />
        )}
        {/* The original Toolbar now only renders on the Writer tab and only
            for its format-button row — we strip the AI icons + Reports +
            Export + Focus since the TopBar now owns those. */}
        {!isFocusMode && activeTab === 'writer' && (
          <Toolbar
            activeTab={activeTab}
            onToggleFocusMode={toggleFocusMode}
            isFocusMode={isFocusMode}
            onOpenMobileSidebar={() => setMobileSidebarOpen(true)}
            onOpenExportDialog={() => setShowExport(true)}
            onAddAct={() => {
              const state = useAppStore.getState();
              state.addAct();
            }}
            onAddShot={() => {
              const sceneId = useAppStore.getState().activeDirectorSceneId;
              if (sceneId) useAppStore.getState().addShot(sceneId);
            }}
            onAddSection={() => useAppStore.getState().addSection()}
          />
        )}

        <div className="view-container">
            {activeTab === 'writer' && (
              <div key="writer" className="h-full">
                <WriterView
                  screenplay={screenplay}
                  onUpdateField={updateScreenplayField}
                  onStartWriting={() => useAppStore.getState().startWriting()}
                  characters={characters}
                />
              </div>
            )}

            {activeTab === 'director' && (
              <div key="director" className="h-full">
                <DirectorView
                  scenes={scenes}
                  shots={shots}
                  bRolls={bRolls}
                  characters={characters}
                  activeSceneId={activeDirectorSceneId}
                  onSceneSelect={setActiveDirectorScene}
                  onAddScene={(name, content) => useAppStore.getState().addScene(name, content)}
                  onDeleteScene={(id) => useAppStore.getState().deleteScene(id)}
                  onAddShot={(sceneId) => useAppStore.getState().addShot(sceneId)}
                  onUpdateShot={(id, updates) => useAppStore.getState().updateShot(id, updates)}
                  onDeleteShot={(id) => useAppStore.getState().deleteShot(id)}
                  onAddBRoll={(shotId) => useAppStore.getState().addBRoll(shotId)}
                  onUpdateBRoll={(id, updates) => useAppStore.getState().updateBRoll(id, updates)}
                  onDeleteBRoll={(id) => useAppStore.getState().deleteBRoll(id)}
                  onUpdateScene={(id, updates) => useAppStore.getState().updateScene(id, updates)}
                  onReorderShots={(sceneId, shotIds) => useAppStore.getState().reorderShots(sceneId, shotIds)}
                />
              </div>
            )}

            {activeTab === 'plot' && (
              <div key="plot" className="h-full">
                <PlotBoardView
                  plotBoard={plotBoard}
                  beats={beats}
                  onAddAct={() => useAppStore.getState().addAct()}
                  onUpdateAct={(id, updates) => useAppStore.getState().updateAct(id, updates)}
                  onDeleteAct={(id) => useAppStore.getState().deleteAct(id)}
                  onAddBeat={addBeat}
                  onUpdateBeat={(id, updates) => useAppStore.getState().updateBeat(id, updates)}
                  onDeleteBeat={(id) => useAppStore.getState().deleteBeat(id)}
                  onMoveBeat={(beatId, fromActId, toActId) => useAppStore.getState().moveBeat(beatId, fromActId, toActId)}
                  onReorderBeats={(actId, ids) => useAppStore.getState().reorderBeats(actId, ids)}
                />
              </div>
            )}

            {activeTab === 'workspace' && (
              <div key="workspace" className="h-full">
                <WorkspaceView />
              </div>
            )}

            {activeTab === 'dashboard' && (
              <div key="dashboard" className="h-full">
                <StoryDashboard />
              </div>
            )}

            {activeTab === 'calendar' && (
              <div key="calendar" className="h-full">
                <CalendarView />
              </div>
            )}
        </div>

        {/* Replaced the heavy CharacterBar + StatusBar + SocialBar pill stack
            with a single thin StatusLine. Character access lives in the
            right-side inspector (Story Tools → Characters). */}
        {!isFocusMode && (
          <StatusLine
            screenplay={screenplay}
            scenes={scenes}
            onSave={handleManualSave}
            dirty={dirty}
          />
        )}

        <RightPanel
          panel={rightPanel}
          onClose={closePanel}
          notes={notes}
          onAddNote={addNote}
          onDeleteNote={deleteNote}
          history={history}
          activeStoryId={activeStoryId}
          settings={settings}
          onUpdateSettings={updateSettings}
          characters={characters}
          onUpdateCharacter={(id, updates) => useAppStore.getState().updateCharacter(id, updates)}
          onDeleteCharacter={(id) => useAppStore.getState().deleteCharacter(id)}
          screenplay={screenplay}
          onUpdateScreenplayField={updateScreenplayField}
          focusCharacterId={focusCharacterId}
          onClearFocusCharacter={() => useAppStore.setState({ focusCharacterId: null })}
        />
      </div>

      {/* SocialBar removed in the layout rewrite — its functionality is
          consolidated into the rail's user menu + the Workspace tab. */}

      {!isFocusMode && !showStorySelector && (
        <FloatingActionButton
          isFocusMode={isFocusMode}
          actions={[
            {
              id: 'new-character',
              label: 'Add Character',
              icon: Users,
              color: 'bg-[var(--accent)] text-[var(--accent-ink)]',
              onClick: () => {
                useAppStore.getState().addCharacter({
                  name: 'New Character', displayName: 'New Character', description: '',
                  color: '#3b82f6', image: null, backstory: '', goals: '', personality: '',
                  age: '', occupation: '', motivation: '', conflict: '', relationships: '',
                  notes: '', voiceAudio: null, tags: [], createdAt: Date.now(),
                });
                useAppStore.setState({ rightPanel: 'characters' });
                toast.success('Character added — fill in their profile');
              },
            },
            {
              id: 'add-beat',
              label: 'Add Beat',
              icon: Zap,
              color: 'bg-[var(--accent)] text-[var(--accent-ink)]',
              onClick: () => {
                const actId = plotBoard?.acts?.[0]?.id;
                if (actId) {
                  addBeat(actId);
                  setTab('plot');
                  toast.success('Beat added');
                } else {
                  toast.error('Create an act first on the Plot board');
                }
              },
            },
          ]}
        />
      )}

      <ExportDialog open={showExport} onClose={() => setShowExport(false)} />
      <SettingsOverlay open={showSettings} onClose={() => setShowSettings(false)} />
      <Onboarding />
      <FindReplace />
      <StylePane />
      <CompareOverlay />
      {showCoach && <DialogueCoach onClose={() => setShowCoach(false)} />}
      {showTableRead && <TableRead onClose={() => setShowTableRead(false)} />}
      <AltTakeOverlay />
      <CommandPalette
        open={showPalette}
        onClose={() => setShowPalette(false)}
        onSave={handleManualSave}
        onExport={() => setShowExport(true)}
        onSettings={() => setShowSettings(true)}
      />

      {profile && (
        <ProfileEditor
          open={showProfile}
          initial={profile}
          onClose={() => setShowProfile(false)}
          onSaved={(p) => { setProfile(p); updateSettings({ userDisplayName: p.displayName, userRole: p.role === 'both' ? 'writer' : (p.role as any) }); }}
        />
      )}

      {/* User menu popover — opens from the rail avatar. Local mode shows
          a Sign-in CTA that re-opens the AuthWall by flipping skippedAuth
          back to false. Signed-in mode shows Edit profile + Sign out. */}
      <UserMenu
        open={showUserMenu}
        onClose={() => setShowUserMenu(false)}
        user={user}
        profile={profile}
        onOpenAuth={() => {
          // Reset the "skipped" flag so the AuthWall re-mounts.
          setSkippedAuth(false);
        }}
        onOpenProfile={() => { if (profile) setShowProfile(true); }}
        onOpenSettings={() => setShowSettings(true)}
        onSignOut={async () => {
          const { signOutUser } = await import('@/firebase');
          await signOutUser();
          setUser(null);
          setProfile(null);
          setSkippedAuth(false);
        }}
        anchor="rail-bottom"
      />
    </div>
  );
}

export default App;
