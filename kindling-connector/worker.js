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

// screenplay scene-blocks → flat ScreenplayElement[]
function makeElements(blocks) {
  const els = [];
  for (const sc of (blocks || [])) {
    if (sc.heading) els.push({ id: genId('el'), type: 'scene-heading', content: String(sc.heading).toUpperCase(), sceneId: null });
    if (sc.action) els.push({ id: genId('el'), type: 'action', content: String(sc.action), sceneId: null });
    for (const d of (sc.dialogue || [])) {
      if (d.character) els.push({ id: genId('el'), type: 'character', content: String(d.character).toUpperCase(), sceneId: null });
      if (d.parenthetical) els.push({ id: genId('el'), type: 'parenthetical', content: `(${String(d.parenthetical).replace(/^\(|\)$/g, '')})`, sceneId: null });
      if (d.line) els.push({ id: genId('el'), type: 'dialogue', content: String(d.line), sceneId: null });
    }
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

// scenes (+ shots, written into shotsOut) starting at a given index/order so
// appended scenes continue numbering + colors from what's already there.
function makeScenes(list, startSceneIndex, startShotOrder, shotsOut) {
  let shotOrder = startShotOrder;
  return (list || []).map((s, i) => {
    const idx = startSceneIndex + i;
    const sceneId = genId('scene');
    const shotIds = [];
    for (const sh of (s.shots || [])) {
      const shotId = genId('shot');
      shotsOut[shotId] = {
        id: shotId, sceneId, description: sh.description || '', shotType: sh.shotType || '',
        camera: sh.camera || '', bRollIds: [], order: shotOrder++, lens: sh.lens || '',
        durationSec: typeof sh.durationSec === 'number' ? sh.durationSec : 0, audioNote: sh.audioNote || '',
      };
      shotIds.push(shotId);
    }
    const name = s.name || `Scene ${idx + 1}`;
    return { id: sceneId, name, heading: name, content: '', description: s.description || '', color: SCENE_COLORS[idx % SCENE_COLORS.length], status: 'todo', shotIds, order: idx };
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
      beatsOut[beatId] = { id: beatId, actId, title: b.title || '', description: b.description || '', tags: [], color: BEAT_COLORS[beatCount % BEAT_COLORS.length], order: bi };
      beatIds.push(beatId);
      beatCount++;
    });
    return { id: actId, title: String(a.title || `ACT ${startActIndex + ai + 1}`).toUpperCase(), beatIds, order: startActIndex + ai };
  });
}

// Build a brand-new story from a full spec.
function buildStoryData(spec) {
  const shots = {};
  const beats = {};
  const characters = (spec.characters || []).map(makeCharacter);
  const scenes = makeScenes(spec.scenes, 0, 0, shots);
  const acts = makeActs(spec.acts, 0, 0, beats);
  const screenplay = {
    title: spec.title || 'Untitled', logline: spec.logline || '', synopsis: spec.synopsis || '',
    theme: spec.theme || '', genre: spec.genre || '', type: spec.type || 'movie', instructions: spec.instructions || '',
    outlinePoints: Array.isArray(spec.outline) ? spec.outline : [], elements: makeElements(spec.screenplay),
    sections: [], assets: [], world: [], locations: [],
  };
  return { screenplay, scenes, shots, bRolls: {}, characters, plotBoard: { acts }, beats, notes: [], version: '2.0', exportedAt: Date.now() };
}

