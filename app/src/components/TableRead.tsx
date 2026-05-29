import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  X, Play, Pause, SkipForward, SkipBack, Square,
  Mic2, Users, Gauge, Volume2, AlertCircle,
} from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import type { ScreenplayElement } from '@/types';

/**
 * Table-Read mode.
 *
 * Uses the browser's built-in SpeechSynthesis to read the screenplay aloud,
 * assigning a different voice to each character. The user can:
 *   - pick which voice each character gets
 *   - skip / pause / resume / restart
 *   - tweak rate (0.7–1.4×) and master volume
 *   - watch the current line scroll past in the preview pane
 *
 * Everything happens in the browser — no audio leaves the device.
 *
 * Notes about Web Speech quirks:
 *   - speechSynthesis.getVoices() is empty until `voiceschanged` fires once.
 *   - Long utterances are throttled by Chrome; we batch into per-element
 *     utterances so the queue can be paused/skipped responsively.
 *   - When the panel closes mid-read, we MUST call speechSynthesis.cancel()
 *     or the browser keeps speaking after we unmount.
 */

interface Item {
  id: string;
  /** What gets spoken. */
  text: string;
  /** 'narrator' | speaker name in caps. */
  voice: 'narrator' | string;
  /** Pretty label for the preview pane. */
  label: string;
  /** Element type, for color-coding the preview. */
  kind: 'scene-heading' | 'action' | 'dialogue' | 'transition';
}

interface Props { onClose: () => void; }

const NARRATOR = 'narrator';

