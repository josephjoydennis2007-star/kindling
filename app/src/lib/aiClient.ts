/**
 * Minimal, side-effect-free wrapper for the same 6 AI providers AIHelperPanel
 * supports. AIHelperPanel keeps its own streaming `callAI` for chat; this file
 * is for *one-shot* structured calls from other features (Dialogue Coach,
 * scene breakdown, style assistant, etc.) that just want a JSON response back.
 *
 * Intentionally NOT a streaming API — features that want streaming should
 * import AIHelperPanel's variant or implement their own SSE reader.
 */

import type { AppSettings } from '@/types';

const DEFAULT_MODELS: Record<string, string> = {
  // 'builtin' is the no-key free default — Pollinations.ai. Their text endpoint
  // accepts a `model` param naming an upstream backend ('openai', 'mistral',
  // 'llama' etc.); 'openai' gives the best general-purpose quality at time
  // of writing. Free, rate-limited, no auth.
  builtin: 'openai',
  // Google AI Studio (Gemini). Free tier on flash-class models is generous:
  // 1500 req/day, ~GPT-4o-mini quality, very fast. Recommended fallback
  // when Pollinations 524s.
  gemini: 'gemini-2.0-flash',
  openai: 'gpt-4o-mini',
  anthropic: 'claude-3-5-sonnet-latest',
  openrouter: 'openai/gpt-4o-mini',
  groq: 'llama-3.3-70b-versatile',
  ollama: 'llama3.2',
  custom: '',
};

// Pollinations Text API — free OpenAI-compatible endpoint. Documented at
// https://pollinations.ai/text — no API key required, suitable for the
// out-of-the-box "AI co-worker" experience.
const POLLINATIONS_TEXT_URL = 'https://text.pollinations.ai/openai';

/**
 * Gemini free-tier model fallback chain. CRUCIALLY, each model has its
 * OWN separate daily quota bucket on the free tier. So when the user's
 * preferred model returns "GenerateRequestsPerDayPerProjectPerModel-
 * FreeTier" exhausted, we transparently retry against the next model
 * in this list — which still has its own untouched daily allowance.
 * Ordered fastest/best first. We dedupe the user's chosen model so it
 * isn't retried twice.
 */
const GEMINI_FALLBACK_MODELS = [
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
  'gemini-1.5-flash',
  'gemini-1.5-flash-8b',
  'gemini-2.5-flash',
];

