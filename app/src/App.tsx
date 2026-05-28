import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Toaster, toast } from 'sonner';
import { StickyNote, Users, Zap } from 'lucide-react';
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
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [skippedAuth, setSkippedAuth] = useState(false);
  const [showProfile, setShowProfile] = useState(false);

  // Watch Firebase auth state; load (or auto-create) profile
  useEffect(() => {
    const unsub = watchAuth(async (u) => {
      setUser(u);
      if (u) {
        const existing = await getProfile(u.uid);
        if (existing) {
          setProfile(existing);
          updateSettings({ userId: u.uid, userDisplayName: existing.displayName });
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

  const handleManualSave = useCallback(() => {
    if (!activeStoryId) return;
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
  }, [activeStoryId, addHistory, saveState]);

  const handleImport = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,.txt,.md,.markdown,.fountain,.html,.htm';
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

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); handleManualSave(); }
      else if (mod && e.key === '\\') { e.preventDefault(); toggleSidebar(); }
      else if (mod && e.key === '.') { e.preventDefault(); toggleFocusMode(); }
      else if (mod && e.shiftKey && e.key.toLowerCase() === 'e') { e.preventDefault(); setShowExport(true); }
      else if (mod && e.key === ',') { e.preventDefault(); setShowSettings(true); }
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

      <div className="main-area">
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
                />
              </div>
            )}

            {activeTab === 'workspace' && (
              <div key="workspace" className="h-full">
                <WorkspaceView />
              </div>
            )}
        </div>

        {!isFocusMode && activeTab === 'writer' && (
          <CharacterBar
            characters={characters}
            onCharacterClick={() => {
              useAppStore.setState({ rightPanel: 'characters' });
            }}
            onAddCharacter={() => togglePanel('characters')}
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

      {!isFocusMode && (
        <FloatingActionButton
          isFocusMode={isFocusMode}
          actions={[
            {
              id: 'new-note',
              label: 'Add Note',
              icon: StickyNote,
              color: 'bg-gradient-to-br from-amber-500 to-orange-600 text-white',
              onClick: () => addNote('New note', 'general')
            },
            {
              id: 'new-character',
              label: 'New Character',
              icon: Users,
              color: 'bg-gradient-to-br from-blue-500 to-cyan-600 text-white',
              onClick: () => useAppStore.getState().addCharacter({ name: 'New Character', displayName: 'New Character', description: '', color: '#3b82f6', image: null, backstory: '', goals: '', personality: '', age: '', occupation: '', motivation: '', conflict: '', relationships: '', notes: '', voiceAudio: null, tags: [], createdAt: Date.now() })
            },
            {
              id: 'add-beat',
              label: 'Add Beat',
              icon: Zap,
              color: 'bg-gradient-to-br from-purple-500 to-pink-600 text-white',
              onClick: () => { if (plotBoard?.acts?.[0]?.id) addBeat(plotBoard.acts[0].id); }
            },
          ]}
        />
      )}

      <ExportDialog open={showExport} onClose={() => setShowExport(false)} />
      <SettingsOverlay open={showSettings} onClose={() => setShowSettings(false)} />

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
