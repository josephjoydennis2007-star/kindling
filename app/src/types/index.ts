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
  imagePrompt?: string;      // appearance prompt for AI image gen (face, body, side view)
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
  /** Production breakdown — tagged elements needed to shoot this scene. */
  breakdown?: SceneBreakdown;
}

/** Standard 1st-AD script-breakdown categories. Each is a list of item names
 *  needed to shoot a given scene (cast, props, wardrobe, SFX, vehicles, …). */
export interface SceneBreakdown {
  cast?: string[];
  extras?: string[];
  props?: string[];
  wardrobe?: string[];
  makeup?: string[];
  vehicles?: string[];
  animals?: string[];
  sfx?: string[];          // special / visual effects
  sound?: string[];
  setDressing?: string[];
  notes?: string;
}

/** The ordered, labelled breakdown categories (drives the UI + export). */
export const BREAKDOWN_CATEGORIES: { key: keyof SceneBreakdown; label: string; color: string }[] = [
  { key: 'cast',        label: 'Cast',         color: '#ef4444' },
  { key: 'extras',      label: 'Background',   color: '#f59e0b' },
  { key: 'props',       label: 'Props',        color: '#8b5cf6' },
  { key: 'wardrobe',    label: 'Wardrobe',     color: '#ec4899' },
  { key: 'makeup',      label: 'Hair / Makeup',color: '#14b8a6' },
  { key: 'vehicles',    label: 'Vehicles',     color: '#3b82f6' },
  { key: 'animals',     label: 'Animals',      color: '#84cc16' },
  { key: 'sfx',         label: 'SFX / VFX',    color: '#06b6d4' },
  { key: 'sound',       label: 'Sound',        color: '#a855f7' },
  { key: 'setDressing', label: 'Set Dressing', color: '#f97316' },
];

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
  storyboard?: string | null; // FIRST frame — storyboard image as data URL or remote URL
  /** Optional LAST frame — the end state of the shot, used to drive Runway
   *  first→last-frame video generation. Same format as `storyboard`. */
  lastFrame?: string | null;
  /** When true, this shot is intended to be a first→last-frame transition
   *  (e.g. a move or transformation). The UI then surfaces the "last frame"
   *  slot prominently and Claude knows to generate/attach a second frame. */
  needsLastFrame?: boolean;
  /** Optional description of what the LAST frame should look like — the
   *  end-state prompt for image generation (the shot's `description` is the
   *  first-frame prompt). */
  lastFrameDescription?: string;
  /** The generated VIDEO for this shot (a hosted URL — e.g. a Runway result).
   *  When set, the storyboard shows the video in place of the frame image, with
   *  the first/last frames as small thumbnails over it. */
  video?: string | null;
  durationSec?: number;       // shot duration in seconds
  lens?: string;              // lens metadata, e.g. "35mm", "85mm anamorphic"
}

export interface BRoll {
  id: string;
  shotId: string;
  description: string;
  /** Optional frame image (data URL or remote URL) for this b-roll — shown +
   *  click-to-view in the shot it belongs to, just like a shot's storyboard. */
  frame?: string | null;
  /** Optional video (hosted URL) for this b-roll — plays in the storyboard and
   *  flows into the Export Reel alongside the shot videos. */
  video?: string | null;
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
  /** The project this story belongs to (optional — loose stories have none). */
  projectId?: string;
  /** Where this story's cloud copy lives. 'github' once it overflowed Firebase's
   *  1MB doc limit and was saved to a private GitHub gist instead. */
  storedOn?: 'firebase' | 'github';
  /** The gist id holding this story when storedOn === 'github'. */
  githubGistId?: string;
}

/** A piece of reference material attached to a Project — pasted text or the
 *  text content of a dropped .txt/.md file. The AI reads these as knowledge. */
export interface ProjectKnowledge {
  id: string;
  name: string;
  content: string;
  addedAt: number;
}

/** A Project groups many stories under one creative brief — like a Claude
 *  Project. Its `about` (master prompt), `instructions`, and `knowledge` tell
 *  the AI what every story in the project should be and how to build it. */
export interface Project {
  id: string;
  name: string;
  /** Master prompt: what this project's stories are about + the format/tone. */
  about: string;
  /** Extra standing instructions for the AI when building stories here. */
  instructions: string;
  /** Default story type for new stories in this project. */
  defaultType?: StoryType;
  knowledge: ProjectKnowledge[];
  createdAt: number;
  updatedAt: number;
}

