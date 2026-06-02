import { useAppStore } from '@/store/useAppStore';
import type { ScreenplayElement } from '@/types';

/**
 * agentTools — the action vocabulary the AI co-worker can use to actually
 * MAKE CHANGES in the app. Each tool function:
 *   1. Validates its args.
 *   2. Mutates the store (or dispatches a UI event).
 *   3. Returns a small structured `result` the agent can read.
 *   4. Emits an `agent:step` DOM event so the live-action panel can
 *      show what's happening as it happens.
 *
 * The vocabulary is intentionally small + obvious — one verb per action.
 * If the AI tries to call something not in TOOLS it'll get a friendly
 * "no such tool" back and can correct itself.
 */

export interface AgentEvent {
  ts: number;
  tool: string;
  args: any;
  result?: any;
  ok: boolean;
  message?: string;
}

let agentRunning = false;
export function isAgentRunning(): boolean { return agentRunning; }
export function setAgentRunning(v: boolean): void { agentRunning = v; }

function emit(ev: AgentEvent) {
  document.dispatchEvent(new CustomEvent('agent:step', { detail: ev }));
}

function id(): string {
  return `el_${Date.now()}_${Math.floor(Math.random() * 99999)}`;
}

/** Find a scene by name (case-insensitive substring match) or by id. */
function findScene(query: string): { id: string; name: string } | null {
  const scenes = useAppStore.getState().scenes;
  const q = (query || '').trim().toLowerCase();
  if (!q) return null;
  // exact id
  const byId = scenes.find((s) => s.id === query);
  if (byId) return { id: byId.id, name: byId.name };
  // case-insensitive name
  const byName = scenes.find((s) =>
    (s.name || '').toLowerCase() === q || (s.name || '').toLowerCase().includes(q),
  );
  return byName ? { id: byName.id, name: byName.name } : null;
}

function findAct(query: string): { id: string; title: string } | null {
  const acts = useAppStore.getState().plotBoard.acts;
  const q = (query || '').trim().toLowerCase();
  if (!q) return null;
  const byId = acts.find((a) => a.id === query);
  if (byId) return { id: byId.id, title: byId.title };
  const byName = acts.find((a) => (a.title || '').toLowerCase().includes(q));
  return byName ? { id: byName.id, title: byName.title } : null;
}

function dispatchWriterRebuild() {
  document.dispatchEvent(new CustomEvent('writer:rebuild'));
}

/**
 * The tool registry. Each tool returns `{ ok, message, ...extra }`.
 * Async only when it needs to wait on a UI animation.
 */
