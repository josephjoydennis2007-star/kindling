/**
 * Kindling Connector — a remote MCP server (Cloudflare Worker).
 *
 * This is what lets you control Kindling from inside Claude (desktop, web,
 * AND phone). You add this Worker's URL to Claude as a "custom connector";
 * then in any Claude chat you can say "build me a heist thriller" and Claude
 * calls the tools below, which write the finished story straight into YOUR
 * Kindling account. Open the app and it's there.
 *
 * How it talks to Kindling:
 *   1. Signs in to YOUR Kindling account with the Firebase Auth REST API
 *      (email + password you set as Worker secrets) → gets an ID token + uid.
 *   2. Writes a story document to Firestore REST at
 *      /projects/kindling-1d29d/databases/default/documents/stories/{id}
 *      with owner = your uid, and `data` = the full story JSON (the exact
 *      shape Kindling's importStory() expects).
 *   3. Kindling's cloud sync pulls it the next time you open the app.
 *
 * No Firebase Admin / service account needed — it authenticates AS YOU, so
 * it only ever touches your own stories and respects your security rules.
 *
 * ── Required Worker secrets (set with `wrangler secret put NAME`) ──
 *   KINDLING_EMAIL     — your Kindling login email (email/password account)
 *   KINDLING_PASSWORD  — that account's password
 * Optional (already defaulted to this project):
 *   FIREBASE_API_KEY   — defaults to the public Kindling web API key
 *   FIREBASE_PROJECT   — defaults to "kindling-1d29d"
 *   FIREBASE_DB        — defaults to "default" (the NAMED database)
 *   APP_URL            — defaults to https://kindling-1d29d.web.app
 */

const DEFAULTS = {
  FIREBASE_API_KEY: 'AIzaSyDGj9GtrS3jpXmmtC4g84MkWBhFJqbkwEw',
  FIREBASE_PROJECT: 'kindling-1d29d',
  FIREBASE_DB: 'default',
  APP_URL: 'https://kindling-1d29d.web.app',
};

const PROTOCOL_VERSION = '2024-11-05';

// ─── small helpers ────────────────────────────────────────────────────────
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, Mcp-Session-Id',
};
const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', ...cors } });

function rpcResult(id, result) { return { jsonrpc: '2.0', id, result }; }
function rpcError(id, code, message) { return { jsonrpc: '2.0', id, error: { code, message } }; }

let _idSeq = 0;
function genId(prefix) {
  _idSeq += 1;
  return `${prefix}_${Date.now().toString(36)}_${_idSeq}`;
}

// ─── Firebase auth (sign in AS the user) ──────────────────────────────────
async function signIn(env) {
  const apiKey = env.FIREBASE_API_KEY || DEFAULTS.FIREBASE_API_KEY;
  const email = env.KINDLING_EMAIL;
  const password = env.KINDLING_PASSWORD;
  if (!email || !password) {
    throw new Error('Worker is missing KINDLING_EMAIL / KINDLING_PASSWORD secrets. Set them with `wrangler secret put`.');
  }
  const r = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    },
  );
  const j = await r.json();
  if (!r.ok) {
    throw new Error(`Kindling sign-in failed: ${j?.error?.message || r.status}. Make sure this account has an EMAIL/PASSWORD login (Google-only sign-in can't be used here).`);
  }
  return { idToken: j.idToken, uid: j.localId };
}

// ─── Firestore REST (typed-value) helpers ─────────────────────────────────
function fsBase(env) {
  const project = env.FIREBASE_PROJECT || DEFAULTS.FIREBASE_PROJECT;
  const dbName = env.FIREBASE_DB || DEFAULTS.FIREBASE_DB;
  return `https://firestore.googleapis.com/v1/projects/${project}/databases/${dbName}/documents`;
}
// Convert a JS value to a Firestore typed value (only the few types we need).
function fsVal(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(fsVal) } };
  if (typeof v === 'object') {
    const fields = {};
    for (const k of Object.keys(v)) fields[k] = fsVal(v[k]);
    return { mapValue: { fields } };
  }
  return { stringValue: String(v) };
}

async function writeStoryDoc(env, auth, storyId, title, dataString) {
  const now = new Date().toISOString();
  const fields = {
    owner: fsVal(auth.uid),
    ownerName: fsVal(env.KINDLING_EMAIL || 'Claude'),
    collaborators: fsVal([]),
    shareable: fsVal(false),
    title: fsVal(title),
    data: fsVal(dataString),
    createdAt: { timestampValue: now },
    updatedAt: { timestampValue: now },
  };
  const url = `${fsBase(env)}/stories/${storyId}`;
  const r = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.idToken}` },
    body: JSON.stringify({ fields }),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`Firestore write failed (${r.status}): ${t.slice(0, 300)}`);
  }
}

async function listStoryDocs(env, auth) {
  // structured query: stories where owner == uid
  const url = `${fsBase(env)}:runQuery`;
  const body = {
    structuredQuery: {
      from: [{ collectionId: 'stories' }],
      where: {
        fieldFilter: { field: { fieldPath: 'owner' }, op: 'EQUAL', value: { stringValue: auth.uid } },
      },
      limit: 50,
    },
  };
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.idToken}` },
    body: JSON.stringify(body),
  });
  const arr = await r.json();
  if (!r.ok) throw new Error(`Firestore query failed: ${JSON.stringify(arr).slice(0, 200)}`);
  const out = [];
  for (const row of arr) {
    if (!row.document) continue;
    const id = row.document.name.split('/').pop();
    const f = row.document.fields || {};
    out.push({ id, title: f.title?.stringValue || 'Untitled' });
  }
  return out;
}

// ─── Story builders (output the exact shapes Kindling's importStory expects) ─
// Colors match the app's palettes so connector stories render identically.
const SCENE_COLORS = ['#3b82f6', '#2a9d8f', '#e9c46a', '#9b5de5', '#f15bb5', '#00bbf9', '#fb5607', '#e76f51'];
const BEAT_COLORS = ['#e76f51', '#f4a261', '#2a9d8f', '#264653', '#e9c46a', '#9b5de5', '#f15bb5', '#00bbf9', '#fb5607', '#8338ec'];
const CHAR_COLORS = ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ef4444', '#14b8a6'];

