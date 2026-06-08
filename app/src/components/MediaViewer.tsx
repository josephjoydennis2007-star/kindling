import { useEffect, useState, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, Download, ExternalLink, ZoomIn, ZoomOut } from 'lucide-react';
import { VIEW_MEDIA_EVENT, looksLikeVideo, type ViewMediaDetail } from '@/lib/mediaViewer';

/**
 * Fullscreen lightbox for shot frames, storyboards, assets, and Runway
 * results. Mounted once in App. Opens when any component dispatches the
 * `app:viewMedia` event (via viewMedia()). Click the backdrop or press Esc
 * to close. Images can be zoomed; videos play with native controls.
 */
export default function MediaViewer() {
  const [media, setMedia] = useState<ViewMediaDetail | null>(null);
  const [zoom, setZoom] = useState(1);

  const close = useCallback(() => { setMedia(null); setZoom(1); }, []);

  useEffect(() => {
    const onView = (e: Event) => {
      const detail = (e as CustomEvent<ViewMediaDetail>).detail;
      if (detail?.url) { setMedia(detail); setZoom(1); }
    };
    document.addEventListener(VIEW_MEDIA_EVENT, onView as EventListener);
    return () => document.removeEventListener(VIEW_MEDIA_EVENT, onView as EventListener);
  }, []);

  useEffect(() => {
    if (!media) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      if (e.key === '+' || e.key === '=') setZoom((z) => Math.min(5, z + 0.25));
      if (e.key === '-') setZoom((z) => Math.max(0.5, z - 0.25));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [media, close]);

  const isVideo = media ? (media.kind === 'video' || (media.kind !== 'image' && looksLikeVideo(media.url))) : false;

  return (
    <AnimatePresence>
      {media && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-[200] bg-black/90 backdrop-blur-sm flex items-center justify-center"
          onClick={close}
        >
          {/* Toolbar */}
          <div className="absolute top-3 right-3 flex items-center gap-2 z-10" onClick={(e) => e.stopPropagation()}>
            {!isVideo && (
              <>
                <button
                  onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}
                  className="p-2 rounded-lg bg-white/10 text-white hover:bg-white/20 transition-colors"
                  title="Zoom out (-)"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>
                <span className="text-xs text-white/70 tabular-nums w-10 text-center">{Math.round(zoom * 100)}%</span>
                <button
                  onClick={() => setZoom((z) => Math.min(5, z + 0.25))}
                  className="p-2 rounded-lg bg-white/10 text-white hover:bg-white/20 transition-colors"
                  title="Zoom in (+)"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
              </>
            )}
            <a
              href={media.url}
              target="_blank"
              rel="noreferrer"
              className="p-2 rounded-lg bg-white/10 text-white hover:bg-white/20 transition-colors"
              title="Open in new tab"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
            <a
              href={media.url}
              download
              className="p-2 rounded-lg bg-white/10 text-white hover:bg-white/20 transition-colors"
              title="Download"
            >
              <Download className="w-4 h-4" />
            </a>
            <button
              onClick={close}
              className="p-2 rounded-lg bg-white/10 text-white hover:bg-white/20 transition-colors"
              title="Close (Esc)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Media */}
          <div
            className="max-w-[92vw] max-h-[88vh] overflow-auto flex items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            {isVideo ? (
              <video
                src={media.url}
                controls
                autoPlay
                className="max-w-[92vw] max-h-[88vh] rounded-lg shadow-2xl"
              />
            ) : (
              <img
                src={media.url}
                alt={media.caption || 'preview'}
                style={{ transform: `scale(${zoom})`, transformOrigin: 'center' }}
                className="max-w-[92vw] max-h-[88vh] object-contain rounded-lg shadow-2xl transition-transform"
              />
            )}
          </div>

          {media.caption && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-lg bg-black/60 text-white text-xs max-w-[80vw] text-center" onClick={(e) => e.stopPropagation()}>
              {media.caption}
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
