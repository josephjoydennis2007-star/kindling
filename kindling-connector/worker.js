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

// ─── Build the Kindling story object (the shape importStory() expects) ────
// Input is the high-level spec Claude provides. Output is the exact
// { screenplay, scenes, shots, bRolls, characters, plotBoard, beats, notes }
// object Kindling loads.
function buildStoryData(spec) {
  const screenplayElements = [];
  // screenplay: array of scene blocks → flat ScreenplayElement[]
  for (const sc of (spec.screenplay || [])) {
    if (sc.heading) screenplayElements.push({ id: genId('el'), type: 'scene-heading', content: String(sc.heading).toUpperCase(), sceneId: null });
    if (sc.action) screenplayElements.push({ id: genId('el'), type: 'action', content: String(sc.action), sceneId: null });
    for (const d of (sc.dialogue || [])) {
      if (d.character) screenplayElements.push({ id: genId('el'), type: 'character', content: String(d.character).toUpperCase(), sceneId: null });
      if (d.parenthetical) screenplayElements.push({ id: genId('el'), type: 'parenthetical', content: `(${String(d.parenthetical).replace(/^\(|\)$/g, '')})`, sceneId: null });
      if (d.line) screenplayElements.push({ id: genId('el'), type: 'dialogue', content: String(d.line), sceneId: null });
    }
  }

  // characters
  const COLORS = ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ef4444', '#14b8a6'];
  const characters = (spec.characters || []).map((c, i) => ({
    id: genId('char'),
    name: String(c.name || 'CHARACTER').toUpperCase(),
    displayName: c.name || 'Character',
    description: c.description || '',
    color: COLORS[i % COLORS.length],
    image: null,
    backstory: c.backstory || '',
    goals: c.goals || '',
    personality: c.personality || '',
    age: c.age != null ? String(c.age) : '',
    occupation: c.occupation || '',
    motivation: c.motivation || '',
    conflict: c.conflict || '',
    relationships: c.relationships || '',
    notes: c.notes || '',
    voiceAudio: null,
    tags: [],
    createdAt: Date.now(),
    archetype: c.archetype || '',
    voiceOf: c.voiceOf || '',
    want: c.want || '',
    need: c.need || '',
    fear: c.fear || '',
    secret: c.secret || '',
    pronouns: c.pronouns || '',
    imagePrompt: c.imagePrompt || '',
  }));

  // scenes + shots
  const scenes = [];
  const shots = {};
  for (const s of (spec.scenes || [])) {
    const sceneId = genId('scene');
    const shotIds = [];
    for (const sh of (s.shots || [])) {
      const shotId = genId('shot');
      shots[shotId] = {
        id: shotId,
        sceneId,
        description: sh.description || '',
        shotType: sh.shotType || '',
        camera: sh.camera || '',
        lens: sh.lens || '',
        durationSec: typeof sh.durationSec === 'number' ? sh.durationSec : 0,
        audioNote: sh.audioNote || '',
        image: null,
        status: 'todo',
      };
      shotIds.push(shotId);
    }
    scenes.push({
      id: sceneId,
      name: s.name || 'Scene',
      description: s.description || '',
      content: '',
      shotIds,
      status: 'todo',
      color: '',
    });
  }

  // plot board: acts + beats
  const acts = [];
  const beats = {};
  (spec.acts || []).forEach((a, ai) => {
    const actId = genId('act');
    const beatIds = [];
    (a.beats || []).forEach((b, bi) => {
      const beatId = genId('beat');
      beats[beatId] = {
        id: beatId,
        actId,
        title: b.title || '',
        description: b.description || '',
        tags: [],
        color: '',
        order: bi,
      };
      beatIds.push(beatId);
    });
    acts.push({ id: actId, title: String(a.title || `ACT ${ai + 1}`).toUpperCase(), beatIds, order: ai });
  });

  const screenplay = {
    title: spec.title || 'Untitled',
    logline: spec.logline || '',
    synopsis: spec.synopsis || '',
    theme: spec.theme || '',
    genre: spec.genre || '',
    type: spec.type || 'movie',
    instructions: spec.instructions || '',
    outlinePoints: Array.isArray(spec.outline) ? spec.outline : [],
    elements: screenplayElements,
    sections: [],
    assets: [],
    world: [],
    locations: [],
  };

  return {
    screenplay,
    scenes,
    shots,
    bRolls: {},
    characters,
    plotBoard: { acts },
    beats,
    notes: [],
    version: '2.0',
    exportedAt: Date.now(),
  };
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
        text: `✅ Built "${args.title}" in Kindling (${counts}). Open it: ${appUrl}\nIt will appear in your story list the next time you open the app signed in.`,
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
