/**
 * agentBlueprint — the agent's STORY PLAN (its "story bible" / backend memory).
 *
 * The problem this solves: the AI was re-guessing the story every turn,
 * producing dozens of near-duplicate outline points / beats because it had
 * no durable picture of what the story IS or what it had already created.
 *
 * The fix: a single canonical plan, decided ONCE at the start of a build and
 * persisted per story. It is injected into every system prompt as the
 * agent's single source of truth, so the agent always knows:
 *   - the premise, theme, protagonist, antagonist
 *   - the full character roster (names + roles)
 *   - the ordered story beats (the spine)
 *   - the ordered scene list
 * The agent then EXECUTES the plan step by step instead of inventing new
 * material each turn. That's what stops the repeat-and-drag.
 *
 * Stored in localStorage per storyId (same pattern as agentBuildState).
 */

export interface PlannedCharacter {
  name: string;
  role: string; // e.g. "protagonist", "antagonist", "ally", "mentor"
}

export interface StoryPlan {
  premise: string;     // one-paragraph spine of the whole story
  theme: string;
  genre: string;
  protagonist: string; // name
  antagonist: string;  // name
  characters: PlannedCharacter[];
  beats: string[];     // ordered story beats (the outline spine)
  scenes: string[];    // ordered scene list (names)
  createdAt: number;
  updatedAt: number;
}

const KEY = (storyId: string) => `kindling-story-plan-${storyId}`;

export function loadStoryPlan(storyId: string | null): StoryPlan | null {
  if (!storyId) return null;
  try {
    const raw = localStorage.getItem(KEY(storyId));
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (p && typeof p === 'object') {
      return {
        premise: String(p.premise || ''),
        theme: String(p.theme || ''),
        genre: String(p.genre || ''),
        protagonist: String(p.protagonist || ''),
        antagonist: String(p.antagonist || ''),
        characters: Array.isArray(p.characters)
          ? p.characters.map((c: any) => ({ name: String(c?.name || ''), role: String(c?.role || '') })).filter((c: PlannedCharacter) => c.name)
          : [],
        beats: Array.isArray(p.beats) ? p.beats.map((b: any) => String(b || '')).filter(Boolean) : [],
        scenes: Array.isArray(p.scenes) ? p.scenes.map((s: any) => String(s || '')).filter(Boolean) : [],
        createdAt: Number(p.createdAt) || Date.now(),
        updatedAt: Number(p.updatedAt) || Date.now(),
      };
    }
  } catch { /* ignore */ }
  return null;
}

export function saveStoryPlan(storyId: string | null, plan: StoryPlan): void {
  if (!storyId) return;
  try { localStorage.setItem(KEY(storyId), JSON.stringify(plan)); } catch { /* private mode */ }
}

export function clearStoryPlan(storyId: string | null): void {
  if (!storyId) return;
  try { localStorage.removeItem(KEY(storyId)); } catch { /* ignore */ }
}

export function hasStoryPlan(storyId: string | null): boolean {
  const p = loadStoryPlan(storyId);
  return !!(p && (p.premise || p.beats.length || p.characters.length));
}

/**
 * Merge a partial plan into the stored one. Non-empty incoming fields win;
 * arrays REPLACE when provided (so the agent can correct the whole spine),
 * but a missing/empty array leaves the existing one intact.
 */
export function upsertStoryPlan(storyId: string | null, partial: Partial<StoryPlan>): StoryPlan {
  const existing = loadStoryPlan(storyId);
  const now = Date.now();
  const merged: StoryPlan = {
    premise: pick(partial.premise, existing?.premise),
    theme: pick(partial.theme, existing?.theme),
    genre: pick(partial.genre, existing?.genre),
    protagonist: pick(partial.protagonist, existing?.protagonist),
    antagonist: pick(partial.antagonist, existing?.antagonist),
    characters: Array.isArray(partial.characters) && partial.characters.length
      ? partial.characters.map((c) => ({ name: String(c?.name || ''), role: String(c?.role || '') })).filter((c) => c.name)
      : (existing?.characters || []),
    beats: Array.isArray(partial.beats) && partial.beats.length
      ? partial.beats.map((b) => String(b || '')).filter(Boolean)
      : (existing?.beats || []),
    scenes: Array.isArray(partial.scenes) && partial.scenes.length
      ? partial.scenes.map((s) => String(s || '')).filter(Boolean)
      : (existing?.scenes || []),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
  saveStoryPlan(storyId, merged);
  return merged;
}

function pick(a: string | undefined, b: string | undefined): string {
  const av = String(a ?? '').trim();
  return av || String(b ?? '');
}

/** Render the plan as a compact prompt block — the agent's source of truth. */
export function renderStoryPlan(plan: StoryPlan | null): string {
  if (!plan) return '';
  const lines: string[] = [];
  lines.push('## THE STORY PLAN — your single source of truth (already decided — FOLLOW it, do not re-invent it)');
  if (plan.premise) lines.push(`Premise: ${plan.premise}`);
  const meta: string[] = [];
  if (plan.genre) meta.push(`Genre: ${plan.genre}`);
  if (plan.theme) meta.push(`Theme: ${plan.theme}`);
  if (meta.length) lines.push(meta.join(' | '));
  const who: string[] = [];
  if (plan.protagonist) who.push(`Protagonist: ${plan.protagonist}`);
  if (plan.antagonist) who.push(`Antagonist: ${plan.antagonist}`);
  if (who.length) lines.push(who.join(' | '));
  if (plan.characters.length) {
    lines.push('Characters (the full roster — create ONLY these, one profile each):');
    plan.characters.forEach((c) => lines.push(`  - ${c.name}${c.role ? ` — ${c.role}` : ''}`));
  }
  if (plan.beats.length) {
    lines.push('Beats (the spine, in order — the outline + the basis for acts/scenes):');
    plan.beats.forEach((b, i) => lines.push(`  ${i + 1}. ${b}`));
  }
  if (plan.scenes.length) {
    lines.push('Scenes (in order — create exactly these, no extras):');
    plan.scenes.forEach((s, i) => lines.push(`  ${i + 1}. ${s}`));
  }
  lines.push('Rule: build EXACTLY what this plan lists. Never add a beat / character / scene that is not here unless the user explicitly asks. When everything in the plan for the current step exists, that step is DONE.');
  return lines.join('\n');
}