// ── value normalizers (map free-form input → the app's exact enums) ────────
// The app renders shot type from a <select> whose value MUST exactly equal one
// of these strings, else it shows blank. Claude tends to write "wide shot" /
// "close up" — map those to the canonical value so they actually display.
const SHOT_TYPE_CANON = ['WIDE', 'MEDIUM', 'CLOSE-UP', 'EXTREME CLOSE-UP', 'OVER-THE-SHOULDER', 'POV', 'ESTABLISHING', 'INSERT', 'AERIAL'];
function normalizeShotType(v) {
  if (!v) return '';
  const upper = String(v).trim().toUpperCase();
  if (!upper) return '';
  if (SHOT_TYPE_CANON.includes(upper)) return upper;
  const key = upper.replace(/[^A-Z]/g, ''); // strip spaces, hyphens, dots
  const map = {
    WIDE: 'WIDE', WIDESHOT: 'WIDE', WS: 'WIDE', LONGSHOT: 'WIDE', LS: 'WIDE', FULLSHOT: 'WIDE', FULL: 'WIDE', LONG: 'WIDE', WS2: 'WIDE',
    MEDIUM: 'MEDIUM', MEDIUMSHOT: 'MEDIUM', MID: 'MEDIUM', MIDSHOT: 'MEDIUM', MS: 'MEDIUM', TWOSHOT: 'MEDIUM', MEDSHOT: 'MEDIUM', MED: 'MEDIUM', MEDIUMCLOSEUP: 'MEDIUM', MCU: 'MEDIUM',
    CLOSEUP: 'CLOSE-UP', CLOSE: 'CLOSE-UP', CU: 'CLOSE-UP', CLOSEUPSHOT: 'CLOSE-UP', CLOSESHOT: 'CLOSE-UP',
    EXTREMECLOSEUP: 'EXTREME CLOSE-UP', ECU: 'EXTREME CLOSE-UP', XCU: 'EXTREME CLOSE-UP', EXTREMECLOSE: 'EXTREME CLOSE-UP',
    OVERTHESHOULDER: 'OVER-THE-SHOULDER', OTS: 'OVER-THE-SHOULDER', OVERSHOULDER: 'OVER-THE-SHOULDER',
    POV: 'POV', POINTOFVIEW: 'POV',
    ESTABLISHING: 'ESTABLISHING', ESTABLISHINGSHOT: 'ESTABLISHING', EST: 'ESTABLISHING', ESTABLISH: 'ESTABLISHING',
    INSERT: 'INSERT', INSERTSHOT: 'INSERT', CUTAWAY: 'INSERT',
    AERIAL: 'AERIAL', AERIALSHOT: 'AERIAL', DRONE: 'AERIAL', DRONESHOT: 'AERIAL', BIRDSEYE: 'AERIAL', BIRDSEYEVIEW: 'AERIAL', OVERHEAD: 'AERIAL', TOPSHOT: 'AERIAL', CRANE: 'AERIAL',
  };
  return map[key] || '';
}
const SCENE_STATUSES = ['todo', 'in-progress', 'shot', 'final'];
function normalizeSceneStatus(v) {
  const s = String(v || '').trim().toLowerCase().replace(/\s+/g, '-');
  return SCENE_STATUSES.includes(s) ? s : 'todo';
}
const BEAT_TYPES = ['setup', 'hook', 'inciting', 'turn', 'twist', 'midpoint', 'crisis', 'climax', 'payoff', 'tag', 'other'];
function normalizeBeatType(v) {
  const s = String(v || '').trim().toLowerCase();
  return BEAT_TYPES.includes(s) ? s : '';
}
function normalizeBudget(b) {
  if (!b || typeof b !== 'object') return null;
  const out = {};
  let any = false;
  for (const k of ['cast', 'crew', 'location', 'props', 'post']) {
    if (b[k] != null && !Number.isNaN(Number(b[k]))) { out[k] = Number(b[k]); any = true; }
  }
  return any ? out : null;
}

// ── Length targets per show type ───────────────────────────────────────────
// Rough guideposts so a "movie" actually gets feature length instead of a
// 5-scene sketch. `lines` = screenplay elements (each heading / action /
// character cue / dialogue line counts as one). These are floors to aim for,
// not hard caps — Claude should keep calling add_to_story until it reaches them.
const TYPE_TARGETS = {
  'movie':       { scenes: 48, lines: 1100, label: 'feature film (~90–120 min)' },
  'thriller':    { scenes: 48, lines: 1100, label: 'thriller feature (~90–110 min)' },
  'tv-series':   { scenes: 32, lines: 750,  label: 'TV series episode (~45 min)' },
  'tv-show':     { scenes: 20, lines: 420,  label: 'TV show episode (~22–30 min)' },
  'mini-series': { scenes: 40, lines: 950,  label: 'mini-series episode (~50 min)' },
  'documentary': { scenes: 24, lines: 480,  label: 'documentary (~50–80 min)' },
  'short-film':  { scenes: 12, lines: 280,  label: 'short film (under 40 min)' },
  'music-video': { scenes: 10, lines: 140,  label: 'music video (~3–5 min)' },
  'commercial':  { scenes: 5,  lines: 70,   label: 'commercial (15–60s)' },
  'youtube':     { scenes: 12, lines: 240,  label: 'YouTube video (~8–15 min)' },
  'web-series':  { scenes: 18, lines: 380,  label: 'web-series episode (~10–20 min)' },
  'stage-play':  { scenes: 18, lines: 850,  label: 'stage play (full length)' },
  'animation':   { scenes: 36, lines: 820,  label: 'animated feature/episode' },
};
function normalizeStoryType(v) {
  const s = String(v || '').trim().toLowerCase();
  if (TYPE_TARGETS[s]) return s;
  const map = {
    'feature': 'movie', 'feature film': 'movie', 'film': 'movie', 'featurefilm': 'movie',
    'series': 'tv-series', 'tv series': 'tv-series', 'television series': 'tv-series',
    'show': 'tv-show', 'tv show': 'tv-show',
    'miniseries': 'mini-series', 'mini series': 'mini-series', 'limited series': 'mini-series',
    'doc': 'documentary',
    'short': 'short-film', 'short film': 'short-film',
    'music video': 'music-video', 'mv': 'music-video',
    'ad': 'commercial', 'advert': 'commercial', 'advertisement': 'commercial',
    'vlog': 'youtube', 'youtube video': 'youtube',
    'web series': 'web-series', 'webseries': 'web-series',
    'play': 'stage-play', 'stage play': 'stage-play', 'theatre': 'stage-play', 'theater': 'stage-play',
    'animated': 'animation', 'cartoon': 'animation', 'anime': 'animation',
  };
  return map[s] || 'movie';
}
function targetFor(type) { return TYPE_TARGETS[normalizeStoryType(type)] || TYPE_TARGETS.movie; }
function progressNote(type, sceneCount, lineCount) {
  const t = targetFor(type);
  const pct = Math.min(
    100,
    Math.round((Math.min(sceneCount / t.scenes, lineCount / t.lines)) * 100),
  );
  if (pct >= 95) {
    return `✔ Length: this is a full-length ${t.label} (${sceneCount} scenes / ${lineCount} script lines).`;
  }
  return `📏 Length target for a ${t.label}: ~${t.scenes} scenes and ~${t.lines} script lines. Currently ${sceneCount} scenes / ${lineCount} lines (~${pct}% of target). Keep calling add_to_story with the NEXT batch of scenes + screenplay until you reach full length — do NOT stop early.`;
}

