export interface Character {
  id: string;
  name: string;
  displayName: string;
  description: string;
  color: string;
  image: string | null;
  // Rich profile fields
  backstory: string;
  goals: string;
  personality: string;
  age: string;
  occupation: string;
  motivation: string;
  conflict: string;
  relationships: string;
  notes: string;
  voiceAudio: string | null;
  tags: string[];
  createdAt: number;
  // Extended profile (all optional so old data still loads)
  archetype?: string;        // e.g. "The Mentor", "The Trickster"
  voiceOf?: string;          // distinctive speech style / dialect
  want?: string;             // what they consciously want
  need?: string;             // what they actually need
  fear?: string;             // deepest fear / wound
  secret?: string;           // hidden truth
  pronouns?: string;
}

export interface ScreenplayElement {
  id: string;
  type: 'scene-heading' | 'action' | 'character' | 'parenthetical' | 'dialogue' | 'transition';
  content: string;
  sceneId: string | null;
  sectionId?: string | null;
}

export type SceneStatus = 'todo' | 'in-progress' | 'shot' | 'final';

export interface Scene {
  id: string;
  name: string;
  heading: string;
  content: string;
  description: string;
  color: string;
  status: SceneStatus;
  shotIds: string[];
  order: number;
  /** ISO YYYY-MM-DD shoot date (optional) */
  shootDate?: string;
  /** Per-category budget. Currency is whatever the user picks in Settings. */
  budget?: {
    cast?: number;
    crew?: number;
    location?: number;
    props?: number;
    post?: number;
  };
  /** ISO timestamp the scene was last touched (for revision marks) */
  lastEditedAt?: number;
  /** Revision color tag — "blue" / "pink" / "yellow" / etc. */
  revisionColor?: string;
}

export type ShotType =
  | 'WIDE'
  | 'MEDIUM'
  | 'CLOSE-UP'
  | 'EXTREME CLOSE-UP'
  | 'OVER-THE-SHOULDER'
  | 'POV'
  | 'ESTABLISHING'
  | 'INSERT'
  | 'AERIAL';

export interface Shot {
  id: string;
  sceneId: string;
  description: string;
  shotType: ShotType | '';
  camera: string;
  bRollIds: string[];
  order: number;
  audioNote?: string;        // optional audio cue (sfx / music / ambience)
  audioFile?: string | null; // optional audio data URL
  storyboard?: string | null; // storyboard image as data URL
  durationSec?: number;       // shot duration in seconds
  lens?: string;              // lens metadata, e.g. "35mm", "85mm anamorphic"
}

export interface BRoll {
  id: string;
  shotId: string;
  description: string;
}

export interface Act {
  id: string;
  title: string;
  beatIds: string[];
  order: number;
}

export type BeatType =
  | 'setup'
  | 'hook'
  | 'inciting'
  | 'turn'
  | 'twist'
  | 'midpoint'
  | 'crisis'
  | 'climax'
  | 'payoff'
  | 'tag'
  | 'other';

export interface Beat {
  id: string;
  actId: string;
  title: string;
  description: string;
  tags: string[];
  color: string;
  beatType?: BeatType;
  /** numerical order inside its act (lower first). New beats default to end. */
  order?: number;
}

export interface Note {
  id: string;
  text: string;
  category: 'general' | 'plot' | 'character';
  createdAt: number;
}

export interface HistoryEntry {
  id: string;
  storyId: string;
  label: string;
  timestamp: number;
  data: string; // compressed/serialized app state
}

// "Section" is the Writer-side counterpart to a Director Scene:
// a named block of the screenplay (Cold Opening, Establishment,
// Experiment Activation, Escalation, World Impact, Containment
// Failure, Incident Close, etc.). Custom names supported.
export interface Section {
  id: string;
  name: string;
  color: string;
  order: number;
  description?: string;
}

export type StoryType =
  | 'movie'
  | 'tv-series'
  | 'tv-show'
  | 'mini-series'
  | 'thriller'
  | 'documentary'
  | 'short-film'
  | 'music-video'
  | 'commercial'
  | 'youtube'
  | 'web-series'
  | 'stage-play'
  | 'animation';

export interface Story {
  id: string;
  title: string;
  type?: StoryType;
  createdAt: number;
  updatedAt: number;
}

export interface CoworkerInfo {
  id: string;
  name: string;
  email?: string;
  avatar?: string | null;
  role: 'admin' | 'writer' | 'director' | 'viewer';
  status: 'online' | 'offline' | 'typing' | 'away';
  lastSeen?: number;
  currentSection?: string | null; // which app section they are in
  socialAllowed?: boolean;        // whether admin lets them use social bar
  accessStatus?: 'allowed' | 'blocked'; // access control
}

export interface AccessRequest {
  id: string;
  storyId: string;
  roomId: string;
  requesterId: string;
  requesterName: string;
  requesterEmail?: string;
  adminId: string;
  status: 'pending' | 'approved' | 'denied';
  createdAt: number;
  respondedAt?: number;
}

export interface ChatMessage {
  id: string;
  authorId: string;
  authorName: string;
  text: string;
  timestamp: number;
  attachments?: {
    kind: 'image' | 'audio' | 'file' | 'link';
    url: string;
    name?: string;
  }[];
}

export interface WorkspaceLink {
  id: string;
  category: 'video' | 'audio' | 'voice' | 'ai-video' | 'custom';
  label: string;
  url: string;
  icon?: string;
  notes?: string;
}