export const TOOLS: Record<string, (args: any) => Promise<any>> = {
  // ---- Navigation ----
  async navigate({ tab }: { tab: string }) {
    const allowed = ['dashboard', 'writer', 'outline', 'world', 'director', 'plot', 'storyboard', 'calendar', 'locations', 'workspace'];
    if (!allowed.includes(tab)) {
      return { ok: false, message: `Unknown tab "${tab}". Allowed: ${allowed.join(', ')}.` };
    }
    useAppStore.getState().setTab(tab as any);
    return { ok: true, message: `Switched to ${tab}` };
  },

  // ---- Story-level metadata ----
  async setTitle({ text }: { text: string }) {
    useAppStore.getState().updateScreenplayField('title', String(text || ''));
    return { ok: true, message: `Title set` };
  },
  async setLogline({ text }: { text: string }) {
    useAppStore.getState().updateScreenplayField('logline', String(text || ''));
    return { ok: true, message: `Logline set` };
  },
  async setSynopsis({ text }: { text: string }) {
    useAppStore.getState().updateScreenplayField('synopsis', String(text || ''));
    return { ok: true, message: `Synopsis set` };
  },
  async setTheme({ text }: { text: string }) {
    useAppStore.getState().updateScreenplayField('theme' as any, String(text || ''));
    return { ok: true, message: `Theme set` };
  },
  async addOutlinePoint({ text }: { text: string }) {
    const screenplay = useAppStore.getState().screenplay as any;
    const current: string[] = Array.isArray(screenplay.outlinePoints) ? screenplay.outlinePoints : [];
    useAppStore.getState().updateScreenplayField('outlinePoints' as any, [...current, String(text || '')]);
    return { ok: true, message: `Added outline point` };
  },

  // ---- Writer content — each appends a screenplay element ----
  async addSceneHeading({ text }: { text: string }) {
    const t = String(text || '').toUpperCase();
    const el: ScreenplayElement = { id: id(), type: 'scene-heading', content: t, sceneId: null };
    useAppStore.getState().addElement(el);
    dispatchWriterRebuild();
    return { ok: true, message: `Inserted scene heading "${t}"` };
  },
  async addAction({ text }: { text: string }) {
    const el: ScreenplayElement = { id: id(), type: 'action', content: String(text || ''), sceneId: null };
    useAppStore.getState().addElement(el);
    dispatchWriterRebuild();
    return { ok: true, message: `Inserted action` };
  },
  async addCharacterCue({ name }: { name: string }) {
    const t = String(name || '').toUpperCase();
    const el: ScreenplayElement = { id: id(), type: 'character', content: t, sceneId: null };
    useAppStore.getState().addElement(el);
    dispatchWriterRebuild();
    return { ok: true, message: `Inserted character cue ${t}` };
  },
  async addParenthetical({ text }: { text: string }) {
    let t = String(text || '').trim();
    if (!t.startsWith('(')) t = `(${t}`;
    if (!t.endsWith(')')) t = `${t})`;
    const el: ScreenplayElement = { id: id(), type: 'parenthetical', content: t, sceneId: null };
    useAppStore.getState().addElement(el);
    dispatchWriterRebuild();
    return { ok: true, message: `Inserted parenthetical` };
  },
  async addDialogue({ text }: { text: string }) {
    const el: ScreenplayElement = { id: id(), type: 'dialogue', content: String(text || ''), sceneId: null };
    useAppStore.getState().addElement(el);
    dispatchWriterRebuild();
    return { ok: true, message: `Inserted dialogue` };
  },
  async addTransition({ text }: { text: string }) {
    const t = String(text || 'CUT TO:').toUpperCase();
    const el: ScreenplayElement = { id: id(), type: 'transition', content: t, sceneId: null };
    useAppStore.getState().addElement(el);
    dispatchWriterRebuild();
    return { ok: true, message: `Inserted transition ${t}` };
  },
  /** One-shot writer block — accepts a multi-line plain Fountain-ish text. */
  async writeScreenplay({ text }: { text: string }) {
    const lines = String(text || '').split(/\r?\n/);
    const newEls: ScreenplayElement[] = [];
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) continue;
      let type: ScreenplayElement['type'] = 'action';
      if (/^(INT|EXT|INT\/EXT|I\/E)\.?\s+/i.test(line)) type = 'scene-heading';
      else if (/^[A-Z][A-Z0-9 .'-]{1,40}$/.test(line) && line.length < 30 && !/[.!?]$/.test(line)) type = 'character';
      else if (/^\(.+\)$/.test(line)) type = 'parenthetical';
      else if (/(FADE OUT|CUT TO:|SMASH CUT:|DISSOLVE TO:|FADE TO:|FADE IN:)/i.test(line)) type = 'transition';
      // dialogue heuristic: previous line was a character cue or parenthetical
      else if (newEls.length > 0 && (newEls[newEls.length - 1].type === 'character' || newEls[newEls.length - 1].type === 'parenthetical')) {
        type = 'dialogue';
      }
      const t = type === 'scene-heading' || type === 'character' || type === 'transition'
        ? line.toUpperCase()
        : line;
      newEls.push({ id: id(), type, content: t, sceneId: null });
    }
    if (newEls.length === 0) return { ok: false, message: 'No content provided' };
    const state = useAppStore.getState();
    const merged = [...(state.screenplay.elements || []), ...newEls];
    state.updateScreenplayField('elements', merged);
    dispatchWriterRebuild();
    return { ok: true, message: `Wrote ${newEls.length} screenplay line${newEls.length === 1 ? '' : 's'}` };
  },

  // ---- Characters ----
  async createCharacter({ name, description, archetype, want, fear }: { name: string; description?: string; archetype?: string; want?: string; fear?: string }) {
    if (!name) return { ok: false, message: 'name required' };
    const newId = useAppStore.getState().addCharacter({
      name: String(name).toUpperCase(),
      displayName: String(name),
      description: description || '',
      archetype: archetype || '',
      want: want || '',
      fear: fear || '',
    } as any);
    return { ok: true, message: `Created character ${name}`, id: newId };
  },

  // ---- Director: scenes + shots ----
  async createScene({ name, description }: { name: string; description?: string }) {
    if (!name) return { ok: false, message: 'name required' };
    const newId = useAppStore.getState().addScene(name, '');
    if (description) {
      useAppStore.getState().updateScene(newId, { description });
    }
    useAppStore.getState().setActiveDirectorScene(newId);
    return { ok: true, message: `Created scene "${name}"`, id: newId };
  },
  async updateSceneDescription({ scene, description }: { scene: string; description: string }) {
    const s = findScene(scene);
    if (!s) return { ok: false, message: `Scene "${scene}" not found` };
    useAppStore.getState().updateScene(s.id, { description: String(description || '') });
    return { ok: true, message: `Updated description for ${s.name}` };
  },
  async addShot({ scene, description, shotType, camera }: { scene: string; description?: string; shotType?: string; camera?: string }) {
    const s = findScene(scene);
    if (!s) return { ok: false, message: `Scene "${scene}" not found. Create it first with createScene.` };
    const shotId = useAppStore.getState().addShot(s.id);
    useAppStore.getState().updateShot(shotId, {
      description: description || '',
      shotType: (shotType as any) || '',
      camera: camera || '',
    });
    return { ok: true, message: `Added shot to ${s.name}`, id: shotId };
  },

  // ---- Plot: acts + beats ----
  async createAct({ title }: { title?: string }) {
    const actId = useAppStore.getState().addAct();
    if (title) useAppStore.getState().updateAct(actId, { title: String(title).toUpperCase() });
    return { ok: true, message: `Created act "${title || 'NEW ACT'}"`, id: actId };
  },
  async addBeat({ act, title, description }: { act: string; title?: string; description?: string }) {
    const a = findAct(act);
    if (!a) return { ok: false, message: `Act "${act}" not found. Create it first with createAct.` };
    const beatId = useAppStore.getState().addBeat(a.id);
    useAppStore.getState().updateBeat(beatId, {
      title: title || '',
      description: description || '',
    });
    return { ok: true, message: `Added beat "${title || 'Untitled'}" to ${a.title}`, id: beatId };
  },

  // ---- World items ----
  async addWorldItem({ kind, name, body, tags }: { kind: string; name: string; body?: string; tags?: string[] }) {
    const allowedKinds = ['location', 'lore', 'rule', 'faction', 'item', 'term'];
    if (!allowedKinds.includes(kind)) return { ok: false, message: `Unknown world kind "${kind}". Allowed: ${allowedKinds.join(', ')}.` };
    if (!name) return { ok: false, message: 'name required' };
    const state = useAppStore.getState();
    const existing = Array.isArray((state.screenplay as any).world) ? (state.screenplay as any).world : [];
    const item = {
      id: `w_${Date.now()}_${Math.floor(Math.random() * 9999)}`,
      kind,
      name,
      body: body || '',
      tags: Array.isArray(tags) ? tags : [],
    };
    state.updateScreenplayField('world' as any, [item, ...existing]);
    return { ok: true, message: `Added world ${kind}: ${name}`, id: item.id };
  },

  // ---- Locations (production scouting) ----
  async addLocation({ name, address, intExt, timeOfDay, cost, notes }: { name: string; address?: string; intExt?: string; timeOfDay?: string; cost?: string; notes?: string }) {
    if (!name) return { ok: false, message: 'name required' };
    const state = useAppStore.getState();
    const existing = Array.isArray((state.screenplay as any).locations) ? (state.screenplay as any).locations : [];
    const loc = {
      id: `loc_${Date.now()}_${Math.floor(Math.random() * 9999)}`,
      name, address: address || '',
      intExt: (intExt as any) || 'int',
      timeOfDay: (timeOfDay as any) || 'day',
      notes: notes || '',
      permitStatus: 'unknown',
      cost: cost || '',
      photos: [],
      linkedSceneIds: [],
    };
    state.updateScreenplayField('locations' as any, [loc, ...existing]);
    return { ok: true, message: `Added location ${name}`, id: loc.id };
  },

  // ---- Meta ----
  async think({ text }: { text: string }) {
    return { ok: true, message: String(text || '') };
  },
  async done({ summary }: { summary?: string }) {
    return { ok: true, message: String(summary || 'Done'), done: true };
  },
};