// screenplay scene-blocks → flat ScreenplayElement[]. When a block names a
// `section` that exists in sectionMap (name→id), its elements are tagged with
// that sectionId so they group under the right Writer section.
function makeElements(blocks, sectionMap) {
  const els = [];
  for (const sc of (blocks || [])) {
    const sectionId = (sectionMap && sc.section && sectionMap[String(sc.section).trim().toLowerCase()]) || null;
    const push = (type, content) => els.push({ id: genId('el'), type, content, sceneId: null, sectionId });
    if (sc.heading) push('scene-heading', String(sc.heading).toUpperCase());
    if (sc.action) push('action', String(sc.action));
    for (const d of (sc.dialogue || [])) {
      if (d.character) push('character', String(d.character).toUpperCase());
      if (d.parenthetical) push('parenthetical', `(${String(d.parenthetical).replace(/^\(|\)$/g, '')})`);
      if (d.line) push('dialogue', String(d.line));
    }
    if (sc.transition) push('transition', String(sc.transition).toUpperCase());
  }
  return els;
}

function makeCharacter(c, i) {
  return {
    id: genId('char'), name: String(c.name || 'CHARACTER').toUpperCase(), displayName: c.name || 'Character',
    description: c.description || '', color: CHAR_COLORS[i % CHAR_COLORS.length], image: null,
    backstory: c.backstory || '', goals: c.goals || '', personality: c.personality || '',
    age: c.age != null ? String(c.age) : '', occupation: c.occupation || '', motivation: c.motivation || '',
    conflict: c.conflict || '', relationships: c.relationships || '', notes: c.notes || '',
    voiceAudio: null, tags: [], createdAt: Date.now(), archetype: c.archetype || '', voiceOf: c.voiceOf || '',
    want: c.want || '', need: c.need || '', fear: c.fear || '', secret: c.secret || '',
    pronouns: c.pronouns || '', imagePrompt: c.imagePrompt || '',
  };
}

// scenes (+ shots into shotsOut, + b-rolls into bRollsOut) starting at a given
// index/order so appended scenes continue numbering + colors from what's
// already there.
function makeScenes(list, startSceneIndex, startShotOrder, shotsOut, bRollsOut) {
  let shotOrder = startShotOrder;
  return (list || []).map((s, i) => {
    const idx = startSceneIndex + i;
    const sceneId = genId('scene');
    const shotIds = [];
    for (const sh of (s.shots || [])) {
      const shotId = genId('shot');
      // B-roll list: accept an array of strings OR {description} objects.
      const bRollIds = [];
      const brSrc = Array.isArray(sh.bRolls) ? sh.bRolls : (Array.isArray(sh.broll) ? sh.broll : []);
      for (const br of brSrc) {
        const desc = typeof br === 'string' ? br : (br && br.description) || '';
        if (!String(desc).trim()) continue;
        const brId = genId('broll');
        bRollsOut[brId] = { id: brId, shotId, description: String(desc) };
        bRollIds.push(brId);
      }
      const shot = {
        id: shotId, sceneId, description: sh.description || '', shotType: normalizeShotType(sh.shotType),
        camera: sh.camera || '', bRollIds, order: shotOrder++, lens: sh.lens || '',
        durationSec: typeof sh.durationSec === 'number' ? sh.durationSec : 0, audioNote: sh.audioNote || '',
        storyboard: sh.firstFrameImage || sh.image || sh.storyboard || null,
        lastFrame: sh.lastFrameImage || sh.lastFrame || null,
        audioFile: null,
      };
      if (sh.needsLastFrame) shot.needsLastFrame = true;
      if (typeof sh.lastFrameDescription === 'string' && sh.lastFrameDescription.trim()) {
        shot.lastFrameDescription = sh.lastFrameDescription.trim();
        shot.needsLastFrame = true; // a described end-state implies a transition
      }
      shotsOut[shotId] = shot;
      shotIds.push(shotId);
    }
    const name = s.name || `Scene ${idx + 1}`;
    const scene = {
      id: sceneId, name, heading: name, content: '', description: s.description || '',
      color: SCENE_COLORS[idx % SCENE_COLORS.length], status: normalizeSceneStatus(s.status), shotIds, order: idx,
    };
    if (typeof s.shootDate === 'string' && s.shootDate.trim()) scene.shootDate = s.shootDate.trim();
    const budget = normalizeBudget(s.budget);
    if (budget) scene.budget = budget;
    return scene;
  });
}

// acts (+ beats into beatsOut) continuing from existing counts.
function makeActs(list, startBeatCount, startActIndex, beatsOut) {
  let beatCount = startBeatCount;
  return (list || []).map((a, ai) => {
    const actId = genId('act');
    const beatIds = [];
    (a.beats || []).forEach((b, bi) => {
      const beatId = genId('beat');
      const beat = {
        id: beatId, actId, title: b.title || '', description: b.description || '',
        tags: Array.isArray(b.tags) ? b.tags.map(String) : [],
        color: BEAT_COLORS[beatCount % BEAT_COLORS.length], order: bi,
      };
      const bt = normalizeBeatType(b.beatType || b.type);
      if (bt) beat.beatType = bt;
      beatsOut[beatId] = beat;
      beatIds.push(beatId);
      beatCount++;
    });
    return { id: actId, title: String(a.title || `ACT ${startActIndex + ai + 1}`).toUpperCase(), beatIds, order: startActIndex + ai };
  });
}

