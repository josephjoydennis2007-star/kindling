import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  AppState,
  AppSettings,
  Character,
  Scene,
  Shot,
  BRoll,
  Act,
  Beat,
  Note,
  HistoryEntry,
  ScreenplayElement,
  Story,
  StoryType,
  Project,
  ProjectKnowledge,
  Section,
  CoworkerInfo,
  ChatMessage,
  WorkspaceLink,
} from '@/types';
import { getTemplate } from '@/lib/storyTemplates';

const COLORS = ['#e76f51','#f4a261','#2a9d8f','#264653','#e9c46a','#9b5de5','#f15bb5','#00bbf9','#fb5607','#8338ec'];

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

const defaultSettings: AppSettings = {
  theme: 'dark',
  primaryColor: '#3b82f6',
  accentColor: '#f4a261',
  bgColor: '#0a0a0f',
  sidebarColor: '#111118',
  panelColor: '#16161f',
  textColor: '#e8e8e8',
  textSecondaryColor: '#a0a0a0',
  borderColor: '#2a2a3a',
  fontSize: 12,
  lineHeight: 1,
  fontFamily: 'Courier New, Courier, monospace',
  autoSave: true,
  autoSaveInterval: 60000,
  cloudSync: false,
  userId: null,
  sidebarCollapsed: false,

  defaultSaveFolder: null,
  socialBarEnabled: true,
  // 'builtin' is the free, no-API-key default. Uses Pollinations.ai so any
  // user — including someone who just installed the app — can talk to the
  // co-worker AI right away. Power users can switch to OpenAI/Anthropic etc.
  // in Settings → AI for higher-quality output.
  aiProvider: 'builtin',
  aiApiKey: '',
  aiModel: 'openai',
  aiEndpoint: '',
  userDisplayName: 'You',
  userRole: 'admin',
};

const DEFAULT_WORKSPACE_LINKS: WorkspaceLink[] = [
  { id: 'w1', category: 'video', label: 'DaVinci Resolve',  url: 'https://www.blackmagicdesign.com/products/davinciresolve' },
  { id: 'w2', category: 'video', label: 'CapCut Web',       url: 'https://www.capcut.com/editor' },
  { id: 'w3', category: 'video', label: 'Adobe Premiere',   url: 'https://www.adobe.com/products/premiere.html' },
  { id: 'w4', category: 'video', label: 'Clipchamp',        url: 'https://clipchamp.com' },

  { id: 'a1', category: 'audio', label: 'Freesound (SFX)',  url: 'https://freesound.org' },
  { id: 'a2', category: 'audio', label: 'Pixabay Music',    url: 'https://pixabay.com/music/' },
  { id: 'a3', category: 'audio', label: 'YouTube Audio Library', url: 'https://studio.youtube.com/channel/UC/music' },
  { id: 'a4', category: 'audio', label: 'Mixkit (Free)',    url: 'https://mixkit.co/free-sound-effects/' },
  { id: 'a5', category: 'audio', label: 'Zapsplat',         url: 'https://www.zapsplat.com' },

  { id: 'v1', category: 'voice', label: 'ElevenLabs',       url: 'https://elevenlabs.io/app/speech-synthesis' },
  { id: 'v2', category: 'voice', label: 'Fish Audio',       url: 'https://fish.audio' },
  { id: 'v3', category: 'voice', label: 'Murf.ai',          url: 'https://murf.ai/studio' },
  { id: 'v4', category: 'voice', label: 'PlayHT',           url: 'https://play.ht' },

  { id: 'i1', category: 'ai-video', label: 'Runway',        url: 'https://runwayml.com' },
  { id: 'i2', category: 'ai-video', label: 'Pika',          url: 'https://pika.art' },
  { id: 'i3', category: 'ai-video', label: 'Luma Dream Machine', url: 'https://lumalabs.ai/dream-machine' },
  { id: 'i4', category: 'ai-video', label: 'HeyGen',        url: 'https://app.heygen.com' },
  { id: 'i5', category: 'ai-video', label: 'Kling',         url: 'https://klingai.com' },

  // Cloud Storage (uses 'custom' until a dedicated type exists)
  { id: 'c1', category: 'custom', label: 'Google Drive',  url: 'https://drive.google.com' },
  { id: 'c2', category: 'custom', label: 'Dropbox',       url: 'https://www.dropbox.com/home' },
  { id: 'c3', category: 'custom', label: 'OneDrive',      url: 'https://onedrive.live.com' },
  { id: 'c4', category: 'custom', label: 'iCloud Drive',  url: 'https://www.icloud.com/iclouddrive' },
  { id: 'c5', category: 'custom', label: 'Box',           url: 'https://app.box.com' },
  { id: 'c6', category: 'custom', label: 'Mega',          url: 'https://mega.io' },
  { id: 'c7', category: 'custom', label: 'pCloud',        url: 'https://my.pcloud.com' },
  { id: 'c8', category: 'custom', label: 'Sync.com',      url: 'https://www.sync.com' },
  { id: 'c9', category: 'custom', label: 'Notion',        url: 'https://www.notion.so' },
  { id: 'c10',category: 'custom', label: 'GitHub Gists',  url: 'https://gist.github.com' },
  { id: 'c11',category: 'custom', label: 'Backblaze B2',  url: 'https://www.backblaze.com/cloud-storage' },
  { id: 'c12',category: 'custom', label: 'Frame.io',      url: 'https://app.frame.io' },
];

