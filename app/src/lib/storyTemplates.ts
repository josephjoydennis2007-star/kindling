/**
 * Per-story-type templates.
 *
 * When the user picks "YouTube Vlog" they shouldn't get the same blank Feature
 * Film page as the next user. Each StoryType returns:
 *   - default sections (already-named, in the right order)
 *   - default screenplay elements (so the editor isn't empty)
 *   - a short blurb describing the format
 *   - the writer's "primary format" so toolbar defaults make sense
 */

import type { ScreenplayElement, Section, StoryType } from '@/types';

function id(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

const COLORS = ['#3b82f6', '#2a9d8f', '#e9c46a', '#9b5de5', '#f15bb5', '#00bbf9', '#fb5607', '#e76f51'];

function makeSections(names: string[]): Section[] {
  return names.map((name, i) => ({
    id: id('sec'),
    name,
    color: COLORS[i % COLORS.length],
    order: i,
  }));
}

function makeElements(blocks: { type: ScreenplayElement['type']; content: string; sceneId?: string | null }[]): ScreenplayElement[] {
  return blocks.map((b) => ({
    id: id('el'),
    type: b.type,
    content: b.content,
    sceneId: b.sceneId ?? null,
  }));
}

/** A toolbar format button — label shown to the user, underlying engine
 *  type the editor applies. Lets one type map to many user-facing buttons. */
export interface ToolbarFormat {
  label: string;
  format: ScreenplayElement['type'];
}

export interface StoryTemplate {
  /** Friendly label for the type */
  label: string;
  /** Short description for the new-story dialog */
  blurb: string;
  /** Primary writer format — what the toolbar should highlight first */
  primaryFormat: ScreenplayElement['type'];
  /** Default named sections for the writer's section bar */
  sections: Section[];
  /** Initial screenplay content (already typed in) */
  elements: ScreenplayElement[];
  /** Suggested logline placeholder */
  loglinePlaceholder: string;
  /** Suggested first scene heading (if applicable) */
  openingSceneHeading?: string;
  /** Format buttons shown in the writer's toolbar for this type. */
  toolbarFormats: ToolbarFormat[];
}

/* Screenplay-style format buttons (Movie, TV, Mini, Thriller, Doc, Short, Anim, Web) */
const SCREENPLAY_TOOLBAR: ToolbarFormat[] = [
  { label: 'Scene', format: 'scene-heading' },
  { label: 'Action', format: 'action' },
  { label: 'Character', format: 'character' },
  { label: 'Paren', format: 'parenthetical' },
  { label: 'Dialogue', format: 'dialogue' },
  { label: 'Trans', format: 'transition' },
];

/* Short-form / video toolbar (YouTube, Music Video, Commercial) */
const VIDEO_TOOLBAR: ToolbarFormat[] = [
  { label: 'Hook', format: 'scene-heading' },
  { label: 'Beat', format: 'action' },
  { label: 'On-Screen', format: 'character' },
  { label: 'B-roll', format: 'parenthetical' },
  { label: 'V.O.', format: 'dialogue' },
  { label: 'CTA / Cut', format: 'transition' },
];

/* Stage play toolbar */
const STAGE_TOOLBAR: ToolbarFormat[] = [
  { label: 'Scene', format: 'scene-heading' },
  { label: 'Stage Dir.', format: 'action' },
  { label: 'Speaker', format: 'character' },
  { label: 'Aside', format: 'parenthetical' },
  { label: 'Line', format: 'dialogue' },
  { label: 'Curtain', format: 'transition' },
];

/* ----- per-type templates ----- */

const movieTemplate: StoryTemplate = {
  label: 'Feature Film',
  blurb: '90–120 page screenplay. Three-act structure with scene headings, action, and dialogue.',
  primaryFormat: 'scene-heading',
  toolbarFormats: SCREENPLAY_TOOLBAR,
  sections: makeSections(['Act I — Setup', 'Act II — Confrontation', 'Act III — Resolution']),
  loglinePlaceholder: 'A [protagonist] must [goal] before [stakes].',
  openingSceneHeading: 'INT. SOMEWHERE — DAY',
  elements: makeElements([
    { type: 'transition', content: 'FADE IN:' },
    { type: 'scene-heading', content: 'INT. SOMEWHERE — DAY' },
    { type: 'action', content: 'A wide, establishing image. Something is about to change.' },
    { type: 'action', content: '' },
  ]),
};

const tvSeriesTemplate: StoryTemplate = {
  label: 'TV Series (Drama / 1-hour)',
  blurb: 'Hour-long drama with teaser + 5 acts. Each episode gets its own document.',
  primaryFormat: 'scene-heading',
  toolbarFormats: SCREENPLAY_TOOLBAR,
  sections: makeSections(['Teaser', 'Act One', 'Act Two', 'Act Three', 'Act Four', 'Act Five / Tag']),
  loglinePlaceholder: 'When [event], [hero] must [goal] — or [stakes].',
  openingSceneHeading: 'COLD OPEN — EXT. STREET — NIGHT',
  elements: makeElements([
    { type: 'scene-heading', content: 'COLD OPEN — EXT. STREET — NIGHT' },
    { type: 'action', content: 'Open on something that hooks an audience in eight seconds.' },
    { type: 'action', content: '' },
  ]),
};

const tvShowTemplate: StoryTemplate = {
  label: 'TV Show (Sitcom / Half-hour)',
  blurb: 'Multi-camera sitcom — cold open, two acts, tag.',
  primaryFormat: 'scene-heading',
  toolbarFormats: SCREENPLAY_TOOLBAR,
  sections: makeSections(['Cold Open', 'Act One', 'Act Two', 'Tag']),
  loglinePlaceholder: 'A workplace / family ensemble dealing with [premise].',
  openingSceneHeading: 'COLD OPEN — INT. LIVING ROOM — DAY',
  elements: makeElements([
    { type: 'scene-heading', content: 'COLD OPEN — INT. LIVING ROOM — DAY' },
    { type: 'action', content: 'A small premise, a quick laugh.' },
    { type: 'action', content: '' },
  ]),
};

const miniSeriesTemplate: StoryTemplate = {
  label: 'Limited / Mini-series',
  blurb: '3–8 episode limited run. Treat each section as one episode.',
  primaryFormat: 'scene-heading',
  toolbarFormats: SCREENPLAY_TOOLBAR,
  sections: makeSections(['Episode 1', 'Episode 2', 'Episode 3', 'Episode 4', 'Finale']),
  loglinePlaceholder: 'A self-contained miniseries about [event].',
  elements: makeElements([
    { type: 'scene-heading', content: 'EPISODE ONE — "PILOT"' },
    { type: 'action', content: '' },
  ]),
};

const thrillerTemplate: StoryTemplate = {
  label: 'Thriller',
  blurb: 'Tight, page-turning beats. Hook → setup → escalation → twist → climax → fallout.',
  primaryFormat: 'scene-heading',
  toolbarFormats: SCREENPLAY_TOOLBAR,
  sections: makeSections(['Hook', 'Setup', 'Escalation', 'Midpoint Twist', 'Climax', 'Fallout']),
  loglinePlaceholder: 'A [protagonist] discovers [secret] and must outrun [antagonist].',
  openingSceneHeading: 'EXT. HIGHWAY — NIGHT',
  elements: makeElements([
    { type: 'scene-heading', content: 'EXT. HIGHWAY — NIGHT' },
    { type: 'action', content: 'Headlights cut across rain. Whatever is coming, the audience already feels it.' },
    { type: 'action', content: '' },
  ]),
};

const documentaryTemplate: StoryTemplate = {
  label: 'Documentary',
  blurb: 'Interview + voiceover format with B-roll and chapters.',
  primaryFormat: 'action',
  toolbarFormats: [
    { label: 'Chapter', format: 'scene-heading' },
    { label: 'V.O.', format: 'dialogue' },
    { label: 'Interview', format: 'character' },
    { label: 'B-roll', format: 'parenthetical' },
    { label: 'Action', format: 'action' },
    { label: 'Cut', format: 'transition' },
  ],
  sections: makeSections(['Cold Open / Hook', 'Subject & Context', 'Conflict', 'Investigation', 'Reveal', 'Outro']),
  loglinePlaceholder: 'An investigation into [subject] reveals [insight].',
  elements: makeElements([
    { type: 'scene-heading', content: 'COLD OPEN — ARCHIVE FOOTAGE' },
    { type: 'action', content: 'V.O. — your subject\'s voice over grainy footage.' },
    { type: 'action', content: '' },
  ]),
};

const shortFilmTemplate: StoryTemplate = {
  label: 'Short Film',
  blurb: '5–15 page short. One sharp idea, one strong image, one ending.',
  primaryFormat: 'scene-heading',
  toolbarFormats: SCREENPLAY_TOOLBAR,
  sections: makeSections(['Opening Image', 'Inciting Moment', 'Turn', 'Climax / Final Image']),
  loglinePlaceholder: 'In a single moment, [hero] realizes [insight].',
  openingSceneHeading: 'EXT. SOMEWHERE — DAY',
  elements: makeElements([
    { type: 'scene-heading', content: 'EXT. SOMEWHERE — DAY' },
    { type: 'action', content: 'One image. One person. Something is wrong.' },
    { type: 'action', content: '' },
  ]),
};

const musicVideoTemplate: StoryTemplate = {
  label: 'Music Video',
  blurb: 'Storyboard-style. Section per verse / chorus / bridge.',
  primaryFormat: 'action',
  toolbarFormats: VIDEO_TOOLBAR,
  sections: makeSections(['Intro', 'Verse 1', 'Pre-Chorus', 'Chorus', 'Verse 2', 'Chorus', 'Bridge', 'Final Chorus', 'Outro']),
  loglinePlaceholder: 'A visual interpretation of [theme] for [artist].',
  elements: makeElements([
    { type: 'scene-heading', content: 'INTRO — 0:00–0:10' },
    { type: 'action', content: 'Cold blue light. Slow push-in on the artist.' },
    { type: 'action', content: '' },
  ]),
};

const commercialTemplate: StoryTemplate = {
  label: 'Commercial',
  blurb: '15s / 30s / 60s spot. Problem → product → payoff.',
  primaryFormat: 'action',
  toolbarFormats: VIDEO_TOOLBAR,
  sections: makeSections(['Problem (0–7s)', 'Setup (7–15s)', 'Solution / Product (15–25s)', 'Tagline (25–30s)']),
  loglinePlaceholder: 'Show [audience] that [brand] solves [pain] in 30 seconds.',
  elements: makeElements([
    { type: 'scene-heading', content: 'INT. KITCHEN — MORNING (0:00)' },
    { type: 'action', content: 'Sun pours in. Someone is mid-frustration with [pain].' },
    { type: 'action', content: '' },
  ]),
};

const youtubeTemplate: StoryTemplate = {
  label: 'YouTube / Vlog / Short',
  blurb: 'Hook in 3 seconds, value, retention spikes, call-to-action.',
  primaryFormat: 'action',
  toolbarFormats: VIDEO_TOOLBAR,
  sections: makeSections(['Hook (0–3s)', 'Promise / Setup', 'Main Content', 'Retention Spike', 'Payoff', 'CTA / Outro']),
  loglinePlaceholder: 'A [length] video that teaches / shows [thing] in [angle].',
  elements: makeElements([
    { type: 'action', content: 'HOOK (0–3s): The single sentence that stops the scroll.' },
    { type: 'action', content: '' },
    { type: 'action', content: 'INTRO (3–10s): Promise what they\'ll get from this video.' },
    { type: 'action', content: '' },
    { type: 'action', content: 'MAIN — beat 1' },
    { type: 'action', content: '' },
  ]),
};

const webSeriesTemplate: StoryTemplate = {
  label: 'Web Series',
  blurb: 'Short-form episodes (5–15 min). Each section is an episode.',
  primaryFormat: 'scene-heading',
  toolbarFormats: SCREENPLAY_TOOLBAR,
  sections: makeSections(['Episode 1', 'Episode 2', 'Episode 3', 'Episode 4', 'Episode 5']),
  loglinePlaceholder: 'A bingeable web series about [premise].',
  elements: makeElements([
    { type: 'scene-heading', content: 'EPISODE ONE' },
    { type: 'action', content: '' },
  ]),
};

const stagePlayTemplate: StoryTemplate = {
  label: 'Stage Play',
  blurb: 'Stage directions in italics, character names centered. Acts & scenes.',
  primaryFormat: 'character',
  toolbarFormats: STAGE_TOOLBAR,
  sections: makeSections(['Act I', 'Act II', 'Intermission', 'Act III']),
  loglinePlaceholder: 'A two-act play about [conflict].',
  elements: makeElements([
    { type: 'scene-heading', content: 'ACT I — SCENE 1' },
    { type: 'action', content: '(The lights rise on a sparse stage.)' },
    { type: 'character', content: 'NARRATOR' },
    { type: 'dialogue', content: '(addressing the audience) Here begins…' },
  ]),
};

const animationTemplate: StoryTemplate = {
  label: 'Animation',
  blurb: 'Storyboard-friendly with detailed action / panel descriptions.',
  primaryFormat: 'scene-heading',
  toolbarFormats: SCREENPLAY_TOOLBAR,
  sections: makeSections(['Cold Open', 'Act I', 'Act II', 'Act III', 'Stinger']),
  loglinePlaceholder: 'A stylized story about [character + want].',
  elements: makeElements([
    { type: 'scene-heading', content: 'EXT. STYLIZED WORLD — DAY' },
    { type: 'action', content: 'Wide. Color palette: warm yellows, deep teals.' },
    { type: 'action', content: '' },
  ]),
};

export const STORY_TEMPLATES: Record<StoryType, StoryTemplate> = {
  movie: movieTemplate,
  'tv-series': tvSeriesTemplate,
  'tv-show': tvShowTemplate,
  'mini-series': miniSeriesTemplate,
  thriller: thrillerTemplate,
  documentary: documentaryTemplate,
  'short-film': shortFilmTemplate,
  'music-video': musicVideoTemplate,
  commercial: commercialTemplate,
  youtube: youtubeTemplate,
  'web-series': webSeriesTemplate,
  'stage-play': stagePlayTemplate,
  animation: animationTemplate,
};

export function getTemplate(type?: StoryType): StoryTemplate {
  return STORY_TEMPLATES[type || 'movie'] || movieTemplate;
}
