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
  audioNote?: string;   // optional audio cue (sfx / music / ambience)
  audioFile?: string | null; // optional audio data URL
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

export interface Beat {
  id: string;
  actId: string;
  title: string;
  description: string;
  tags: string[];
  color: string;
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
  aiProvider: 'anthropic' | 'openai' | 'custom';
  aiApiKey: string;
  aiModel: string;
  aiEndpoint: string;
  userDisplayName: string;
  userRole: 'admin' | 'writer' | 'director' | 'viewer';
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
}

export type AppTab = 'writer' | 'director' | 'plot' | 'workspace';

export type RightPanelType =
  | 'notes'
  | 'history'
  | 'settings'
  | 'characters'
  | 'instructions'
  | 'collab'
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