export default function TableRead({ onClose }: Props) {
  const screenplay = useAppStore((s) => s.screenplay);

  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceMap, setVoiceMap] = useState<Record<string, string>>(() => loadVoiceMap());
  const [rate, setRate] = useState(1.0);
  const [volume, setVolume] = useState(1.0);
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [paused, setPaused] = useState(false);

  // Detect SpeechSynthesis support up front — Safari iOS prior to 16 lacks it.
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window;

  // Build the read queue from screenplay elements. Scene headings + action
  // get the narrator voice; character cues set the next dialogue's voice.
  const items = useMemo<Item[]>(() => {
    if (!screenplay?.elements) return [];
    const out: Item[] = [];
    let speaker: string | null = null;
    let parenthetical: string | null = null;
    for (const el of screenplay.elements as ScreenplayElement[]) {
      const text = stripHtml(el.content).trim();
      if (!text) continue;
      if (el.type === 'scene-heading') {
        out.push({ id: el.id, text, voice: NARRATOR, label: text, kind: 'scene-heading' });
        speaker = null; parenthetical = null;
      } else if (el.type === 'action') {
        out.push({ id: el.id, text, voice: NARRATOR, label: text, kind: 'action' });
        speaker = null; parenthetical = null;
      } else if (el.type === 'transition') {
        out.push({ id: el.id, text, voice: NARRATOR, label: text, kind: 'transition' });
      } else if (el.type === 'character') {
        speaker = text.replace(/\(.+?\)/g, '').trim().toUpperCase();
        parenthetical = null;
      } else if (el.type === 'parenthetical') {
        parenthetical = text;
      } else if (el.type === 'dialogue' && speaker) {
        // Prepend parenthetical as a stage direction prefix the voice can hint at.
        const spoken = parenthetical ? `${parenthetical}. ${text}` : text;
        out.push({
          id: el.id,
          text: spoken,
          voice: speaker,
          label: `${speaker}: ${text}`,
          kind: 'dialogue',
        });
        parenthetical = null;
      }
    }
    return out;
  }, [screenplay?.elements]);

  const speakers = useMemo(() => {
    const s = new Set<string>();
    for (const i of items) if (i.voice !== NARRATOR) s.add(i.voice);
    return [...s].sort();
  }, [items]);

  // Wait for voices to load. The list may come asynchronously.
  useEffect(() => {
    if (!supported) return;
    const load = () => setVoices(window.speechSynthesis.getVoices());
    load();
    window.speechSynthesis.addEventListener('voiceschanged', load);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', load);
  }, [supported]);

  // Auto-assign a default voice for each speaker the first time we see them.
  // Spread the voices around so JANE and JOHN don't both sound identical.
  useEffect(() => {
    if (!voices.length || !speakers.length) return;
    setVoiceMap((cur) => {
      const next = { ...cur };
      let changed = false;
      const pool = voices.length;
      speakers.forEach((name, i) => {
        if (!next[name]) {
          next[name] = voices[(hashCode(name) + i) % pool].name;
          changed = true;
        }
      });
      if (!next[NARRATOR]) {
        // Prefer the first English voice for narration when we can find one.
        const eng = voices.find((v) => /^en/i.test(v.lang));
        next[NARRATOR] = (eng || voices[0]).name;
        changed = true;
      }
      if (changed) saveVoiceMap(next);
      return next;
    });
  }, [voices, speakers]);

  // Cancel any in-flight speech if we unmount.
  useEffect(() => {
    return () => {
      if (supported) window.speechSynthesis.cancel();
    };
  }, [supported]);

  // Persist voice picks
  useEffect(() => { saveVoiceMap(voiceMap); }, [voiceMap]);

  // Stop talking if the user closes / pauses.
  const stop = () => {
    if (supported) window.speechSynthesis.cancel();
    setPlaying(false);
    setPaused(false);
  };

  // Speak items[idx], chain to the next on `end`.
  const utterRef = useRef<SpeechSynthesisUtterance | null>(null);
  const speakAt = (startIdx: number) => {
    if (!supported || startIdx >= items.length) { stop(); return; }
    window.speechSynthesis.cancel();
    setIdx(startIdx);
    setPlaying(true);
    setPaused(false);

    const it = items[startIdx];
    const u = new SpeechSynthesisUtterance(it.text);
    const voiceName = voiceMap[it.voice] || voiceMap[NARRATOR];
    const v = voices.find((vv) => vv.name === voiceName);
    if (v) u.voice = v;
    u.rate = rate;
    u.volume = volume;
    // Slight pitch jitter per character so similar voices feel distinct.
    if (it.voice !== NARRATOR) u.pitch = 1 + (hashCode(it.voice) % 7) / 50 - 0.07;
    u.onend = () => {
      // Only advance if a new utterance hasn't replaced this one already.
      if (utterRef.current === u) speakAt(startIdx + 1);
    };
    u.onerror = (ev) => {
      // 'interrupted' / 'canceled' happen normally when we skip — ignore.
      if (ev.error && ev.error !== 'interrupted' && ev.error !== 'canceled') {
        // Surface but don't crash the read.
        // eslint-disable-next-line no-console
        console.warn('TableRead utterance error:', ev.error);
      }
    };
    utterRef.current = u;
    window.speechSynthesis.speak(u);
  };

  const play = () => {
    if (!supported) return;
    if (paused) {
      window.speechSynthesis.resume();
      setPaused(false);
      setPlaying(true);
    } else {
      speakAt(idx);
    }
  };
  const pause = () => {
    if (!supported) return;
    window.speechSynthesis.pause();
    setPaused(true);
  };
  const next = () => speakAt(Math.min(items.length - 1, idx + 1));
  const back = () => speakAt(Math.max(0, idx - 1));

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 16 }}
      transition={{ duration: 0.18 }}
      className="fixed inset-x-2 sm:inset-x-auto sm:right-4 sm:left-auto bottom-4 sm:bottom-6 sm:w-[480px] bg-[var(--panel)] border border-[var(--border)] shadow-2xl rounded-2xl z-50 flex flex-col overflow-hidden"
      role="dialog"
      aria-label="Table-read mode"
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--border)] bg-[var(--card)]">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center shadow">
          <Mic2 className="w-4 h-4 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold">Table Read</div>
          <div className="text-[10px] text-[var(--text-muted)]">
            {items.length} element{items.length === 1 ? '' : 's'} · {speakers.length} character{speakers.length === 1 ? '' : 's'}
          </div>
        </div>
        <button
          onClick={() => { stop(); onClose(); }}
          className="p-1.5 rounded-md hover:bg-[var(--hover)] text-[var(--text-muted)]"
          aria-label="Close Table Read"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Unsupported guard */}
      {!supported && (
        <div className="p-4 m-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[11px] flex items-start gap-2">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          Your browser doesn't expose the Web Speech API. Try Chrome, Edge, or Safari 16+.
        </div>
      )}

      {supported && (
        <>
          {/* Now-speaking preview */}
          <div className="px-4 py-3 max-h-44 overflow-y-auto bg-[var(--bg)]/40 border-b border-[var(--border)] space-y-1.5">
            {items.length === 0 ? (
              <div className="text-[11px] text-[var(--text-muted)] text-center py-4">
                Write some screenplay elements first.
              </div>
            ) : (
              items.slice(Math.max(0, idx - 1), idx + 3).map((it, i) => {
                const realIdx = Math.max(0, idx - 1) + i;
                const isActive = realIdx === idx;
                return (
                  <div
                    key={it.id + realIdx}
                    className={`text-[11px] leading-snug ${
                      isActive
                        ? 'font-semibold text-[var(--text)] bg-[var(--accent)]/10 px-2 py-1 rounded'
                        : 'text-[var(--text-muted)]'
                    } ${it.kind === 'scene-heading' ? 'uppercase tracking-wider' : ''}`}
                  >
                    {it.label}
                  </div>
                );
              })
            )}
          </div>

          {/* Transport controls */}
          <div className="px-4 py-3 flex items-center gap-2 border-b border-[var(--border)]">
            <button onClick={back} className="p-2 rounded-md hover:bg-[var(--hover)]" aria-label="Previous line">
              <SkipBack className="w-4 h-4" />
            </button>
            {!playing || paused ? (
              <button
                onClick={play}
                disabled={items.length === 0}
                className="flex-1 py-2 rounded-md bg-gradient-to-r from-emerald-500 to-teal-600 text-white text-sm font-semibold shadow flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <Play className="w-4 h-4" /> {paused ? 'Resume' : 'Read aloud'}
              </button>
            ) : (
              <button
                onClick={pause}
                className="flex-1 py-2 rounded-md bg-[var(--card)] border border-[var(--border)] text-sm font-semibold flex items-center justify-center gap-2"
              >
                <Pause className="w-4 h-4" /> Pause
              </button>
            )}
            <button onClick={next} className="p-2 rounded-md hover:bg-[var(--hover)]" aria-label="Next line">
              <SkipForward className="w-4 h-4" />
            </button>
            <button
              onClick={stop}
              className="p-2 rounded-md hover:bg-[var(--hover)] text-[var(--text-muted)]"
              aria-label="Stop"
              title="Stop"
            >
              <Square className="w-4 h-4" />
            </button>
          </div>

          {/* Voice assignments + speed */}
          <div className="px-4 py-3 space-y-3 max-h-[40vh] overflow-y-auto">
            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1">
                <span className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] font-bold flex items-center gap-1">
                  <Gauge className="w-3 h-3" /> Speed
                </span>
                <input
                  type="range" min={0.7} max={1.4} step={0.05}
                  value={rate} onChange={(e) => setRate(Number(e.target.value))}
                  className="w-full accent-[var(--accent)]"
                  aria-label="Reading speed"
                />
                <span className="text-[10px] text-[var(--text-muted)]">{rate.toFixed(2)}×</span>
              </label>
              <label className="space-y-1">
                <span className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] font-bold flex items-center gap-1">
                  <Volume2 className="w-3 h-3" /> Volume
                </span>
                <input
                  type="range" min={0} max={1} step={0.05}
                  value={volume} onChange={(e) => setVolume(Number(e.target.value))}
                  className="w-full accent-[var(--accent)]"
                  aria-label="Volume"
                />
                <span className="text-[10px] text-[var(--text-muted)]">{Math.round(volume * 100)}%</span>
              </label>
            </div>

            <div>
              <h3 className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] font-bold mb-2 flex items-center gap-1">
                <Users className="w-3 h-3" /> Cast voices
              </h3>
              <div className="space-y-1.5">
                <VoicePick
                  label="Narrator (action / scene headings)"
                  voices={voices}
                  value={voiceMap[NARRATOR]}
                  onChange={(name) => setVoiceMap({ ...voiceMap, [NARRATOR]: name })}
                />
                {speakers.map((sp) => (
                  <VoicePick
                    key={sp}
                    label={sp}
                    voices={voices}
                    value={voiceMap[sp]}
                    onChange={(name) => setVoiceMap({ ...voiceMap, [sp]: name })}
                  />
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </motion.div>
  );
}

function VoicePick({
  label, voices, value, onChange,
}: {
  label: string;
  voices: SpeechSynthesisVoice[];
  value: string | undefined;
  onChange: (name: string) => void;
}) {
  return (
    <label className="flex items-center gap-2">
      <span className="flex-1 text-[11px] font-semibold text-[var(--text)] truncate">{label}</span>
      <select
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        className="text-[11px] bg-[var(--card)] border border-[var(--border)] rounded px-1.5 py-1 max-w-[55%] text-[var(--text)]"
      >
        {voices.length === 0 && <option value="">Loading voices…</option>}
        {voices.map((v) => (
          <option key={v.name} value={v.name}>{v.name} ({v.lang})</option>
        ))}
      </select>
    </label>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const VMAP_KEY = 'kindling-tableread-voices';

function loadVoiceMap(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(VMAP_KEY) || '{}'); } catch { return {}; }
}

function saveVoiceMap(m: Record<string, string>) {
  try { localStorage.setItem(VMAP_KEY, JSON.stringify(m)); } catch {}
}

function stripHtml(html: string): string {
  if (typeof document !== 'undefined') {
    const d = document.createElement('div');
    d.innerHTML = html || '';
    return d.textContent || '';
  }
  return (html || '').replace(/<[^>]+>/g, '');
}

/** Tiny deterministic hash so JANE always maps to the same starting voice. */
function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}
