/**
 * agentMemory — per-story persistent transcript of the AI co-worker's
 * conversations + actions, so the agent can answer "what did you just do?"
 * and so the user can pick up a follow-up like "actually, change the
 * second scene to be set in Paris."
 *
 * Stored in localStorage keyed by storyId. Capped at the last N turns to
 * keep the prompt budget sane. Loaded once per session into an in-memory
 * cache; mutated by the runner via `appendTurns` + `recordGoal`.
 */

export type MemoryRole = 'user' | 'assistant' | 'tool';

export interface MemoryTurn {
  role: MemoryRole;
  content: string;
  ts: number;
}

const KEY = (storyId: string) => `kindling-agent-memory-${storyId}`;
const MAX_TURNS = 60;
const cache: Record<string, MemoryTurn[]> = {};

export function loadMemory(storyId: string | null): MemoryTurn[] {
  if (!storyId) return [];
  if (cache[storyId]) return cache[storyId];
  try {
    const raw = localStorage.getItem(KEY(storyId));
    cache[storyId] = raw ? (JSON.parse(raw) as MemoryTurn[]) : [];
  } catch {
    cache[storyId] = [];
  }
  return cache[storyId];
}

function persist(storyId: string): void {
  try {
    const list = (cache[storyId] || []).slice(-MAX_TURNS);
    cache[storyId] = list;
    localStorage.setItem(KEY(storyId), JSON.stringify(list));
  } catch { /* localStorage full or private-mode */ }
}

export function appendTurns(storyId: string | null, turns: MemoryTurn[]): void {
  if (!storyId || !turns.length) return;
  const existing = loadMemory(storyId);
  cache[storyId] = [...existing, ...turns];
  persist(storyId);
}

export function clearMemory(storyId: string | null): void {
  if (!storyId) return;
  cache[storyId] = [];
  try { localStorage.removeItem(KEY(storyId)); } catch {}
}

/** Render the memory as a flat string suitable for putting in the prompt. */
export function memoryAsPrompt(storyId: string | null): string {
  const turns = loadMemory(storyId);
  if (!turns.length) return '';
  // Skip the very oldest turns if the transcript is huge — keep the last
  // 30 turns of context. Older context is dropped silently.
  const recent = turns.slice(-30);
  return recent.map((t) => `[${t.role.toUpperCase()} ${new Date(t.ts).toISOString().slice(11, 19)}]\n${t.content}`).join('\n\n');
}
