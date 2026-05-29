import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Toaster, toast } from 'sonner';
import { Users, Zap } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { useIndexedDB } from '@/hooks/useIndexedDB';
import { watchAuth, getProfile, upsertProfile, signOutUser, type UserProfile } from '@/firebase';
import AuthWall from '@/components/AuthWall';
import ProfileEditor from '@/components/ProfileEditor';
import type { User as FirebaseUser } from 'firebase/auth';
import Sidebar from '@/components/Sidebar';
import Toolbar from '@/components/Toolbar';
import WriterView from '@/components/WriterView';
import DirectorView from '@/components/DirectorView';
import PlotBoardView from '@/components/PlotBoardView';
import CharacterBar from '@/components/CharacterBar';
import StatusBar from '@/components/StatusBar';
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
import ExportDialog from '@/components/ExportDialog';
import SocialBar from '@/components/SocialBar';
import SettingsOverlay from '@/components/SettingsOverlay';
import FloatingActionButton from '@/components/FloatingActionButton';
import type { AppState } from '@/types';
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

  // Watch Firebase auth state; load (or auto-create) profile
  useEffect(() => {
    const unsub = watchAuth(async (u) => {
      setUser(u);
      if (u) {
        const existing = await getProfile(u.uid);
        if (existing) {
          setProfile(existing);
          updateSettings({ userId: u.uid, userDisplayName: existing.displayName });
          // Cache the profile locally so it can be restored on next refresh
          try { localStorage.setItem('kindling-cached-profile', JSON.stringify(existing)); } catch {}
        } else if (!u.isAnonymous) {
          // Auto-create skeleton profile + show editor
          const skeleton: UserProfile = {
            uid: u.uid,
            email: u.email,
            displayName: u.displayName || (u.email?.split('@')[0]) || 'You',
            role: 'writer',
            avatar: u.photoURL || null,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          };
          await upsertProfile(skeleton);
          setProfile(skeleton);
          updateSettings({ userId: u.uid, userDisplayName: skeleton.displayName });
          try { localStorage.setItem('kindling-cached-profile', JSON.stringify(skeleton)); } catch {}
          setShowProfile(true);
        }
      }
      setAuthChecked(true);
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

  // Auto-save
  useEffect(() => {
    if (!settings.autoSave || !activeStoryId) return;
    const interval = setInterval(() => {
      document.dispatchEvent(new CustomEvent('writer:saving'));
      addHistory('Auto-save', activeStoryId);
      const next = useAppStore.getState();
      const saveData: Partial<AppState> = {
        screenplay: next.screenplay,
        scenes: next.scenes,
        shots: next.shots,
        bRolls: next.bRolls,
        characters: next.characters,
        plotBoard: next.plotBoard,
        beats: next.beats,
        notes: next.notes,
        history: next.history,
      };
      saveState(activeStoryId, saveData);
      document.dispatchEvent(new CustomEvent('writer:saved'));
    }, settings.autoSaveInterval);
    return () => clearInterval(interval);
  }, [settings.autoSave, settings.autoSaveInterval, activeStoryId, saveState, addHistory]);

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

  // Apply theme
  useEffect(() => {
    document.body.classList.remove('theme-light', 'theme-dark', 'theme-custom');
    if (settings.theme === 'light') {
      document.body.classList.add('theme-light');
    } else if (settings.theme === 'dark') {
      document.body.classList.add('theme-dark');
    } else {
      document.body.classList.add('theme-custom');
    }
  }, [settings.theme]);

  // Apply custom CSS variables (only in custom theme; otherwise let the
  // stylesheet themes drive colors so custom values don't bleed into dark/light)
  useEffect(() => {
    const root = document.documentElement;
    const customVars: Record<string, string> = {
      '--primary': settings.primaryColor,
      '--accent': settings.accentColor,
      '--bg': settings.bgColor,
      '--sidebar': settings.sidebarColor,
      '--panel': settings.panelColor,
      '--card': settings.panelColor,
      '--hover': settings.borderColor,
      '--active': settings.borderColor,
      '--border-light': settings.borderColor,
      '--text': settings.textColor,
      '--text-secondary': settings.textSecondaryColor,
      '--text-muted': settings.textSecondaryColor,
      '--border': settings.borderColor,
    };
    if (settings.theme === 'custom') {
      Object.entries(customVars).forEach(([key, value]) => root.style.setProperty(key, value));
    } else {
      Object.keys(customVars).forEach((key) => root.style.removeProperty(key));
    }
  }, [settings]);

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
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-400 via-red-500 to-pink-500 mx-auto mb-3 shadow-2xl animate-pulse" />
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
          <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center mx-auto mb-4 shadow-2xl">
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-[var(--text)] mb-2">Kindling</h1>
          <p className="text-sm text-[var(--text-muted)]">Loading your workspace...</p>
          <motion.div
            className="mt-4 w-48 h-1 bg-[var(--border)] rounded-full mx-auto overflow-hidden"
          >
            <motion.div
              className="h-full bg-gradient-to-r from-blue-500 to-purple-500"
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

      {!isFocusMode && (
        <Sidebar
          activeTab={activeTab}
          onTabChange={setTab}
          onTogglePanel={togglePanel}
          rightPanel={rightPanel}
          stories={stories}
          activeStoryId={activeStoryId}
          onStoryChange={handleSelectStory}
          onShowStorySelector={() => setShowStorySelector(true)}
          collapsed={settings.sidebarCollapsed}
          onToggleCollapse={toggleSidebar}
          mobileOpen={mobileSidebarOpen}
          onCloseMobile={() => setMobileSidebarOpen(false)}
          onExport={() => setShowExport(true)}
          onImport={handleImport}
          onOpenSettings={() => setShowSettings(true)}
          user={user ? { displayName: profile?.displayName || user.displayName, photoURL: profile?.avatar || user.photoURL, email: user.email } : null}
          onOpenProfile={() => setShowProfile(true)}
          onSignOut={async () => {
            await signOutUser();
            setUser(null);
            setProfile(null);
            setSkippedAuth(false);
          }}
        />
      )}

      <div className="main-area" id="main-content" role="main">
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

        {!isFocusMode && activeTab === 'writer' && (
          <CharacterBar
            characters={characters}
            onCharacterClick={(id) => useAppStore.getState().focusCharacter(id)}
            onAddCharacter={() => togglePanel('characters')}
            onOpenAllCharacters={() => useAppStore.setState({ rightPanel: 'characters' })}
          />
        )}

        {!isFocusMode && <StatusBar
          screenplay={screenplay}
          scenes={scenes}
          onSave={handleManualSave}
        />}

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

      {!isFocusMode && (
        <SocialBar
          enabled={settings.socialBarEnabled}
          onActivity={(site) => {
            // Hook for admin notification — wire to a backend later.
            // eslint-disable-next-line no-console
            console.log('[social-activity]', site);
          }}
        />
      )}

      {!isFocusMode && !showStorySelector && (
        <FloatingActionButton
          isFocusMode={isFocusMode}
          actions={[
            {
              id: 'new-character',
              label: 'Add Character',
              icon: Users,
              color: 'bg-gradient-to-br from-blue-500 to-cyan-600 text-white',
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
              color: 'bg-gradient-to-br from-purple-500 to-pink-600 text-white',
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
    </div>
  );
}

export default App;
