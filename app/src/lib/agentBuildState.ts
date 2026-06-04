/**
 * agentBuildState — the agent's ordered build workflow, persisted per
 * story. This is what makes the co-worker ORGANIZED: it always works
 * through the same fixed sequence of steps, does an ENTIRE step before
 * moving on, knows which steps are already finished, and can resume an
 * unfinished step on "continue" without repeating work.
 *
 * The canonical order (the user's spec):
 *   1. instructions  — title, logline, synopsis, theme, outline, instructions
 *   2. acts          — every act + every beat for the whole story
 *   3. characters    — every character with full fields
 *   4. screenplay    — the entire screenplay in the writer
 *   5. scenes        — every scene + its shots/b-roll for the whole story
 *
 * State is { completed: Step[] } stored in localStorage per storyId. The
 * agent marks a step done via the markStepDone tool; the runner reads
 * this to tell the agent which step to work on next (or to resume).
 */

export const BUILD_STEPS = ['instructions', 'acts', 'characters', 'screenplay', 'scenes'] as const;
export type BuildStep = typeof BUILD_STEPS[number];

export const STEP_LABEL: Record<BuildStep, string> = {
  instructions: 'Story setup (title, logline, synopsis, theme, outline)',
  acts: 'Acts & beats',
  characters: 'Characters',
  screenplay: 'Screenplay',
  scenes: 'Scenes & shots',
};

const KEY = (storyId: string) => `kindling-agent-build-${storyId}`;

interface BuildState { completed: BuildStep[] }

export function loadBuildState(storyId: string | null): BuildState {
  if (!storyId) return { completed: [] };
  try {
    const raw = localStorage.getItem(KEY(storyId));
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed && Array.isArray(parsed.completed)) return parsed;
  } catch { /* ignore */ }
  return { completed: [] };
}

function save(storyId: string, state: BuildState): void {
  try { localStorage.setItem(KEY(storyId), JSON.stringify(state)); } catch { /* private mode */ }
}

export function markStepComplete(storyId: string | null, step: BuildStep): void {
  if (!storyId) return;
  const s = loadBuildState(storyId);
  if (!s.completed.includes(step)) s.completed.push(step);
  save(storyId, s);
}

export function unmarkStep(storyId: string | null, step: BuildStep): void {
  if (!storyId) return;
  const s = loadBuildState(storyId);
  s.completed = s.completed.filter((x) => x !== step);
  save(storyId, s);
}

export function clearBuildState(storyId: string | null): void {
  if (!storyId) return;
  try { localStorage.removeItem(KEY(storyId)); } catch { /* ignore */ }
}

/** The next step that ISN'T complete (the one the agent should work on),
 *  or null when everything's done. */
export function nextIncompleteStep(storyId: string | null): BuildStep | null {
  const done = new Set(loadBuildState(storyId).completed);
  for (const step of BUILD_STEPS) {
    if (!done.has(step)) return step;
  }
  return null;
}

export function isStepComplete(storyId: string | null, step: BuildStep): boolean {
  return loadBuildState(storyId).completed.includes(step);
}
