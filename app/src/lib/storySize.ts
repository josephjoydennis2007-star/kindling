/**
 * Story size guard.
 *
 * A story is saved to Firestore as ONE document whose `data` field is the
 * JSON-stringified story. Firestore caps a document at 1,048,576 bytes. If a
 * write exceeds that it FAILS — and historically that failure was swallowed,
 * so the user's work silently stopped syncing. This module makes the limit
 * explicit: we measure the payload and refuse (with a clear, catchable error)
 * before attempting a doomed write, and expose a "near the limit" threshold so
 * the UI can warn early.
 *
 * The usual culprit is embedded image/audio data: URLs (uploaded assets,
 * storyboard frames, character art). Keeping those as hosted URLs instead of
 * base64 is the real long-term fix; this guard stops data loss in the meantime.
 */

export const FIRESTORE_DOC_LIMIT = 1_048_576; // hard Firestore limit (bytes)
// Leave headroom for the other doc fields (owner, title, timestamps, etc.).
export const SAFE_DATA_LIMIT = 980_000;
// Start warning the user well before the ceiling.
export const WARN_THRESHOLD = 800_000;

/** UTF-8 byte length of a string. */
export function byteSize(str: string): number {
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(str).length;
  // Fallback (older runtimes): count UTF-8 bytes manually.
  let bytes = 0;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    bytes += c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0xd800 || c >= 0xe000 ? 3 : (i++, 4);
  }
  return bytes;
}

export function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/** Thrown when a story payload would exceed the safe Firestore size. */
export class StorySizeError extends Error {
  readonly name = 'StorySizeError';
  readonly bytes: number;
  constructor(bytes: number) {
    super(
      `This story is too large to sync to the cloud (${humanSize(bytes)} — the limit is ${humanSize(SAFE_DATA_LIMIT)}). ` +
      `It's almost always large embedded images. Remove some from Assets or shot frames, ` +
      `or attach images by URL instead of uploading them. Your work is still saved on this device.`,
    );
    this.bytes = bytes;
  }
}

/** Throws StorySizeError if the data string exceeds the safe cloud limit. */
export function assertWithinCloudLimit(data: string): number {
  const bytes = byteSize(data);
  if (bytes > SAFE_DATA_LIMIT) throw new StorySizeError(bytes);
  return bytes;
}

/** True when the payload is large enough to warn (but still under the limit). */
export function isNearCloudLimit(data: string): boolean {
  const bytes = byteSize(data);
  return bytes >= WARN_THRESHOLD && bytes <= SAFE_DATA_LIMIT;
}
