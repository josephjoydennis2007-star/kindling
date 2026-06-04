/**
 * agentToolSchemas — OpenAI-compatible function/tool schemas for the
 * agent's action vocabulary.
 *
 * This is the NATIVE tool-calling path. Instead of asking the model to
 * "respond with one JSON object" (which kept truncating + failing to
 * parse), we send these schemas in the `tools` array of a standard
 * /chat/completions request. The model returns structured, server-
 * VALIDATED `tool_calls` — the API guarantees the JSON is well-formed,
 * so the truncation/parse-failure bug class is gone.
 *
 * Works with any OpenAI-compatible endpoint that supports tools:
 * OpenRouter, OpenAI, and Groq (llama-3.3-70b supports tool calling).
 *
 * The `name` of each schema MUST match a key in agentTools.TOOLS so the
 * runner can dispatch the call. We include the most-used ~25 tools to
 * keep the schema token cost reasonable; the long-tail edit/delete/list
 * tools remain available to the JSON-prompt fallback path.
 */

export interface OpenAITool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, any>;
      required?: string[];
    };
  };
}

function t(
  name: string,
  description: string,
  properties: Record<string, any>,
  required: string[] = [],
): OpenAITool {
  return {
    type: 'function',
    function: { name, description, parameters: { type: 'object', properties, required } },
  };
}

const str = (description: string) => ({ type: 'string', description });