// worldbuilding wiki items → screenplay.world[] ({ id, kind, name, body, tags })
const WORLD_KINDS = ['location', 'lore', 'rule', 'faction', 'item', 'term'];
function makeWorld(list) {
  return (list || []).map((w) => ({
    id: genId('world'),
    kind: WORLD_KINDS.includes(String(w.kind || '').toLowerCase()) ? String(w.kind).toLowerCase() : 'lore',
    name: w.name || 'Untitled',
    body: w.body || w.description || '',
    tags: Array.isArray(w.tags) ? w.tags.map(String) : [],
  })).filter((w) => w.name);
}

// physical shoot locations → screenplay.locations[]
function makeLocations(list) {
  const pick = (v, allowed, dflt) => (allowed.includes(String(v || '').toLowerCase()) ? String(v).toLowerCase() : dflt);
  return (list || []).map((l) => ({
    id: genId('loc'),
    name: l.name || 'New location',
    address: l.address || '',
    intExt: pick(l.intExt, ['int', 'ext', 'both'], 'int'),
    timeOfDay: pick(l.timeOfDay, ['day', 'night', 'both'], 'day'),
    notes: l.notes || '',
    permitStatus: pick(l.permitStatus, ['unknown', 'inquired', 'granted', 'denied'], 'unknown'),
    cost: l.cost != null ? String(l.cost) : '',
    photos: [],
    linkedSceneIds: [],
  })).filter((l) => l.name);
}

// notes → notes[] ({ id, text, category, createdAt })
function makeNotes(list) {
  const cat = (v) => (['general', 'plot', 'character'].includes(String(v || '').toLowerCase()) ? String(v).toLowerCase() : 'general');
  return (list || []).map((n) => ({
    id: genId('note'),
    text: typeof n === 'string' ? n : (n.text || ''),
    category: typeof n === 'string' ? 'general' : cat(n.category),
    createdAt: Date.now(),
  })).filter((n) => n.text);
}

// writer sections → screenplay.sections[] ({ id, name, color, order, description })
function makeSections(list, startOrder) {
  return (list || []).map((s, i) => ({
    id: genId('sec'),
    name: (typeof s === 'string' ? s : s.name) || `Section ${startOrder + i + 1}`,
    color: SCENE_COLORS[(startOrder + i) % SCENE_COLORS.length],
    order: startOrder + i,
    description: (typeof s === 'string' ? '' : s.description) || '',
  }));
}

// Build a brand-new story from a full spec.
function buildStoryData(spec) {
  const shots = {};
  const bRolls = {};
  const beats = {};
  const characters = (spec.characters || []).map(makeCharacter);
  const scenes = makeScenes(spec.scenes, 0, 0, shots, bRolls);
  const acts = makeActs(spec.acts, 0, 0, beats);
  const sections = makeSections(spec.sections, 0);
  const sectionMap = {};
  for (const sec of sections) sectionMap[sec.name.trim().toLowerCase()] = sec.id;
  const screenplay = {
    title: spec.title || 'Untitled', logline: spec.logline || '', synopsis: spec.synopsis || '',
    theme: spec.theme || '', genre: spec.genre || '', type: normalizeStoryType(spec.type), instructions: spec.instructions || '',
    outlinePoints: Array.isArray(spec.outline) ? spec.outline : [], elements: makeElements(spec.screenplay, sectionMap),
    sections, assets: [], world: makeWorld(spec.world), locations: makeLocations(spec.locations),
  };
  return { screenplay, scenes, shots, bRolls, characters, plotBoard: { acts }, beats, notes: makeNotes(spec.notes), version: '2.0', exportedAt: Date.now() };
}

// Append more material to an EXISTING story's data object (for add_to_story).
// Continues IDs/order/colors and dedupes characters by name.
function appendToStoryData(existing, spec) {
  const data = existing && typeof existing === 'object' ? existing : {};
  data.screenplay = data.screenplay || {};
  data.screenplay.elements = Array.isArray(data.screenplay.elements) ? data.screenplay.elements : [];
  data.screenplay.sections = Array.isArray(data.screenplay.sections) ? data.screenplay.sections : [];
  data.screenplay.world = Array.isArray(data.screenplay.world) ? data.screenplay.world : [];
  data.screenplay.locations = Array.isArray(data.screenplay.locations) ? data.screenplay.locations : [];
  data.scenes = Array.isArray(data.scenes) ? data.scenes : [];
  data.shots = data.shots && typeof data.shots === 'object' ? data.shots : {};
  data.bRolls = data.bRolls && typeof data.bRolls === 'object' ? data.bRolls : {};
  data.characters = Array.isArray(data.characters) ? data.characters : [];
  data.plotBoard = data.plotBoard && Array.isArray(data.plotBoard.acts) ? data.plotBoard : { acts: [] };
  data.beats = data.beats && typeof data.beats === 'object' ? data.beats : {};
  data.notes = Array.isArray(data.notes) ? data.notes : [];

  // Sections first so screenplay blocks can reference them by name. Build a
  // name→id map over BOTH pre-existing and newly-added sections.
  if (Array.isArray(spec.sections) && spec.sections.length) {
    data.screenplay.sections = data.screenplay.sections.concat(makeSections(spec.sections, data.screenplay.sections.length));
  }
  const sectionMap = {};
  for (const sec of data.screenplay.sections) sectionMap[String(sec.name).trim().toLowerCase()] = sec.id;

  if (Array.isArray(spec.screenplay) && spec.screenplay.length) {
    data.screenplay.elements = data.screenplay.elements.concat(makeElements(spec.screenplay, sectionMap));
  }
  if (Array.isArray(spec.scenes) && spec.scenes.length) {
    const newScenes = makeScenes(spec.scenes, data.scenes.length, Object.keys(data.shots).length, data.shots, data.bRolls);
    data.scenes = data.scenes.concat(newScenes);
  }
  if (Array.isArray(spec.characters) && spec.characters.length) {
    for (const c of spec.characters) {
      const nameU = String(c.name || '').trim().toUpperCase();
      const ex = data.characters.find((x) => String(x.name || '').trim().toUpperCase() === nameU);
      if (ex) {
        for (const k of ['description', 'backstory', 'goals', 'personality', 'age', 'occupation', 'motivation', 'conflict', 'relationships', 'notes', 'archetype', 'voiceOf', 'want', 'need', 'fear', 'secret', 'pronouns', 'imagePrompt']) {
          if (c[k] != null && String(c[k]).trim() && !String(ex[k] || '').trim()) ex[k] = String(c[k]);
        }
      } else {
        data.characters.push(makeCharacter(c, data.characters.length));
      }
    }
  }
  if (Array.isArray(spec.acts) && spec.acts.length) {
    const newActs = makeActs(spec.acts, Object.keys(data.beats).length, data.plotBoard.acts.length, data.beats);
    data.plotBoard.acts = data.plotBoard.acts.concat(newActs);
  }
  if (typeof spec.title === 'string' && spec.title) data.screenplay.title = spec.title;
  if (typeof spec.logline === 'string' && spec.logline) data.screenplay.logline = spec.logline;
  if (typeof spec.synopsis === 'string' && spec.synopsis) data.screenplay.synopsis = spec.synopsis;
  if (typeof spec.theme === 'string' && spec.theme) data.screenplay.theme = spec.theme;
  if (typeof spec.genre === 'string' && spec.genre) data.screenplay.genre = spec.genre;
  if (typeof spec.instructions === 'string' && spec.instructions) data.screenplay.instructions = spec.instructions;
  if (Array.isArray(spec.outline) && spec.outline.length) {
    data.screenplay.outlinePoints = (Array.isArray(data.screenplay.outlinePoints) ? data.screenplay.outlinePoints : []).concat(spec.outline);
  }
  if (Array.isArray(spec.world) && spec.world.length) {
    data.screenplay.world = data.screenplay.world.concat(makeWorld(spec.world));
  }
  if (Array.isArray(spec.locations) && spec.locations.length) {
    data.screenplay.locations = data.screenplay.locations.concat(makeLocations(spec.locations));
  }
  if (Array.isArray(spec.notes) && spec.notes.length) {
    data.notes = data.notes.concat(makeNotes(spec.notes));
  }
  data.exportedAt = Date.now();
  return data;
}

