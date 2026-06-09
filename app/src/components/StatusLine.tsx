import { useEffect, useMemo, useState } from 'react';
import { Save, Loader2, CloudOff, Cloud, HardDrive, Gauge } from 'lucide-react';
import type { Screenplay, Scene } from '@/types';
import { useAppStore } from '@/store/useAppStore';
import { estimateMediaBytes } from '@/lib/mediaStrip';

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
  /** Word-style dirty flag — true when there are in-memory changes that
   *  haven't been written to IndexedDB. Drives the "Unsaved" indicator. */
  dirty?: boolean;
}

export default function StatusLine({ screenplay, scenes, onSave, dirty }: Props) {
  const words = countWords(screenplay);
  const pages = Math.max(1, Math.ceil(screenplay.elements.length / 55));

  // ── Story-weight meter ──
  // How much of THIS story is heavy embedded base64 media (the thing that fills
  // your tab's RAM and causes freezes). Remote/cloud image URLs cost ~nothing,
  // so a story whose media lives in the cloud reads as light. Click → Storage.
  const shots = useAppStore((s) => s.shots);
  const characters = useAppStore((s) => s.characters);
  const bRolls = useAppStore((s) => s.bRolls);
  const mediaBytes = useMemo(
    () => estimateMediaBytes({ screenplay, shots, characters, bRolls } as any),
    [screenplay, shots, characters, bRolls],
  );
  const weight = (() => {
    const mb = mediaBytes / (1024 * 1024);
    if (mediaBytes < 1_000_000) return null; // negligible — hide the chip
    if (mb < 15) return { cls: 'text-[var(--text-secondary)]', dot: 'var(--success)', note: 'Light — fine.' };
    if (mb < 45) return { cls: 'text-[var(--warning)]', dot: 'var(--warning)', note: 'Getting heavy — move images to the cloud soon.' };
    return { cls: 'text-[var(--danger)]', dot: 'var(--danger)', note: 'Heavy — risks freezing. Open Storage → Move images to cloud.' };
  })();
  const mbLabel = mediaBytes >= 1024 * 1024 ? `${(mediaBytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.round(mediaBytes / 1024)} KB`;

  // Save lifecycle: idle → saving → savedlocal (on device) → synced (cloud OK).
  // `cloud` tracks the last cloud outcome so the indicator is HONEST about
  // where the work actually lives.
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'savedlocal' | 'synced'>('idle');
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine !== false);

  useEffect(() => {
    const onSaving = () => setSaveState('saving');
    const onSaved = () => { setSaveState((s) => (s === 'synced' ? s : 'savedlocal')); setSavedAt(Date.now()); };
    const onSynced = () => { setSaveState('synced'); setSavedAt(Date.now()); };
    const onCloudFailed = () => setSaveState('savedlocal');
    document.addEventListener('writer:saving', onSaving);
    document.addEventListener('writer:saved', onSaved);
    document.addEventListener('writer:cloudsynced', onSynced);
    document.addEventListener('writer:cloudfailed', onCloudFailed);
    return () => {
      document.removeEventListener('writer:saving', onSaving);
      document.removeEventListener('writer:saved', onSaved);
      document.removeEventListener('writer:cloudsynced', onSynced);
      document.removeEventListener('writer:cloudfailed', onCloudFailed);
    };
  }, []);

  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down); };
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

  // Build the honest save chip.
  let chip: { icon: any; label: string; cls: string; title: string };
  if (!online) {
    chip = { icon: CloudOff, label: 'Offline · saved here', cls: 'text-[var(--warning)]', title: 'You\'re offline. Your work is saved on this device and will sync when you reconnect.' };
  } else if (saveState === 'saving') {
    chip = { icon: Loader2, label: 'Saving…', cls: 'text-[var(--text-muted)]', title: 'Saving…' };
  } else if (dirty) {
    chip = { icon: Save, label: 'Unsaved', cls: 'text-[var(--warning)]', title: 'You have unsaved changes — click to save (Ctrl/Cmd+S).' };
  } else if (saveState === 'synced') {
    chip = { icon: Cloud, label: `Synced ${agoLabel}`, cls: 'text-[var(--success)]', title: 'Saved on this device and synced to the cloud.' };
  } else if (saveState === 'savedlocal') {
    chip = { icon: HardDrive, label: `Saved ${agoLabel}`, cls: 'text-[var(--text-secondary)]', title: 'Saved on this device. Sign in to sync to the cloud.' };
  } else {
    chip = { icon: Save, label: 'Save', cls: 'text-[var(--accent)]', title: 'Save now (Ctrl/Cmd+S)' };
  }
  const ChipIcon = chip.icon;

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

      {weight && (
        <button
          onClick={() => document.dispatchEvent(new CustomEvent('app:openStorage'))}
          title={`This story holds ${mbLabel} of embedded images in memory. ${weight.note}`}
          className={`flex items-center gap-1.5 mr-3 transition-colors hover:brightness-125 ${weight.cls}`}
        >
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: weight.dot }} />
          <Gauge className="w-3 h-3" />
          <span className="tabular-nums">{mbLabel}</span>
        </button>
      )}

      <button
        onClick={onSave}
        title={chip.title}
        aria-label={chip.title}
        className={`flex items-center gap-1.5 transition-colors hover:brightness-125 ${chip.cls}`}
      >
        <ChipIcon className={`w-3 h-3 ${saveState === 'saving' ? 'animate-spin' : ''}`} />
        {chip.label}
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
