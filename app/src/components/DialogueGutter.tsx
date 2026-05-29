import { useMemo } from 'react';
import { useAppStore } from '@/store/useAppStore';
import type { ScreenplayElement } from '@/types';

/**
 * Dialogue density gutter.
 *
 * A thin vertical strip rendered alongside the writer paper, one block per
 * screenplay element. Block height is proportional to the element's word
 * count; color encodes:
 *   - dialogue   → a stable color picked from the speaker's name hash
 *   - action     → grey
 *   - scene-heading → amber
 *   - transition → blue
 *   - parenthetical → muted grey
 *
 * Lets a writer skim the rhythm of their script the way a programmer skims
 * a minimap — long monologues stand out, action gaps stand out, "wall of
 * the same color" instantly says "one character is hogging the page."
 *
 * Click any block: editor scrolls to that element. Hover: speaker name +
 * word count appear in a tooltip.
 */

interface Props {
  /** When true, render without the legend — for tight spaces. */
  bare?: boolean;
}

interface Row {
  id: string;
  type: ScreenplayElement['type'];
  words: number;
  speaker: string | null;
}

const PALETTE: Record<ScreenplayElement['type'], string> = {
  'scene-heading':  'hsl(38, 90%, 55%)',     // amber
  'transition':     'hsl(210, 75%, 60%)',    // blue
  'action':         'hsl(220, 8%, 45%)',     // muted slate
  'parenthetical':  'hsl(220, 8%, 30%)',     // darker slate
  'character':      'hsl(220, 8%, 60%)',     // (rarely shown — cues are skipped)
  'dialogue':       '',                       // filled per-speaker below
};

export default function DialogueGutter({ bare = false }: Props = {}) {
  const screenplay = useAppStore((s) => s.screenplay);

  const rows = useMemo<Row[]>(() => {
    if (!screenplay?.elements) return [];
    const out: Row[] = [];
    let speaker: string | null = null;
    for (const el of screenplay.elements as ScreenplayElement[]) {
      const text = stripHtml(el.content).trim();
      if (el.type === 'character') {
        speaker = text.replace(/\(.+?\)/g, '').trim().toUpperCase();
        continue; // Don't draw the cue itself — it's metadata.
      }
      const words = text ? text.trim().split(/\s+/).filter(Boolean).length : 0;
      out.push({
        id: el.id,
        type: el.type,
        words,
        speaker: el.type === 'dialogue' ? speaker : null,
      });
      if (el.type === 'scene-heading' || el.type === 'action' || el.type === 'transition') {
        speaker = null;
      }
    }
    return out;
  }, [screenplay?.elements]);

  if (!rows.length) {
    if (bare) return null;
    return (
      <div className="text-[9px] text-[var(--text-muted)] text-center pt-2 select-none">
        Density
      </div>
    );
  }

  // For every dialogue row, derive a stable color from the speaker's name.
  // We pre-bake them outside the loop so two adjacent JANE rows aren't a
  // gradient — they're the exact same colored block.
  const speakerColors = new Map<string, string>();
  for (const r of rows) {
    if (r.speaker && !speakerColors.has(r.speaker)) {
      speakerColors.set(r.speaker, hueFor(r.speaker));
    }
  }

  // Heights are proportional to word count, with a floor so empty lines
  // still register as a tiny tick.
  const totalWords = rows.reduce((acc, r) => acc + Math.max(1, r.words), 0);

  const jumpTo = (id: string) => {
    // Find the corresponding DOM element TipTap rendered. The screenplay
    // paragraph extension doesn't add a data-id; we walk by index instead.
    const idx = rows.findIndex((r) => r.id === id);
    if (idx < 0) return;
    const paragraphs = document.querySelectorAll('.ProseMirror > p');
    // rows skip character cues; map back to the real paragraph index.
    let rowIdx = -1;
    let domIdx = -1;
    for (let i = 0; i < paragraphs.length; i++) {
      const p = paragraphs[i] as HTMLElement;
      if (p.classList.contains('character')) continue;
      rowIdx++;
      if (rowIdx === idx) { domIdx = i; break; }
    }
    if (domIdx < 0) return;
    const target = paragraphs[domIdx] as HTMLElement;
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    // Brief highlight flash so the eye finds the right line.
    target.style.transition = 'background-color 0.3s ease';
    const prev = target.style.backgroundColor;
    target.style.backgroundColor = 'rgba(168, 139, 250, 0.18)';
    setTimeout(() => { target.style.backgroundColor = prev; }, 800);
  };

  return (
    <div
      className="flex flex-col w-2 select-none"
      style={{ minHeight: 200 }}
      role="navigation"
      aria-label="Dialogue density gutter"
    >
      {rows.map((r) => {
        const w = Math.max(1, r.words);
        const flex = (w / totalWords) * rows.length;
        const color =
          r.type === 'dialogue' && r.speaker
            ? speakerColors.get(r.speaker) || 'hsl(0, 0%, 60%)'
            : PALETTE[r.type] || 'rgba(120,120,120,0.4)';
        const tip = r.type === 'dialogue' && r.speaker
          ? `${r.speaker} — ${r.words} word${r.words === 1 ? '' : 's'}`
          : `${labelFor(r.type)} — ${r.words} word${r.words === 1 ? '' : 's'}`;
        return (
          <button
            key={r.id}
            type="button"
            onClick={() => jumpTo(r.id)}
            title={tip}
            aria-label={tip}
            className="w-full block transition-all hover:brightness-150 hover:w-3"
            style={{ flex: Math.max(0.2, flex), background: color }}
          />
        );
      })}
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function labelFor(t: ScreenplayElement['type']): string {
  switch (t) {
    case 'scene-heading': return 'Scene';
    case 'action': return 'Action';
    case 'dialogue': return 'Dialogue';
    case 'parenthetical': return 'Paren';
    case 'character': return 'Character';
    case 'transition': return 'Trans';
  }
}

/** Pick a deterministic, easy-on-the-eyes color from a speaker's name. */
function hueFor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = ((h << 5) - h + name.charCodeAt(i)) | 0;
  const hue = Math.abs(h) % 360;
  return `hsl(${hue}, 70%, 60%)`;
}

function stripHtml(html: string): string {
  if (typeof document !== 'undefined') {
    const d = document.createElement('div');
    d.innerHTML = html || '';
    return d.textContent || '';
  }
  return (html || '').replace(/<[^>]+>/g, '');
}