// Read an existing story's title + parsed data from Firestore.
async function readStoryData(env, auth, storyId) {
  const r = await fetch(`${fsBase(env)}/stories/${storyId}`, { headers: { Authorization: `Bearer ${auth.idToken}` } });
  if (!r.ok) throw new Error(`Could not read story "${storyId}" (${r.status}). Call list_stories to get a valid id.`);
  const doc = await r.json();
  const title = doc.fields?.title?.stringValue || 'Untitled';
  let data = {};
  try { data = JSON.parse(doc.fields?.data?.stringValue || '{}'); } catch { /* keep {} */ }
  return { title, data };
}

// ─── Shared schema fragments (used by both build_story and add_to_story) ───
// Defined once so the two tools always expose the exact same rich field set.
const CHARACTER_ITEMS = {
  type: 'array',
  description: 'Characters. Existing names are merged (not duplicated), so you can flesh a character out across calls.',
  items: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      age: { type: 'string' },
      pronouns: { type: 'string' },
      occupation: { type: 'string' },
      archetype: { type: 'string', description: 'e.g. "The Mentor", "The Trickster"' },
      personality: { type: 'string' },
      description: { type: 'string', description: 'Short one-line description / who they are.' },
      want: { type: 'string', description: 'What they consciously want (external goal).' },
      need: { type: 'string', description: 'What they actually need (internal/thematic).' },
      fear: { type: 'string', description: 'Deepest fear / wound.' },
      secret: { type: 'string', description: 'Hidden truth they keep.' },
      goals: { type: 'string' },
      motivation: { type: 'string' },
      conflict: { type: 'string' },
      backstory: { type: 'string' },
      relationships: { type: 'string', description: 'How they relate to other characters.' },
      voiceOf: { type: 'string', description: 'Distinctive speech style / dialect / verbal tics.' },
      notes: { type: 'string', description: 'Freeform notes about the character.' },
      imagePrompt: { type: 'string', description: 'Appearance for image gen: face, body, side view.' },
    },
    required: ['name'],
  },
};
const ACTS_ITEMS = {
  type: 'array',
  description: 'Plot-board acts, each holding ordered story beats.',
  items: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'e.g. "ACT ONE", "SETUP".' },
      beats: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            description: { type: 'string' },
            beatType: { type: 'string', enum: ['setup', 'hook', 'inciting', 'turn', 'twist', 'midpoint', 'crisis', 'climax', 'payoff', 'tag', 'other'], description: 'Dramatic function of the beat.' },
            tags: { type: 'array', items: { type: 'string' } },
          },
        },
      },
    },
  },
};
const SHOT_ITEMS = {
  type: 'array',
  description: 'Director shots for this scene.',
  items: {
    type: 'object',
    properties: {
      description: { type: 'string' },
      shotType: { type: 'string', enum: ['WIDE', 'MEDIUM', 'CLOSE-UP', 'EXTREME CLOSE-UP', 'OVER-THE-SHOULDER', 'POV', 'ESTABLISHING', 'INSERT', 'AERIAL'], description: 'Use one of these exact values. Common synonyms (e.g. "wide shot", "close up", "OTS", "drone") are auto-mapped, but the canonical value is best.' },
      camera: { type: 'string', description: 'Camera movement, e.g. "slow push-in", "handheld", "static".' },
      lens: { type: 'string', description: 'e.g. "35mm", "85mm anamorphic".' },
      durationSec: { type: 'number' },
      audioNote: { type: 'string', description: 'SFX / music / ambience cue.' },
      bRolls: { type: 'array', items: { type: 'string' }, description: 'B-roll / cutaway descriptions for this shot.' },
      needsLastFrame: { type: 'boolean', description: 'Set true when this shot is a first→last-frame transition (a move/transformation) that should be animated between two frames (e.g. for Runway image-to-video). The app then shows a dedicated "last frame" slot.' },
      lastFrameDescription: { type: 'string', description: 'What the END (last) frame should look like — the end-state prompt. The shot `description` is the first-frame prompt. Setting this implies needsLastFrame.' },
      firstFrameImage: { type: 'string', description: 'Optional URL of an already-generated FIRST-frame image to attach now (e.g. a Runway output URL). Prefer a hosted URL over base64.' },
      lastFrameImage: { type: 'string', description: 'Optional URL of an already-generated LAST-frame image to attach now.' },
    },
  },
};
const SCENE_ITEMS = {
  type: 'array',
  description: 'Director scenes (the shot list / production breakdown), distinct from the screenplay text.',
  items: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      description: { type: 'string' },
      status: { type: 'string', enum: ['todo', 'in-progress', 'shot', 'final'], description: 'Production status (default todo).' },
      shootDate: { type: 'string', description: 'ISO date YYYY-MM-DD the scene is scheduled to shoot.' },
      budget: {
        type: 'object',
        description: 'Per-category budget numbers.',
        properties: { cast: { type: 'number' }, crew: { type: 'number' }, location: { type: 'number' }, props: { type: 'number' }, post: { type: 'number' } },
      },
      shots: SHOT_ITEMS,
    },
  },
};
const SCREENPLAY_ITEMS = {
  type: 'array',
  description: 'Ordered scene blocks of the actual script (Writer view).',
  items: {
    type: 'object',
    properties: {
      heading: { type: 'string', description: 'Scene heading, e.g. INT. WAREHOUSE - NIGHT' },
      action: { type: 'string', description: 'Action / description paragraph.' },
      dialogue: {
        type: 'array',
        items: { type: 'object', properties: { character: { type: 'string' }, parenthetical: { type: 'string' }, line: { type: 'string' } } },
      },
      transition: { type: 'string', description: 'Optional transition, e.g. CUT TO:, SMASH CUT:, FADE OUT.' },
      section: { type: 'string', description: 'Optional name of a Writer section this block belongs to (must match a sections[] name).' },
    },
  },
};
const SECTIONS_ITEMS = {
  type: 'array',
  description: 'Named Writer sections (e.g. "Cold Open", "Act One"). Reference them from screenplay blocks via their `section` field.',
  items: { type: 'object', properties: { name: { type: 'string' }, description: { type: 'string' } }, required: ['name'] },
};
const WORLD_ITEMS = {
  type: 'array',
  description: 'Worldbuilding wiki entries (World view).',
  items: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      kind: { type: 'string', enum: ['location', 'lore', 'rule', 'faction', 'item', 'term'], description: 'Category (default lore).' },
      body: { type: 'string', description: 'The write-up for this entry.' },
      tags: { type: 'array', items: { type: 'string' } },
    },
    required: ['name'],
  },
};
const LOCATION_ITEMS = {
  type: 'array',
  description: 'Physical shoot locations (Locations view).',
  items: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      address: { type: 'string' },
      intExt: { type: 'string', enum: ['int', 'ext', 'both'] },
      timeOfDay: { type: 'string', enum: ['day', 'night', 'both'] },
      permitStatus: { type: 'string', enum: ['unknown', 'inquired', 'granted', 'denied'] },
      cost: { type: 'string', description: 'Free-text cost (any currency).' },
      notes: { type: 'string' },
    },
    required: ['name'],
  },
};
const NOTE_ITEMS = {
  type: 'array',
  description: 'Production / story notes (Notes panel).',
  items: {
    type: 'object',
    properties: {
      text: { type: 'string' },
      category: { type: 'string', enum: ['general', 'plot', 'character'] },
    },
    required: ['text'],
  },
};

