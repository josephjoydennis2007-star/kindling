/**
 * Media weight + stripping.
 *
 * THE BUG THIS FIXES: stories embed images as base64 `data:` URLs inline in the
 * snapshot (assets[].data, shots[].storyboard / lastFrame / audioFile,
 * characters[].image). Over time these accumulate to hundreds of MB. When such a
 * snapshot is loaded into React state and rendered, the tab runs out of *memory*
 * (RAM) — the "Paused before potential out-of-memory crash" in dispatchSetState.
 * Note: this is NOT a disk-quota problem (IndexedDB had 150 GB free).
 *
 * Remote (http/https) image URLs are tiny references and cost no memory, so we
 * KEEP those. Only inline base64 `data:` blobs are stripped.
 */

import type { AppState } from '@/types';

/** A loaded snapshot heavier than this (bytes of inline base64) is auto-slimmed
 *  on open so it can't OOM the tab. Set high enough that normal storyboards (a
 *  few dozen frames) survive, but a runaway image-bloated story is rescued. */
export const HEAVY_SNAPSHOT_BYTES = 60_000_000;

function isInlineData(v: unknown): v is string {
  return typeof v === 'string' && v.startsWith('data:');
}

/** Approx bytes of inline base64 media in a snapshot. Cheap: reads string
 *  lengths of the known heavy fields only — never stringifies the whole tree. */
export function estimateMediaBytes(state: Partial<AppState> | null | undefined): number {
  if (!state) return 0;
  let bytes = 0;
  const sp: any = (state as any).screenplay;
  if (sp && Array.isArray(sp.assets)) {
    for (const a of sp.assets) if (isInlineData(a?.data)) bytes += a.data.length;
  }
  const shots: any = (state as any).shots;
  if (shots && typeof shots === 'object') {
    for (const k of Object.keys(shots)) {
      const sh = shots[k];
      if (isInlineData(sh?.storyboard)) bytes += sh.storyboard.length;
      if (isInlineData(sh?.lastFrame)) bytes += sh.lastFrame.length;
      if (isInlineData(sh?.audioFile)) bytes += sh.audioFile.length;
    }
  }
  const chars: any = (state as any).characters;
  if (Array.isArray(chars)) {
    for (const c of chars) if (isInlineData(c?.image)) bytes += c.image.length;
  }
  return bytes;
}

export interface StripResult {
  slim: Partial<AppState>;
  removedCount: number;
  bytesFreed: number;
}

/**
 * Return a copy of the snapshot with inline base64 media removed (remote URLs
 * kept). Non-destructive to text/structure. Used both to rescue a crashing
 * story on load and as the "remove images" action in the Storage Manager.
 */
export function stripHeavyMedia(state: Partial<AppState>): StripResult {
  let removedCount = 0;
  let bytesFreed = 0;
  const drop = (v: unknown): null => {
    if (isInlineData(v)) { removedCount += 1; bytesFreed += (v as string).length; }
    return null;
  };

  // Shallow-clone only the branches we touch so we don't deep-copy megabytes.
  const next: any = { ...state };

  if ((state as any).screenplay) {
    const sp: any = { ...(state as any).screenplay };
    if (Array.isArray(sp.assets)) {
      sp.assets = sp.assets.map((a: any) => {
        if (isInlineData(a?.data)) {
          removedCount += 1; bytesFreed += a.data.length;
          return { ...a, data: '', note: ((a.note || '') + ' [image removed to free memory]').trim() };
        }
        return a;
      });
    }
    next.screenplay = sp;
  }

  if ((state as any).shots && typeof (state as any).shots === 'object') {
    const shots: any = {};
    const src: any = (state as any).shots;
    for (const k of Object.keys(src)) {
      const sh = { ...src[k] };
      if (isInlineData(sh.storyboard)) sh.storyboard = drop(sh.storyboard);
      if (isInlineData(sh.lastFrame)) sh.lastFrame = drop(sh.lastFrame);
      if (isInlineData(sh.audioFile)) sh.audioFile = drop(sh.audioFile);
      shots[k] = sh;
    }
    next.shots = shots;
  }

  if (Array.isArray((state as any).characters)) {
    next.characters = (state as any).characters.map((c: any) =>
      isInlineData(c?.image) ? { ...c, image: drop(c.image) } : c,
    );
  }

  return { slim: next, removedCount, bytesFreed };
}
