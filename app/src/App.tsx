import { useEffect, useState, useCallback, useRef, lazy, Suspense } from 'react';
import { motion } from 'framer-motion';
import { Toaster, toast } from 'sonner';
import { Users, Zap } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { useIndexedDB } from '@/hooks/useIndexedDB';
import { watchAuth, getProfile, upsertProfile, type UserProfile } from '@/firebase';
import AuthWall from '@/components/AuthWall';
const ProfileEditor = lazy(() => import('@/components/ProfileEditor'));
import type { User as FirebaseUser } from 'firebase/auth';
// Sidebar / CharacterBar / StatusBar / SocialBar replaced by IconRail +
// ContextPanel + StatusLine in the layout rewrite. Old files kept on disk
// for reference but no longer mounted anywhere.
import IconRail from '@/components/IconRail';
import ContextPanel from '@/components/ContextPanel';
import StatusLine from '@/components/StatusLine';
import TopBar from '@/components/TopBar';
import UserMenu from '@/components/UserMenu';
const ShareDialog = lazy(() => import('@/components/ShareDialog'));
const InviteDialog = lazy(() => import('@/components/InviteDialog'));
const CloudDiagnostic = lazy(() => import('@/components/CloudDiagnostic'));
const VersionHistory = lazy(() => import('@/components/VersionHistory'));
const BreakdownView = lazy(() => import('@/components/BreakdownView'));
import CommentsPanel from '@/components/CommentsPanel';
import InlineCommentPopup, { openInlineCommentFromSelection } from '@/components/InlineCommentPopup';
import InlineCommentHighlights from '@/components/InlineCommentHighlights';
import { useNotifications } from '@/hooks/useNotifications';
import { useStoryRole } from '@/hooks/useStoryRole';
import Toolbar from '@/components/Toolbar';
import WriterView from '@/components/WriterView';
const DirectorView = lazy(() => import('@/components/DirectorView'));
const PlotBoardView = lazy(() => import('@/components/PlotBoardView'));
import RightPanel from '@/components/RightPanel';
import StorySelector from '@/components/StorySelector';
const WorkspaceView = lazy(() => import('@/components/WorkspaceView'));
const StoryDashboard = lazy(() => import('@/components/StoryDashboard'));
const CalendarView = lazy(() => import('@/components/CalendarView'));
const OutlineView = lazy(() => import('@/components/OutlineView'));
const WorldView = lazy(() => import('@/components/WorldView'));
const StoryboardView = lazy(() => import('@/components/StoryboardView'));
const LocationsView = lazy(() => import('@/components/LocationsView'));
const CommandPalette = lazy(() => import('@/components/CommandPalette'));
const Onboarding = lazy(() => import('@/components/Onboarding'));
const FindReplace = lazy(() => import('@/components/FindReplace'));
const StylePane = lazy(() => import('@/components/StylePane'));
const CompareOverlay = lazy(() => import('@/components/CompareOverlay'));
const DialogueCoach = lazy(() => import('@/components/DialogueCoach'));
const TableRead = lazy(() => import('@/components/TableRead'));
const AltTakeOverlay = lazy(() => import('@/components/AltTakeOverlay'));
const ExportDialog = lazy(() => import('@/components/ExportDialog'));
const SettingsOverlay = lazy(() => import('@/components/SettingsOverlay'));
const AgentPanel = lazy(() => import('@/components/AgentPanel'));
import { installRunwayBridge } from '@/lib/sendToRunway';
import FloatingActionButton from '@/components/FloatingActionButton';
import MediaViewer from '@/components/MediaViewer';
import RunwayPromptDialog from '@/components/RunwayPromptDialog';
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

  const { ready, saveState, loadState, deleteStory: idbDeleteStory } = useIndexedDB();
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
  // AgentPanel — the agentic AI co-worker drawer. Opens via TopBar button
  // or via the `app:openAgent` event from anywhere.
  const [showAgent, setShowAgent] = useState(false);

  // Current user's role on the active cloud story. For local-only stories
  // this returns canWrite + canDirect = true (full access). Used to gate
  // the Writer editor + Director add buttons + format toolbar so a Writer
  // collaborator can SEE the Director board without being able to edit it.
  const { canWrite, canDirect, role: storyRole, isOwner: isStoryOwner, isCloud: isCloudStory } = useStoryRole();
  // Cross-app notification counts — surfaced as small badges on the
  // TopBar Tools dropdown so a collaborator sees "someone invited you"
  // or "there's a new comment on this story" without opening every panel.
  const { pendingInvites, unreadComments, markCommentsSeen } = useNotifications();

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

  // Share-link handler — when the URL contains `?s=<storyId>`, pull that
  // story from Firestore + import it locally. Only fires after auth has
  // resolved (so the read attempt is authenticated). Strips the query
  // param afterwards so refreshing doesn't re-import.
  useEffect(() => {
    if (!authChecked) return;
    const params = new URLSearchParams(window.location.search);
    const sharedId = params.get('s');
    if (!sharedId) return;

    (async () => {
      try {
        const { pullStory } = await import('@/lib/cloudStories');
        const cloudStory = await pullStory(sharedId);
        if (!cloudStory) {
          toast.error('That shared story could not be found or you don\'t have access.');
          return;
        }
        // Use importSharedStory so the local Story entry's id matches the
        // cloud storyId — keeps both sides of the share aligned for cloud
        // chat, People list, and Jitsi room lookups.
        const state = useAppStore.getState();
        state.importSharedStory(cloudStory.id, cloudStory.title, cloudStory.data);
        toast.success(`Opened "${cloudStory.title}" — shared by ${cloudStory.ownerName || 'someone'}`);
      } catch (err: any) {
        // eslint-disable-next-line no-console
        console.warn('[Kindling] Failed to load shared story:', err);
        if (err?.code === 'permission-denied') {
          toast.error('You\'re not authorized to read this story. Ask the owner to share it with you.');
        } else if (!user) {
          toast.error('Sign in to open shared stories.');
        }
      } finally {
        // Strip ?s=… so a refresh doesn't try to re-import.
        const url = new URL(window.location.href);
        url.searchParams.delete('s');
        window.history.replaceState({}, '', url.toString());
      }
    })();
  }, [authChecked, user]);

  // Load story data when activeStoryId changes.
  //
  // CRITICAL: always reset every per-story field BEFORE merging in the
  // saved snapshot. The previous behavior only called setState(state)
  // when there was something saved, which meant switching to a brand-new
  // story left the OLD story's screenplay/scenes/characters/etc. in
  // place — that's exactly the "click a different story, title changes
  // but content is still from the old one" bug the user reported.
  //
  // Hardcoded blank values mirror the store's `defaultState` for the
  // per-story slots. Cross-story fields (activeStoryId, stories[],
  // settings, etc.) are deliberately NOT touched.
  useEffect(() => {
    if (!ready) return;
    if (!activeStoryId) {
      setInitialized(true);
      if (stories.length === 0) {
        setShowStorySelector(true);
      }
      return;
    }
    loadState(activeStoryId).then((state) => {
      // Blank-slate template — exactly the same shape as defaultState's
      // per-story slots so any field absent from the saved snapshot
      // (e.g. a story saved before `world`/`locations`/`outlinePoints`
      // existed) gets a clean default rather than inheriting stale data
      // from the previously-active story.
      const blank: any = {
        screenplay: {
          title: '',
          author: '',
          contact: '',
          logline: '',
          synopsis: '',
          instructions: '',
          started: false,
          elements: [],
          sections: [],
          activeSectionId: null,
          assets: [],
          world: [],
          locations: [],
          outlinePoints: [],
          theme: '',
        },
        scenes: [],
        shots: {},
        bRolls: {},
        characters: [],
        plotBoard: { acts: [] },
        beats: {},
        notes: [],
        history: [],
        activeSceneId: null,
        activeDirectorSceneId: null,
        focusCharacterId: null,
        rightPanel: null,
      };
      // Merge order: blank first, then the saved snapshot on top. The
      // store-level merge keeps cross-story fields (stories, settings,
      // user, activeStoryId) untouched because they aren't in `blank`.
      const next: any = { ...blank };
      if (state) {
        // For `screenplay` specifically we want field-level merge so a
        // partial saved snapshot doesn't blow away a newer field that
        // happens to live on it.
        if (state.screenplay) {
          next.screenplay = { ...blank.screenplay, ...state.screenplay };
        }
        for (const k of Object.keys(state)) {
          if (k === 'screenplay') continue;
          next[k] = (state as any)[k];
        }
      }
      useAppStore.setState(next);
      setInitialized(true);
      // The TipTap editor reads `screenplay.elements` ONCE at mount —
      // it does not re-render when the underlying store changes. So
      // after a story switch we have to explicitly tell the writer to
      // resync from the freshly-loaded snapshot, otherwise the user
      // sees the previous story's text until a manual refresh. This
      // event is the same one the agent dispatches when it writes
      // screenplay lines; WriterView's listener calls editor.commands
      // .setContent(html) which is the only way to make TipTap pick up
      // the new content live.
      // setTimeout(0) so the dispatch runs AFTER React commits the
      // setState above and WriterView's effect has refreshed its
      // reference to the new screenplay.
      setTimeout(() => {
        document.dispatchEvent(new CustomEvent('writer:rebuild'));
      }, 0);
    });
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

  // Live-sync refs (used by the Firestore watcher below).
  //   dirtyRef         — a ref mirror of `dirty` so the long-lived snapshot
  //                      callback can read the latest value without the
  //                      watcher effect re-subscribing on every keystroke.
  //   lastCloudDataRef — the last story `data` string we either applied from
  //                      the cloud or pushed to it. Lets the watcher ignore
  //                      the echo of our own writes (and the initial
  //                      snapshot) so it only reacts to genuinely new remote
  //                      material (e.g. the Connector's add_to_story).
  const dirtyRef = useRef(false);
  const lastCloudDataRef = useRef<string | null>(null);
  // One-shot guard so the "story is getting large" warning isn't spammed.
  const nearLimitWarnedRef = useRef(false);
  useEffect(() => { dirtyRef.current = dirty; }, [dirty]);

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

  // Handle story selection.
  //
  // The user reported "I click a different story, the name changes but
  // the content stays the same." Root cause was two-fold:
  //   1. Switching without saving first → the in-memory edits to the
  //      OUTGOING story were lost the moment its slot got overwritten.
  //   2. The load effect didn't reset per-story slots, so an empty
  //      INCOMING story inherited the previous story's editor content.
  //
  // Fix here is (1): snapshot the current story to IndexedDB BEFORE we
  // change activeStoryId. The load effect handles (2) with the blank-
  // template merge.
  const handleSelectStory = useCallback(async (storyId: string) => {
    const s = useAppStore.getState();
    const currentId = s.activeStoryId;
    if (currentId && currentId !== storyId) {
      try {
        await saveState(currentId, {
          screenplay: s.screenplay,
          scenes: s.scenes,
          shots: s.shots,
          bRolls: s.bRolls,
          characters: s.characters,
          plotBoard: s.plotBoard,
          beats: s.beats,
          notes: s.notes,
          history: s.history,
        });
      } catch {
        // IndexedDB hiccup — proceed anyway. Worst case the user loses
        // a few seconds of work; previously the entire load was broken.
      }
    }
    loadStory(storyId);
    setShowStorySelector(false);
  }, [loadStory, saveState]);

  // Delete a story everywhere: in-memory store, this device's IndexedDB
  // snapshot + history, AND the cloud copy. Deleting only locally would let
  // the sign-in recovery pull resurrect it from Firestore on the next load,
  // so we remove the cloud doc too (when signed in) to make it permanent.
  const handleDeleteStory = useCallback(async (storyId: string) => {
    const st = useAppStore.getState();
    const story = st.stories.find((s) => s.id === storyId);
    const title = story?.title || 'this story';
    const ok = window.confirm(
      `Delete "${title}" permanently?\n\nThis removes it from this device and from the cloud. It cannot be undone.`,
    );
    if (!ok) return;
    const wasActive = st.activeStoryId === storyId;
    // 1) In-memory store (also clears activeStoryId if it was the open one).
    st.deleteStory(storyId);
    // If we just closed the open story, hop to another one (if any) so the
    // user isn't left staring at an empty workspace.
    if (wasActive) {
      const remaining = useAppStore.getState().stories;
      if (remaining.length > 0) {
        await handleSelectStory(remaining[0].id);
      } else {
        setShowStorySelector(true);
      }
    }
    // 2) Local IndexedDB snapshot + history.
    try { await idbDeleteStory(storyId); } catch {/* ignore */}
    // 3) Cloud doc — so it isn't pulled back on next sign-in.
    if (user) {
      try {
        const { deleteStoryCloud } = await import('@/lib/cloudStories');
        await deleteStoryCloud(storyId);
      } catch (err: any) {
        // eslint-disable-next-line no-console
        console.warn('[Kindling] Cloud delete failed:', err?.code || err?.message || err);
        toast.error('Removed locally, but the cloud copy could not be deleted (you may not be the owner).');
        return;
      }
    }
    toast.success(`Deleted "${title}"`);
  }, [user, idbDeleteStory, handleSelectStory]);

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
    // Auto-save fires this same path. We tag the dispatch with a
    // `silent` flag so the toast only shows on EXPLICIT Ctrl+S /
    // Save-button presses — not every 30 seconds of typing.
    const triggeredByAutoSave = (window as any).__kindlingAutoSaveInProgress;
    if (!triggeredByAutoSave) toast.success('Story saved');
    document.dispatchEvent(new CustomEvent('writer:saved'));

    // Push to Firestore IF the user is signed in. Errors don't block the
    // local save (which always succeeds first). The story doc id matches
    // the local storyId so re-opens find it cleanly.
    //
    // Cloud failures are logged but NEVER toasted — local save already
    // succeeded. Previously a permission-denied here would show a scary
    // "Cloud sync blocked" toast even though the user's actual work was
    // safely persisted, which was alarming + misleading. Failures show up
    // in the Studio tab's diagnostic banner instead.
    if (user) {
      try {
        const { pushStory, saveVersion } = await import('@/lib/cloudStories');
        const story = state.stories.find((st) => st.id === activeStoryId);
        const cloudData = state.exportStory();
        // Remember exactly what we're sending so the live watcher recognizes
        // the snapshot echo of our own write and doesn't re-import it.
        lastCloudDataRef.current = cloudData;
        // Warn once when approaching the cloud size limit, before it blocks.
        const { isNearCloudLimit, byteSize, humanSize, SAFE_DATA_LIMIT } = await import('@/lib/storySize');
        if (isNearCloudLimit(cloudData) && !nearLimitWarnedRef.current) {
          nearLimitWarnedRef.current = true;
          toast.warning('This story is getting large', {
            description: `It's ${humanSize(byteSize(cloudData))} of a ${humanSize(SAFE_DATA_LIMIT)} cloud limit. Large embedded images are usually the cause — attach images by URL rather than uploading to keep syncing smoothly.`,
            duration: 9000,
          });
        }
        await pushStory({
          storyId: activeStoryId,
          title: story?.title || state.screenplay.title || 'Untitled',
          data: cloudData,
        });
        // On an EXPLICIT save (not the 30s autosave) drop a restorable cloud
        // snapshot. Deduped + pruned to the newest N inside saveVersion.
        if (!triggeredByAutoSave) {
          saveVersion(activeStoryId, {
            data: cloudData,
            title: story?.title || state.screenplay.title || 'Untitled',
            label: 'Manual save',
          }).catch(() => {/* versions are best-effort */});
        }
      } catch (err: any) {
        // eslint-disable-next-line no-console
        console.warn('[Kindling] Cloud save failed (local copy was saved):', err?.code || err?.message || err);
        // The story is too big for Firestore's 1MB limit — this used to fail
        // silently and stop cloud sync. Now we tell the user clearly (local
        // copy is still safe). Show it even on autosave since it's important.
        if (err?.name === 'StorySizeError') {
          toast.error('Story too large to sync to the cloud', {
            description: err.message,
            duration: 12000,
          });
        }
      }
    }

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

  // Auto-save — debounced 30s after the dirty flag flips.
  //
  // The previous "manual save only" model meant if the user forgot to
  // hit Ctrl+S, anything they typed since opening the story was at risk
  // (tab close, refresh, crash, switch story without saving). Now the
  // moment something changes, a 30-second timer starts; if the user
  // keeps editing, each new edit resets it; once they're quiet for 30s
  // the save happens silently in the background (no toast). Manual save
  // (Ctrl+S, the Save button) still works exactly as before and shows
  // its own toast for explicit reassurance.
  useEffect(() => {
    if (!dirty || !activeStoryId) return;
    const id = window.setTimeout(() => {
      // Same save path as Ctrl+S but quieter — we don't want a toast
      // every 30 seconds. handleManualSave dispatches the writer:saving
      // event so the status indicator still flashes.
      try {
        (window as any).__kindlingAutoSaveInProgress = true;
        handleManualSave();
      } finally {
        // Reset on next tick — the toast check in handleManualSave is
        // synchronous, so as long as it runs in the same frame the
        // flag is read correctly.
        setTimeout(() => { (window as any).__kindlingAutoSaveInProgress = false; }, 0);
      }
    }, 30_000);
    return () => window.clearTimeout(id);
  }, [dirty, activeStoryId, handleManualSave]);

  // Cloud-recovery pull on sign-in.
  //
  // Previously the K-drawer only showed stories present in this
  // browser's IndexedDB. If the user signed in on a different device
  // (or cleared their browser data) they'd see an empty drawer even
  // though all their stories were safely in Firestore. This pulls
  // every story they own / collaborate on at sign-in and merges any
  // missing ones into the local store + hydrates each saved snapshot
  // into IndexedDB so the K-drawer surfaces them immediately and
  // switching to them works offline thereafter.
  useEffect(() => {
    if (!user || !ready) return;
    let cancelled = false;
    (async () => {
      try {
        const { listMyStories } = await import('@/lib/cloudStories');
        const cloudStories = await listMyStories();
        if (cancelled || !cloudStories.length) return;
        // Map of the stories we already have locally → their last-known
        // updatedAt, so we can tell a brand-new story apart from one that
        // already exists locally but has been UPDATED in the cloud (e.g. by
        // the Kindling Connector's add_to_story across several "continue"
        // calls). Without this, an already-known id was skipped entirely and
        // the appended scenes/screenplay never reached IndexedDB — the app
        // kept loading the stale first snapshot. That's the "I only ever see
        // the first step Claude wrote" bug.
        const localById = new Map(useAppStore.getState().stories.map((s) => [s.id, s]));
        const activeId = useAppStore.getState().activeStoryId;
        const fresh: any[] = [];
        let updatedCount = 0;
        for (const cs of cloudStories) {
          const existing = localById.get(cs.id);
          const cloudUpdated = cs.updatedAt || 0;
          const localUpdated = (existing as any)?.updatedAt || 0;
          // Skip only when we already have this story AND the cloud copy is
          // not newer than what we hold locally. A strictly-newer cloud
          // updatedAt means new material was appended (or edited) remotely.
          if (existing && cloudUpdated <= localUpdated) continue;

          // (Re)hydrate the per-story snapshot into IndexedDB so opening the
          // story loads its actual current content. The cloud `data` field is
          // a JSON string produced by exportStory().
          try {
            const parsed = (cs as any).data ? JSON.parse((cs as any).data) : null;
            if (parsed) await saveState(cs.id, parsed);
          } catch {
            // Corrupt blob — leave it; user can still open the cloud
            // story and re-save to fix.
          }

          if (!existing) {
            fresh.push({
              id: cs.id,
              title: cs.title || 'Untitled Story',
              type: 'movie',
              createdAt: (cs as any).createdAt || cs.updatedAt || Date.now(),
              updatedAt: cs.updatedAt || Date.now(),
            });
          } else {
            updatedCount += 1;
            // Bump the local Story entry (title + updatedAt) so the drawer
            // reflects the change and we don't re-hydrate it next refresh.
            useAppStore.setState((s: any) => ({
              stories: s.stories.map((st: any) =>
                st.id === cs.id
                  ? { ...st, title: cs.title || st.title, updatedAt: cloudUpdated || Date.now() }
                  : st,
              ),
            }));
            // If this updated story is the one currently open, refresh the
            // live editor in place so the new material appears without the
            // user having to switch stories or reload again.
            if (cs.id === activeId && (cs as any).data) {
              useAppStore.getState().importStory((cs as any).data);
              setTimeout(() => {
                document.dispatchEvent(new CustomEvent('writer:rebuild'));
              }, 0);
            }
          }
        }
        if (fresh.length > 0 && !cancelled) {
          useAppStore.setState((s: any) => ({ stories: [...s.stories, ...fresh] }));
          toast.success(`Recovered ${fresh.length} stor${fresh.length === 1 ? 'y' : 'ies'} from cloud`, {
            description: 'Open the stories drawer (K logo) to see them.',
            duration: 6000,
          });
        }
        if (updatedCount > 0 && !cancelled) {
          toast.success(`Synced ${updatedCount} updated stor${updatedCount === 1 ? 'y' : 'ies'} from cloud`, {
            description: 'New material added from Claude is now in the app.',
            duration: 5000,
          });
        }
      } catch (err: any) {
        // Firestore unreachable or rules block reads. Silent — local
        // stories still work; the user can sign in again later.
        // eslint-disable-next-line no-console
        console.warn('[Kindling] Cloud story pull failed:', err?.code || err?.message || err);
      }
    })();
    return () => { cancelled = true; };
  }, [user, ready, saveState]);

  // Live Firestore watcher on the OPEN story.
  //
  // The sign-in recovery pull above only runs on load/refresh. This adds a
  // real-time subscription to the currently-active story so material the
  // Kindling Connector appends from Claude (each "continue" → add_to_story)
  // appears in the app instantly — no refresh needed.
  //
  // Safeguards:
  //   - We ignore the FIRST snapshot (it's just the current doc; the story
  //     is already loaded) and only record it as the baseline.
  //   - We ignore any snapshot whose `data` equals what we last applied or
  //     pushed (lastCloudDataRef) — that filters out the echo of our own
  //     saves so the editor doesn't flicker or loop.
  //   - We do NOT overwrite the editor while there are unsaved local edits
  //     (dirtyRef) — your in-progress work always wins; the new remote
  //     material is picked up the next time the story is clean (or on
  //     refresh via the recovery pull).
  useEffect(() => {
    if (!user || !activeStoryId) return;
    let first = true;
    let unsub: (() => void) | undefined;
    let cancelled = false;
    (async () => {
      try {
        const { watchStory } = await import('@/lib/cloudStories');
        if (cancelled) return;
        unsub = watchStory(
          activeStoryId,
          (story) => {
            const remoteData = (story as any).data as string | undefined;
            if (!remoteData) return;
            // First snapshot = current state → just set the baseline.
            if (first) { first = false; lastCloudDataRef.current = remoteData; return; }
            // Echo of our own write, or nothing changed.
            if (remoteData === lastCloudDataRef.current) return;
            // Don't clobber unsaved local edits.
            if (dirtyRef.current) return;
            const ok = useAppStore.getState().importStory(remoteData);
            if (!ok) return;
            lastCloudDataRef.current = remoteData;
            // Persist so a later reopen loads the fresh content offline too.
            try { saveState(activeStoryId, JSON.parse(remoteData)); } catch {/* corrupt blob */}
            // Bump the drawer entry's title/updatedAt.
            useAppStore.setState((s: any) => ({
              stories: s.stories.map((st: any) =>
                st.id === activeStoryId
                  ? { ...st, title: (story as any).title || st.title, updatedAt: (story as any).updatedAt || Date.now() }
                  : st,
              ),
            }));
            // TipTap reads elements once at mount — force it to resync.
            setTimeout(() => {
              document.dispatchEvent(new CustomEvent('writer:rebuild'));
            }, 0);
            toast.success('New material added from Claude', {
              description: 'The latest scenes just synced into this story.',
              duration: 4000,
            });
          },
          (err) => {
            // eslint-disable-next-line no-console
            console.warn('[Kindling] Live story watch error:', (err as any)?.code || (err as any)?.message || err);
          },
        );
      } catch (err: any) {
        // eslint-disable-next-line no-console
        console.warn('[Kindling] Could not start live story watch:', err?.code || err?.message || err);
      }
    })();
    return () => { cancelled = true; if (unsub) unsub(); };
  }, [user, activeStoryId, saveState]);

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

  // Open the full ProfileEditor from anywhere (e.g. Settings → Profile → "Open full profile editor →").
  useEffect(() => {
    const onOpenProfile = () => { if (profile) setShowProfile(true); };
    document.addEventListener('app:openProfileEditor', onOpenProfile);
    return () => document.removeEventListener('app:openProfileEditor', onOpenProfile);
  }, [profile]);

  // Agent panel — opened by the TopBar Co-worker button or by any
  // component that dispatches `app:openAgent`.
  useEffect(() => {
    const onOpenAgent = () => setShowAgent(true);
    document.addEventListener('app:openAgent', onOpenAgent);
    return () => document.removeEventListener('app:openAgent', onOpenAgent);
  }, []);

  // Generic save trigger — used by Version-history restore (and anywhere that
  // needs to force an immediate persist) so it doesn't have to wait for the
  // 30s autosave.
  useEffect(() => {
    const onSave = () => handleManualSave();
    document.addEventListener('app:save', onSave);
    return () => document.removeEventListener('app:save', onSave);
  }, [handleManualSave]);

  // Install the Runway browser-bridge listeners once at boot. The
  // bridge listens for postMessages from the Kindling Runway Bridge
  // extension and attaches returned image / video URLs to the matching
  // shot. Without the extension installed the listeners are inert.
  useEffect(() => {
    installRunwayBridge();
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

  // Right-click → contextmenu. On the writer / director / plot views, if
  // the user has text selected we show our own small menu with "Add
  // comment" instead of the browser's default menu. Otherwise we let the
  // browser handle it normally so they can paste / inspect.
  useEffect(() => {
    let menuEl: HTMLDivElement | null = null;
    const closeMenu = () => {
      if (menuEl && menuEl.parentNode) menuEl.parentNode.removeChild(menuEl);
      menuEl = null;
    };
    const onContext = (e: MouseEvent) => {
      const tab = useAppStore.getState().activeTab;
      if (tab !== 'writer' && tab !== 'director' && tab !== 'plot') return;
      // Only intercept when the user is right-clicking inside the main
      // view area (so they can still paste into the editor + use the
      // browser menu on toolbars etc).
      const inViewContainer = (e.target as HTMLElement)?.closest?.('.view-container');
      if (!inViewContainer) return;
      // Only intercept if either:
      //   - text is selected (something to comment on)
      //   - they right-clicked on a scene/beat element
      const sel = window.getSelection();
      const hasSelection = sel && sel.toString().trim().length > 0;
      const onCommentable = (e.target as HTMLElement)?.closest?.('[data-commentable]');
      if (!hasSelection && !onCommentable) return;

      e.preventDefault();
      closeMenu();

      const snippet = hasSelection
        ? sel!.toString().trim().slice(0, 240)
        : (onCommentable?.textContent || '').trim().slice(0, 240);

      // Build a small floating menu near the click. Clamp X/Y so the
      // ~190px-wide menu never spills off the right or bottom edge when
      // the user right-clicks near a screen border.
      const MENU_W = 190;
      const MENU_H = 48;
      const menuX = Math.max(8, Math.min(e.clientX, window.innerWidth - MENU_W));
      const menuY = Math.max(8, Math.min(e.clientY, window.innerHeight - MENU_H));
      menuEl = document.createElement('div');
      menuEl.style.cssText = `position:fixed;left:${menuX}px;top:${menuY}px;z-index:400;background:var(--panel);border:1px solid var(--rule);border-radius:6px;box-shadow:0 8px 24px rgba(0,0,0,0.3);padding:4px;min-width:180px;font:12px Inter,system-ui,sans-serif;color:var(--text);`;
      const item = document.createElement('button');
      item.style.cssText = 'display:flex;align-items:center;gap:8px;width:100%;padding:6px 10px;border:none;background:transparent;color:var(--text-secondary);text-align:left;cursor:pointer;border-radius:4px;font-size:12px';
      item.innerHTML = '<span style="color:var(--accent)">💬</span><span>Add comment</span>';
      item.addEventListener('mouseenter', () => { item.style.background = 'var(--hover)'; item.style.color = 'var(--text)'; });
      item.addEventListener('mouseleave', () => { item.style.background = 'transparent'; item.style.color = 'var(--text-secondary)'; });
      item.addEventListener('click', () => {
        document.dispatchEvent(new CustomEvent('app:openInlineComment', {
          detail: { x: e.clientX, y: e.clientY + 4, tab, snippet, target: `${tab}${snippet ? ':' + snippet.slice(0, 40) : ''}` },
        }));
        closeMenu();
      });
      menuEl.appendChild(item);
      document.body.appendChild(menuEl);

      // Close on any click outside.
      const onAway = (ev: MouseEvent) => {
        if (menuEl && !menuEl.contains(ev.target as Node)) {
          closeMenu();
          document.removeEventListener('mousedown', onAway, true);
        }
      };
      setTimeout(() => document.addEventListener('mousedown', onAway, true), 0);
    };
    document.addEventListener('contextmenu', onContext);
    return () => {
      document.removeEventListener('contextmenu', onContext);
      closeMenu();
    };
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Guard against synthetic / IME / screen-reader / extension-injected
      // keyboard events that arrive without a `.key` value. The standard
      // KeyboardEvent.key is typed as a non-optional string but in practice
      // some clients dispatch events where it is undefined — calling
      // .toLowerCase() on undefined throws the TypeError that was filling
      // the console. Bail early when there's no key to act on.
      if (typeof e.key !== 'string' || !e.key) return;
      const mod = e.metaKey || e.ctrlKey;
      // Ctrl/Cmd+S = manual save. The `!e.shiftKey` guard is essential:
      // without it this branch also swallowed Ctrl+Shift+S, so the Style
      // assistant shortcut (defined later in this same if-else chain)
      // could never fire — a dead branch ESLint flagged via no-dupe-else-if.
      if (mod && !e.shiftKey && e.key.toLowerCase() === 's') { e.preventDefault(); handleManualSave(); }
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
      else if (mod && e.shiftKey && e.key.toLowerCase() === 'm') {
        // Ctrl/Cmd+Shift+M → open the inline comment popup anchored to
        // the current text selection (if any). Works on every tab where
        // a comment makes sense.
        const tab = useAppStore.getState().activeTab;
        if (tab === 'writer' || tab === 'director' || tab === 'plot') {
          e.preventDefault();
          openInlineCommentFromSelection(tab);
        }
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
      const customHex = (settings as any).accentColor as string | undefined;

      if (accent === 'custom' && customHex) {
        // Derive a full, professional palette from the user's colour and write
        // it inline (overrides every preset). Works for ANY hue.
        import('@/lib/accentGrading').then(({ applyCustomAccent }) => {
          applyCustomAccent(customHex, mode);
        });
        root.removeAttribute('data-accent');
      } else {
        // Built-in preset: clear any custom inline vars + set the data-accent
        // attribute so index.css's tuned palette blocks apply.
        import('@/lib/accentGrading').then(({ clearCustomAccent }) => clearCustomAccent());
        if (accent && accent !== 'indigo') {
          root.setAttribute('data-accent', accent);
        } else {
          root.removeAttribute('data-accent');
        }
      }
    };
    apply();
    // Re-apply when the system theme changes (only relevant when mode === 'system').
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const onChange = () => { if (!settings.theme || (settings.theme as string) === 'auto' || (settings.theme as string) === 'system') apply(); };
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, [settings.theme, (settings as any).accent, (settings as any).accentColor]);

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
        onDeleteStory={handleDeleteStory}
        canClose={stories.length > 0}
        onClose={() => setShowStorySelector(false)}
      />
    );
  }

  const activeDirectorSceneId = useAppStore.getState().activeDirectorSceneId;

  return (
    <div className={`app-container ${isFocusMode ? 'focus-mode' : ''}`}>
      <a href="#main-content" className="skip-link">Skip to content</a>
      <Toaster theme={settings.theme === 'light' ? 'light' : 'dark'} position="bottom-right" richColors />
      <MediaViewer />
      <RunwayPromptDialog />
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
          onDeleteStory={handleDeleteStory}
          onOpenSettings={() => setShowSettings(true)}
          onOpenProfile={() => setShowUserMenu((v) => !v)}
          user={user ? { displayName: profile?.displayName || user.displayName, photoURL: profile?.avatar || user.photoURL, email: user.email } : null}
          canWrite={canWrite}
          canDirect={canDirect}
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
            currentPanel={rightPanel}
            onOpenPanel={(p) => {
              // Opening Comments or Collaborate effectively "sees" the
              // notifications they were badging.
              if (p === 'comments') markCommentsSeen();
              togglePanel(p as any);
            }}
            roleBadge={isCloudStory ? { role: storyRole || 'both', isOwner: isStoryOwner } : null}
            pendingInvites={pendingInvites}
            unreadComments={unreadComments}
          />
        )}
        {/* The original Toolbar now only renders on the Writer tab and only
            for its format-button row — we strip the AI icons + Reports +
            Export + Focus since the TopBar now owns those. */}
        {!isFocusMode && activeTab === 'writer' && canWrite && (
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
        {/* Read-only banner for collaborators viewing a panel they can't edit.
            Director-only collaborators see this on the Writer tab; writer-only
            on the Director / Plot tabs. */}
        {!isFocusMode && activeTab === 'writer' && !canWrite && (
          <ReadOnlyBanner kind="writer" />
        )}
        {!isFocusMode && (activeTab === 'director' || activeTab === 'plot') && !canDirect && (
          <ReadOnlyBanner kind="director" />
        )}

        <div className="view-container">
          <Suspense fallback={<div className="h-full flex items-center justify-center text-[var(--text-muted)] text-sm">Loading…</div>}>
            {activeTab === 'writer' && (
              <div key="writer" className={`h-full ${canWrite ? '' : 'pointer-events-none select-text opacity-90'}`}>
                <WriterView
                  screenplay={screenplay}
                  onUpdateField={updateScreenplayField}
                  onStartWriting={() => useAppStore.getState().startWriting()}
                  characters={characters}
                />
              </div>
            )}

            {activeTab === 'director' && (
              <div key="director" className={`h-full ${canDirect ? '' : 'pointer-events-none select-text opacity-90'}`}>
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
              <div key="plot" className={`h-full ${canDirect ? '' : 'pointer-events-none select-text opacity-90'}`}>
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
              <div key="calendar" className={`h-full ${canDirect ? '' : 'pointer-events-none select-text opacity-90'}`}>
                <CalendarView />
              </div>
            )}

            {/* Writer-section workspaces — gated by canWrite */}
            {activeTab === 'outline' && (
              <div key="outline" className={`h-full ${canWrite ? '' : 'pointer-events-none select-text opacity-90'}`}>
                <OutlineView />
              </div>
            )}
            {activeTab === 'world' && (
              <div key="world" className={`h-full ${canWrite ? '' : 'pointer-events-none select-text opacity-90'}`}>
                <WorldView />
              </div>
            )}

            {/* Director-section workspaces — gated by canDirect */}
            {activeTab === 'storyboard' && (
              <div key="storyboard" className={`h-full ${canDirect ? '' : 'pointer-events-none select-text opacity-90'}`}>
                <StoryboardView />
              </div>
            )}
            {activeTab === 'locations' && (
              <div key="locations" className={`h-full ${canDirect ? '' : 'pointer-events-none select-text opacity-90'}`}>
                <LocationsView />
              </div>
            )}
          </Suspense>
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

        {/* Comments panel is rendered as a fixed-right column when its tool
            is selected, OUTSIDE the normal RightPanel rotation (because it
            needs its own data subscription + a real-time list). Same look
            and feel as the existing inspector panels. */}
        {rightPanel === 'comments' && (
          <aside className="fixed right-0 top-11 bottom-7 w-[320px] border-l border-[var(--rule)] bg-[var(--panel)] z-10 shadow-2xl">
            <CommentsPanel onClose={closePanel} currentTab={activeTab} />
          </aside>
        )}

        <RightPanel
          panel={rightPanel === 'comments' ? null : rightPanel}
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

      {!isFocusMode && !showStorySelector && (canWrite || canDirect) && (
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

      <Suspense fallback={null}>
      <ExportDialog open={showExport} onClose={() => setShowExport(false)} />
      <SettingsOverlay open={showSettings} onClose={() => setShowSettings(false)} />
      {/* Share & invite dialogs — opened via TopBar ⋯ menu via custom events.
          Both adapt to local-vs-signed-in state and route through onOpenAuth
          (flip skippedAuth back to false to re-mount the AuthWall). */}
      <ShareDialog user={user} onOpenAuth={() => setSkippedAuth(false)} />
      <InviteDialog user={user} onOpenAuth={() => setSkippedAuth(false)} />
      {/* Live Firestore round-trip probe — opens via the ⋯ menu or a custom
          event from any UI surface. Tells the user EXACTLY which step fails
          (config / auth / network / write / read), with the raw error code. */}
      <CloudDiagnostic />
      <VersionHistory />
      <BreakdownView />
      {/* Floating inline comment popup. Opens via:
            - TopBar Comment button → app:openInlineComment event
            - Cmd/Ctrl+Shift+M keyboard shortcut (see keyboard handler)
            - Right-click on writer / director / plot view → "Add comment"
          Posts to /stories/{id}/comments with a target string anchored to
          the current tab + selection snippet. */}
      <InlineCommentPopup />
      {/* Persistent highlight overlay — paints colored boxes over every
          commented snippet in the active panel. Double-clicking a
          highlight opens InlineCommentPopup in edit mode. */}
      <InlineCommentHighlights />
      {/* Agent co-worker drawer — opened via TopBar Bot button. */}
      <AgentPanel open={showAgent} onClose={() => setShowAgent(false)} />
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
      </Suspense>

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

/**
 * Read-only banner — shown above a view when the current user's role on
 * the cloud-shared story doesn't include edit access for that view.
 * Tells the user what they can do (view + look around) and what they
 * need (an upgrade to writer/director/both) without being scary.
 */
function ReadOnlyBanner({ kind }: { kind: 'writer' | 'director' }) {
  const label = kind === 'writer' ? 'Writer view' : 'Director view';
  const need = kind === 'writer' ? 'writer or both' : 'director or both';
  return (
    <div className="px-3 py-1.5 bg-[var(--accent-soft)] border-b border-[var(--accent)]/30 flex items-center gap-2 text-[11px] text-[var(--text-secondary)] flex-shrink-0">
      <svg className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--accent)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
      </svg>
      <span className="font-medium">
        {label} is read-only for you on this story.
      </span>
      <span className="text-[var(--text-muted)] truncate">
        Ask the owner for the <strong>{need}</strong> role to make changes.
      </span>
    </div>
  );
}

export default App;