export interface AppSettings {
  theme: 'dark' | 'light' | 'custom';
  primaryColor: string;
  accentColor: string;
  bgColor: string;
  sidebarColor: string;
  panelColor: string;
  textColor: string;
  textSecondaryColor: string;
  borderColor: string;
  fontSize: number;
  lineHeight: number;
  fontFamily: string;
  autoSave: boolean;
  autoSaveInterval: number;
  cloudSync: boolean;
  userId: string | null;
  sidebarCollapsed: boolean;

  // New
  defaultSaveFolder: string | null;       // user-friendly name (handle stored in IDB)
  socialBarEnabled: boolean;
  aiProvider: 'anthropic' | 'openai' | 'openrouter' | 'groq' | 'ollama' | 'custom';
  aiApiKey: string;
  aiModel: string;
  aiEndpoint: string;
  userDisplayName: string;
  userRole: 'admin' | 'writer' | 'director' | 'viewer';

  // Optional cloud-storage provider tokens. All optional so existing
  // saved settings stay valid; each provider stores its own token here.
  githubGistToken?: string;
  githubGistId?: string;       // last pushed gist
  dropboxToken?: string;
  googleDriveClientId?: string;
  webdavUrl?: string;
  webdavAuth?: string;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  jsonbinKey?: string;
  jsonbinId?: string;          // last pushed bin
  pastebinKey?: string;
  /** ISO timestamp of last successful cloud sync */
  lastCloudSyncAt?: string;
  /** When true, pull from the first configured cloud provider every 15s and
   *  treat changes as collab updates. Push on every save. */
  liveSync?: boolean;
  /** Preferred UI language (i18n) */
  locale?: 'en' | 'es' | 'fr';
  /** Currency code (ISO 4217) used to format budget amounts. */
  currency?: 'USD' | 'EUR' | 'GBP' | 'CAD' | 'AUD' | 'JPY' | 'INR' | 'NGN' | 'ZAR';
  /** Show the thin dialogue-density gutter beside the writer paper.
   *  Defaults to true; writers can hide it from Settings. */
  showGutter?: boolean;
  /** Show the compact scene heat strip above the writer paper.
   *  Defaults to true. */
  showHeatStrip?: boolean;
  /** Brand accent — one of four palettes. Drives both the solid --accent
   *  variable and the --accent-pair variable used in the 4 sanctioned
   *  gradients. */
  accent?: 'indigo' | 'salmon' | 'forest' | 'violet';
}

export type AssetKind = 'image' | 'audio' | 'reference';

export interface Asset {
  id: string;
  name: string;
  kind: AssetKind;
  /** data: URL — kept inline so it travels with story exports. */
  data: string;
  size: number;          // bytes (approximate)
  addedAt: number;
  /** Optional caption / source URL / notes the user attaches. */
  note?: string;
}

export interface Screenplay {
  title: string;
  author: string;
  contact: string;
  logline: string;
  synopsis: string;
  instructions: string;
  started: boolean;
  elements: ScreenplayElement[];
  sections?: Section[];          // optional list of writer sections
  activeSectionId?: string | null;
  assets?: Asset[];              // per-story asset library
  /** Industry revision-color stage. Index into REVISION_COLORS. */
  revisionStage?: number;
}

/**
 * Standard production color-revision order. White is the production draft;
 * each subsequent color marks a new revision pass.
 */
export const REVISION_COLORS: { name: string; hex: string; textHex: string }[] = [
  { name: 'White',     hex: '#ffffff', textHex: '#222222' },
  { name: 'Blue',      hex: '#bfdbfe', textHex: '#1e3a8a' },
  { name: 'Pink',      hex: '#fbcfe8', textHex: '#9d174d' },
  { name: 'Yellow',    hex: '#fef08a', textHex: '#854d0e' },
  { name: 'Green',     hex: '#bbf7d0', textHex: '#14532d' },
  { name: 'Goldenrod', hex: '#fde68a', textHex: '#78350f' },
  { name: 'Buff',      hex: '#fde4cf', textHex: '#9a3412' },
  { name: 'Salmon',    hex: '#fecaca', textHex: '#991b1b' },
  { name: 'Cherry',    hex: '#fda4af', textHex: '#9f1239' },
  { name: 'Second White', hex: '#f8fafc', textHex: '#222222' },
];

export type AppTab = 'dashboard' | 'writer' | 'director' | 'plot' | 'workspace' | 'calendar';

export type RightPanelType =
  | 'notes'
  | 'history'
  | 'settings'
  | 'characters'
  | 'instructions'
  | 'collab'
  | 'assets'
  | 'ai'
  | 'export'
  | null;

export interface AppState {
  activeStoryId: string | null;
  stories: Story[];
  activeTab: AppTab;
  activeSceneId: string | null;
  activeDirectorSceneId: string | null;
  screenplay: Screenplay;
  scenes: Scene[];
  shots: Record<string, Shot>;
  bRolls: Record<string, BRoll>;
  characters: Character[];
  plotBoard: {
    acts: Act[];
  };
  beats: Record<string, Beat>;
  notes: Note[];
  history: HistoryEntry[];
  settings: AppSettings;
  rightPanel: RightPanelType;
  isFocusMode: boolean;
  focusCharacterId: string | null;

  // Collaboration & workspace
  coworkers: CoworkerInfo[];
  chat: ChatMessage[];
  workspaceLinks: WorkspaceLink[];
}