/** Execute a single tool call. Returns the result + emits an agent:step event. */
export async function runTool(tool: string, args: any): Promise<AgentEvent> {
  const ts = Date.now();
  const fn = TOOLS[tool];
  if (!fn) {
    const ev: AgentEvent = { ts, tool, args, ok: false, message: `Unknown tool "${tool}"` };
    emit(ev);
    return ev;
  }
  try {
    const result = await fn(args || {});
    const ev: AgentEvent = {
      ts, tool, args,
      ok: !!result?.ok,
      message: result?.message,
      result,
    };
    emit(ev);
    return ev;
  } catch (e: any) {
    const ev: AgentEvent = { ts, tool, args, ok: false, message: e?.message || 'Tool threw' };
    emit(ev);
    return ev;
  }
}

/** Return a compact, JSON-friendly summary of current app state so the
 *  agent can decide whether it's done. */
export function snapshotState() {
  const s = useAppStore.getState();
  const sp = s.screenplay as any;
  return {
    activeTab: s.activeTab,
    title: sp.title || '',
    logline: sp.logline || '',
    synopsis: (sp.synopsis || '').slice(0, 200),
    theme: sp.theme || '',
    outlinePointCount: Array.isArray(sp.outlinePoints) ? sp.outlinePoints.length : 0,
    screenplayLineCount: (sp.elements || []).length,
    sceneCount: s.scenes.length,
    sceneNames: s.scenes.map((sc) => sc.name).slice(0, 20),
    shotCount: Object.keys(s.shots).length,
    characterCount: s.characters.length,
    characterNames: s.characters.map((c) => c.name).slice(0, 20),
    actCount: s.plotBoard.acts.length,
    actTitles: s.plotBoard.acts.map((a) => a.title),
    beatCount: Object.keys(s.beats).length,
    worldItemCount: Array.isArray(sp.world) ? sp.world.length : 0,
    locationCount: Array.isArray(sp.locations) ? sp.locations.length : 0,
  };
}