export interface CoworkerInfo {
  id: string;
  name: string;
  email?: string;
  avatar?: string | null;
  // Includes producer + both (the four role system introduced in v12+).
  // admin / viewer kept for backward compat with old local data.
  role: 'admin' | 'writer' | 'director' | 'producer' | 'both' | 'viewer';
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
  // 'builtin'  = Pollinations.ai (no key, but unreliable + can return HTML
  //              errors when their upstream is sad).
  // 'gemini'   = Google AI Studio (free key, 1500 req/day, GPT-4o-mini-class
  //              quality, no credit card needed). Recommended default for
  //              anyone who hits a Pollinations 524 — see PROVIDER_HELP.
  // Other providers are paid or self-hosted.
  aiProvider: 'builtin' | 'gemini' | 'anthropic' | 'openai' | 'openrouter' | 'groq' | 'deepseek' | 'nvidia' | 'ollama' | 'custom';
  aiApiKey: string;
  aiModel: string;
  aiEndpoint: string;
  // ---- Runway integration ----
  // Optional API key for runwayml.com. When set, the agent unlocks two
  // tools: generateShotImage (text -> still frame for a shot's storyboard
  // slot) and generateShotVideo (text + still -> motion clip). Empty
  // string = integration disabled.
  runwayApiKey?: string;
  // Model selection: gen4_image / gen4_turbo (video) / gen3a_turbo etc.
  runwayImageModel?: string;
  runwayVideoModel?: string;
  /**
   * URL of a CORS-enabled proxy in front of api.dev.runwayml.com.
   * Runway's Developer API does not currently send Access-Control-Allow-
   * Origin headers, so browsers block direct calls. The user deploys a
   * 5-line Cloudflare Worker (template in /docs/runway-cors-proxy.js)
   * and pastes its public URL here. When set, runwayClient routes every
   * request through this proxy instead of hitting Runway directly.
   * Empty = direct (works only from server-side test tools).
   */
  runwayProxyUrl?: string;
  userDisplayName: string;
  // Mirrors the profile-level role choice (writer/director/producer/both).
  // admin / viewer kept for backward compat with older local-storage shapes.
  userRole: 'admin' | 'writer' | 'director' | 'producer' | 'both' | 'viewer';

  // Optional cloud-storage provider tokens. All optional so existing
  // saved settings stay valid; each provider stores its own token here.
  githubGistToken?: string;
  githubGistId?: string;       // last pushed gist
  /** Google OAuth Client ID (public, no secret) for YouTube publishing. */
  googleClientId?: string;
  // ── Free media hosting (images + video) so uploads don't bloat RAM/disk ──
  cloudinaryCloudName?: string;     // Cloudinary cloud name (free, no card)
  cloudinaryUploadPreset?: string;  // an UNSIGNED upload preset
  githubMediaRepo?: string;         // "owner/repo" — a PUBLIC repo for media
  githubMediaToken?: string;        // token w/ public_repo scope (falls back to gist token)
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
  /** YouTube creator packaging — lives alongside the screenplay so it travels
   *  with the story. Used only by the YouTube Studio page. */
  youtube?: YouTubePack;
}

/** Everything a YouTuber needs to package a video — separate from the
 *  industry film-making fields. Edited in the YouTube Studio page. */
export interface YouTubePack {
  format?: 'short' | 'long';       // vertical Short vs long-form video
  idea?: string;                   // the topic/prompt the video is built from
  title?: string;                  // chosen title
  altTitles?: string;              // alternative title options (free text)
  thumbnailText?: string;          // 3-5 word overlay text
  thumbnail?: string | null;       // thumbnail image (hosted URL)
  hook?: string;                   // first 3 seconds
  script?: string;                 // the spoken script (not screenplay format)
  description?: string;            // SEO description
  tags?: string;                   // comma-separated tags
  hashtags?: string;               // hashtags
  chapters?: string;               // timestamped chapters
  cta?: string;                    // call to action
  /** Hosted voiceover audio (WAV/MP3 URL — e.g. Gemini TTS → Cloudinary). */
  voiceoverUrl?: string | null;
  /** Hosted background-music URL (from the music corner / paste-back). */
  musicUrl?: string | null;
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

// Writer-section views: writer, outline, world, research
// Director-section views: director, plot, storyboard, schedule (calendar), locations
// General views: dashboard, workspace
export type AppTab =
  | 'dashboard'
  // Writer workspaces
  | 'writer' | 'outline' | 'world' | 'research'
  // Director workspaces
  | 'director' | 'plot' | 'storyboard' | 'calendar' | 'locations'
  // YouTube creator workspace (separate from industry film-making)
  | 'youtube'
  // General
  | 'workspace';

export type RightPanelType =
  | 'notes'
  | 'history'
  | 'settings'
  | 'characters'
  | 'instructions'
  | 'collab'
  | 'comments'
  | 'assets'
  | 'ai'
  | 'export'
  | null;

export interface AppState {
  activeStoryId: string | null;
  stories: Story[];
  projects: Project[];
  activeProjectId: string | null;
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