export const AGENT_TOOLS: OpenAITool[] = [
  // ---- Navigation ----
  t('navigate', 'Switch the app to a tab so the user sees your work. Call before editing.',
    { tab: { type: 'string', enum: ['dashboard', 'writer', 'outline', 'world', 'director', 'plot', 'storyboard', 'calendar', 'locations', 'workspace'], description: 'Tab to open' } },
    ['tab']),

  // ---- Story plan (backend source of truth) ----
  t('getStoryPlan', 'Read the locked story plan (your source of truth). If it does not exist, design the whole story and call setStoryPlan FIRST before building anything.', {}, []),
  t('setStoryPlan', 'Lock the COMPLETE story plan ONCE so you build a fixed plan instead of re-inventing it (which causes duplicates). After this, build exactly this plan — no beats/characters/scenes that are not in it. Shown to you every turn.',
    {
      premise: str('One-paragraph spine of the whole story'),
      theme: str('Theme'), genre: str('Genre'),
      protagonist: str('Protagonist name'), antagonist: str('Antagonist name'),
      characters: { type: 'array', description: 'Full roster', items: { type: 'object', properties: { name: { type: 'string' }, role: { type: 'string' } }, required: ['name'] } },
      beats: { type: 'array', description: 'Ordered story beats (the outline spine)', items: { type: 'string' } },
      scenes: { type: 'array', description: 'Ordered scene names', items: { type: 'string' } },
    }, []),
  t('dedupeOutline', 'Remove near-duplicate outline points (clean up repetition).', {}, []),

  // ---- Build workflow (stay organized) ----
  t('getBuildStatus', 'ALWAYS call this FIRST. Returns hasPlan + the ordered build step you should work on next + exactly what already exists (outline, acts, characters, scenes, shots-per-scene) so you resume correctly and never repeat.', {}, []),
  t('markStepDone', 'Call when an ENTIRE step is finished. Announces "✓ … step done".', { step: { type: 'string', enum: ['instructions', 'acts', 'characters', 'screenplay', 'scenes'] } }, ['step']),
  t('dedupeScreenplay', 'Remove repeated/duplicated screenplay lines (fixes a model that repeated itself).', {}, []),

  // ---- Story metadata ----
  t('setTitle', 'Set the story title.', { text: str('The title') }, ['text']),
  t('setLogline', 'Set the one-sentence logline.', { text: str('Logline') }, ['text']),
  t('setSynopsis', 'Set the 1–2 paragraph synopsis.', { text: str('Synopsis') }, ['text']),
  t('setTheme', 'Set the story\'s thematic statement.', { text: str('Theme') }, ['text']),
  t('setInstructions', 'Set the instructions/notes field (story bible bar).', { text: str('Instructions') }, ['text']),
  t('addOutlinePoint', 'Append one outline/treatment point.', { text: str('One story beat') }, ['text']),

  // ---- Writer (screenplay) ----
  t('writeScreenplay', 'Write a full block of screenplay (Fountain-ish). The parser detects headings/dialogue/action automatically. Use this for "write a scene" — put a LOT of prose here. ONE scene per call.',
    { text: str('Multi-line screenplay text: scene heading, action, CHARACTER cues, dialogue') }, ['text']),
  t('addSceneHeading', 'Insert a scene heading, e.g. "INT. WAREHOUSE - NIGHT".', { text: str('Slugline') }, ['text']),
  t('addAction', 'Insert an action/description line.', { text: str('Action text') }, ['text']),
  t('addDialogue', 'Insert a dialogue line (call addCharacterCue first).', { text: str('Dialogue') }, ['text']),
  t('addCharacterCue', 'Insert an UPPERCASE character cue before dialogue.', { name: str('Character name') }, ['name']),

  // ---- Characters (FULL fields) ----
  t('createCharacter', 'Create a character — fill out as MANY fields as the story supports (always give age + imagePrompt). ONE profile per name: if the character already exists this MERGES into it, it never duplicates — so do not create the same name twice.',
    { name: str('Name'), description: str('Short description'), pronouns: str('e.g. she/her'), age: str('Age (always provide)'), occupation: str('Job/role'), archetype: str('e.g. The Mentor'), voiceOf: str('Speech style/dialect'), personality: str('Traits, demeanor'), want: str('What they consciously want'), need: str('What they actually need'), fear: str('Deepest fear'), secret: str('Hidden truth'), backstory: str('Backstory'), motivation: str('Motivation'), conflict: str('Core conflict'), relationships: str('Key relationships'), imagePrompt: str('Physical-appearance prompt for AI image gen: face, hair, build, apparent age, wardrobe, distinctive features + side-view/profile note (face, body, side view)') },
    ['name']),
  t('updateCharacter', 'Update an existing character (match by name or id). Any field, including imagePrompt.',
    { character: str('Name or id'), description: str('Description'), pronouns: str('Pronouns'), age: str('Age'), occupation: str('Occupation'), archetype: str('Archetype'), voiceOf: str('Voice'), personality: str('Personality'), want: str('Want'), need: str('Need'), fear: str('Fear'), secret: str('Secret'), backstory: str('Backstory'), motivation: str('Motivation'), conflict: str('Conflict'), relationships: str('Relationships'), imagePrompt: str('Appearance prompt: face, body, side view') },
    ['character']),
  t('mergeDuplicateCharacters', 'Collapse same-name character cards into ONE profile each (merges fields, keeps earliest). Use to clean up duplicate characters.', {}, []),

  // ---- Director ----
  t('createScene', 'Create a Director scene (sets it active).', { name: str('Scene name'), description: str('One-line description') }, ['name']),
  t('updateSceneDescription', 'Update a scene\'s description (match by name/id).', { scene: str('Name or id'), description: str('New description') }, ['scene', 'description']),
  t('addShot', 'Add a shot to a scene. Give each scene the NUMBER OF SHOTS the story needs — vary it, don\'t use a fixed count.',
    { scene: str('Scene name or id'), description: str('What the shot shows'), shotType: { type: 'string', enum: ['WIDE', 'MEDIUM', 'CLOSE-UP', 'EXTREME CLOSE-UP', 'OVER-THE-SHOULDER', 'POV', 'ESTABLISHING', 'INSERT', 'AERIAL'], description: 'Shot type' }, camera: str('Camera/movement note'), lens: str('Lens, e.g. 35mm, 85mm anamorphic'), durationSec: { type: 'number', description: 'Shot length in seconds' }, audioNote: str('SFX/music/ambience cue') },
    ['scene']),
  t('addBRoll', 'Add b-roll (supplementary footage) to a shot.',
    { shot: str('Shot id or scene name'), description: str('What the b-roll shows') }, ['shot']),

  // ---- Plot ----
  t('createAct', 'Create a plot act.', { title: str('Act title, e.g. ACT ONE') }, []),
  t('addBeat', 'Add a beat to an act (match by act name/id).', { act: str('Act name or id'), title: str('Beat title'), description: str('Beat description') }, ['act']),

  // ---- World ----
  t('addWorldItem', 'Add a worldbuilding item.',
    { kind: { type: 'string', enum: ['location', 'lore', 'rule', 'faction', 'item', 'term'], description: 'Category' }, name: str('Name'), body: str('Description') },
    ['kind', 'name']),

  // ---- Locations ----
  t('addLocation', 'Add a production location.',
    { name: str('Name'), address: str('Address'), intExt: { type: 'string', enum: ['int', 'ext', 'both'] }, timeOfDay: { type: 'string', enum: ['day', 'night', 'both'] }, cost: str('Cost estimate'), notes: str('Notes') },
    ['name']),

  // ---- Read-back ----
  t('listScenes', 'List existing scenes (read-only) so you reference real names/ids.', {}, []),
  t('listCharacters', 'List existing characters (read-only).', {}, []),
  t('getScreenplaySummary', 'Get current title/logline/synopsis/outline + first lines (read-only).', {}, []),

  // ---- Runway ----
  t('generateShotImage', 'Generate a Runway image for a shot (needs Runway key). Attaches to the shot if matched.',
    { shot: str('Scene name or shot id (optional)'), prompt: str('Image prompt') }, ['prompt']),

  // ---- Meta ----
  t('done', 'Call LAST when the user\'s entire goal is complete.', { summary: str('One-line summary of what you did') }, []),
];

/**
 * Which provider+model combos reliably support OpenAI-style tool calling.
 *
 * HARD-LEARNED: Groq's Llama models DON'T. They emit tool calls in their
 * own `<function=name{...}>` text format, which Groq's API then rejects
 * with a 400 `tool_use_failed`. So Groq (and OpenRouter when routed to a
 * Llama/Mistral/free model) must use the JSON-prompt loop instead, which
 * is genuinely more reliable for those models.
 *
 * Native tool-calling is therefore enabled ONLY for the model families
 * that handle the tools API correctly: OpenAI GPT, Anthropic Claude, and
 * Google Gemini-via-OpenRouter. Everything else → JSON-prompt fallback,
 * which is the path that was reliably making changes before.
 */
export function providerSupportsTools(provider: string, model: string): boolean {
  const m = (model || '').toLowerCase();
  if (provider === 'openai') return true; // GPT handles tools natively
  if (provider === 'openrouter') {
    // Only the big-lab models on OpenRouter do tools properly. Llama,
    // Mistral, Qwen, Gemma, DeepSeek, ":free" community models → no.
    return /(^|\/)(openai|gpt|anthropic|claude|google\/gemini)/i.test(m) && !m.includes(':free');
  }
  // groq / builtin / gemini / ollama / custom → JSON-prompt loop.
  return false;
}