/** Get a Markdown description of every tool, for the system prompt. */
export function toolsManual(): string {
  return [
    '## Available tools',
    '',
    'You call tools by emitting a JSON object with a top-level "actions" array.',
    'Each action is `{ "tool": "name", "args": { ... } }`.',
    '',
    '### Navigation',
    '- `navigate(tab)` — tab is one of: dashboard, writer, outline, world, director, plot, storyboard, calendar, locations, workspace. Use BEFORE any writing/editing action so the user can SEE what you are doing.',
    '',
    '### Story metadata',
    '- `setTitle(text)`',
    '- `setLogline(text)` — one sentence',
    '- `setSynopsis(text)` — 1–2 paragraphs',
    '- `setTheme(text)`',
    '- `addOutlinePoint(text)` — one beat per call',
    '',
    '### Writer (screenplay editor)',
    '- `addSceneHeading(text)` — e.g. "INT. WAREHOUSE - NIGHT"',
    '- `addAction(text)` — visual description / stage direction',
    '- `addCharacterCue(name)` — UPPERCASE',
    '- `addParenthetical(text)` — adverb / micro-direction',
    '- `addDialogue(text)`',
    '- `addTransition(text)` — e.g. "CUT TO:" or "FADE OUT."',
    '- `writeScreenplay(text)` — paste a whole Fountain-ish block at once. The parser figures out which lines are headings/dialogue/etc. Use this for "write me a scene".',
    '',
    '### Characters',
    '- `createCharacter(name, description, archetype, want, fear)`',
    '',
    '### Director',
    '- `createScene(name, description)` — also sets it active',
    '- `updateSceneDescription(scene, description)` — scene is name or id',
    '- `addShot(scene, description, shotType, camera)` — shotType: WIDE / MEDIUM / CLOSE-UP / EXTREME CLOSE-UP / OVER-THE-SHOULDER / POV / ESTABLISHING / INSERT / AERIAL',
    '',
    '### Plot',
    '- `createAct(title)`',
    '- `addBeat(act, title, description)` — act is name or id',
    '',
    '### World',
    '- `addWorldItem(kind, name, body, tags)` — kind ∈ location, lore, rule, faction, item, term',
    '',
    '### Locations (production scouting)',
    '- `addLocation(name, address, intExt, timeOfDay, cost, notes)` — intExt: int/ext/both, timeOfDay: day/night/both',
    '',
    '### Meta',
    '- `think(text)` — say what you are about to do, shows in the live log',
    '- `done(summary)` — emit this LAST when the user\'s request is complete',
    '',
  ].join('\n');
}
