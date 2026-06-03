/**
 * geminiQuota — remembers which Gemini models are out of daily free-tier
 * quota TODAY so the app stops wasting the user's remaining quota by
 * re-pinging dead models.
 *
 * The bug this fixes: the model-fallback chain fired a request at every
 * model in the list on each failure. Since each Gemini model has its own
 * separate daily bucket, walking the chain repeatedly (across agent turns
 * + Test-button clicks) drained ALL of them — which is why a brand-new
 * key looked "already rate-limited" on first real use.
 *
 * Now: once a model returns a PER-DAY exhaustion, we stamp it dead for
 * the rest of the Pacific day (Google's quota reset boundary) and skip it
 * entirely — no network request — until tomorrow.
 */

const KEY = (model: string) => `kindling-gemini-dead-${model}`;

/** Today's date in US Pacific (Google's quota reset zone) as YYYY-MM-DD.
 *  We approximate Pacific as UTC-8; close enough for a per-day cache. */
function pacificDay(): string {
  const now = new Date(Date.now() - 8 * 60 * 60 * 1000);
  return now.toISOString().slice(0, 10);
}

/** Mark a model as out of daily quota for the rest of today. */
export function markGeminiExhausted(model: string): void {
  try { localStorage.setItem(KEY(model), pacificDay()); } catch { /* private mode */ }
}

/** True if this model was already exhausted earlier today. */
export function isGeminiExhausted(model: string): boolean {
  try { return localStorage.getItem(KEY(model)) === pacificDay(); }
  catch { return false; }
}

/** Clear the dead-stamp for a model (e.g. user wants to force a retry). */
export function clearGeminiExhausted(model?: string): void {
  try {
    if (model) { localStorage.removeItem(KEY(model)); return; }
    // Clear all gemini dead-stamps.
    Object.keys(localStorage)
      .filter((k) => k.startsWith('kindling-gemini-dead-'))
      .forEach((k) => localStorage.removeItem(k));
  } catch { /* ignore */ }
}