export interface AIMsg {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

/**
 * Result of an AI call. We keep the `ok: false` path explicit so callers can
 * render a friendly error inline instead of try/catching.
 *
 * `retryAfter` (seconds) is populated when the provider returned a 429
 * rate-limit response. Callers (the agent loop) can sleep that long and
 * retry the same turn instead of failing outright.
 */
export type AIResult =
  | { ok: true; text: string }
  | {
      ok: false;
      error: string;
      retryAfter?: number;
      /** Internal: set by the Gemini path when the failure is a PER-DAY
       *  free-tier quota exhaustion specifically, so aiOnce can fall
       *  through to the next model in the fallback chain. Not meant for
       *  callers. */
      _dailyQuotaExhausted?: boolean;
    };

/**
 * Extract retry-after seconds from a rate-limit response. Providers
 * communicate the cooldown in different ways:
 *   - Standard HTTP `Retry-After` header (seconds OR HTTP-date)
 *   - Inside the error body: "Please try again in 25.88s"
 *   - Inside a `retry_after_ms` field on Groq's error shape
 */
function parseRetryAfter(r: Response, body: string): number | undefined {
  // 1. HTTP Retry-After header.
  const header = r.headers.get('retry-after') || r.headers.get('Retry-After');
  if (header) {
    const n = Number(header);
    if (Number.isFinite(n) && n > 0) return Math.ceil(n);
    const date = Date.parse(header);
    if (!Number.isNaN(date)) {
      const diff = Math.ceil((date - Date.now()) / 1000);
      if (diff > 0) return diff;
    }
  }
  // 2. Try parsing the body as JSON for a retry_after_ms field.
  try {
    const j = JSON.parse(body);
    const ms = j?.error?.retry_after_ms ?? j?.retry_after_ms;
    if (typeof ms === 'number' && ms > 0) return Math.ceil(ms / 1000);
    const sec = j?.error?.retry_after ?? j?.retry_after;
    if (typeof sec === 'number' && sec > 0) return Math.ceil(sec);
  } catch { /* not JSON */ }
  // 3. Fall back to the "try again in 25.88s" hint in the error string.
  const m = body.match(/try again in (\d+(?:\.\d+)?)\s*(s|sec|seconds|ms)/i);
  if (m) {
    const n = Number(m[1]);
    if (m[2].startsWith('ms')) return Math.ceil(n / 1000);
    return Math.ceil(n);
  }
  // 4. Pollinations 429 "Queue full for IP" has no Retry-After or
  //    structured retry field, but the queue typically clears in 5–10
  //    seconds. Default to 8 so the agent retries instead of bailing.
  if (/queue full/i.test(body)) return 8;
  return undefined;
}

/**
 * OpenRouter (and a few other budget providers) return HTTP 402 when
 * a request would exceed the remaining credit budget. The error body
 * includes the exact affordable amount — "can only afford 1677 tokens"
 * — which we parse out so we can retry the same request with a lower
 * max_tokens cap and squeak it through.
 */
function parseAffordableMaxTokens(body: string): number | undefined {
  const m = body.match(/(?:can only afford|maximum allowed[^\d]+)(\d+)\s*tokens?/i);
  if (m) {
    const n = parseInt(m[1], 10);
    if (Number.isFinite(n) && n >= 64) return Math.max(64, n - 8); // small safety margin
  }
  // Some providers phrase it as "max max_tokens is X".
  const m2 = body.match(/max(?:imum)?\s+max_tokens\s+(?:is|allowed)[^\d]+(\d+)/i);
  if (m2) {
    const n = parseInt(m2[1], 10);
    if (Number.isFinite(n) && n >= 64) return Math.max(64, n - 8);
  }
  return undefined;
}

/**
 * Returns true if the provider is reachable WITHOUT an API key (e.g. local
 * Ollama). Useful for deciding whether to gate UI on a missing key.
 */
export function providerNeedsKey(provider: string): boolean {
  // 'builtin' (Pollinations) and 'ollama' (local) both run without a key.
  return provider !== 'ollama' && provider !== 'builtin';
}

/**
 * One-shot call. Picks the right endpoint + auth shape per provider.
 * Caller-supplied `system` becomes the system prompt; `user` is the
 * (typically large) input we want analyzed.
 */
export async function aiOnce(
  settings: Pick<AppSettings, 'aiProvider' | 'aiApiKey' | 'aiModel' | 'aiEndpoint'>,
  system: string,
  user: string,
  opts: { maxTokens?: number; temperature?: number } = {}
): Promise<AIResult> {
  const provider = settings.aiProvider;
  const apiKey = (settings.aiApiKey || '').trim();
  const model = (settings.aiModel || '').trim() || DEFAULT_MODELS[provider] || 'gpt-4o-mini';
  const maxTokens = opts.maxTokens ?? 1800;
  const temperature = opts.temperature ?? 0.4;

  if (providerNeedsKey(provider) && !apiKey) {
    return { ok: false, error: `No API key for ${provider}. Add one in the AI panel (✦ button).` };
  }

  try {
    // ---- Google AI Studio (Gemini) ----
    // Different request shape from OpenAI: uses `contents` + `systemInstruction`
    // + `generationConfig`. Key goes in the query string per Google's docs.
    //
    // FREE-TIER DAILY QUOTA FALLBACK: every Gemini model has a SEPARATE
    // daily request bucket. When the user's chosen model is exhausted
    // ("GenerateRequestsPerDayPerProjectPerModel-FreeTier"), we
    // transparently retry the SAME prompt against the next model in
    // GEMINI_FALLBACK_MODELS, which still has untouched daily quota.
    // This is what makes Gemini usable on a brand-new account whose
    // primary model's quota is already drained.
    if (provider === 'gemini') {
      // Try the user's chosen model first, then the rest of the chain
      // (deduped). Per-minute limits + non-quota errors short-circuit
      // immediately; only PER-DAY quota exhaustion advances to the next
      // model.
      const chain = [model, ...GEMINI_FALLBACK_MODELS.filter((m) => m !== model)];
      for (const m of chain) {
        const res = await geminiGenerateOne(m, apiKey, system, user, maxTokens, temperature);
        if (res.ok) return res;
        // Only continue the fallback loop when THIS model's daily quota
        // is the blocker. Anything else (bad key, per-minute, no text)
        // applies to all models, so stop and surface it.
        if (!res._dailyQuotaExhausted) return res;
      }
      // Every model in the chain was daily-exhausted.
      return {
        ok: false,
        error:
          'All Gemini free-tier models are out of daily quota on this Google account. Quota resets at midnight Pacific. For a more generous free option right now, switch to Groq in Settings → AI (free key at console.groq.com/keys).',
      };
    }

    if (provider === 'anthropic') {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          system,
          messages: [{ role: 'user', content: user }],
          temperature,
        }),
      });
      if (!r.ok) {
        const body = (await r.text()).slice(0, 600);
        if (r.status === 429) {
          const retryAfter = parseRetryAfter(r, body);
          return {
            ok: false,
            error: `Anthropic rate-limited (429). ${retryAfter ? `Retry in ${retryAfter}s.` : 'Wait a moment.'}`,
            retryAfter,
          };
        }
        return { ok: false, error: `Anthropic ${r.status}: ${body.slice(0, 200)}` };
      }
      const j = await r.json();
      return { ok: true, text: (j.content?.[0]?.text || '').trim() };
    }

    // OpenAI-style chat-completions request (everything else)
    const url =
      provider === 'builtin'    ? POLLINATIONS_TEXT_URL :
      provider === 'openai'     ? 'https://api.openai.com/v1/chat/completions' :
      provider === 'openrouter' ? 'https://openrouter.ai/api/v1/chat/completions' :
      provider === 'groq'       ? 'https://api.groq.com/openai/v1/chat/completions' :
      provider === 'ollama'     ? `${(settings.aiEndpoint || 'http://localhost:11434').replace(/\/$/, '')}/v1/chat/completions` :
      /* custom */                (settings.aiEndpoint || '');

    if (!url) return { ok: false, error: 'Custom endpoint not set in AI settings.' };

    const extraHeaders: Record<string, string> =
      provider === 'openrouter'
        ? { 'HTTP-Referer': typeof location !== 'undefined' ? location.origin : '', 'X-Title': 'Kindling' }
        : {};

    const r = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
        ...extraHeaders,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        max_tokens: maxTokens,
        temperature,
      }),
    });
    if (!r.ok) {
      const body = (await r.text()).slice(0, 600);
      if (r.status === 429) {
        // Surface the cooldown so the agent loop can sleep instead of
        // killing the run. Groq's free tier hits this all the time —
        // 12k tokens/min on llama-3.3-70b — and their error body
        // includes the exact retry-after value. Pollinations queue-full
        // is handled the same way via parseRetryAfter's queue heuristic.
        const retryAfter = parseRetryAfter(r, body);
        return {
          ok: false,
          error: `${provider} rate-limited (429). ${retryAfter ? `Retry in ${retryAfter}s.` : 'Wait a moment.'}`,
          retryAfter,
        };
      }
      if (r.status === 402) {
        // OpenRouter (and similar budget providers) return 402 with
        // "can only afford N tokens" when the request would exceed the
        // remaining credit budget. Auto-retry ONCE at that cap so the
        // user's run continues until the credits actually hit zero.
        const affordable = parseAffordableMaxTokens(body);
        if (affordable && affordable < maxTokens && !(opts as any)._retriedAfford) {
          return aiOnce(settings, system, user, {
            ...opts,
            maxTokens: affordable,
            // sentinel so we don't loop forever
            ...({ _retriedAfford: true } as any),
          });
        }
        return {
          ok: false,
          error:
            `${provider} out of credits (402). Top up at openrouter.ai/settings/credits or switch to a free provider in Settings → AI (Gemini is the most reliable free option).`,
        };
      }
      return { ok: false, error: `${provider} ${r.status}: ${body.slice(0, 300)}` };
    }
    const j = await r.json();
    const text = (j.choices?.[0]?.message?.content || j.content || '').toString().trim();
    return { ok: true, text };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Network error' };
  }
}

