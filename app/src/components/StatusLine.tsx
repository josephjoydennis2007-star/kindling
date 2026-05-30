import { useEffect, useState } from 'react';
import { Save, Check, Loader2 } from 'lucide-react';
import type { Screenplay, Scene } from '@/types';

/**
 * StatusLine — thin (28px) status row at the very bottom of the app.
 *
 * Replaces the old StatusBar + CharacterBar + SocialBar pill stack with a
 * single quiet line. Holds:
 *   - Word count + page estimate + scene count + revision color
 *   - Save state (Saving / Saved Xs ago / Save) — click to force-save
 *
 * Compact + monospace tabular figures so numbers don't jitter.
 * Listens to the same writer:saved / writer:saving events the old StatusBar
 * did, so no plumbing changes elsewhere.
 */

interface Props {
  screenplay: Screenplay;
  scenes: Scene[];
  onSave: () => void;
}

export default function StatusLine({ screenplay, scenes, onSave }: Props) {
  const words = countWords(screenplay);
  const pages = Math.max(1, Math.ceil(screenplay.elements.length / 55));

  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const onSaving = () => setSaveState('saving');
    const onSaved = () => { setSaveState('saved'); setSavedAt(Date.now()); };
    document.addEventListener('writer:saving', onSaving);
    document.addEventListener('writer:saved', onSaved);
    return () => {
      document.removeEventListener('writer:saving', onSaving);
      document.removeEventListener('writer:saved', onSaved);
    };
  }, []);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const ago = savedAt ? Math.round((now - savedAt) / 1000) : 0;
  const agoLabel = ago < 5 ? 'just now'
    : ago < 60 ? `${ago}s ago`
    : ago < 3600 ? `${Math.round(ago / 60)}m ago`
    : `${Math.round(ago / 3600)}h ago`;

  return (
    <footer
      className="status-bar flex items-center px-3 h-7 text-[11px] text-[var(--text-muted)] border-t border-[var(--rule)] bg-[var(--bg)] flex-shrink-0"
      role="contentinfo"
    >
      <span className="tabular-nums">{words.toLocaleString()} words</span>
      <span className="mx-2.5 text-[var(--rule)]">·</span>
      <span className="tabular-nums">{pages} page{pages !== 1 ? 's' : ''}</span>
      <span className="mx-2.5 text-[var(--rule)]">·</span>
      <span className="tabular-nums">{scenes.length} scene{scenes.length !== 1 ? 's' : ''}</span>

      <span className="flex-1" />

      <button
        onClick={onSave}
        title="Save now (Ctrl/Cmd+S)"
        className={`flex items-center gap-1.5 transition-colors ${
          saveState === 'saving' ? 'text-[var(--text-muted)]'
          : saveState === 'saved' ? 'text-[var(--success)]'
          : 'text-[var(--accent)]'
        }`}
      >
        {saveState === 'saving'
          ? <><Loader2 className="w-3 h-3 animate-spin" /> Saving</>
          : saveState === 'saved'
            ? <><Check className="w-3 h-3" /> Saved {agoLabel}</>
            : <><Save className="w-3 h-3" /> Save</>}
      </button>
    </footer>
  );
}

function countWords(screenplay: Screenplay): number {
  try {
    const text = screenplay.elements.map((el) => {
      const div = document.createElement('div');
      div.innerHTML = el.content;
      return div.textContent || '';
    }).join(' ');
    return text.trim().split(/\s+/).filter((w) => w.length > 0).length;
  } catch {
    return 0;
  }
}
