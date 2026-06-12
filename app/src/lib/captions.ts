/**
 * Captions — generate a standard .srt subtitle file from a script, 100% free,
 * entirely in the browser (no API, no upload).
 *
 * Timing model: spoken narration averages ~2.6 words/second. We split the
 * script into caption-sized chunks (≤ 2 lines × ~42 chars, the broadcast
 * convention), weight each chunk's duration by its word count, and lay them
 * end-to-end. If the real voiceover duration is known (e.g. from the generated
 * VO file), pass `totalSeconds` and the timeline is scaled to fit it exactly.
 */

import { stripCues } from '@/lib/voiceover';

const WORDS_PER_SECOND = 2.6;
const MAX_LINE = 42;        // chars per caption line (broadcast convention)
const MIN_CHUNK_SECONDS = 1;

export interface CaptionCue {
  index: number;
  start: number;  // seconds
  end: number;    // seconds
  text: string;   // 1-2 lines joined with \n
}

/** Split text into caption-sized chunks (≤ 2 lines of ≤ MAX_LINE chars). */
export function chunkScript(script: string): string[] {
  const clean = stripCues(script);
  if (!clean) return [];
  // Sentence-ish split first, then pack words into ≤2-line chunks.
  const sentences = clean.split(/(?<=[.!?…])\s+/).filter(Boolean);
  const chunks: string[] = [];
  for (const sentence of sentences) {
    const words = sentence.split(/\s+/).filter(Boolean);
    let cur = '';
    for (const w of words) {
      const tryLine = cur ? `${cur} ${w}` : w;
      if (tryLine.length <= MAX_LINE * 2) {
        cur = tryLine;
      } else {
        if (cur) chunks.push(cur);
        cur = w;
      }
    }
    if (cur) chunks.push(cur);
  }
  return chunks;
}

/** Wrap a chunk into 1-2 display lines. */
function wrapLines(chunk: string): string {
  if (chunk.length <= MAX_LINE) return chunk;
  // Break near the middle at a space for a balanced two-liner.
  const mid = Math.floor(chunk.length / 2);
  let breakAt = chunk.lastIndexOf(' ', mid);
  if (breakAt < 10) breakAt = chunk.indexOf(' ', mid);
  if (breakAt <= 0) return chunk;
  return `${chunk.slice(0, breakAt)}\n${chunk.slice(breakAt + 1)}`;
}

/** Build timed cues from a script. */
export function buildCues(script: string, opts: { totalSeconds?: number } = {}): CaptionCue[] {
  const chunks = chunkScript(script);
  if (!chunks.length) return [];
  const durations = chunks.map((c) => Math.max(MIN_CHUNK_SECONDS, c.split(/\s+/).length / WORDS_PER_SECOND));
  const natural = durations.reduce((a, b) => a + b, 0);
  const scale = opts.totalSeconds && opts.totalSeconds > 0 ? opts.totalSeconds / natural : 1;
  const cues: CaptionCue[] = [];
  let t = 0;
  chunks.forEach((c, i) => {
    const d = durations[i] * scale;
    cues.push({ index: i + 1, start: t, end: t + d, text: wrapLines(c) });
    t += d;
  });
  return cues;
}

function fmtTime(sec: number): string {
  const ms = Math.round(sec * 1000);
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const r = ms % 1000;
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${p(h)}:${p(m)}:${p(s)},${p(r, 3)}`;
}

/** Render cues as a standard SRT document. */
export function cuesToSrt(cues: CaptionCue[]): string {
  return cues
    .map((c) => `${c.index}\n${fmtTime(c.start)} --> ${fmtTime(c.end)}\n${c.text}\n`)
    .join('\n');
}

/** One-shot: script → SRT text. */
export function scriptToSrt(script: string, opts: { totalSeconds?: number } = {}): string {
  return cuesToSrt(buildCues(script, opts));
}

/** Trigger a browser download of the SRT file. */
export function downloadSrt(filename: string, srt: string): void {
  const blob = new Blob([srt], { type: 'text/srt;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.srt') ? filename : `${filename}.srt`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