/**
 * One Gemini generateContent call against a SPECIFIC model. Returns the
 * normal AIResult, plus an internal `_dailyQuotaExhausted` flag when the
 * failure is specifically a per-day free-tier quota cap — which is the
 * signal aiOnce uses to advance to the next model in the fallback chain.
 */
async function geminiGenerateOne(
  model: string,
  apiKey: string,
  system: string,
  user: string,
  maxTokens: number,
  temperature: number,
): Promise<AIResult> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  let r: Response;
  try {
    r = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
        generationConfig: { temperature, maxOutputTokens: maxTokens },
      }),
    });
  } catch (e: any) {
    return { ok: false, error: `Could not reach Gemini: ${e?.message || 'network error'}` };
  }

  if (!r.ok) {
    const body = (await r.text()).slice(0, 800);
    let parsed: any = null;
    try { parsed = JSON.parse(body); } catch {/* not JSON */}
    const errMsg = parsed?.error?.message || '';
    const errStatus = parsed?.error?.status || '';
    if (r.status === 429) {
      const retryAfter = parseRetryAfter(r, body);
      const violations = parsed?.error?.details?.find?.((d: any) => d['@type']?.includes('QuotaFailure'))?.violations;
      const quotaId: string = violations?.[0]?.quotaId || '';
      // PER-DAY quota → advance to next model (separate bucket).
      if (/PerDay/i.test(quotaId)) {
        return {
          ok: false,
          error: `Gemini ${model} out of daily quota (${quotaId}).`,
          _dailyQuotaExhausted: true,
        };
      }
      // PER-MINUTE quota → waiting helps (same model).
      if (/PerMinute/i.test(quotaId)) {
        return {
          ok: false,
          error: `Gemini ${model} per-minute cap hit (${quotaId}). Retry in ${retryAfter || 30}s.`,
          retryAfter: retryAfter || 30,
        };
      }
      // No quota id — brand-new key provisioning, OR generic. Treat as
      // daily-exhausted so we still TRY other models (cheap, might work).
      if (/RESOURCE_EXHAUSTED/i.test(errMsg + errStatus)) {
        return {
          ok: false,
          error: `Gemini ${model} 429 RESOURCE_EXHAUSTED (no quota id — possibly new-key provisioning).`,
          _dailyQuotaExhausted: true,
        };
      }
      return {
        ok: false,
        error: `Gemini rate-limited (429). ${retryAfter ? `Retry in ${retryAfter}s.` : 'Wait a moment.'}`,
        retryAfter: retryAfter || 30,
      };
    }
    if (r.status === 400 || r.status === 403) {
      if (/api.?key.*not valid|API_KEY_INVALID/i.test(errMsg + body)) {
        return { ok: false, error: 'Google rejected the key. Generate a fresh one at aistudio.google.com/apikey.' };
      }
      if (/permission|PERMISSION_DENIED/i.test(errMsg + errStatus)) {
        return { ok: false, error: 'Gemini permission denied. Use a key from aistudio.google.com (pre-enabled) rather than console.cloud.google.com.' };
      }
      // A model the account can't access (e.g. 2.5 preview) — treat like
      // daily-exhausted so the chain skips to one it CAN use.
      if (/not found|not supported|does not have access/i.test(errMsg)) {
        return { ok: false, error: `Gemini ${model} unavailable on this account.`, _dailyQuotaExhausted: true };
      }
    }
    return { ok: false, error: `Gemini ${r.status}: ${errMsg || body.slice(0, 300)}` };
  }

  const j = await r.json();
  const text = (j.candidates?.[0]?.content?.parts || [])
    .map((p: any) => p.text || '')
    .join('')
    .trim();
  if (!text) return { ok: false, error: `Gemini returned no text (finishReason=${j.candidates?.[0]?.finishReason || 'unknown'})` };
  return { ok: true, text };
}

/**
 * Pull a JSON object out of an AI response that may or may not have
 * surrounding prose / code fences. Returns null if no JSON could be found.
 */
export function extractJSON<T = any>(s: string): T | null {
  if (!s) return null;
  // First try: whole string is JSON
  try { return JSON.parse(s) as T; } catch {}
  // Strip ```json … ``` fences
  const fence = s.match(/```(?:json)?\s*([\s\S]+?)```/i);
  if (fence) {
    try { return JSON.parse(fence[1]) as T; } catch {}
  }
  // Fallback: find first { and matching last }
  const first = s.indexOf('{');
  const last = s.lastIndexOf('}');
  if (first >= 0 && last > first) {
    try { return JSON.parse(s.slice(first, last + 1)) as T; } catch {}
  }
  return null;
}
