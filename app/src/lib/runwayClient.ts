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
    return { ok: false, error: e?.message || 'Network error' };
  }
}

/** Quick sanity check that the user's API key is valid (no charge). */
export async function runwayPing(apiKey: string): Promise<boolean> {
  if (!apiKey) return false;
  try {
    const r = await fetch(`${RUNWAY_BASE}/organization`, {
      headers: {
        authorization: `Bearer ${apiKey}`,
        'X-Runway-Version': RUNWAY_VERSION,
      },
    });
    return r.ok;
  } catch {
    return false;
  }
}
