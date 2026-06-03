/**
 * runwayClient — thin wrapper around the Runway Developer API.
 *
 * Docs: https://docs.dev.runwayml.com/
 *
 * Auth: bearer token (the user's runwayApiKey from settings).
 * Calls go directly browser → api.dev.runwayml.com (their API supports
 * CORS for direct browser use during dev; for production a server-side
 * proxy is recommended).
 *
 * Both image + video generation are ASYNCHRONOUS: you POST a task, get
 * back an id, then poll GET /v1/tasks/{id} until status === 'SUCCEEDED'.
 * This client encapsulates the polling so callers see a simple
 * promise-of-url.
 *
 * Rate-limit + cost: Runway charges credits per generation. We don't
 * track usage here — that's a UI concern for the agent panel.
 */

const RUNWAY_BASE = 'https://api.dev.runwayml.com/v1';
const RUNWAY_VERSION = '2024-11-06'; // X-Runway-Version header required by API

export interface RunwayResult {
  ok: boolean;
  /** Final asset URL when ok = true. Image or video depending on the call. */
  url?: string;
  /** Human-readable error when ok = false. */
  error?: string;
  /** Runway's task id for debugging / cancellation. */
  taskId?: string;
}

interface PollOpts {
  apiKey: string;
  taskId: string;
  maxWaitMs?: number;
  intervalMs?: number;
  onProgress?: (status: string) => void;
}

async function pollTask(opts: PollOpts): Promise<RunwayResult> {
  const start = Date.now();
  const maxWait = opts.maxWaitMs ?? 5 * 60_000; // 5 min — videos can take a while
  const interval = opts.intervalMs ?? 4_000;
  while (Date.now() - start < maxWait) {
    try {
      const r = await fetch(`${RUNWAY_BASE}/tasks/${opts.taskId}`, {
        headers: {
          authorization: `Bearer ${opts.apiKey}`,
          'X-Runway-Version': RUNWAY_VERSION,
        },
      });
      if (!r.ok) {
        const body = (await r.text()).slice(0, 300);
        return { ok: false, error: `Poll ${r.status}: ${body}`, taskId: opts.taskId };
      }
      const j = await r.json();
      opts.onProgress?.(j.status);
      if (j.status === 'SUCCEEDED') {
        // The output is an array of URLs. We grab the first.
        const out = Array.isArray(j.output) ? j.output[0] : j.output;
        return { ok: true, url: typeof out === 'string' ? out : out?.url, taskId: opts.taskId };
      }
      if (j.status === 'FAILED' || j.status === 'CANCELLED') {
        return { ok: false, error: `Runway task ${j.status.toLowerCase()}: ${j.failure || j.failureCode || ''}`.trim(), taskId: opts.taskId };
      }
    } catch (e: any) {
      return { ok: false, error: e?.message || 'Network error during poll', taskId: opts.taskId };
    }
    await new Promise((r) => setTimeout(r, interval));
  }
  return { ok: false, error: 'Timed out waiting for Runway task', taskId: opts.taskId };
}

/**
 * Generate a still image from a text prompt using Runway Gen-4 Image.
 * Returns the asset URL once the task succeeds.
 */
export async function runwayTextToImage(opts: {
  apiKey: string;
  prompt: string;
  model?: string;
  ratio?: string;        // e.g. '1920:1080'
  onProgress?: (status: string) => void;
}): Promise<RunwayResult> {
  if (!opts.apiKey) return { ok: false, error: 'No Runway API key' };
  const model = opts.model || 'gen4_image';
  const ratio = opts.ratio || '1920:1080';
  try {
    const r = await fetch(`${RUNWAY_BASE}/text_to_image`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${opts.apiKey}`,
        'X-Runway-Version': RUNWAY_VERSION,
      },
      body: JSON.stringify({
        model,
        promptText: opts.prompt,
        ratio,
      }),
    });
    if (!r.ok) {
      const body = (await r.text()).slice(0, 400);
      return { ok: false, error: `Runway ${r.status}: ${body}` };
    }
    const j = await r.json();
    if (!j.id) return { ok: false, error: 'Runway returned no task id' };
    return pollTask({ apiKey: opts.apiKey, taskId: j.id, onProgress: opts.onProgress });
  } catch (e: any) {
    // Distinguish browser CORS block from real network errors — the
    // agent's log otherwise just shows "Network error" which is
    // misleading when the issue is Runway not whitelisting the origin.
    const msg = (e?.message || '').toLowerCase();
    if (msg.includes('failed to fetch') || msg.includes('cors')) {
      return { ok: false, error: 'Runway API is blocked by the browser (CORS). The Developer API needs a server-side proxy to call from a web app.' };
    }
    return { ok: false, error: e?.message || 'Network error' };
  }
}

/**
 * Generate a video clip from a still + motion prompt using Runway
 * image_to_video. The still must be a publicly fetchable URL or a
 * data URL.
 */
export async function runwayImageToVideo(opts: {
  apiKey: string;
  promptImage: string;
  promptText?: string;
  model?: string;
  duration?: 5 | 10;
  ratio?: string;
  onProgress?: (status: string) => void;
}): Promise<RunwayResult> {
  if (!opts.apiKey) return { ok: false, error: 'No Runway API key' };
  const model = opts.model || 'gen4_turbo';
  const ratio = opts.ratio || '1280:720';
  const duration = opts.duration || 5;
  try {
    const r = await fetch(`${RUNWAY_BASE}/image_to_video`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${opts.apiKey}`,
        'X-Runway-Version': RUNWAY_VERSION,
      },
      body: JSON.stringify({
        model,
        promptImage: opts.promptImage,
        promptText: opts.promptText || '',
        ratio,
        duration,
      }),
    });
    if (!r.ok) {
      const body = (await r.text()).slice(0, 400);
      return { ok: false, error: `Runway ${r.status}: ${body}` };
    }
    const j = await r.json();
    if (!j.id) return { ok: false, error: 'Runway returned no task id' };
    return pollTask({
      apiKey: opts.apiKey,
      taskId: j.id,
      maxWaitMs: 10 * 60_000, // video can take longer
      onProgress: opts.onProgress,
    });
  } catch (e: any) {
    const msg = (e?.message || '').toLowerCase();
    if (msg.includes('failed to fetch') || msg.includes('cors')) {
      return { ok: false, error: 'Runway API is blocked by the browser (CORS). The Developer API needs a server-side proxy to call from a web app.' };
    }
    return { ok: false, error: e?.message || 'Network error' };
  }
}

