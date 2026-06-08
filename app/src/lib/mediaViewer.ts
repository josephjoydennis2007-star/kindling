/**
 * Tiny global media-viewer bus. Any component can call viewMedia(url) to pop
 * the fullscreen lightbox (mounted once in App via <MediaViewer/>), without
 * prop-drilling. Supports images and videos; the viewer auto-detects video by
 * file extension or an explicit kind.
 */

export type MediaKind = 'image' | 'video' | 'auto';

export interface ViewMediaDetail {
  url: string;
  kind?: MediaKind;
  caption?: string;
}

const EVENT = 'app:viewMedia';

/** Open the fullscreen viewer on the given media URL (or data URL). */
export function viewMedia(url: string, kind: MediaKind = 'auto', caption?: string): void {
  if (!url) return;
  document.dispatchEvent(new CustomEvent<ViewMediaDetail>(EVENT, { detail: { url, kind, caption } }));
}

/** True when a URL looks like a video by extension. */
export function looksLikeVideo(url: string): boolean {
  return /\.(mp4|webm|mov|m4v|ogg)(\?|#|$)/i.test(url || '');
}

export const VIEW_MEDIA_EVENT = EVENT;