const defaultState: AppState = {
  activeStoryId: null,
  stories: [],
  projects: [],
  activeProjectId: null,
  activeTab: 'writer',
  activeSceneId: null,
  activeDirectorSceneId: null,
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
  },
  scenes: [],
  shots: {},
  bRolls: {},
  characters: [],
  plotBoard: {
    acts: [
      { id: genId(), title: 'ACT ONE', beatIds: [], order: 0 },
      { id: genId(), title: 'ACT TWO (A)', beatIds: [], order: 1 },
      { id: genId(), title: 'ACT TWO (B)', beatIds: [], order: 2 },
      { id: genId(), title: 'ACT THREE', beatIds: [], order: 3 },
    ]
  },
  beats: {},
  notes: [],
  history: [],
  settings: defaultSettings,
  rightPanel: null,
  isFocusMode: false,
  focusCharacterId: null,

  coworkers: [],
  chat: [],
  workspaceLinks: DEFAULT_WORKSPACE_LINKS,
};

const SCENE_COLORS = ['#3b82f6', '#2a9d8f', '#e9c46a', '#9b5de5', '#f15bb5', '#00bbf9', '#fb5607', '#e76f51'];

/**
 * Make ANY imported story safe to render. A story built outside the app
 * (the Claude connector, an old export, a shared link) might be missing
 * fields the UI iterates — e.g. shot.bRollIds, scene.heading, beat.color.
 * One undefined array there (`shot.bRollIds.map(...)`) white-screens the
 * whole app. This backfills EVERY field with the same defaults the store's
 * own add* actions use, so an imported story renders identically to one
 * created inside the app — same colors, same structure, no crashes.
 */
function normalizeStoryData(data: any) {
  const scenes: Scene[] = (Array.isArray(data?.scenes) ? data.scenes : []).map((s: any, i: number) => ({
    id: s?.id || genId(),
    name: s?.name || `Scene ${i + 1}`,
    heading: s?.heading || s?.name || `Scene ${i + 1}`,
    content: typeof s?.content === 'string' ? s.content : '',
    description: typeof s?.description === 'string' ? s.description : '',
    color: s?.color || SCENE_COLORS[i % SCENE_COLORS.length],
    status: s?.status || 'todo',
    shotIds: Array.isArray(s?.shotIds) ? s.shotIds : [],
    order: typeof s?.order === 'number' ? s.order : i,
    ...(s?.shootDate ? { shootDate: s.shootDate } : {}),
    ...(s?.budget ? { budget: s.budget } : {}),
    ...(s?.revisionColor ? { revisionColor: s.revisionColor } : {}),
    ...(typeof s?.lastEditedAt === 'number' ? { lastEditedAt: s.lastEditedAt } : {}),
    ...(s?.breakdown && typeof s.breakdown === 'object' ? { breakdown: s.breakdown } : {}),
  }));

  const rawShots = data?.shots && typeof data.shots === 'object' ? data.shots : {};
  const shots: Record<string, Shot> = {};
  let si = 0;
  for (const key of Object.keys(rawShots)) {
    const sh = rawShots[key] || {};
    shots[key] = {
      id: sh.id || key,
      sceneId: sh.sceneId || '',
      description: typeof sh.description === 'string' ? sh.description : '',
      shotType: sh.shotType || '',
      camera: typeof sh.camera === 'string' ? sh.camera : '',
      bRollIds: Array.isArray(sh.bRollIds) ? sh.bRollIds : [],
      order: typeof sh.order === 'number' ? sh.order : si,
      ...(sh.audioNote ? { audioNote: sh.audioNote } : {}),
      ...(sh.audioFile ? { audioFile: sh.audioFile } : {}),
      ...(sh.storyboard ? { storyboard: sh.storyboard } : {}),
      ...(sh.lastFrame ? { lastFrame: sh.lastFrame } : {}),
      ...(sh.needsLastFrame ? { needsLastFrame: true } : {}),
      ...(sh.lastFrameDescription ? { lastFrameDescription: sh.lastFrameDescription } : {}),
      ...(typeof sh.durationSec === 'number' ? { durationSec: sh.durationSec } : {}),
      ...(sh.lens ? { lens: sh.lens } : {}),
    };
    si++;
  }

  const rawBeats = data?.beats && typeof data.beats === 'object' ? data.beats : {};
  const beats: Record<string, Beat> = {};
  let bi = 0;
  for (const key of Object.keys(rawBeats)) {
    const b = rawBeats[key] || {};
    beats[key] = {
      id: b.id || key,
      actId: b.actId || '',
      title: typeof b.title === 'string' ? b.title : '',
      description: typeof b.description === 'string' ? b.description : '',
      tags: Array.isArray(b.tags) ? b.tags : [],
      color: b.color || COLORS[bi % COLORS.length],
      ...(b.beatType ? { beatType: b.beatType } : {}),
      ...(typeof b.order === 'number' ? { order: b.order } : {}),
    };
    bi++;
  }

  const characters: Character[] = (Array.isArray(data?.characters) ? data.characters : []).map((c: any, i: number) => ({
    ...c,
    id: c?.id || genId(),
    name: c?.name || 'CHARACTER',
    displayName: c?.displayName || c?.name || 'Character',
    description: typeof c?.description === 'string' ? c.description : '',
    color: c?.color || COLORS[i % COLORS.length],
    image: c?.image ?? null,
    backstory: c?.backstory || '',
    goals: c?.goals || '',
    personality: c?.personality || '',
    age: c?.age || '',
    occupation: c?.occupation || '',
    motivation: c?.motivation || '',
    conflict: c?.conflict || '',
    relationships: c?.relationships || '',
    notes: c?.notes || '',
    voiceAudio: c?.voiceAudio ?? null,
    tags: Array.isArray(c?.tags) ? c.tags : [],
    createdAt: typeof c?.createdAt === 'number' ? c.createdAt : Date.now(),
  }));

  const rawActs = Array.isArray(data?.plotBoard?.acts) ? data.plotBoard.acts : null;
  const plotBoard = rawActs
    ? {
        acts: rawActs.map((a: any, i: number) => ({
          id: a?.id || genId(),
          title: a?.title || `ACT ${i + 1}`,
          beatIds: Array.isArray(a?.beatIds) ? a.beatIds : [],
          order: typeof a?.order === 'number' ? a.order : i,
        })),
      }
    : defaultState.plotBoard;

  const screenplay = {
    ...defaultState.screenplay,
    ...(data?.screenplay || {}),
    elements: Array.isArray(data?.screenplay?.elements) ? data.screenplay.elements : [],
    sections: Array.isArray(data?.screenplay?.sections) ? data.screenplay.sections : [],
  };

  return {
    screenplay,
    scenes,
    shots,
    bRolls: data?.bRolls && typeof data.bRolls === 'object' ? data.bRolls : {},
    characters,
    plotBoard,
    beats,
    notes: Array.isArray(data?.notes) ? data.notes : [],
  };
}

