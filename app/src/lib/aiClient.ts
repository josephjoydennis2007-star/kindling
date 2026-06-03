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
  | { ok: false; error: string; retryAfter?: number };

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
    // Free tier: 1500 req/day on gemini-2.0-flash, no credit card required.
    if (provider === 'gemini') {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: 'user', parts: [{ text: user }] }],
          generationConfig: {
            temperature,
            maxOutputTokens: maxTokens,
          },
        }),
      });
      if (!r.ok) {
        const body = (await r.text()).slice(0, 600);
        if (r.status === 429) {
          const retryAfter = parseRetryAfter(r, body);
          return {
            ok: false,
            error: `Gemini rate-limited (429). ${retryAfter ? `Retry in ${retryAfter}s.` : 'Wait a moment.'}`,
            retryAfter,
          };
        }
        return { ok: false, error: `Gemini ${r.status}: ${body.slice(0, 300)}` };
      }
      const j = await r.json();
      const text = (j.candidates?.[0]?.content?.parts || [])
        .map((p: any) => p.text || '')
        .join('')
        .trim();
      if (!text) return { ok: false, error: `Gemini returned no text (finishReason=${j.candidates?.[0]?.finishReason || 'unknown'})` };
      return { ok: true, text };
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
        // includes the exact retry-after value.
        const retryAfter = parseRetryAfter(r, body);
        return {
          ok: false,
          error: `${provider} rate-limited (429). ${retryAfter ? `Retry in ${retryAfter}s.` : 'Wait a moment.'}`,
          retryAfter,
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