// ─── MCP tool definitions ─────────────────────────────────────────────────
const TOOLS = [
  {
    name: 'list_stories',
    description: 'List the stories in the Kindling account (id + title).',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'build_story',
    description:
      "Create a COMPLETE new story in Kindling from a full spec and save it to the user's account. Fill in as much as you can — every part maps to a real workspace in the app: title/logline/synopsis/theme/genre, the character roster, acts+beats (Plot board), director scenes with shots + b-rolls (Director), the screenplay scene-blocks (Writer), worldbuilding entries (World), shoot locations (Locations), writer sections, and notes. IMPORTANT — write to LENGTH for the chosen `type`: a movie/feature must reach feature length (aim ~48 scenes / ~1100 script lines), not a short sketch. You won't fit a whole feature in one call, so build the opening batch here, then call add_to_story repeatedly until the returned progress note says it's at full length. Returns the story id + a length-progress note. To keep writing into THIS story afterward, pass that id to add_to_story.",
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        logline: { type: 'string' },
        synopsis: { type: 'string' },
        theme: { type: 'string' },
        genre: { type: 'string' },
        type: { type: 'string', description: 'movie | tv-series | short-film | youtube | music-video | commercial | documentary | stage-play | animation (default movie)' },
        instructions: { type: 'string', description: 'Author/style instructions shown in the app.' },
        outline: { type: 'array', items: { type: 'string' }, description: 'Ordered story beats / outline points (Outline view).' },
        sections: SECTIONS_ITEMS,
        characters: CHARACTER_ITEMS,
        acts: ACTS_ITEMS,
        scenes: SCENE_ITEMS,
        screenplay: SCREENPLAY_ITEMS,
        world: WORLD_ITEMS,
        locations: LOCATION_ITEMS,
        notes: NOTE_ITEMS,
      },
      required: ['title'],
    },
  },
  {
    name: 'get_story',
    description: "Read an existing story's current state — title, characters, scene names, and the screenplay scene-headings already written — so you know exactly where to continue from without repeating anything. Call this before add_to_story when resuming a long build.",
    inputSchema: { type: 'object', properties: { storyId: { type: 'string', description: 'The story id (from build_story / list_stories).' } }, required: ['storyId'] },
  },
  {
    name: 'add_to_story',
    description:
      "Append MORE material to an EXISTING story (identified by storyId) — the way to build a full feature across several calls. Pass only the NEW content; it continues numbering, ordering and colors automatically and never overwrites what's there. You can append ANY part the app supports: screenplay scene-blocks, director scenes with shots + b-rolls, characters (merged by name), acts/beats, worldbuilding entries, locations, writer sections, and notes. Keep calling this repeatedly (e.g. scenes 1–15, then 16–30, then 31–48…) until the returned length-progress note reports the story has reached full length for its type — a feature film should NOT stop at a handful of scenes.",
    inputSchema: {
      type: 'object',
      properties: {
        storyId: { type: 'string', description: 'The id of the story to add to (from build_story / list_stories / get_story).' },
        title: { type: 'string', description: 'Optional — update the title.' },
        logline: { type: 'string' }, synopsis: { type: 'string' }, theme: { type: 'string' }, genre: { type: 'string' },
        instructions: { type: 'string', description: 'Optional — update author/style instructions.' },
        outline: { type: 'array', items: { type: 'string' }, description: 'Additional outline points (appended).' },
        sections: SECTIONS_ITEMS,
        characters: CHARACTER_ITEMS,
        acts: ACTS_ITEMS,
        scenes: SCENE_ITEMS,
        screenplay: { ...SCREENPLAY_ITEMS, description: 'The NEXT batch of ordered scene blocks to append to the script.' },
        world: WORLD_ITEMS,
        locations: LOCATION_ITEMS,
        notes: NOTE_ITEMS,
      },
      required: ['storyId'],
    },
  },
  {
    name: 'set_shot_frame',
    description:
      "Attach a generated FRAME IMAGE to a specific shot's storyboard — the bridge from an image generator (e.g. a Runway connector's generate_image) back into Kindling. Workflow: generate the image elsewhere, get its URL, then call this with the story + which scene/shot + which frame. Use frame='first' for the opening frame (the shot's storyboard) and frame='last' for the end frame of a first→last transition (which the app uses to drive image-to-video). Identify the shot by scene (1-based number OR exact scene name) and shot (1-based index within that scene). Call get_story first to see scene/shot indices and which frames already exist. Pass a hosted image URL when possible (not base64) — the story document has a size limit.",
    inputSchema: {
      type: 'object',
      properties: {
        storyId: { type: 'string', description: 'The story id (from build_story / list_stories / get_story).' },
        scene: { type: ['string', 'number'], description: '1-based scene number (e.g. 1 for the first scene) OR the exact scene name.' },
        shot: { type: 'number', description: '1-based index of the shot within that scene (1 = first shot).' },
        frame: { type: 'string', enum: ['first', 'last'], description: "Which frame to set. 'first' = the opening storyboard frame; 'last' = the end frame of a first→last transition (also marks the shot as needsLastFrame).", },
        imageUrl: { type: 'string', description: 'URL of the generated image to attach (e.g. a Runway output URL). A data: URL also works but counts against the document size limit.' },
      },
      required: ['storyId', 'scene', 'shot', 'imageUrl'],
    },
  },
];