// Append more material to an EXISTING story's data object (for add_to_story).
// Continues IDs/order/colors and dedupes characters by name.
function appendToStoryData(existing, spec) {
  const data = existing && typeof existing === 'object' ? existing : {};
  data.screenplay = data.screenplay || {};
  data.screenplay.elements = Array.isArray(data.screenplay.elements) ? data.screenplay.elements : [];
  data.scenes = Array.isArray(data.scenes) ? data.scenes : [];
  data.shots = data.shots && typeof data.shots === 'object' ? data.shots : {};
  data.characters = Array.isArray(data.characters) ? data.characters : [];
  data.plotBoard = data.plotBoard && Array.isArray(data.plotBoard.acts) ? data.plotBoard : { acts: [] };
  data.beats = data.beats && typeof data.beats === 'object' ? data.beats : {};

  if (Array.isArray(spec.screenplay) && spec.screenplay.length) {
    data.screenplay.elements = data.screenplay.elements.concat(makeElements(spec.screenplay));
  }
  if (Array.isArray(spec.scenes) && spec.scenes.length) {
    const newScenes = makeScenes(spec.scenes, data.scenes.length, Object.keys(data.shots).length, data.shots);
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
  if (Array.isArray(spec.outline) && spec.outline.length) {
    data.screenplay.outlinePoints = (Array.isArray(data.screenplay.outlinePoints) ? data.screenplay.outlinePoints : []).concat(spec.outline);
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
      "Create a COMPLETE new story in Kindling from a full spec and save it to the user's account. Provide as much as you can: title, logline, synopsis, theme, genre, the character roster, the acts+beats, the scene list with shots, and the screenplay (ordered scene blocks). Kindling will show all of it. Returns the story id + a link to open it.",
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        logline: { type: 'string' },
        synopsis: { type: 'string' },
        theme: { type: 'string' },
        genre: { type: 'string' },
        type: { type: 'string', description: "movie | series | short | video (default movie)" },
        outline: { type: 'array', items: { type: 'string' }, description: 'Ordered story beats / outline points' },
        characters: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' }, age: { type: 'string' }, pronouns: { type: 'string' },
              occupation: { type: 'string' }, archetype: { type: 'string' }, personality: { type: 'string' },
              want: { type: 'string' }, need: { type: 'string' }, fear: { type: 'string' },
              backstory: { type: 'string' }, relationships: { type: 'string' },
              imagePrompt: { type: 'string', description: 'Appearance for image gen: face, body, side view' },
            },
            required: ['name'],
          },
        },
        acts: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              beats: { type: 'array', items: { type: 'object', properties: { title: { type: 'string' }, description: { type: 'string' } } } },
            },
          },
        },
        scenes: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' }, description: { type: 'string' },
              shots: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    description: { type: 'string' }, shotType: { type: 'string' }, camera: { type: 'string' },
                    lens: { type: 'string' }, durationSec: { type: 'number' }, audioNote: { type: 'string' },
                  },
                },
              },
            },
          },
        },
        screenplay: {
          type: 'array',
          description: 'Ordered scene blocks of the actual script.',
          items: {
            type: 'object',
            properties: {
              heading: { type: 'string', description: 'e.g. INT. WAREHOUSE - NIGHT' },
              action: { type: 'string' },
              dialogue: {
                type: 'array',
                items: { type: 'object', properties: { character: { type: 'string' }, parenthetical: { type: 'string' }, line: { type: 'string' } } },
              },
            },
          },
        },
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
      "Append MORE material to an EXISTING story (identified by storyId) — the way to build a full feature across several calls. Pass only the NEW content: the next batch of screenplay scene-blocks, and/or more director scenes with shots, characters, or acts/beats. It continues numbering, ordering and colors automatically and never overwrites what's there. Use this repeatedly (e.g. scenes 1–15, then 16–30, then 31–45) to write a complete movie into ONE story.",
    inputSchema: {
      type: 'object',
      properties: {
        storyId: { type: 'string', description: 'The id of the story to add to (from build_story / list_stories / get_story).' },
        title: { type: 'string', description: 'Optional — update the title.' },
        logline: { type: 'string' }, synopsis: { type: 'string' }, theme: { type: 'string' }, genre: { type: 'string' },
        outline: { type: 'array', items: { type: 'string' }, description: 'Additional outline points (appended).' },
        characters: {
          type: 'array',
          description: 'New characters to add (existing names are merged, not duplicated).',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' }, age: { type: 'string' }, pronouns: { type: 'string' },
              occupation: { type: 'string' }, archetype: { type: 'string' }, personality: { type: 'string' },
              want: { type: 'string' }, need: { type: 'string' }, fear: { type: 'string' },
              backstory: { type: 'string' }, relationships: { type: 'string' }, imagePrompt: { type: 'string' },
            },
            required: ['name'],
          },
        },
        acts: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              beats: { type: 'array', items: { type: 'object', properties: { title: { type: 'string' }, description: { type: 'string' } } } },
            },
          },
        },
        scenes: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' }, description: { type: 'string' },
              shots: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    description: { type: 'string' }, shotType: { type: 'string' }, camera: { type: 'string' },
                    lens: { type: 'string' }, durationSec: { type: 'number' }, audioNote: { type: 'string' },
                  },
                },
              },
            },
          },
        },
        screenplay: {
          type: 'array',
          description: 'The NEXT batch of ordered scene blocks to append to the script.',
          items: {
            type: 'object',
            properties: {
              heading: { type: 'string' },
              action: { type: 'string' },
              dialogue: { type: 'array', items: { type: 'object', properties: { character: { type: 'string' }, parenthetical: { type: 'string' }, line: { type: 'string' } } } },
            },
          },
        },
      },
      required: ['storyId'],
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
    const counts = `${data.characters.length} characters, ${data.plotBoard.acts.length} acts, ${Object.keys(data.beats).length} beats, ${data.scenes.length} scenes, ${data.screenplay.elements.length} screenplay lines`;
    return {
      content: [{
        type: 'text',
        text: `✅ Built "${args.title}" in Kindling (${counts}).\nStory id: ${storyId}  ← pass this to add_to_story to keep writing into THIS movie.\nOpen it: ${appUrl}`,
      }],
    };
  }

  if (name === 'get_story') {
    const { title, data } = await readStoryData(env, auth, args.storyId);
    const sp = data.screenplay || {};
    const sceneNames = (data.scenes || []).map((s) => s.name);
    const charNames = (data.characters || []).map((c) => c.name);
    const headings = (sp.elements || []).filter((e) => e.type === 'scene-heading').map((e) => e.content);
    const summary = {
      title,
      logline: sp.logline || '',
      characters: charNames,
      actCount: (data.plotBoard?.acts || []).length,
      sceneCount: sceneNames.length,
      sceneNames,
      screenplayLineCount: (sp.elements || []).length,
      screenplaySceneHeadings: headings,
      lastHeading: headings[headings.length - 1] || '(none yet)',
    };
    return { content: [{ type: 'text', text: `"${title}" current state:\n${JSON.stringify(summary, null, 2)}\n\nTo continue, call add_to_story with storyId "${args.storyId}" and the NEXT scenes/screenplay (don't repeat what's already there).` }] };
  }

  if (name === 'add_to_story') {
    if (!args.storyId) throw new Error('add_to_story needs a storyId. Use list_stories or get_story to find it, or the id printed by build_story.');
    const { title, data } = await readStoryData(env, auth, args.storyId);
    const beforeLines = (data.screenplay?.elements || []).length;
    const beforeScenes = (data.scenes || []).length;
    const merged = appendToStoryData(data, args || {});
    const newTitle = (typeof args.title === 'string' && args.title) ? args.title : title;
    await writeStoryDoc(env, auth, args.storyId, newTitle, JSON.stringify(merged));
    const addedLines = (merged.screenplay.elements.length - beforeLines);
    const addedScenes = (merged.scenes.length - beforeScenes);
    return {
      content: [{
        type: 'text',
        text: `✅ Added to "${newTitle}": +${addedScenes} scenes, +${addedLines} screenplay lines. Now ${merged.scenes.length} scenes / ${merged.screenplay.elements.length} lines total.\nStory id: ${args.storyId} — call add_to_story again for the next batch.`,
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
