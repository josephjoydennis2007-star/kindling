/**
 * In-app image generation — storyboard frames + thumbnails WITHOUT leaving
 * Kindling, free-first.
 *
 * Engine chain (verified June 2026):
 *   1. NVIDIA FLUX.1-schnell via the Kindling Worker proxy (?target=image) —
 *      uses the user's free-credit nvapi key from Settings → AI. NVIDIA's API
 *      is server-only (no CORS), hence the proxy. Returns base64 image JSON.
 *   2. Pollinations — historically keyless; now Turnstile/402-gated for most
 *      callers, kept only as a last-chance fallback.
 *
 * Persistence: the generated image is uploaded to the user's Cloudinary
 * (mediaUpload chain) so the stored URL is theirs forever — never base64 in
 * the story (that was the RAM-freeze bug).
 */

import { uploadFileToCloud, canUploadToCloud } from '@/lib/mediaUpload';
import { useAppStore } from '@/store/useAppStore';
import { NVIDIA_PROXY } from '@/lib/aiClient';

export type ImageShape = 'wide' | 'vertical' | 'thumbnail' | 'square';

// FLUX-friendly sizes (multiples of 64, near the model's native 1MP budget).
const SHAPES: Record<ImageShape, { width: number; height: number }> = {
  wide: { width: 1344, height: 768 },        // storyboard frame ~16:9
  thumbnail: { width: 1344, height: 768 },   // YouTube thumbnail ~16:9
  vertical: { width: 768, height: 1344 },    // Shorts frame ~9:16
  square: { width: 1024, height: 1024 },
};

export interface GenResult {
  ok: boolean;
  /** Final stored URL (Cloudinary when possible, else provider URL). */
  url?: string;
  /** Which engine produced it. */
  engine?: string;
  error?: string;
}

/** The user's NVIDIA key (free credits) — accepted from Settings → AI. */
function nvidiaKey(): string | null {
  try {
    const s: any = useAppStore.getState().settings;
    const k = (s.aiApiKey || '').trim();
    if (s.aiProvider === 'nvidia' && k) return k;
    if (k.startsWith('nvapi-')) return k;
    return null;
  } catch { return null; }
}

function b64ToBlob(b64: string): Blob {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const mime = b64.startsWith('/9j/') ? 'image/jpeg' : 'image/png';
  return new Blob([bytes], { type: mime });
}

async function nvidiaGenerate(prompt: string, shape: ImageShape, seed: number, key: string, signal?: AbortSignal): Promise<Blob> {
  const { width, height } = SHAPES[shape];
  const r = await fetch(`${NVIDIA_PROXY}?target=image`, {
    method: 'POST',
    signal,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({ prompt, width, height, steps: 4, seed, cfg_scale: 0 }),
  });
  if (!r.ok) {
    const t = (await r.text()).slice(0, 300);
    throw new Error(`NVIDIA image ${r.status}: ${t}`);
  }
  const j: any = await r.json();
  // NVIDIA genai response shapes vary by model wrapper — accept the known ones.
  const b64 = j?.artifacts?.[0]?.base64 || j?.image || j?.data?.[0]?.b64_json;
  if (!b64 || typeof b64 !== 'string') throw new Error('NVIDIA returned no image data');
  return b64ToBlob(b64);
}

async function pollinationsGenerate(prompt: string, shape: ImageShape, seed: number, signal?: AbortSignal): Promise<Blob> {
  const { width, height } = SHAPES[shape];
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}` +
    `?width=${width}&height=${height}&seed=${seed}&nologo=true&model=flux`;
  const r = await fetch(url, { signal });
  if (!r.ok) throw new Error(`Pollinations ${r.status}`);
  const blob = await r.blob();
  if (!blob.type.startsWith('image/') || blob.size < 1000) throw new Error('Provider returned a non-image');
  return blob;
}

/**
 * Generate an image for a prompt. Returns a hosted URL (Cloudinary preferred).
 * `seed` varies the result — pass a new one to "re-roll".
 */
export async function generateImage(
  prompt: string,
  shape: ImageShape = 'wide',
  opts: { seed?: number; storyId?: string; signal?: AbortSignal } = {},
): Promise<GenResult> {
  const p = (prompt || '').trim();
  if (!p) return { ok: false, error: 'Empty prompt' };
  const seed = opts.seed ?? Math.floor(Math.random() * 1_000_000);

  let blob: Blob | null = null;
  let engine = '';
  const errors: string[] = [];

  const key = nvidiaKey();
  if (key) {
    try {
      blob = await nvidiaGenerate(p, shape, seed, key, opts.signal);
      engine = 'FLUX.1-schnell (NVIDIA)';
    } catch (e: any) {
      if (e?.name === 'AbortError') return { ok: false, error: 'Cancelled' };
      errors.push(e?.message || 'NVIDIA failed');
    }
  } else {
    errors.push('No NVIDIA key — set provider NVIDIA in Settings → AI (free)');
  }

  if (!blob) {
    try {
      blob = await pollinationsGenerate(p, shape, seed, opts.signal);
      engine = 'FLUX (Pollinations)';
    } catch (e: any) {
      if (e?.name === 'AbortError') return { ok: false, error: 'Cancelled' };
      errors.push(e?.message || 'Pollinations failed');
    }
  }

  if (!blob) return { ok: false, error: errors.join(' · ') };

  // Persist to the user's own cloud when configured; otherwise keep on device
  // as an object-lifetime data URL is NOT acceptable (RAM bug) — so require a
  // host and say so plainly.
  if (canUploadToCloud()) {
    try {
      const stored = await uploadFileToCloud(blob, opts.storyId || 'gen');
      if (/^https?:\/\//i.test(stored)) return { ok: true, url: stored, engine: `${engine} → Cloudinary` };
    } catch { /* fall through */ }
  }
  return { ok: false, error: 'Generated, but no cloud media host is set up — add Cloudinary in Settings → Cloud → Media storage so images can be saved as links.' };
}

/** Build a cinematic frame prompt from a shot's facts. */
export function framePrompt(parts: { description?: string; shotType?: string; scene?: string; style?: string }): string {
  const bits: string[] = [];
  if (parts.shotType) bits.push(`${parts.shotType.toLowerCase()} shot`);
  if (parts.description) bits.push(parts.description.replace(/\[[^\]]*\]/g, '').trim());
  if (parts.scene) bits.push(`scene: ${parts.scene}`);
  return `Cinematic film still, ${bits.filter(Boolean).join(', ')}. ${parts.style || 'Photoreal, dramatic lighting, shallow depth of field, film grain, 35mm.'}`;
}

/** Build a high-CTR YouTube thumbnail prompt. */
export function thumbnailPrompt(idea: string, overlayText?: string): string {
  return `YouTube thumbnail, ${idea}. Bold single subject, exaggerated expression, high contrast, vivid complementary colors, rule of thirds with clear empty space ${overlayText ? `for the text "${overlayText}"` : 'for title text'}, sharp studio lighting, ultra-detailed, clickable.`;
}