interface AppActions {
  // Stories
  createStory: (title: string, type?: StoryType, projectId?: string) => string;
  loadStory: (storyId: string) => void;
  // Projects
  createProject: (name: string, about?: string) => string;
  updateProject: (id: string, patch: Partial<Project>) => void;
  deleteProject: (id: string) => void;
  setActiveProject: (id: string | null) => void;
  addProjectKnowledge: (projectId: string, name: string, content: string) => void;
  removeProjectKnowledge: (projectId: string, knowledgeId: string) => void;
  deleteStory: (storyId: string) => void;
  setActiveStory: (storyId: string | null) => void;
  updateStory: (storyId: string, updates: Partial<Story>) => void;

  // Writer sections
  addSection: (name?: string) => string;
  addAsset: (asset: Omit<import('@/types').Asset, 'id' | 'addedAt'>) => string;
  deleteAsset: (id: string) => void;
  updateSection: (id: string, updates: Partial<Section>) => void;
  deleteSection: (id: string) => void;
  setActiveSection: (id: string | null) => void;

  // Coworkers / chat
  addCoworker: (info: Partial<CoworkerInfo>) => string;
  updateCoworker: (id: string, updates: Partial<CoworkerInfo>) => void;
  removeCoworker: (id: string) => void;
  sendChatMessage: (msg: Omit<ChatMessage, 'id' | 'timestamp'>) => void;
  deleteChatMessage: (id: string) => void;
  clearChat: () => void;

  // Workspace links
  addWorkspaceLink: (link: Omit<WorkspaceLink, 'id'>) => string;
  updateWorkspaceLink: (id: string, updates: Partial<WorkspaceLink>) => void;
  deleteWorkspaceLink: (id: string) => void;
  
  // Tab
  setTab: (tab: AppState['activeTab']) => void;
  
  // Screenplay
  setScreenplay: (screenplay: AppState['screenplay']) => void;
  updateScreenplayField: (field: keyof AppState['screenplay'], value: any) => void;
  addElement: (element: ScreenplayElement) => void;
  updateElement: (id: string, updates: Partial<ScreenplayElement>) => void;
  removeElement: (id: string) => void;
  startWriting: () => void;
  
  // Scenes
  addScene: (name?: string, content?: string) => string;
  updateScene: (id: string, updates: Partial<Scene>) => void;
  deleteScene: (id: string) => void;
  setActiveScene: (id: string | null) => void;
  
  // Characters
  addCharacter: (char: Partial<Character>) => string;
  updateCharacter: (id: string, updates: Partial<Character>) => void;
  deleteCharacter: (id: string) => void;
  mergeDuplicateCharacters: () => number;
  
  // Shots
  addShot: (sceneId: string) => string;
  updateShot: (id: string, updates: Partial<Shot>) => void;
  deleteShot: (id: string) => void;
  
  // B-Rolls
  addBRoll: (shotId: string) => string;
  updateBRoll: (id: string, updates: Partial<BRoll>) => void;
  deleteBRoll: (id: string) => void;
  
