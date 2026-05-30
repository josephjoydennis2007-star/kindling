import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  PenLine,
  Clapperboard,
  LayoutGrid,
  Image as ImageIcon,
  Bot,
  ArrowRight,
  ArrowLeft,
  Sparkles,
  X,
  type LucideIcon,
} from 'lucide-react';

const KEY = 'kindling-onboarded-v1';

interface Slide {
  icon: LucideIcon;
  title: string;
  body: string;
  gradient: string;
}

const SLIDES: Slide[] = [
  {
    icon: PenLine,
    title: 'Write — your way',
    body: 'A screenwriter\'s editor with proper scene / character / dialogue formatting. Hit Tab to cycle formats. Each story type gives you a toolbar that fits it — YouTube gets Hook / B-roll / CTA, stage plays get Stage Direction / Speaker / Aside, and so on.',
    gradient: 'from-blue-500 via-purple-500 to-pink-500',
  },
  {
    icon: Clapperboard,
    title: 'Direct — every shot',
    body: 'Break each scene into shots: type, camera & movement, lens, duration, and a storyboard image you can drag from your asset library. B-rolls nest inside shots.',
    gradient: 'from-orange-500 via-red-500 to-pink-500',
  },
  {
    icon: LayoutGrid,
    title: 'Plot — beat by beat',
    body: 'Drag beats between acts. Tag them setup / hook / turn / climax — they auto-color. Double-click a beat to expand into long-form notes. Hit "b" to drop a new beat into the first act.',
    gradient: 'from-violet-500 via-fuchsia-500 to-pink-500',
  },
  {
    icon: ImageIcon,
    title: 'Assets — your library',
    body: 'Drop images, audio, and references into the Assets panel. Then drag any image straight onto a shot card to set its storyboard. Everything stays local in your browser.',
    gradient: 'from-emerald-500 via-teal-500 to-cyan-500',
  },
  {
    icon: Bot,
    title: 'AI — co-write & rewrite',
    body: 'Plug in OpenAI, Anthropic, Groq, OpenRouter, or local Ollama. Replies stream token-by-token. Highlight any passage in the writer and hit "Inline rewrite" to have the AI sharpen it in-place.',
    gradient: 'from-pink-500 via-purple-500 to-indigo-500',
  },
];

export default function Onboarding({ force }: { force?: boolean }) {
  const [open, setOpen] = useState<boolean>(() => {
    if (force) return true;
    try { return localStorage.getItem(KEY) !== '1'; } catch { return true; }
  });
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!open) return;
      if (e.key === 'Escape') finish();
      else if (e.key === 'ArrowRight') next();
      else if (e.key === 'ArrowLeft') prev();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, idx]);

  const finish = () => {
    try { localStorage.setItem(KEY, '1'); } catch {}
    setOpen(false);
  };
  const next = () => { if (idx < SLIDES.length - 1) setIdx(idx + 1); else finish(); };
  const prev = () => { if (idx > 0) setIdx(idx - 1); };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[400] bg-black/70 backdrop-blur-md flex items-center justify-center p-4"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 12 }}
            transition={{ type: 'spring', stiffness: 240, damping: 26 }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="onboarding-title"
            className="w-full max-w-lg bg-[var(--panel)] border border-[var(--border)] rounded-2xl shadow-2xl overflow-hidden"
          >
            <button
              onClick={finish}
              title="Skip"
              className="absolute top-3 right-3 p-1.5 rounded-full text-[var(--text-muted)] hover:bg-[var(--hover)] hover:text-[var(--text)] z-10"
            >
              <X className="w-4 h-4" />
            </button>

            <AnimatePresence mode="wait">
              <motion.div
                key={idx}
                initial={{ opacity: 0, x: 18 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -18 }}
                transition={{ duration: 0.25 }}
                className="p-8"
              >
                <div className="w-16 h-16 rounded-md bg-[var(--accent-soft)] border border-[var(--accent)]/40 flex items-center justify-center mb-5">
                  {(() => { const Icon = SLIDES[idx].icon; return <Icon className="w-8 h-8" style={{ color: 'var(--accent)' }} />; })()}
                </div>
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-[var(--text-muted)] font-bold mb-1.5">
                  <Sparkles className="w-3 h-3" /> Welcome to Kindling — {idx + 1} / {SLIDES.length}
                </div>
                <h2 id="onboarding-title" className="text-2xl font-bold text-[var(--text)]">{SLIDES[idx].title}</h2>
                <p className="text-sm text-[var(--text-secondary)] mt-3 leading-relaxed">{SLIDES[idx].body}</p>
              </motion.div>
            </AnimatePresence>

            <div className="flex items-center gap-2 px-6 py-4 border-t border-[var(--border)] bg-[var(--sidebar)]">
              <div className="flex gap-1.5">
                {SLIDES.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setIdx(i)}
                    className={`w-2 h-2 rounded-full transition-all ${
                      i === idx ? 'bg-[var(--accent)] w-6' : 'bg-[var(--border)]'
                    }`}
                    aria-label={`Go to slide ${i + 1}`}
                  />
                ))}
              </div>
              <div className="flex-1" />
              <button
                onClick={prev}
                disabled={idx === 0}
                className="p-2 rounded-md text-[var(--text-muted)] hover:bg-[var(--hover)] hover:text-[var(--text)] disabled:opacity-30 disabled:hover:bg-transparent"
                aria-label="Previous"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <button
                onClick={finish}
                className="text-xs text-[var(--text-muted)] hover:text-[var(--text)] px-2"
              >
                Skip
              </button>
              <button
                onClick={next}
                className="flex items-center gap-1.5 px-4 py-2 rounded-md bg-[var(--accent)] text-[var(--bg)] text-xs font-bold hover:brightness-110"
              >
                {idx === SLIDES.length - 1 ? 'Let\'s go' : 'Next'}
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
