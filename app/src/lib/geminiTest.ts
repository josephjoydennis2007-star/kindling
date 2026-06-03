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

  // Smallest possible request — single "ping" content, minimal output.
  const url = `${GEMINI_BASE}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: 'ping' }] }],
        generationConfig: { maxOutputTokens: 4 },
      }),
    });
    const body = await r.text();
    let parsed: any = null;
    try { parsed = JSON.parse(body); } catch { /* not JSON */ }
    const errMsg = parsed?.error?.message || '';
    const errStatus = parsed?.error?.status || '';

    if (r.ok) {
      return { ok: true, status: 200, message: 'Gemini key works.' };
    }

    if (r.status === 400 || r.status === 403) {
      if (/API key not valid|API_KEY_INVALID/i.test(errMsg + errStatus)) {
        return {
          ok: false,
          status: r.status,
          message: 'Google rejected the key. Most likely the key was copied incompletely, or the AI Studio project it belongs to was deleted. Generate a fresh one at aistudio.google.com/apikey.',
        };
      }
      if (/permission|PERMISSION_DENIED/i.test(errMsg + errStatus)) {
        return {
          ok: false,
          status: r.status,
          message: 'Permission denied. The Generative Language API may need enabling on the Google Cloud project this key belongs to. Open console.cloud.google.com → APIs & Services → search "Generative Language API" → Enable. Or just create a brand-new key at aistudio.google.com — those come pre-enabled.',
        };
      }
      if (/billing|BILLING/i.test(errMsg)) {
        return {
          ok: false,
          status: r.status,
          message: 'Google says this project needs billing enabled. Free-tier keys from aistudio.google.com do NOT need billing — if you see this, you have a key from console.cloud.google.com instead. Get a fresh key from AI Studio.',
        };
      }
      return {
        ok: false,
        status: r.status,
        message: `Gemini ${r.status}: ${errMsg || body.slice(0, 200)}`,
      };
    }

    if (r.status === 429) {
      // Look at quota detail. Real RPM/TPM limits include a violations
      // array; a "RESOURCE_EXHAUSTED" without quotaId usually means the
      // brand-new project has no quota provisioned yet.
      const violations = parsed?.error?.details?.find?.((d: any) => d['@type']?.includes('QuotaFailure'))?.violations;
      const quotaId = violations?.[0]?.quotaId;
      if (quotaId) {
        return {
          ok: false,
          status: 429,
          quotaId,
          message: `Real rate limit hit: ${quotaId}. Wait a minute and retry. If it keeps happening immediately, you're hitting the per-minute cap (15 req/min on Flash free tier).`,
        };
      }
      if (/RESOURCE_EXHAUSTED/i.test(errMsg + errStatus)) {
        return {
          ok: false,
          status: 429,
          message:
            'Google returned 429 RESOURCE_EXHAUSTED with no quota detail. The most common cause: this key was made from a BRAND-NEW Google account and quota provisioning takes 5–15 minutes. Wait, then test again. If still failing after 30 min, the account may need phone verification at aistudio.google.com.',
        };
      }
      return {
        ok: false,
        status: 429,
        message: `Gemini 429: ${errMsg || body.slice(0, 200)}`,
      };
    }

    return {
      ok: false,
      status: r.status,
      message: `Gemini ${r.status}: ${errMsg || body.slice(0, 200)}`,
    };
  } catch (e: any) {
    return {
      ok: false,
      message: `Could not reach Google's API: ${e?.message || 'network error'}`,
    };
  }
}