  // Plot Board
  addAct: () => string;
  updateAct: (id: string, updates: Partial<Act>) => void;
  deleteAct: (id: string) => void;
  addBeat: (actId: string) => string;
  updateBeat: (id: string, updates: Partial<Beat>) => void;
  deleteBeat: (id: string) => void;
  moveBeat: (beatId: string, fromActId: string, toActId: string) => void;
  reorderBeats: (actId: string, beatIds: string[]) => void;
  reorderScenes: (sceneIds: string[]) => void;
  reorderShots: (sceneId: string, shotIds: string[]) => void;
  
  // Notes
  addNote: (text: string, category: Note['category']) => void;
  deleteNote: (id: string) => void;
  
  // History
  addHistory: (label: string, storyId: string) => void;
  clearHistory: () => void;
  
  // Settings
  updateSettings: (settings: Partial<AppSettings>) => void;
  resetSettings: () => void;
  
  // UI
  togglePanel: (panel: AppState['rightPanel']) => void;
  closePanel: () => void;
  toggleFocusMode: () => void;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  focusCharacter: (id: string) => void;
  
  // Director
  setActiveDirectorScene: (id: string | null) => void;
  
  // Utils
  genId: () => string;
  getColor: () => string;
  
  // Import/Export
  exportStory: () => string;
  importStory: (json: string) => boolean;
  /**
   * Import a story that came from the cloud (a Firestore /stories/{id} doc).
   * Creates a local Story entry whose id matches the cloud id (so subsequent
   * pullStory / watchChat / Jitsi room lookups use the SAME key on both
   * sides of the share). If a local entry with that id already exists, it
   * is updated in place. Sets activeStoryId to the cloud id so the writer
   * lands inside the shared script immediately.
   */
  importSharedStory: (cloudId: string, title: string, json: string) => boolean;
}