export interface RunwayPingResult {
  ok: boolean;
  /** HTTP status code if a response was received, undefined if the
   *  request failed before reaching Runway (CORS, DNS, offline). */
  status?: number;
  /** Friendly, actionable message for the user. Distinguishes between
   *  CORS block, bad key, billing issue, dev-vs-consumer key mismatch,
   *  and unknown failures. */
  message: string;
}

/**
 * Sanity-check the user's Runway API key without burning a credit.
 *
 * The previous version returned `boolean`, which made every distinct
 * failure look identical to the user ("Runway rejected the key") even
 * when the actual cause was very different (e.g. a CORS block that the
 * API key itself had nothing to do with). This version returns a
 * structured result so the Settings UI can surface what really happened.
 *
 * The fetch is intentionally TWO probes so we can tell the modes apart:
 *
 *   1. /v1/organization — Runway's "who am I?" read-only endpoint. A
 *      200 here means the key is valid AND the API is reachable from
 *      the browser. 401/403 = bad key. 404 = endpoint moved.
 *   2. If the first throws (which is what happens on CORS blocks),
 *      we report the browser-CORS limitation specifically — Runway's
 *      Developer API does not currently send Access-Control-Allow-
 *      Origin headers, so calls from a static web app fail at preflight
 *      time. The user needs either a server-side proxy or Runway has
 *      to allowlist their origin.
 *
 * The third common failure mode — user pasted a key from their regular
 * Runway subscription instead of from dev.runwayml.com — surfaces as a
 * 401 with a specific body shape that we sniff for.
 */
export async function runwayPing(apiKey: string): Promise<RunwayPingResult> {
  const key = (apiKey || '').trim();
  if (!key) return { ok: false, message: 'No key entered' };
  if (!/^key_/.test(key) && !/^rwk_/.test(key) && key.length < 30) {
    return {
      ok: false,
      message: 'That doesn\'t look like a Runway Developer API key. Developer keys start with key_ or rwk_. Get one at dev.runwayml.com (separate from the regular Runway app).',
    };
  }
  try {
    const r = await fetch(`${RUNWAY_BASE}/organization`, {
      method: 'GET',
      headers: {
        authorization: `Bearer ${key}`,
        'X-Runway-Version': RUNWAY_VERSION,
      },
    });
    const body = await r.text();
    if (r.ok) return { ok: true, status: r.status, message: 'Runway key works' };
    if (r.status === 401 || r.status === 403) {
      const lower = body.toLowerCase();
      if (lower.includes('developer') || lower.includes('not enabled')) {
        return {
          ok: false,
          status: r.status,
          message: 'Key rejected: this looks like a regular Runway subscription key, not a Developer API key. Sign up separately at dev.runwayml.com.',
        };
      }
      return { ok: false, status: r.status, message: `Runway returned 401 — the key is invalid, expired, or hasn't been activated for the Developer API yet.` };
    }
    if (r.status === 404) {
      return { ok: false, status: 404, message: 'Runway endpoint moved. Update the app or report this build version.' };
    }
    return { ok: false, status: r.status, message: `Runway returned ${r.status}: ${body.slice(0, 160)}` };
  } catch (e: any) {
    // CORS / network. The fetch threw BEFORE reaching Runway, which
    // means the request didn't get authenticated at all — the key has
    // nothing to do with this failure mode.
    const msg = (e?.message || '').toLowerCase();
    if (msg.includes('failed to fetch') || msg.includes('networkerror') || msg.includes('cors')) {
      return {
        ok: false,
        message:
          'Cannot reach Runway from the browser (CORS block). Runway\'s Developer API does not currently allow direct browser calls. You\'ll need to wait for them to enable CORS for your origin, or use a server-side proxy. Your key may still be perfectly valid — we just can\'t verify it from here.',
      };
    }
    return { ok: false, message: `Connection error: ${e?.message || 'unknown'}` };
  }
}