async function callTool(env, name, args) {
  const auth = await signIn(env);
  const appUrl = env.APP_URL || DEFAULTS.APP_URL;

  if (name === 'list_stories') {
    const list = await listStoryDocs(env, auth);
    const text = list.length
      ? 'Your Kindling stories:\n' + list.map((s) => `- ${s.title} (id: ${s.id})`).join('\n')
      : 'No stories yet.';
    return { content: [{ type: 'text', text }] };
  }

  if (name === 'build_story') {
    const storyId = genId('story');
    const data = buildStoryData(args || {});
    await writeStoryDoc(env, auth, storyId, args.title || 'Untitled', JSON.stringify(data));
    const counts = [
      `${data.characters.length} characters`,
      `${data.plotBoard.acts.length} acts`,
      `${Object.keys(data.beats).length} beats`,
      `${data.scenes.length} scenes`,
      `${Object.keys(data.shots).length} shots`,
      `${data.screenplay.elements.length} screenplay lines`,
      `${(data.screenplay.world || []).length} world items`,
      `${(data.screenplay.locations || []).length} locations`,
      `${(data.notes || []).length} notes`,
    ].join(', ');
    return {
      content: [{
        type: 'text',
        text: `✅ Built "${args.title}" in Kindling (${counts}).\n${progressNote(data.screenplay.type, data.scenes.length, data.screenplay.elements.length)}\nStory id: ${storyId}  ← pass this to add_to_story to keep writing into THIS story.\nOpen it: ${appUrl}`,
      }],
    };
  }

  if (name === 'get_story') {
    const { title, data } = await readStoryData(env, auth, args.storyId);
    const sp = data.screenplay || {};
    const sceneNames = (data.scenes || []).map((s) => s.name);
    const charNames = (data.characters || []).map((c) => c.name);
    const headings = (sp.elements || []).filter((e) => e.type === 'scene-heading').map((e) => e.content);
    const allShots = data.shots && typeof data.shots === 'object' ? data.shots : {};
    // Per-scene shot breakdown with 1-based indices + frame status so the
    // caller can target set_shot_frame precisely.
    const sceneShots = (data.scenes || []).map((s, si) => ({
      scene: si + 1,
      name: s.name,
      shots: (s.shotIds || []).map((id, shi) => {
        const sh = allShots[id] || {};
        return {
          shot: shi + 1,
          shotType: sh.shotType || '',
          description: sh.description || '',
          hasFirstFrame: !!sh.storyboard,
          hasLastFrame: !!sh.lastFrame,
          needsLastFrame: !!sh.needsLastFrame,
          lastFrameDescription: sh.lastFrameDescription || '',
        };
      }),
    }));
    const target = targetFor(sp.type);
    const lineCount = (sp.elements || []).length;
    const summary = {
      title,
      type: sp.type || 'movie',
      lengthTarget: `~${target.scenes} scenes / ~${target.lines} script lines for a ${target.label}`,
      lengthProgress: progressNote(sp.type, (data.scenes || []).length, lineCount),
      logline: sp.logline || '',
      genre: sp.genre || '',
      theme: sp.theme || '',
      characters: charNames,
      actCount: (data.plotBoard?.acts || []).length,
      beatCount: Object.keys(data.beats || {}).length,
      sceneCount: sceneNames.length,
      sceneNames,
      shotCount: Object.keys(allShots).length,
      sceneShots,
      screenplayLineCount: (sp.elements || []).length,
      screenplaySceneHeadings: headings,
      lastHeading: headings[headings.length - 1] || '(none yet)',
      sections: (sp.sections || []).map((s) => s.name),
      worldItems: (sp.world || []).map((w) => `${w.name} (${w.kind})`),
      locations: (sp.locations || []).map((l) => l.name),
      noteCount: (data.notes || []).length,
    };
    return { content: [{ type: 'text', text: `"${title}" current state:\n${JSON.stringify(summary, null, 2)}\n\nTo continue writing, call add_to_story. To attach a generated frame image to a shot, call set_shot_frame with the scene + shot numbers shown under sceneShots.` }] };
  }

  if (name === 'add_to_story') {
    if (!args.storyId) throw new Error('add_to_story needs a storyId. Use list_stories or get_story to find it, or the id printed by build_story.');
    const { title, data } = await readStoryData(env, auth, args.storyId);
    const before = {
      lines: (data.screenplay?.elements || []).length,
      scenes: (data.scenes || []).length,
      chars: (data.characters || []).length,
      beats: Object.keys(data.beats || {}).length,
      world: (data.screenplay?.world || []).length,
      locations: (data.screenplay?.locations || []).length,
      notes: (data.notes || []).length,
    };
    const merged = appendToStoryData(data, args || {});
    const newTitle = (typeof args.title === 'string' && args.title) ? args.title : title;
    await writeStoryDoc(env, auth, args.storyId, newTitle, JSON.stringify(merged));
    const delta = (n, label) => (n > 0 ? `+${n} ${label}` : null);
    const added = [
      delta(merged.scenes.length - before.scenes, 'scenes'),
      delta(merged.screenplay.elements.length - before.lines, 'screenplay lines'),
      delta(merged.characters.length - before.chars, 'characters'),
      delta(Object.keys(merged.beats).length - before.beats, 'beats'),
      delta((merged.screenplay.world || []).length - before.world, 'world items'),
      delta((merged.screenplay.locations || []).length - before.locations, 'locations'),
      delta((merged.notes || []).length - before.notes, 'notes'),
    ].filter(Boolean).join(', ') || 'no new items (nothing to add?)';
    return {
      content: [{
        type: 'text',
        text: `✅ Added to "${newTitle}": ${added}. Now ${merged.scenes.length} scenes / ${merged.screenplay.elements.length} screenplay lines total.\n${progressNote(merged.screenplay.type, merged.scenes.length, merged.screenplay.elements.length)}\nStory id: ${args.storyId} — call add_to_story again for the next batch.`,
      }],
    };
  }

  if (name === 'set_shot_frame') {
    if (!args.storyId) throw new Error('set_shot_frame needs a storyId.');
    if (!args.imageUrl || !String(args.imageUrl).trim()) throw new Error('set_shot_frame needs an imageUrl (the generated frame to attach).');
    const { title, data } = await readStoryData(env, auth, args.storyId);
    const scenes = Array.isArray(data.scenes) ? data.scenes : [];
    const shotsMap = data.shots && typeof data.shots === 'object' ? data.shots : {};
    if (!scenes.length) throw new Error('This story has no director scenes/shots yet. Add scenes with shots first (build_story / add_to_story).');

    // Resolve the scene: accept a 1-based number, a numeric string, or a name.
    let sceneObj = null;
    const sArg = args.scene;
    if (typeof sArg === 'number' || (typeof sArg === 'string' && /^\d+$/.test(sArg.trim()))) {
      const idx = Number(typeof sArg === 'string' ? sArg.trim() : sArg) - 1;
      sceneObj = scenes[idx] || null;
    }
    if (!sceneObj && typeof sArg === 'string') {
      const needle = sArg.trim().toLowerCase();
      sceneObj = scenes.find((s) => String(s.name || '').trim().toLowerCase() === needle) || null;
    }
    if (!sceneObj) throw new Error(`Could not find scene "${args.scene}". Call get_story to see scene numbers/names (sceneShots).`);

    const shotIdx = Number(args.shot) - 1;
    const shotId = (sceneObj.shotIds || [])[shotIdx];
    const shot = shotId ? shotsMap[shotId] : null;
    if (!shot) throw new Error(`Scene "${sceneObj.name}" has no shot #${args.shot}. It has ${(sceneObj.shotIds || []).length} shot(s). Call get_story to check.`);

    const frame = String(args.frame || 'first').toLowerCase() === 'last' ? 'last' : 'first';
    if (frame === 'last') {
      shot.lastFrame = String(args.imageUrl);
      shot.needsLastFrame = true;
    } else {
      shot.storyboard = String(args.imageUrl);
    }
    data.exportedAt = Date.now();
    await writeStoryDoc(env, auth, args.storyId, title, JSON.stringify(data));
    return {
      content: [{
        type: 'text',
        text: `✅ Set the ${frame} frame on scene "${sceneObj.name}" (scene ${scenes.indexOf(sceneObj) + 1}), shot #${args.shot}${shot.shotType ? ` (${shot.shotType})` : ''}. It will appear in Kindling's Director + Storyboard views.\nOpen it: ${appUrl}`,
      }],
    };
  }

  throw new Error(`Unknown tool: ${name}`);
}