export const useAppStore = create<AppState & AppActions>()(
  persist(
    (set, get) => ({
      ...defaultState,

      // Stories
      createStory: (title, type, projectId) => {
        const pid = projectId ?? get().activeProjectId ?? undefined;
        const story: Story = {
          id: genId(),
          title: title || 'Untitled Story',
          type: type || 'movie',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          ...(pid ? { projectId: pid } : {}),
        };
        // Pull a per-type template so a YouTube short doesn't open the same
        // blank screenplay as a Feature Film.
        const tpl = getTemplate(story.type);
        const reset = resetStoryData();
        set((state) => ({
          stories: [...state.stories, story],
          activeStoryId: story.id,
          ...reset,
          screenplay: {
            ...reset.screenplay!,
            sections: tpl.sections,
            activeSectionId: tpl.sections[0]?.id ?? null,
            elements: tpl.elements,
            started: true,
          },
        }));
        return story.id;
      },

      loadStory: (storyId) => {
        // This will be handled by the sync hook
        set({ activeStoryId: storyId });
      },

      deleteStory: (storyId) => {
        set((state) => ({
          stories: state.stories.filter((s) => s.id !== storyId),
          activeStoryId: state.activeStoryId === storyId ? null : state.activeStoryId,
        }));
      },

      setActiveStory: (storyId) => set({ activeStoryId: storyId }),

      updateStory: (storyId, updates) => set((state) => ({
        stories: state.stories.map((s) =>
          s.id === storyId ? { ...s, ...updates, updatedAt: Date.now() } : s
        ),
      })),

      // ---- Projects ----
      createProject: (name, about) => {
        const project: Project = {
          id: genId(),
          name: name || 'Untitled Project',
          about: about || '',
          instructions: '',
          knowledge: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        set((state) => ({ projects: [...state.projects, project], activeProjectId: project.id }));
        return project.id;
      },
      updateProject: (id, patch) => set((state) => ({
        projects: state.projects.map((p) => (p.id === id ? { ...p, ...patch, updatedAt: Date.now() } : p)),
      })),
      deleteProject: (id) => set((state) => ({
        projects: state.projects.filter((p) => p.id !== id),
        activeProjectId: state.activeProjectId === id ? null : state.activeProjectId,
        // Detach (don't delete) the project's stories so work is never lost.
        stories: state.stories.map((s) => (s.projectId === id ? { ...s, projectId: undefined } : s)),
      })),
      setActiveProject: (id) => set({ activeProjectId: id }),
      addProjectKnowledge: (projectId, name, content) => set((state) => ({
        projects: state.projects.map((p) => p.id === projectId
          ? { ...p, updatedAt: Date.now(), knowledge: [...p.knowledge, { id: genId(), name: name || 'Note', content: content || '', addedAt: Date.now() } as ProjectKnowledge] }
          : p),
      })),
      removeProjectKnowledge: (projectId, knowledgeId) => set((state) => ({
        projects: state.projects.map((p) => p.id === projectId
          ? { ...p, updatedAt: Date.now(), knowledge: p.knowledge.filter((k) => k.id !== knowledgeId) }
          : p),
      })),

      // ---- Writer sections ----
      addSection: (name) => {
        const id = genId();
        const list = get().screenplay.sections || [];
        const section: Section = {
          id,
          name: (name && name.trim()) || `Section ${list.length + 1}`,
          color: SCENE_COLORS[list.length % SCENE_COLORS.length],
          order: list.length,
        };
        set((state) => ({
          screenplay: {
            ...state.screenplay,
            sections: [...(state.screenplay.sections || []), section],
            activeSectionId: id,
          },
        }));
        return id;
      },
      updateSection: (id, updates) => set((state) => ({
        screenplay: {
          ...state.screenplay,
          sections: (state.screenplay.sections || []).map((s) =>
            s.id === id ? { ...s, ...updates } : s
          ),
        },
      })),
      deleteSection: (id) => set((state) => ({
        screenplay: {
          ...state.screenplay,
          sections: (state.screenplay.sections || []).filter((s) => s.id !== id),
          elements: state.screenplay.elements.map((e) =>
            e.sectionId === id ? { ...e, sectionId: null } : e
          ),
          activeSectionId: state.screenplay.activeSectionId === id ? null : state.screenplay.activeSectionId,
        },
      })),
      setActiveSection: (id) => set((state) => ({
        screenplay: { ...state.screenplay, activeSectionId: id },
      })),

      addAsset: (asset) => {
        const id = genId();
        const list = get().screenplay.assets || [];
        const next = { ...asset, id, addedAt: Date.now() };
        set((state) => ({
          screenplay: { ...state.screenplay, assets: [...list, next] },
        }));
        return id;
      },
      deleteAsset: (id) =>
        set((state) => ({
          screenplay: {
            ...state.screenplay,
            assets: (state.screenplay.assets || []).filter((a) => a.id !== id),
          },
        })),

      // ---- Coworkers / chat ----
      addCoworker: (info) => {
        const id = info.id || genId();
        const coworker: CoworkerInfo = {
          id,
          name: info.name || 'New Coworker',
          email: info.email,
          avatar: info.avatar || null,
          role: info.role || 'viewer',
          status: info.status || 'offline',
          lastSeen: Date.now(),
          currentSection: info.currentSection || null,
          socialAllowed: info.socialAllowed ?? true,
        };
        set((state) => ({ coworkers: [...state.coworkers, coworker] }));
        return id;
      },
      updateCoworker: (id, updates) => set((state) => ({
        coworkers: state.coworkers.map((c) => (c.id === id ? { ...c, ...updates } : c)),
      })),
      removeCoworker: (id) => set((state) => ({
        coworkers: state.coworkers.filter((c) => c.id !== id),
      })),
      sendChatMessage: (msg) => set((state) => ({
        chat: [
          ...state.chat,
          { ...msg, id: genId(), timestamp: Date.now() } as ChatMessage,
        ].slice(-500),
      })),
      deleteChatMessage: (id) => set((state) => ({
        chat: state.chat.filter((m) => m.id !== id),
      })),
      clearChat: () => set({ chat: [] }),

      // ---- Workspace links ----
      addWorkspaceLink: (link) => {
        const id = genId();
        set((state) => ({
          workspaceLinks: [...state.workspaceLinks, { ...link, id }],
        }));
        return id;
      },
      updateWorkspaceLink: (id, updates) => set((state) => ({
        workspaceLinks: state.workspaceLinks.map((l) =>
          l.id === id ? { ...l, ...updates } : l
        ),
      })),
      deleteWorkspaceLink: (id) => set((state) => ({
        workspaceLinks: state.workspaceLinks.filter((l) => l.id !== id),
      })),

      // Tab
      setTab: (tab) => set({ activeTab: tab }),

      // Screenplay
      setScreenplay: (screenplay) => set({ screenplay }),
      updateScreenplayField: (field, value) =>
        set((state) => ({
          screenplay: { ...state.screenplay, [field]: value },
        })),
      addElement: (element) =>
        set((state) => ({
          screenplay: {
            ...state.screenplay,
            elements: [...state.screenplay.elements, element],
          },
        })),
      updateElement: (id, updates) =>
        set((state) => ({
          screenplay: {
            ...state.screenplay,
            elements: state.screenplay.elements.map((el) =>
              el.id === id ? { ...el, ...updates } : el
            ),
          },
        })),
      removeElement: (id) =>
        set((state) => ({
          screenplay: {
            ...state.screenplay,
            elements: state.screenplay.elements.filter((el) => el.id !== id),
          },
        })),
      startWriting: () =>
        set((state) => ({
          screenplay: { ...state.screenplay, started: true },
        })),

      // Scenes
      addScene: (name, content) => {
        const id = genId();
        const count = get().scenes.length;
        const safeName = typeof name === 'string' && name.trim() ? name.trim() : `Scene ${count + 1}`;
        const scene: Scene = {
          id,
          name: safeName,
          heading: safeName,
          content: typeof content === 'string' ? content : '',
          description: '',
          color: SCENE_COLORS[count % SCENE_COLORS.length],
          status: 'todo',
          shotIds: [],
          order: count,
        };
        set((state) => ({
          scenes: [...state.scenes, scene],
        }));
        return id;
      },
      updateScene: (id, updates) =>
        set((state) => ({
          scenes: state.scenes.map((s) => (s.id === id ? { ...s, ...updates } : s)),
        })),
      deleteScene: (id) =>
        set((state) => ({
          scenes: state.scenes.filter((s) => s.id !== id),
          screenplay: {
            ...state.screenplay,
            elements: state.screenplay.elements.filter((el) => el.sceneId !== id),
          },
        })),
      setActiveScene: (id) => set({ activeSceneId: id }),

      // Characters
      addCharacter: (char) => {
        // ---- Dedupe by name: one profile per character. ----
        // If a character with the same (case-insensitive, trimmed) name
        // already exists, MERGE the provided non-empty fields into it
        // instead of creating a duplicate. This stops the AI (and manual
        // re-adds / @mention auto-adds) from spawning twin profiles.
        const wantedName = String(char.name || '').trim().toUpperCase();
        if (wantedName) {
          const existing = get().characters.find(
            (c) => c.name.trim().toUpperCase() === wantedName,
          );
          if (existing) {
            const merged: Partial<Character> = {};
            // Only overwrite when the incoming value is a non-empty string,
            // so a bare re-add never wipes existing detail.
            (Object.keys(char) as (keyof Character)[]).forEach((k) => {
              const v: any = (char as any)[k];
              if (k === 'id' || k === 'createdAt' || k === 'name') return;
              if (typeof v === 'string') {
                if (v.trim()) (merged as any)[k] = v;
              } else if (v !== undefined && v !== null) {
                (merged as any)[k] = v;
              }
            });
            if (Object.keys(merged).length) {
              set((state) => ({
                characters: state.characters.map((c) =>
                  c.id === existing.id ? { ...c, ...merged } : c,
                ),
              }));
            }
            return existing.id;
          }
        }
        const id = genId();
        const character: Character = {
          id,
          name: (char.name || 'CHARACTER').toUpperCase(),
          displayName: char.displayName || char.name || 'Character',
          description: char.description || '',
          color: char.color || COLORS[get().characters.length % COLORS.length],
          image: char.image || null,
          backstory: char.backstory || '',
          goals: char.goals || '',
          personality: char.personality || '',
          age: char.age || '',
          occupation: char.occupation || '',
          motivation: char.motivation || '',
          conflict: char.conflict || '',
          relationships: char.relationships || '',
          notes: char.notes || '',
          voiceAudio: char.voiceAudio || null,
          tags: char.tags || [],
          createdAt: Date.now(),
          imagePrompt: char.imagePrompt || '',
        };
        set((state) => ({
          characters: [...state.characters, character],
        }));
        return id;
      },
      updateCharacter: (id, updates) =>
        set((state) => ({
          characters: state.characters.map((c) =>
            c.id === id ? { ...c, ...updates } : c
          ),
        })),
      deleteCharacter: (id) =>
        set((state) => ({
          characters: state.characters.filter((c) => c.id !== id),
        })),
      // Collapse same-name characters into ONE profile. Keeps the earliest
      // profile, fills any of its blank fields from the duplicates (so no
      // detail is lost), unions tags, and drops the extras. Returns how many
      // duplicate cards were removed. Used by the "Merge duplicates" button
      // and the AI's mergeDuplicateCharacters tool to clean up data that
      // pre-dates the dedupe-on-add fix.
      mergeDuplicateCharacters: () => {
        const before = get().characters;
        const groups = new Map<string, Character[]>();
        for (const c of before) {
          const key = (c.name || '').trim().toUpperCase();
          const arr = groups.get(key);
          if (arr) arr.push(c); else groups.set(key, [c]);
        }
        let removed = 0;
        const STR_FIELDS: (keyof Character)[] = [
          'displayName', 'description', 'backstory', 'goals', 'personality',
          'age', 'occupation', 'motivation', 'conflict', 'relationships',
          'notes', 'archetype', 'voiceOf', 'want', 'need', 'fear', 'secret',
          'pronouns', 'imagePrompt',
        ];
        const merged: Character[] = [];
        for (const [, arr] of groups) {
          if (arr.length === 1) { merged.push(arr[0]); continue; }
          // Earliest created becomes the surviving profile.
          const sorted = [...arr].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
          const target = { ...sorted[0] } as Character;
          for (const dup of sorted.slice(1)) {
            for (const f of STR_FIELDS) {
              const cur = (target as any)[f];
              const incoming = (dup as any)[f];
              if ((cur === undefined || cur === null || String(cur).trim() === '') &&
                  typeof incoming === 'string' && incoming.trim() !== '') {
                (target as any)[f] = incoming;
              }
            }
            if (!target.image && dup.image) target.image = dup.image;
            if (!target.voiceAudio && dup.voiceAudio) target.voiceAudio = dup.voiceAudio;
            const tagSet = new Set([...(target.tags || []), ...(dup.tags || [])]);
            target.tags = Array.from(tagSet);
            removed++;
          }
          merged.push(target);
        }
        if (removed > 0) set({ characters: merged });
        return removed;
      },

      // Shots
      addShot: (sceneId) => {
        const id = genId();
        const shot: Shot = {
          id,
          sceneId,
          description: '',
          shotType: '',
          camera: '',
          bRollIds: [],
          order: Object.keys(get().shots).length,
        };
        set((state) => ({
          shots: { ...state.shots, [id]: shot },
          scenes: state.scenes.map((s) =>
            s.id === sceneId ? { ...s, shotIds: [...s.shotIds, id] } : s
          ),
        }));
        return id;
      },
      updateShot: (id, updates) =>
        set((state) => ({
          shots: { ...state.shots, [id]: { ...state.shots[id], ...updates } },
        })),
      deleteShot: (id) =>
        set((state) => {
          const { [id]: _, ...restShots } = state.shots;
          return {
            shots: restShots,
            scenes: state.scenes.map((s) => ({
              ...s,
              shotIds: s.shotIds.filter((sid) => sid !== id),
            })),
          };
        }),

      // B-Rolls
      addBRoll: (shotId) => {
        const id = genId();
        const bRoll: BRoll = {
          id,
          shotId,
          description: '',
        };
        set((state) => ({
          bRolls: { ...state.bRolls, [id]: bRoll },
          shots: {
            ...state.shots,
            [shotId]: {
              ...state.shots[shotId],
              bRollIds: [...state.shots[shotId].bRollIds, id],
            },
          },
        }));
        return id;
      },
      updateBRoll: (id, updates) =>
        set((state) => ({
          bRolls: { ...state.bRolls, [id]: { ...state.bRolls[id], ...updates } },
        })),
      deleteBRoll: (id) =>
        set((state) => {
          const { [id]: _, ...rest } = state.bRolls;
          const shotId = state.bRolls[id]?.shotId;
          return {
            bRolls: rest,
            shots: shotId
              ? {
                  ...state.shots,
                  [shotId]: {
                    ...state.shots[shotId],
                    bRollIds: state.shots[shotId].bRollIds.filter((bid) => bid !== id),
                  },
                }
              : state.shots,
          };
        }),

      // Plot Board
      addAct: () => {
        const id = genId();
        const act: Act = {
          id,
          title: 'NEW ACT',
          beatIds: [],
          order: get().plotBoard.acts.length,
        };
        set((state) => ({
          plotBoard: {
            ...state.plotBoard,
            acts: [...state.plotBoard.acts, act],
          },
        }));
        return id;
      },
      updateAct: (id, updates) =>
        set((state) => ({
          plotBoard: {
            ...state.plotBoard,
            acts: state.plotBoard.acts.map((a) =>
              a.id === id ? { ...a, ...updates } : a
            ),
          },
        })),
      deleteAct: (id) =>
        set((state) => ({
          plotBoard: {
            ...state.plotBoard,
            acts: state.plotBoard.acts.filter((a) => a.id !== id),
          },
        })),
      addBeat: (actId) => {
        const id = genId();
        const beat: Beat = {
          id,
          actId,
          title: '',
          description: '',
          tags: [],
          color: COLORS[Object.keys(get().beats).length % COLORS.length],
        };
        set((state) => ({
          beats: { ...state.beats, [id]: beat },
          plotBoard: {
            ...state.plotBoard,
            acts: state.plotBoard.acts.map((a) =>
              a.id === actId ? { ...a, beatIds: [...a.beatIds, id] } : a
            ),
          },
        }));
        return id;
      },
      updateBeat: (id, updates) =>
        set((state) => ({
          beats: { ...state.beats, [id]: { ...state.beats[id], ...updates } },
        })),
      deleteBeat: (id) =>
        set((state) => {
          const { [id]: _, ...rest } = state.beats;
          return {
            beats: rest,
            plotBoard: {
              ...state.plotBoard,
              acts: state.plotBoard.acts.map((a) => ({
                ...a,
                beatIds: a.beatIds.filter((bid) => bid !== id),
              })),
            },
          };
        }),
      moveBeat: (beatId, fromActId, toActId) =>
        set((state) => ({
          beats: {
            ...state.beats,
            [beatId]: { ...state.beats[beatId], actId: toActId },
          },
          plotBoard: {
            ...state.plotBoard,
            acts: state.plotBoard.acts.map((a) => {
              if (a.id === fromActId) {
                return { ...a, beatIds: a.beatIds.filter((bid) => bid !== beatId) };
              }
              if (a.id === toActId) {
                return { ...a, beatIds: [...a.beatIds, beatId] };
              }
              return a;
            }),
          },
        })),
      reorderShots: (sceneId, shotIds) =>
        set((state) => ({
          scenes: state.scenes.map((s) =>
            s.id === sceneId ? { ...s, shotIds } : s
          ),
        })),
      reorderBeats: (actId, beatIds) =>
        set((state) => ({
          plotBoard: {
            ...state.plotBoard,
            acts: state.plotBoard.acts.map((a) => (a.id === actId ? { ...a, beatIds } : a)),
          },
        })),
      reorderScenes: (sceneIds) =>
        set((state) => {
          const map = new Map(state.scenes.map((s) => [s.id, s]));
          const reordered: Scene[] = [];
          sceneIds.forEach((id, i) => {
            const s = map.get(id);
            if (s) { reordered.push({ ...s, order: i }); map.delete(id); }
          });
          // Append any scenes that weren't in sceneIds (defensive)
          let i = reordered.length;
          for (const s of map.values()) reordered.push({ ...s, order: i++ });
          return { scenes: reordered };
        }),

      // Notes
      addNote: (text, category) =>
        set((state) => ({
          notes: [
            ...state.notes,
            { id: genId(), text, category, createdAt: Date.now() },
          ],
        })),
      deleteNote: (id) =>
        set((state) => ({
          notes: state.notes.filter((n) => n.id !== id),
        })),

      // History
      addHistory: (label, storyId) => {
        const entry: HistoryEntry = {
          id: genId(),
          storyId,
          label,
          timestamp: Date.now(),
          data: JSON.stringify({
            screenplay: get().screenplay,
            scenes: get().scenes,
            shots: get().shots,
            bRolls: get().bRolls,
            characters: get().characters,
            plotBoard: get().plotBoard,
            beats: get().beats,
            notes: get().notes,
          }),
        };
        set((state) => ({
          history: [entry, ...state.history].slice(0, 50),
        }));
      },
      clearHistory: () => set({ history: [] }),

      // Settings
      updateSettings: (settings) =>
        set((state) => ({
          settings: { ...state.settings, ...settings },
        })),
      resetSettings: () => set({ settings: defaultSettings }),

      // UI
      togglePanel: (panel) =>
        set((state) => ({
          rightPanel: state.rightPanel === panel ? null : panel,
        })),
      closePanel: () => set({ rightPanel: null }),
      toggleFocusMode: () =>
        set((state) => ({ isFocusMode: !state.isFocusMode })),
      toggleSidebar: () =>
        set((state) => ({
          settings: { ...state.settings, sidebarCollapsed: !state.settings.sidebarCollapsed },
        })),
      setSidebarCollapsed: (collapsed) =>
        set((state) => ({
          settings: { ...state.settings, sidebarCollapsed: collapsed },
        })),
      focusCharacter: (id) => set({ rightPanel: 'characters', focusCharacterId: id }),

      // Director
      setActiveDirectorScene: (id) => set({ activeDirectorSceneId: id }),

      // Utils
      genId,
      getColor: () => COLORS[get().characters.length % COLORS.length],

      // Export/Import
      exportStory: () => {
        const state = get();
        const exportData = {
          screenplay: state.screenplay,
          scenes: state.scenes,
          shots: state.shots,
          bRolls: state.bRolls,
          characters: state.characters,
          plotBoard: state.plotBoard,
          beats: state.beats,
          notes: state.notes,
          version: '2.0',
          exportedAt: Date.now(),
        };
        return JSON.stringify(exportData, null, 2);
      },
      importStory: (json) => {
        try {
          const data = JSON.parse(json);
          if (!data.screenplay || !data.scenes) return false;
          const n = normalizeStoryData(data);
          set({
            screenplay: n.screenplay,
            scenes: n.scenes,
            shots: n.shots,
            bRolls: n.bRolls,
            characters: n.characters,
            plotBoard: n.plotBoard,
            beats: n.beats,
            notes: n.notes,
          });
          return true;
        } catch {
          return false;
        }
      },

      importSharedStory: (cloudId, title, json) => {
        try {
          const data = JSON.parse(json);
          if (!data.screenplay || !data.scenes) return false;
          set((state) => {
            // Upsert the local Story entry under the cloud id so both sides
            // of the share use the same key.
            const exists = state.stories.some((s) => s.id === cloudId);
            const newStories: Story[] = exists
              ? state.stories.map((s) =>
                  s.id === cloudId
                    ? { ...s, title: title || s.title, updatedAt: Date.now() }
                    : s,
                )
              : [
                  ...state.stories,
                  {
                    id: cloudId,
                    title: title || 'Untitled',
                    type: (data.screenplay?.type as Story['type']) || 'movie',
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                  },
                ];
            const n = normalizeStoryData(data);
            return {
              stories: newStories,
              activeStoryId: cloudId,
              screenplay: n.screenplay,
              scenes: n.scenes,
              shots: n.shots,
              bRolls: n.bRolls,
              characters: n.characters,
              plotBoard: n.plotBoard,
              beats: n.beats,
              notes: n.notes,
            };
          });
          return true;
        } catch {
          return false;
        }
      },
    }),
    {
      name: 'kindling-storage',
      partialize: (state) => ({
        stories: state.stories,
        activeStoryId: state.activeStoryId,
        projects: state.projects,
        activeProjectId: state.activeProjectId,
        settings: state.settings,
        workspaceLinks: state.workspaceLinks,
        coworkers: state.coworkers,
      }),
    }
  )
);

function resetStoryData(): Partial<AppState> {
  return {
    screenplay: defaultState.screenplay,
    scenes: defaultState.scenes,
    shots: defaultState.shots,
    bRolls: defaultState.bRolls,
    characters: defaultState.characters,
    plotBoard: defaultState.plotBoard,
    beats: defaultState.beats,
    notes: defaultState.notes,
    history: defaultState.history,
  };
}

export { genId, COLORS };
