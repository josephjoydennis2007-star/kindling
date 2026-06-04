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

  // ---- Characters (FULL field access) ----
  async createCharacter(p: {
    name: string; description?: string; archetype?: string; want?: string; need?: string;
    fear?: string; secret?: string; pronouns?: string; age?: string; occupation?: string;
    voiceOf?: string; personality?: string; backstory?: string; goals?: string;
    motivation?: string; conflict?: string; relationships?: string; notes?: string;
  }) {
    if (!p.name) return { ok: false, message: 'name required' };
    const newId = useAppStore.getState().addCharacter({
      name: String(p.name).toUpperCase(),
      displayName: String(p.name),
      description: p.description || '',
      archetype: p.archetype || '',
      want: p.want || '',
      need: p.need || '',
      fear: p.fear || '',
      secret: p.secret || '',
      pronouns: p.pronouns || '',
      age: p.age || '',
      occupation: p.occupation || '',
      voiceOf: p.voiceOf || '',
      personality: p.personality || '',
      backstory: p.backstory || '',
      goals: p.goals || '',
      motivation: p.motivation || '',
      conflict: p.conflict || '',
      relationships: p.relationships || '',
      notes: p.notes || '',
    } as any);
    return { ok: true, message: `Created character ${p.name}`, id: newId };
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
  async addShot({ scene, description, shotType, camera, lens, durationSec, audioNote }: { scene: string; description?: string; shotType?: string; camera?: string; lens?: string; durationSec?: number; audioNote?: string }) {
    const s = findScene(scene);
    if (!s) return { ok: false, message: `Scene "${scene}" not found. Create it first with createScene.` };
    const shotId = useAppStore.getState().addShot(s.id);
    const updates: any = {
      description: description || '',
      shotType: (shotType as any) || '',
      camera: camera || '',
    };
    if (typeof lens === 'string') updates.lens = lens;
    if (typeof durationSec === 'number') updates.durationSec = durationSec;
    if (typeof audioNote === 'string') updates.audioNote = audioNote;
    useAppStore.getState().updateShot(shotId, updates);
    return { ok: true, message: `Added shot to ${s.name}`, id: shotId };
  },

  // ---- B-roll (supplementary footage per shot) ----
  async addBRoll({ shot, description }: { shot: string; description?: string }) {
    const state = useAppStore.getState();
    const allShots = Object.values(state.shots);
    let target = allShots.find((sh: any) => sh.id === shot);
    if (!target) {
      // Match by scene name → first shot of that scene.
      const sc = state.scenes.find((x) => x.name.toLowerCase().includes(shot.toLowerCase()));
      if (sc) target = allShots.find((sh: any) => sh.sceneId === sc.id);
    }
    if (!target) return { ok: false, message: `Shot "${shot}" not found. Add a shot first.` };
    const brollId = state.addBRoll((target as any).id);
    if (description) state.updateBRoll(brollId, { description });
    return { ok: true, message: `Added b-roll to shot`, id: brollId };
  },
  async updateBRoll({ brollId, description }: { brollId: string; description: string }) {
    useAppStore.getState().updateBRoll(brollId, { description: String(description || '') });
    return { ok: true, message: `Updated b-roll` };
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

  // ---- Editing existing things (full access) ----
  async updateScene({ scene, name, description, status, color, heading }: { scene: string; name?: string; description?: string; status?: string; color?: string; heading?: string }) {
    const s = findScene(scene);
    if (!s) return { ok: false, message: `Scene "${scene}" not found` };
    const updates: any = {};
    if (typeof name === 'string') { updates.name = name; updates.heading = heading ?? name; }
    if (typeof description === 'string') updates.description = description;
    if (typeof status === 'string') updates.status = status;
    if (typeof color === 'string') updates.color = color;
    if (typeof heading === 'string') updates.heading = heading;
    useAppStore.getState().updateScene(s.id, updates);
    return { ok: true, message: `Updated scene ${s.name}` };
  },
  async deleteScene({ scene }: { scene: string }) {
    const s = findScene(scene);
    if (!s) return { ok: false, message: `Scene "${scene}" not found` };
    useAppStore.getState().deleteScene(s.id);
    return { ok: true, message: `Deleted scene ${s.name}` };
  },
  async updateShot({ shotId, description, shotType, camera, lens, durationSec }: { shotId: string; description?: string; shotType?: string; camera?: string; lens?: string; durationSec?: number }) {
    const updates: any = {};
    if (typeof description === 'string') updates.description = description;
    if (typeof shotType === 'string') updates.shotType = shotType;
    if (typeof camera === 'string') updates.camera = camera;
    if (typeof lens === 'string') updates.lens = lens;
    if (typeof durationSec === 'number') updates.durationSec = durationSec;
    useAppStore.getState().updateShot(shotId, updates);
    return { ok: true, message: `Updated shot` };
  },
  async deleteShot({ shotId }: { shotId: string }) {
    useAppStore.getState().deleteShot(shotId);
    return { ok: true, message: `Deleted shot` };
  },
  async updateCharacter(p: {
    character: string; name?: string; description?: string; archetype?: string; want?: string;
    need?: string; fear?: string; secret?: string; pronouns?: string; occupation?: string; age?: string;
    voiceOf?: string; backstory?: string; goals?: string; personality?: string; motivation?: string;
    conflict?: string; relationships?: string; notes?: string;
  }) {
    const chars = useAppStore.getState().characters;
    const c = chars.find((x) => x.id === p.character || x.name.toLowerCase() === p.character.toLowerCase());
    if (!c) return { ok: false, message: `Character "${p.character}" not found` };
    const updates: any = {};
    if (typeof p.name === 'string') { updates.name = p.name.toUpperCase(); updates.displayName = p.name; }
    // Every other field: copy through when provided. Full character access.
    for (const k of ['description', 'archetype', 'want', 'need', 'fear', 'secret', 'pronouns',
      'occupation', 'age', 'voiceOf', 'backstory', 'goals', 'personality', 'motivation',
      'conflict', 'relationships', 'notes'] as const) {
      if (typeof (p as any)[k] === 'string') updates[k] = (p as any)[k];
    }
    useAppStore.getState().updateCharacter(c.id, updates);
    return { ok: true, message: `Updated character ${c.name}` };
  },
  async deleteCharacter({ character }: { character: string }) {
    const chars = useAppStore.getState().characters;
    const c = chars.find((x) => x.id === character || x.name.toLowerCase() === character.toLowerCase());
    if (!c) return { ok: false, message: `Character "${character}" not found` };
    useAppStore.getState().deleteCharacter(c.id);
    return { ok: true, message: `Deleted character ${c.name}` };
  },
  async updateAct({ act, title }: { act: string; title: string }) {
    const a = findAct(act);
    if (!a) return { ok: false, message: `Act "${act}" not found` };
    useAppStore.getState().updateAct(a.id, { title: String(title).toUpperCase() });
    return { ok: true, message: `Updated act` };
  },
  async deleteAct({ act }: { act: string }) {
    const a = findAct(act);
    if (!a) return { ok: false, message: `Act "${act}" not found` };
    useAppStore.getState().deleteAct(a.id);
    return { ok: true, message: `Deleted act ${a.title}` };
  },
  async updateBeat({ beatId, title, description }: { beatId: string; title?: string; description?: string }) {
    const updates: any = {};
    if (typeof title === 'string') updates.title = title;
    if (typeof description === 'string') updates.description = description;
    useAppStore.getState().updateBeat(beatId, updates);
    return { ok: true, message: `Updated beat` };
  },
  async deleteBeat({ beatId }: { beatId: string }) {
    useAppStore.getState().deleteBeat(beatId);
    return { ok: true, message: `Deleted beat` };
  },

  // ---- Stories ----
  async createStory({ title, type }: { title: string; type?: string }) {
    if (!title) return { ok: false, message: 'title required' };
    const newId = useAppStore.getState().createStory(title, (type as any) || 'movie');
    useAppStore.getState().setActiveStory(newId);
    return { ok: true, message: `Created story "${title}"`, id: newId };
  },
  async switchStory({ story }: { story: string }) {
    const stories = useAppStore.getState().stories;
    const s = stories.find((x) => x.id === story || x.title.toLowerCase() === story.toLowerCase());
    if (!s) return { ok: false, message: `Story "${story}" not found` };
    useAppStore.getState().setActiveStory(s.id);
    return { ok: true, message: `Switched to "${s.title}"` };
  },

  // ---- Notes ----
  async addNote({ text, category }: { text: string; category?: string }) {
    useAppStore.getState().addNote(text, (category as any) || 'general');
    return { ok: true, message: `Added note` };
  },

  // ---- Settings + app behavior ----
  async setAppTheme({ theme }: { theme: 'light' | 'dark' }) {
    useAppStore.getState().updateSettings({ theme: theme as any });
    return { ok: true, message: `App theme set to ${theme}` };
  },
  async setLocale({ locale }: { locale: 'en' | 'es' | 'fr' }) {
    useAppStore.getState().updateSettings({ locale } as any);
    return { ok: true, message: `Locale set to ${locale}` };
  },
  async toggleFocusMode() {
    useAppStore.getState().toggleFocusMode();
    return { ok: true, message: `Focus mode toggled` };
  },

  // ---- Read-back tools — for the AI to inspect what's in the app ----
  async listScenes() {
    const scenes = useAppStore.getState().scenes;
    return { ok: true, message: `${scenes.length} scenes`, data: scenes.map((s) => ({ id: s.id, name: s.name, status: s.status, shotCount: s.shotIds.length, description: s.description })) };
  },
  async listShots({ scene }: { scene?: string } = {}) {
    const state = useAppStore.getState();
    const shots = state.shots;
    if (scene) {
      const s = findScene(scene);
      if (!s) return { ok: false, message: `Scene "${scene}" not found` };
      const sc = state.scenes.find((x) => x.id === s.id)!;
      return { ok: true, data: sc.shotIds.map((id) => shots[id]).filter(Boolean) };
    }
    return { ok: true, data: Object.values(shots) };
  },
  async listCharacters() {
    const cs = useAppStore.getState().characters;
    return { ok: true, message: `${cs.length} characters`, data: cs.map((c) => ({ id: c.id, name: c.name, description: c.description, want: (c as any).want, fear: (c as any).fear })) };
  },
  async listActsAndBeats() {
    const state = useAppStore.getState();
    return {
      ok: true,
      data: state.plotBoard.acts.map((a) => ({
        id: a.id, title: a.title,
        beats: a.beatIds.map((bid) => state.beats[bid]).filter(Boolean).map((b) => ({ id: b.id, title: b.title, description: b.description })),
      })),
    };
  },
  async listLocations() {
    const locs = ((useAppStore.getState().screenplay as any).locations || []) as any[];
    return { ok: true, message: `${locs.length} locations`, data: locs };
  },
  async listWorldItems() {
    const items = ((useAppStore.getState().screenplay as any).world || []) as any[];
    return { ok: true, message: `${items.length} world items`, data: items };
  },
  async getScreenplaySummary() {
    const s = useAppStore.getState().screenplay as any;
    return {
      ok: true,
      data: {
        title: s.title, logline: s.logline, synopsis: s.synopsis, theme: s.theme,
        instructions: s.instructions,
        outlinePoints: s.outlinePoints || [],
        lineCount: (s.elements || []).length,
        firstLines: (s.elements || []).slice(0, 20).map((el: any) => `${el.type}: ${el.content}`),
      },
    };
  },

  // ---- Instructions field (the story-bible instructions/synopsis bar) ----
  async setInstructions({ text }: { text: string }) {
    useAppStore.getState().updateScreenplayField('instructions', String(text || ''));
    return { ok: true, message: 'Instructions set' };
  },

  // ---- Build-workflow state machine ----
  // The agent calls these to stay organized: getBuildStatus to see which
  // ordered step it's on + what already exists (so it never repeats or
  // skips), and markStepDone when an ENTIRE step is finished.
  async getBuildStatus() {
    const { loadBuildState, nextIncompleteStep, BUILD_STEPS, STEP_LABEL } = await import('@/lib/agentBuildState');
    const s = useAppStore.getState();
    const sp = s.screenplay as any;
    const storyId = s.activeStoryId;
    const build = loadBuildState(storyId);
    const next = nextIncompleteStep(storyId);
    return {
      ok: true,
      data: {
        order: BUILD_STEPS,
        stepLabels: STEP_LABEL,
        completedSteps: build.completed,
        nextStep: next,
        // A precise count of what exists so the agent can resume exactly
        // where it left off + detect what's missing.
        exists: {
          hasTitle: !!sp.title, hasLogline: !!sp.logline, hasSynopsis: !!sp.synopsis,
          hasTheme: !!sp.theme, hasInstructions: !!sp.instructions,
          outlinePoints: Array.isArray(sp.outlinePoints) ? sp.outlinePoints.length : 0,
          actCount: s.plotBoard.acts.length,
          beatCount: Object.keys(s.beats).length,
          characterCount: s.characters.length,
          characterNames: s.characters.map((c) => c.name),
          screenplayLineCount: (sp.elements || []).length,
          sceneCount: s.scenes.length,
          sceneNames: s.scenes.map((sc) => sc.name),
          shotsPerScene: s.scenes.map((sc) => ({ scene: sc.name, shots: sc.shotIds.length })),
        },
      },
    };
  },
  async markStepDone({ step }: { step: string }) {
    const { markStepComplete, STEP_LABEL, BUILD_STEPS, nextIncompleteStep } = await import('@/lib/agentBuildState');
    if (!(BUILD_STEPS as readonly string[]).includes(step)) {
      return { ok: false, message: `Unknown step "${step}". Valid: ${BUILD_STEPS.join(', ')}.` };
    }
    const storyId = useAppStore.getState().activeStoryId;
    markStepComplete(storyId, step as any);
    const next = nextIncompleteStep(storyId);
    return {
      ok: true,
      message: `✓ ${STEP_LABEL[step as keyof typeof STEP_LABEL]} step done.`,
      done: false,
      data: { nextStep: next, nextLabel: next ? STEP_LABEL[next] : 'Everything is built' },
    };
  },

  // ---- Anti-repetition: collapse consecutive duplicate screenplay lines ----
  // If a model (or a bad re-run) repeated content — "the man smiles / the
  // woman smiles / the man smiles" with the SAME text — this removes the
  // duplicate runs, keeping the first occurrence. Deterministic, doesn't
  // rely on the LLM to spot its own repetition.
  async dedupeScreenplay() {
    const state = useAppStore.getState();
    const els: any[] = state.screenplay.elements || [];
    if (els.length < 2) return { ok: true, message: 'Nothing to dedupe' };
    const norm = (e: any) => `${e.type}|${(e.content || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().toLowerCase()}`;
    const out: any[] = [];
    const seenBlock = new Set<string>();
    let removed = 0;
    // Pass 1: drop consecutive exact duplicates.
    let prevKey = '';
    for (const e of els) {
      const k = norm(e);
      if (k === prevKey && k.split('|')[1]) { removed++; continue; }
      out.push(e);
      prevKey = k;
    }
    // Pass 2: drop a line that exactly repeats a NON-adjacent earlier line
    // of meaningful length (catches "comes back and uses the same stuff").
    const out2: any[] = [];
    for (const e of out) {
      const k = norm(e);
      const content = k.split('|')[1] || '';
      if (content.length > 25 && seenBlock.has(k)) { removed++; continue; }
      if (content.length > 25) seenBlock.add(k);
      out2.push(e);
    }
    if (removed === 0) return { ok: true, message: 'No repeated lines found' };
    state.updateScreenplayField('elements', out2);
    dispatchWriterRebuild();
    return { ok: true, message: `Removed ${removed} repeated screenplay line${removed === 1 ? '' : 's'}` };
  },

  // ---- Trigger UI actions on the user's behalf ----
  async triggerExport() {
    document.dispatchEvent(new CustomEvent('app:openExport'));
    return { ok: true, message: 'Opened export dialog' };
  },
  async triggerSave() {
    document.dispatchEvent(new CustomEvent('app:save'));
    return { ok: true, message: 'Saved' };
  },

  // ---- Runway integration (image + video generation) ----
  //
  // Both tools require settings.runwayApiKey to be set. If not, they
  // return a friendly "configure your key" message instead of failing
  // hard, so the agent can ask the user to wire it up.
  async generateShotImage({ shot, prompt, ratio }: { shot?: string; prompt: string; ratio?: string }) {
    const settings = useAppStore.getState().settings as any;
    const apiKey = (settings.runwayApiKey || '').trim();
    if (!apiKey) {
      return { ok: false, message: 'No Runway API key — open Settings → AI → Runway and paste your key first.' };
    }
    if (!prompt) return { ok: false, message: 'prompt required' };
    const { runwayTextToImage } = await import('@/lib/runwayClient');
    const result = await runwayTextToImage({
      apiKey,
      prompt,
      proxyUrl: settings.runwayProxyUrl,
      model: settings.runwayImageModel || 'gen4_image',
      ratio: ratio || '1920:1080',
    });
    if (!result.ok || !result.url) {
      return { ok: false, message: result.error || 'Runway failed' };
    }
    // If a shot was specified, attach the generated image as that shot's
    // storyboard frame so it shows up in StoryboardView immediately.
    if (shot) {
      const state = useAppStore.getState();
      const allShots = Object.values(state.shots);
      let target = allShots.find((s) => s.id === shot);
      if (!target) {
        // Try matching by scene + index ("scene 2 shot 1") — fall back to
        // first shot of named scene.
        const scene = state.scenes.find((sc) => sc.name.toLowerCase().includes(shot.toLowerCase()));
        if (scene) target = allShots.find((s) => s.sceneId === scene.id);
      }
      if (target) {
        state.updateShot(target.id, { storyboard: result.url });
        return { ok: true, message: `Generated image attached to shot in ${state.scenes.find((s) => s.id === target!.sceneId)?.name || 'scene'}`, url: result.url, id: target.id };
      }
    }
    // No shot match — drop it in the asset library so the user can drag
    // it onto any storyboard slot.
    useAppStore.getState().addAsset({
      name: prompt.slice(0, 60),
      kind: 'image',
      data: result.url,
      size: 0,
    });
    return { ok: true, message: 'Generated image added to Assets', url: result.url };
  },

  async generateShotVideo({ shot, promptImage, promptText, duration }: { shot?: string; promptImage?: string; promptText?: string; duration?: 5 | 10 }) {
    const settings = useAppStore.getState().settings as any;
    const apiKey = (settings.runwayApiKey || '').trim();
    if (!apiKey) {
      return { ok: false, message: 'No Runway API key — open Settings → AI → Runway and paste your key first.' };
    }
    // Source image: explicit URL/data, or the named shot's existing
    // storyboard, or fail with a helpful hint.
    let sourceUrl = promptImage || '';
    if (!sourceUrl && shot) {
      const state = useAppStore.getState();
      const allShots = Object.values(state.shots);
      const target = allShots.find((s) => s.id === shot)
        || allShots.find((s) => state.scenes.find((sc) => sc.id === s.sceneId)?.name.toLowerCase().includes(shot.toLowerCase()));
      if (target?.storyboard) sourceUrl = target.storyboard;
    }
    if (!sourceUrl) {
      return { ok: false, message: 'No source image — call generateShotImage first or pass promptImage.' };
    }
    const { runwayImageToVideo } = await import('@/lib/runwayClient');
    const result = await runwayImageToVideo({
      apiKey,
      promptImage: sourceUrl,
      promptText: promptText || '',
      proxyUrl: settings.runwayProxyUrl,
      model: settings.runwayVideoModel || 'gen4_turbo',
      duration: duration || 5,
    });
    if (!result.ok || !result.url) {
      return { ok: false, message: result.error || 'Runway video failed' };
    }
    // Save the video URL to Assets as a reference so user can preview/download.
    useAppStore.getState().addAsset({
      name: (promptText || 'shot video').slice(0, 60),
      kind: 'reference',
      data: result.url,
      size: 0,
    });
    return { ok: true, message: 'Generated video added to Assets', url: result.url };
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
  // Compact state summary fed to the AI in every system prompt. Kept
  // small to fit Groq's free-tier 12k tokens/minute budget — capped
  // arrays at 12 items, truncated long strings. The agent can always
  // call listScenes/listCharacters/etc. to read more.
  const s = useAppStore.getState();
  const sp = s.screenplay as any;
  return {
    tab: s.activeTab,
    title: (sp.title || '').slice(0, 80),
    logline: (sp.logline || '').slice(0, 140),
    theme: (sp.theme || '').slice(0, 60),
    scriptLines: (sp.elements || []).length,
    scenes: s.scenes.slice(0, 12).map((sc) => sc.name),
    sceneCount: s.scenes.length,
    shots: Object.keys(s.shots).length,
    characters: s.characters.slice(0, 12).map((c) => c.name),
    characterCount: s.characters.length,
    acts: s.plotBoard.acts.map((a) => a.title),
    beats: Object.keys(s.beats).length,
    worldItems: Array.isArray(sp.world) ? sp.world.length : 0,
    locations: Array.isArray(sp.locations) ? sp.locations.length : 0,
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
    '- `setInstructions(text)` — the instructions/notes field in the story bible',
    '- `addOutlinePoint(text)` — one beat per call',
    '',
    '### Build workflow — call these to stay organized',
    '- `getBuildStatus()` — ALWAYS call FIRST. Returns the ordered step to work on next + a precise inventory of what exists (acts, beats, characters, scenes, shots-per-scene). Resume from here; never repeat.',
    '- `markStepDone(step)` — call when an ENTIRE step is finished. step ∈ instructions, acts, characters, screenplay, scenes. Announces "✓ … step done".',
    '- `dedupeScreenplay()` — removes repeated/duplicated screenplay lines if a model repeated itself.',
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
    '### Characters (full fields — fill them out)',
    '- `createCharacter(name, description, pronouns, age, occupation, archetype, voiceOf, personality, want, need, fear, secret, backstory, motivation, conflict, relationships)`',
    '',
    '### Director',
    '- `createScene(name, description)` — also sets it active',
    '- `updateSceneDescription(scene, description)` — scene is name or id',
    '- `addShot(scene, description, shotType, camera, lens, durationSec, audioNote)` — shotType: WIDE / MEDIUM / CLOSE-UP / EXTREME CLOSE-UP / OVER-THE-SHOULDER / POV / ESTABLISHING / INSERT / AERIAL. Give each scene the number of shots IT needs — vary it per scene, never a fixed count.',
    '- `addBRoll(shot, description)` — add b-roll footage to a shot (shot = id or scene name)',
    '- `updateBRoll(brollId, description)`',
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
    '### Edit / delete existing things (full access)',
    '- `updateScene(scene, name?, description?, status?, color?, heading?)` — status ∈ todo/in-progress/shot/final',
    '- `deleteScene(scene)`',
    '- `updateShot(shotId, description?, shotType?, camera?, lens?, durationSec?)`',
    '- `deleteShot(shotId)`',
    '- `updateCharacter(character, name?, description?, archetype?, want?, fear?, occupation?, age?, backstory?, personality?, motivation?, conflict?)`',
    '- `deleteCharacter(character)`',
    '- `updateAct(act, title)`',
    '- `deleteAct(act)`',
    '- `updateBeat(beatId, title?, description?)`',
    '- `deleteBeat(beatId)`',
    '',
    '### Stories',
    '- `createStory(title, type?)` — type ∈ movie, tv-series, mini-series, short-film, documentary, music-video, commercial, youtube, web-series, stage-play, animation, thriller, tv-show. Auto-switches to the new story.',
    '- `switchStory(story)` — id or title',
    '',
    '### Notes',
    '- `addNote(text, category?)`',
    '',
    '### App / settings',
    '- `setAppTheme(theme)` — light or dark (this changes the UI theme, NOT the story\'s thematic statement which is `setTheme`)',
    '- `setLocale(locale)` — en, es, fr',
    '- `toggleFocusMode()`',
    '',
    '### Read-back — inspect the app before acting',
    'These return `data` you can read between turns. Use them whenever you need to know what already exists (e.g. to edit existing scenes instead of duplicating).',
    '- `listScenes()`',
    '- `listShots(scene?)`',
    '- `listCharacters()`',
    '- `listActsAndBeats()`',
    '- `listLocations()`',
    '- `listWorldItems()`',
    '- `getScreenplaySummary()` — current title/logline/synopsis/instructions/outline + first 20 screenplay lines',
    '',
    '### UI triggers',
    '- `triggerSave()`',
    '- `triggerExport()` — opens the export dialog',
    '',
    '### Runway (image + video generation)',
    'Only available if the user has set their Runway API key in Settings → AI → Runway. If `generateShotImage` returns "No Runway API key", relay that to the user as a single sentence and continue with text-only work.',
    '- `generateShotImage(shot?, prompt, ratio?)` — text-to-image via Runway Gen-4. If `shot` is provided (scene name, id, or first match), the result is attached as that shot\'s storyboard frame so the user sees it appear in StoryboardView. Otherwise dropped into Assets. `ratio` defaults to "1920:1080".',
    '- `generateShotVideo(shot?, promptImage?, promptText?, duration?)` — image-to-video via Runway Gen-4 Turbo. Either pass `promptImage` (URL or data URL) or reference an existing shot by name/id (uses that shot\'s storyboard image as the source). `duration` is 5 or 10 seconds. Saved into Assets as a reference.',
    '',
    '### Meta',
    '- `think(text)` — narrate what you are about to do; shows in the live log',
    '- `done(summary)` — emit this LAST when the user\'s request is fully complete. If the goal is big, DO NOT emit done early — keep iterating across turns. The runner will give you 30 turns.',
    '',
  ].join('\n');
}
