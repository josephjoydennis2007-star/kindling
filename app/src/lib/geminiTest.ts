/**
 * geminiTest — explain what's wrong with a Gemini key, in plain English.
 *
 * The user got "Gemini rate-limited (429). Wait a moment." on their
 * very first chat message, which means the request is failing for a
 * reason that isn't actually a rate limit. Google packs the real
 * cause into the response body (RESOURCE_EXHAUSTED, INVALID_ARGUMENT,
 * PERMISSION_DENIED, etc.). This helper makes a minimal generate-
 * content call and decodes the response.
 *
 * Also runs cheap client-side sanity checks before pinging Google so
 * we can give faster feedback for the most common mistake: pasting a
 * key with whitespace, the wrong prefix, or copied from the wrong page.
 */

export interface GeminiTestResult {
  ok: boolean;
  status?: number;
  /** Friendly, actionable explanation. */
  message: string;
  /** Internal Google quota id if 429 is a real rate limit. */
  quotaId?: string;
}

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';

// Same fallback chain aiClient uses. Each model has its own separate
// daily free-tier quota bucket, so the Test button walks the chain to
// find ANY model the key can use today.
const FALLBACK_MODELS = [
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
  'gemini-1.5-flash',
  'gemini-1.5-flash-8b',
  'gemini-2.5-flash',
];

export async function testGeminiKey(rawKey: string, model: string = 'gemini-2.0-flash'): Promise<GeminiTestResult> {
  const key = (rawKey || '').trim();

  // Cheap client-side checks first — but ONLY for things that
  // definitely can't reach Google's API at all (empty, embedded
  // newlines that break the URL). The previous AIza-strict regex was
  // catching valid keys whose chars fell outside its character class —
  // better to let Google decide and surface their actual response.
  if (!key) return { ok: false, message: 'Paste a Gemini API key first.' };
  if (/\s/.test(key)) {
    return {
      ok: false,
      message: 'Key contains whitespace — paste again, the whole single line from aistudio.google.com/apikey.',
    };
  }
  if (key.length < 20) {
    return {
      ok: false,
      message: 'That key is too short to be a real Gemini key. Generate one at aistudio.google.com/apikey.',
    };
  }
  if (!key.startsWith('AIza')) {
    // Soft warning — Google's API will reject non-AIza prefixed keys
    // with a clear error, so we forward the request anyway and let the
    // server tell us. We just note our suspicion in the message.
  }

  // Try the chosen model first, then the fallback chain. Each model has a
  // SEPARATE daily free-tier bucket, so if the primary is exhausted we
  // report whichever one DOES work — and Kindling will auto-use it.
  const chain = [model, ...FALLBACK_MODELS.filter((m) => m !== model)];
  let lastDailyExhausted = false;
  for (const m of chain) {
    const res = await pingOne(key, m);
    if (res.kind === 'ok') {
      return {
        ok: true,
        status: 200,
        message: m === model ? 'Gemini key works.' : `Gemini key works on ${m} (your default ${model} is out of daily quota, so Kindling will use ${m}).`,
      };
    }
    // Key-level failures apply to every model — stop immediately.
    if (res.kind === 'key' || res.kind === 'permission' || res.kind === 'billing' || res.kind === 'perminute') {
      return { ok: false, status: res.status, message: res.message, quotaId: res.quotaId };
    }
    // Daily-quota / resource-exhausted → try the next model.
    if (res.kind === 'daily') { lastDailyExhausted = true; continue; }
    // Anything else (network, unknown) — surface it.
    return { ok: false, status: res.status, message: res.message };
  }
  // Every model in the chain was out of daily quota.
  if (lastDailyExhausted) {
    return {
      ok: false,
      message:
        'Every Gemini free model is out of daily quota on this Google account (resets midnight Pacific). This happens fast on brand-new accounts. For a more generous free option right now, use Groq — free key at console.groq.com/keys, then pick Groq in Settings → AI.',
    };
  }
  return { ok: false, message: 'Gemini test failed for an unknown reason.' };
}

type PingOutcome =
  | { kind: 'ok' }
  | { kind: 'key' | 'permission' | 'billing' | 'perminute' | 'daily' | 'other'; status?: number; message: string; quotaId?: string };

/** Ping a single Gemini model. Classifies the failure mode so the caller
 *  knows whether to advance the fallback chain or stop. */
async function pingOne(key: string, model: string): Promise<PingOutcome> {
  const url = `${GEMINI_BASE}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;
  let r: Response;
  try {
    r = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: 'ping' }] }],
        generationConfig: { maxOutputTokens: 4 },
      }),
    });
  } catch (e: any) {
    return { kind: 'other', message: `Could not reach Google's API: ${e?.message || 'network error'}` };
  }
  const body = await r.text();
  let parsed: any = null;
  try { parsed = JSON.parse(body); } catch { /* not JSON */ }
  const errMsg = parsed?.error?.message || '';
  const errStatus = parsed?.error?.status || '';

  if (r.ok) return { kind: 'ok' };

  if (r.status === 400 || r.status === 403) {
    if (/API key not valid|API_KEY_INVALID/i.test(errMsg + errStatus)) {
      return { kind: 'key', status: r.status, message: 'Google rejected the key. Most likely it was copied incompletely or the AI Studio project was deleted. Generate a fresh one at aistudio.google.com/apikey.' };
    }
    if (/permission|PERMISSION_DENIED/i.test(errMsg + errStatus)) {
      return { kind: 'permission', status: r.status, message: 'Permission denied. Use a key from aistudio.google.com (pre-enabled) rather than console.cloud.google.com.' };
    }
    if (/billing|BILLING/i.test(errMsg)) {
      return { kind: 'billing', status: r.status, message: 'This project needs billing enabled — meaning the key is from console.cloud.google.com, not AI Studio. Get a free key from aistudio.google.com instead.' };
    }
    // Model not available on this account → skip to the next model.
    if (/not found|not supported|does not have access/i.test(errMsg)) {
      return { kind: 'daily', status: r.status, message: `${model} unavailable on this account.` };
    }
    return { kind: 'other', status: r.status, message: `Gemini ${r.status}: ${errMsg || body.slice(0, 200)}` };
  }

  if (r.status === 429) {
    const violations = parsed?.error?.details?.find?.((d: any) => d['@type']?.includes('QuotaFailure'))?.violations;
    const quotaId: string = violations?.[0]?.quotaId || '';
    if (/PerMinute/i.test(quotaId)) {
      return { kind: 'perminute', status: 429, quotaId, message: `Per-minute cap on ${model} (${quotaId}). Wait ~60s and retry.` };
    }
    if (/PerDay/i.test(quotaId) || /RESOURCE_EXHAUSTED/i.test(errMsg + errStatus)) {
      return { kind: 'daily', status: 429, quotaId, message: `${model} out of daily quota.` };
    }
    return { kind: 'other', status: 429, message: `Gemini 429: ${errMsg || body.slice(0, 200)}` };
  }

  return { kind: 'other', status: r.status, message: `Gemini ${r.status}: ${errMsg || body.slice(0, 200)}` };
}
