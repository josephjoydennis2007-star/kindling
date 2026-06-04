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

  // ---- Story metadata ----
  t('setTitle', 'Set the story title.', { text: str('The title') }, ['text']),
  t('setLogline', 'Set the one-sentence logline.', { text: str('Logline') }, ['text']),
  t('setSynopsis', 'Set the 1–2 paragraph synopsis.', { text: str('Synopsis') }, ['text']),
  t('setTheme', 'Set the story\'s thematic statement.', { text: str('Theme') }, ['text']),
  t('addOutlinePoint', 'Append one outline/treatment point.', { text: str('One story beat') }, ['text']),

  // ---- Writer (screenplay) ----
  t('writeScreenplay', 'Write a full block of screenplay (Fountain-ish). The parser detects headings/dialogue/action automatically. Use this for "write a scene" — put a LOT of prose here. ONE scene per call.',
    { text: str('Multi-line screenplay text: scene heading, action, CHARACTER cues, dialogue') }, ['text']),
  t('addSceneHeading', 'Insert a scene heading, e.g. "INT. WAREHOUSE - NIGHT".', { text: str('Slugline') }, ['text']),
  t('addAction', 'Insert an action/description line.', { text: str('Action text') }, ['text']),
  t('addDialogue', 'Insert a dialogue line (call addCharacterCue first).', { text: str('Dialogue') }, ['text']),
  t('addCharacterCue', 'Insert an UPPERCASE character cue before dialogue.', { name: str('Character name') }, ['name']),

  // ---- Characters ----
  t('createCharacter', 'Create a character with an arc.',
    { name: str('Name'), description: str('Short description'), archetype: str('e.g. The Mentor'), want: str('What they consciously want'), fear: str('Deepest fear') },
    ['name']),
  t('updateCharacter', 'Update an existing character (match by name or id).',
    { character: str('Name or id'), description: str('New description'), want: str('Want'), fear: str('Fear'), backstory: str('Backstory'), motivation: str('Motivation') },
    ['character']),

  // ---- Director ----
  t('createScene', 'Create a Director scene (sets it active).', { name: str('Scene name'), description: str('One-line description') }, ['name']),
  t('updateSceneDescription', 'Update a scene\'s description (match by name/id).', { scene: str('Name or id'), description: str('New description') }, ['scene', 'description']),
  t('addShot', 'Add a shot to a scene.',
    { scene: str('Scene name or id'), description: str('What the shot shows'), shotType: { type: 'string', enum: ['WIDE', 'MEDIUM', 'CLOSE-UP', 'EXTREME CLOSE-UP', 'OVER-THE-SHOULDER', 'POV', 'ESTABLISHING', 'INSERT', 'AERIAL'], description: 'Shot type' }, camera: str('Camera/movement note') },
    ['scene']),

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

/** Models / providers known to support OpenAI-style tool calling. */
export function providerSupportsTools(provider: string, model: string): boolean {
  if (provider === 'openai' || provider === 'openrouter') return true;
  if (provider === 'groq') {
    // Groq supports tools on the llama-3.3 + llama-3.1 + mixtral lines.
    return /llama-3|mixtral|qwen|gemma2/i.test(model);
  }
  // builtin (Pollinations) + gemini use the JSON-prompt fallback —
  // Pollinations' tool support is unreliable; Gemini uses a different
  // function-calling shape we handle separately.
  return false;
}
