import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, Copy, Check, ExternalLink, Film, Image as ImageIcon } from 'lucide-react';
import { toast } from 'sonner';
import { RUNWAY_PROMPT_EVENT, type RunwayPromptDetail } from '@/lib/sendToRunway';
import { useAppStore } from '@/store/useAppStore';

/**
 * A persistent, copyable prompt panel that appears when the user sends a shot
 * to Runway. Runway's own prompt box can't be reliably auto-filled (their
 * React app blocks programmatic input across versions), so instead of relying
 * on a flaky paste we ALWAYS surface the exact prompt here with a one-click
 * Copy button + an "Open Runway" link. The user pastes it into Runway (Ctrl+V)
 * — the prompt is already on the clipboard too. Mounted once in App.
 */
export default function RunwayPromptDialog() {
  const [data, setData] = useState<RunwayPromptDetail | null>(null);
  const [copied, setCopied] = useState(false);
  const [result, setResult] = useState('');

  // Attach a Runway result back onto the shot this prompt was sent from — one
  // paste, lands on the right place automatically (no hunting in the storyboard).
  const attachResult = () => {
    const url = result.trim();
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) { toast.error('Paste a hosted URL (http/https) from Runway'); return; }
    const shotId = data?.shotId;
    if (!shotId) { toast.error('No shot linked', { description: 'Generate from a shot’s Image/Video button to auto-attach.' }); return; }
    const st = useAppStore.getState();
    if (!(st.shots as any)[shotId]) { toast.error('That shot no longer exists'); return; }
    if (data?.target === 'video') st.updateShot(shotId, { video: url } as any);
    else st.updateShot(shotId, { storyboard: url } as any);
    toast.success(data?.target === 'video' ? 'Video attached to the shot' : 'Image attached to the shot');
    setResult('');
    setData(null);
  };

  useEffect(() => {
    const onEvt = (e: Event) => {
      const detail = (e as CustomEvent<RunwayPromptDetail>).detail;
      if (detail?.prompt) { setData(detail); setCopied(false); }
    };
    document.addEventListener(RUNWAY_PROMPT_EVENT, onEvt as EventListener);
    return () => document.removeEventListener(RUNWAY_PROMPT_EVENT, onEvt as EventListener);
  }, []);

  const copy = async () => {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(data.prompt);
      setCopied(true);
      toast.success('Prompt copied');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Could not copy — select the text and copy manually.');
    }
  };

  const runwayUrl = data?.target === 'video'
    ? 'https://app.runwayml.com/video-tools/teams/personal/ai-tools/gen-4'
    : 'https://app.runwayml.com/video-tools/teams/personal/ai-tools/generative-images';

  return (
    <AnimatePresence>
      {data && (
        <motion.div
          initial={{ opacity: 0, y: 20, x: 20 }}
          animate={{ opacity: 1, y: 0, x: 0 }}
          exit={{ opacity: 0, y: 20 }}
          className="fixed bottom-4 right-4 z-[180] w-[360px] max-w-[92vw] bg-[var(--panel)] border border-[var(--accent)] rounded-xl shadow-2xl overflow-hidden"
        >
          <div className="flex items-center justify-between px-4 py-2.5 bg-[var(--accent)]/10 border-b border-[var(--border)]">
            <div className="flex items-center gap-2 text-xs font-bold text-[var(--accent)] uppercase tracking-wider">
              {data.target === 'video' ? <Film className="w-3.5 h-3.5" /> : <ImageIcon className="w-3.5 h-3.5" />}
              Runway {data.target === 'video' ? 'video' : 'image'} prompt
            </div>
            <button onClick={() => setData(null)} className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text)]" title="Close">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-4">
            {data.shotLabel && (
              <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-1.5">{data.shotLabel}</div>
            )}
            <textarea
              readOnly
              value={data.prompt}
              onFocus={(e) => e.currentTarget.select()}
              className="w-full h-28 resize-none bg-[var(--bg)] border border-[var(--border)] rounded-lg p-2.5 text-xs text-[var(--text)] outline-none focus:border-[var(--accent)]"
            />

            {/* Reference frames for the video — drag into Runway, or open/copy. */}
            {data.imageUrls && data.imageUrls.length > 0 && (
              <div className="mt-3">
                <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-1.5">
                  {data.imageUrls.length === 1 ? 'Reference frame' : 'Reference frames (1st → last)'} — drag into Runway, or open to save
                </div>
                <div className="flex gap-2 flex-wrap">
                  {data.imageUrls.map((u, i) => (
                    <div key={u + i} className="relative group/ref">
                      <img
                        src={u}
                        alt={`reference ${i + 1}`}
                        draggable
                        onDragStart={(e) => { e.dataTransfer.setData('text/uri-list', u); e.dataTransfer.setData('text/plain', u); }}
                        onClick={() => window.open(u, '_blank', 'noopener')}
                        className="w-20 h-14 object-cover rounded-md border border-[var(--border)] cursor-grab active:cursor-grabbing hover:border-[var(--accent)]"
                        title="Drag into Runway's image box, or click to open"
                      />
                      <button
                        onClick={async () => { try { await navigator.clipboard.writeText(u); toast.success('Image URL copied'); } catch { toast.error('Copy failed'); } }}
                        className="absolute bottom-0.5 right-0.5 p-1 rounded bg-black/70 text-white opacity-0 group-hover/ref:opacity-100 transition-opacity"
                        title="Copy image URL"
                      >
                        <Copy className="w-2.5 h-2.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="flex gap-2 mt-3">
              <button
                onClick={copy}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-[var(--accent)] text-[var(--accent-ink)] text-xs font-bold hover:brightness-110 transition-all"
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Copied' : 'Copy prompt'}
              </button>
              <a
                href={runwayUrl}
                target="_blank"
                rel="noreferrer"
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-[var(--card)] border border-[var(--border)] text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--accent)] hover:border-[var(--accent)] transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Open Runway
              </a>
            </div>
            {/* Paste the Runway result → auto-attaches to the shot it came from */}
            {data.shotId && (
              <div className="mt-3 pt-3 border-t border-[var(--border)]">
                <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-1.5">Got your {data.target === 'video' ? 'video' : 'image'}? Paste it back</div>
                <div className="flex gap-2">
                  <input
                    value={result}
                    onChange={(e) => setResult(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') attachResult(); }}
                    placeholder="Paste the Runway result URL…"
                    className="flex-1 bg-[var(--bg)] border border-[var(--border)] rounded-md px-2.5 py-1.5 text-[11px] text-[var(--text)] outline-none focus:border-[var(--accent)]"
                  />
                  <button onClick={attachResult} className="px-3 py-1.5 rounded-md text-[11px] font-bold bg-[var(--accent)] text-[var(--accent-ink)] hover:brightness-110 whitespace-nowrap">Attach</button>
                </div>
                <p className="text-[9px] text-[var(--text-muted)] mt-1">Lands on this shot automatically — {data.target === 'video' ? 'as its video' : 'as its frame'}.</p>
              </div>
            )}

            <p className="text-[10px] text-[var(--text-muted)] mt-2.5 leading-relaxed">
              {data.target === 'video' && data.imageUrls && data.imageUrls.length > 0
                ? <>Paste the prompt (Ctrl/Cmd+V), then drag the reference frame(s) above into Runway's image box (first = start, last = end). Click Generate, then drag the result back onto the shot.</>
                : <>Paste into Runway's prompt box (Ctrl/Cmd+V — it's already on your clipboard), click Generate, then drag the result image back onto the shot, or attach it via Claude with <span className="text-[var(--text-secondary)] font-medium">set_shot_frame</span>.</>}
            </p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
