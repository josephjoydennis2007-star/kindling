/**
 * Voiceover — free-first text-to-speech.
 *
 * Two tiers:
 *   1. PREVIEW — the browser's built-in SpeechSynthesis. Instant, offline,
 *      $0, but can't be captured to a file (no audio-node tap), so it's the
 *      "hear it read aloud" tier.
 *   2. FILE — Gemini TTS (generativelanguage API, free tier, browser-callable
 *      with the user's Gemini key). Returns 24kHz PCM16 which we wrap in a WAV
 *      header and upload to the user's Cloudinary → a real hosted audio URL
 *      that plays in the app and travels with the story.
 */

import { uploadFileToCloud, canUploadToCloud } from '@/lib/mediaUpload';
import { useAppStore } from '@/store/useAppStore';

/* ───────────────── Preview (browser TTS) ───────────────── */

export function speakPreview(text: string, opts: { rate?: number } = {}): boolean {
  if (typeof speechSynthesis === 'undefined') return false;
  stopPreview();
  const clean = stripCues(text);
  if (!clean) return false;
  const u = new SpeechSynthesisUtterance(clean);
  u.rate = opts.rate ?? 1.02;
  // Prefer a natural-sounding English voice when available.
  const voices = speechSynthesis.getVoices();
  const best = voices.find((v) => /en[-_]/i.test(v.lang) && /natural|neural|online/i.test(v.name))
    || voices.find((v) => /en[-_]/i.test(v.lang));
  if (best) u.voice = best;
  speechSynthesis.speak(u);
  return true;
}

export function stopPreview(): void {
  if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
}

export function isPreviewSpeaking(): boolean {
  return typeof speechSynthesis !== 'undefined' && speechSynthesis.speaking;
}

/** Remove [VISUAL: …]/[TEXT: …] cues and markdown noise so they aren't read aloud. */
export function stripCues(text: string): string {
  return (text || '')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/[#*_`>]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/* ───────────────── File (Gemini TTS → WAV → Cloudinary) ───────────────── */

export const GEMINI_VOICES = ['Kore', 'Puck', 'Charon', 'Fenrir', 'Aoede'] as const;
export type GeminiVoice = (typeof GEMINI_VOICES)[number];

function geminiKey(): string | null {
  try {
    const s: any = useAppStore.getState().settings;
    const k = (s.aiApiKey || '').trim();
    if (s.aiProvider === 'gemini' && k) return k;
    if (k.startsWith('AIza')) return k;
    return null;
  } catch { return null; }
}

/** Wrap raw PCM16 mono samples in a WAV container. */
export function pcm16ToWav(pcm: Uint8Array, sampleRate = 24000): Blob {
  const header = new ArrayBuffer(44);
  const v = new DataView(header);
  const writeStr = (off: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i)); };
  writeStr(0, 'RIFF');
  v.setUint32(4, 36 + pcm.length, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  v.setUint32(16, 16, true);          // fmt chunk size
  v.setUint16(20, 1, true);           // PCM
  v.setUint16(22, 1, true);           // mono
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true); // byte rate (16-bit mono)
  v.setUint16(32, 2, true);           // block align
  v.setUint16(34, 16, true);          // bits per sample
  writeStr(36, 'data');
  v.setUint32(40, pcm.length, true);
  return new Blob([header, pcm.buffer as ArrayBuffer], { type: 'audio/wav' });
}

export interface VOResult {
  ok: boolean;
  url?: string;
  error?: string;
  /** Rough duration in seconds (PCM length / rate). */
  seconds?: number;
}

/**
 * Generate a real voiceover FILE with Gemini TTS and store it in the user's
 * Cloudinary. Free tier; needs a Gemini key (Settings → AI, or any AIza… key
 * previously saved).
 */
export async function generateVoiceoverFile(
  text: string,
  opts: { voice?: GeminiVoice; storyId?: string; signal?: AbortSignal } = {},
): Promise<VOResult> {
  const clean = stripCues(text);
  if (!clean) return { ok: false, error: 'Nothing to voice — write the script first.' };
  const key = geminiKey();
  if (!key) {
    return { ok: false, error: 'Voiceover files use Google\'s free Gemini TTS — paste a (free) Gemini key in Settings → AI once. The ▶ Preview button works without it.' };
  }
  if (!canUploadToCloud()) {
    return { ok: false, error: 'Set up Cloudinary (Settings → Cloud → Media storage) so the audio can be saved as a link.' };
  }
  try {
    const model = 'gemini-2.5-flash-preview-tts';
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`,
      {
        method: 'POST',
        signal: opts.signal,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: clean.slice(0, 4500) }] }],
          generationConfig: {
            responseModalities: ['AUDIO'],
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: opts.voice || 'Kore' } } },
          },
        }),
      },
    );
    if (!r.ok) {
      const t = (await r.text()).slice(0, 300);
      if (r.status === 404) return { ok: false, error: 'Gemini TTS model not available on this key/region yet — use ▶ Preview for now.' };
      return { ok: false, error: `Gemini TTS ${r.status}: ${t}` };
    }
    const j: any = await r.json();
    const b64 = j?.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData)?.inlineData?.data;
    if (!b64) return { ok: false, error: 'Gemini returned no audio.' };
    const bin = atob(b64);
    const pcm = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) pcm[i] = bin.charCodeAt(i);
    const wav = pcm16ToWav(pcm, 24000);
    const url = await uploadFileToCloud(wav, opts.storyId || 'voiceover');
    if (!/^https?:\/\//i.test(url)) return { ok: false, error: 'Audio generated but the cloud upload failed — check Cloudinary in Settings.' };
    return { ok: true, url, seconds: Math.round(pcm.length / 2 / 24000) };
  } catch (e: any) {
    if (e?.name === 'AbortError') return { ok: false, error: 'Cancelled' };
    return { ok: false, error: e?.message || 'Voiceover failed' };
  }
}
