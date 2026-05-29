import { useEffect, useState } from 'react';
import { Save, Wifi, FileText, Hash, Clock, Check, Loader2, ScrollText } from 'lucide-react';
import type { Screenplay, Scene } from '@/types';
import { REVISION_COLORS } from '@/types';
import { useAppStore } from '@/store/useAppStore';
import SoundscapeButton from '@/components/SoundscapeButton';

interface StatusBarProps {
  screenplay: Screenplay;
  scenes: Scene[];
  onSave: () => void;
}

/**
 * Status bar reads a "writer:saved" custom event from App.tsx whenever a save
 * completes, so we can show a "saved Xs ago" badge that ticks.
 */
export default function StatusBar({ screenplay, scenes, onSave }: StatusBarProps) {
  let words = 0;
  try {
    const text = screenplay.elements.map(el => {
      const div = document.createElement('div');
      div.innerHTML = el.content;
      return div.textContent || '';
    }).join(' ');
    words = text.trim().split(/\s+/).filter(w => w.length > 0).length;
  } catch {
    words = 0;
  }
  const pages = Math.max(1, Math.ceil(screenplay.elements.length / 55));

  // Save state: 'idle' | 'saving' | 'saved'. Auto-ticks every second so
  // "saved Xs ago" stays current without external triggers.
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

  // Tick every second so the "X seconds ago" stays fresh
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
    <div className="status-bar">
      <div className="flex items-center gap-5">
        <span className="flex items-center gap-1.5" aria-label={`${words} words`}>
          <FileText className="w-3 h-3" />
          {words} words
        </span>
        <span className="flex items-center gap-1.5" aria-label={`${pages} pages`}>
          <Hash className="w-3 h-3" />
          {pages} page{pages !== 1 ? 's' : ''}
        </span>
        <span className="flex items-center gap-1.5" aria-label={`${scenes.length} scenes`}>
          <Clock className="w-3 h-3" />
          {scenes.length} scene{scenes.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="ml-auto flex items-center gap-4">
        <SoundscapeButton />
        <RevisionBadge screenplay={screenplay} />
        <span className="flex items-center gap-1.5 text-[var(--success)]">
          <Wifi className="w-3 h-3" />
          Local
        </span>
        <button
          onClick={onSave}
          title="Save now (Ctrl/Cmd+S)"
          className={`flex items-center gap-1.5 px-2 py-0.5 rounded hover:bg-[var(--hover)] transition-colors ${
            saveState === 'saving' ? 'text-[var(--text-muted)]'
            : saveState === 'saved' ? 'text-[var(--success)]'
            : 'text-[var(--accent)]'
          }`}
        >
          {saveState === 'saving'
            ? <><Loader2 className="w-3 h-3 animate-spin" /> Saving…</>
            : saveState === 'saved'
              ? <><Check className="w-3 h-3" /> Saved {agoLabel}</>
              : <><Save className="w-3 h-3" /> Save</>}
        </button>
      </div>
    </div>
  );
}

/**
 * Industry revision color badge. Click to bump to the next color in the
 * standard order (White → Blue → Pink → Yellow → …). Right-click resets.
 */
function RevisionBadge({ screenplay }: { screenplay: Screenplay }) {
  const updateScreenplayField = useAppStore((s) => s.updateScreenplayField);
  const stage = screenplay.revisionStage || 0;
  const color = REVISION_COLORS[stage] || REVISION_COLORS[0];
  return (
    <button
      onClick={() => updateScreenplayField('revisionStage', (stage + 1) % REVISION_COLORS.length)}
      onContextMenu={(e) => { e.preventDefault(); updateScreenplayField('revisionStage', 0); }}
      title={`Revision: ${color.name} — click to bump, right-click to reset`}
      className="flex items-center gap-1.5 px-2 py-0.5 rounded-md border border-[var(--border)]"
      style={{ background: color.hex, color: color.textHex }}
    >
      <ScrollText className="w-3 h-3" />
      <span className="text-[10px] font-bold uppercase">{color.name}</span>
    </button>
  );
}