// ─── MCP JSON-RPC handler ─────────────────────────────────────────────────
async function handleRpc(env, msg) {
  const { id, method, params } = msg;
  try {
    if (method === 'initialize') {
      return rpcResult(id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: 'kindling-connector', version: '1.0.0' },
      });
    }
    if (method === 'notifications/initialized' || method === 'notifications/cancelled') {
      return null; // notifications get no response
    }
    if (method === 'ping') return rpcResult(id, {});
    if (method === 'tools/list') return rpcResult(id, { tools: TOOLS });
    if (method === 'tools/call') {
      const result = await callTool(env, params?.name, params?.arguments || {});
      return rpcResult(id, result);
    }
    return rpcError(id, -32601, `Method not found: ${method}`);
  } catch (e) {
    // Surface tool errors as a readable text result so Claude shows them.
    if (method === 'tools/call') {
      return rpcResult(id, { isError: true, content: [{ type: 'text', text: `Error: ${e.message || e}` }] });
    }
    return rpcError(id, -32603, String(e.message || e));
  }
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });

    // A friendly GET page so you can confirm the Worker is live.
    if (request.method === 'GET') {
      return new Response(
        'Kindling Connector is running. Add this URL as a custom connector in Claude (Settings → Connectors → Add custom connector).',
        { headers: { 'Content-Type': 'text/plain', ...cors } },
      );
    }

    if (request.method !== 'POST') return json(rpcError(null, -32600, 'Use POST'), 405);

    let body;
    try { body = await request.json(); } catch { return json(rpcError(null, -32700, 'Parse error'), 400); }

    // Support a single JSON-RPC message or a batch array.
    if (Array.isArray(body)) {
      const out = [];
      for (const m of body) { const r = await handleRpc(env, m); if (r) out.push(r); }
      return json(out);
    }
    const res = await handleRpc(env, body);
    if (res === null) return new Response(null, { status: 202, headers: cors });
    return json(res);
  },
};
