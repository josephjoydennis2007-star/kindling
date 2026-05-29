import { useMemo, useState } from 'react';
import { Flame, Info } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import type { Scene, ScreenplayElement } from '@/types';

/**
 * Scene Heat Map.
 *
 * One horizontal strip showing every scene in order. Block width is
 * proportional to the scene's word count; color encodes how dialogue-heavy
 * vs action-heavy the scene is. At-a-glance answers:
 *   - "where are my long action stretches?"      → wide cool blocks
 *   - "where am I dumping pages of dialogue?"    → wide warm blocks
 *   - "where are my dead spots?"                 → tiny grey blocks
 *
 * Click any block to jump to the writer with that scene focused.
 * Pure-presentational — reads from the store, dispatches nothing.
 */

interface HeatBlock {
  scene: Scene;
  /** Total non-whitespace words across the scene's elements. */
  words: number;
  /** Words that came from `dialogue` elements. */
  dialogueWords: number;
  /** Number of unique characters with dialogue in the scene. */
  characters: number;
  /** Estimated pages — same 55-elements-per-page rule the StatusBar uses. */
  pages: number;
  /** 0 = pure action, 1 = pure dialogue. NaN if scene is empty. */
  dialogueRatio: number;
}

export default function SceneHeatMap() {
  const scenes = useAppStore((s) => s.scenes);
  const screenplay = useAppStore((s) => s.screenplay);
  const setActiveScene = useAppStore((s) => s.setActiveScene);
  const setTab = useAppStore((s) => s.setTab);

  const [hovered, setHovered] = useState<string | null>(null);

  const blocks = useMemo<HeatBlock[]>(() => {
    if (!scenes?.length) return [];
    // Group elements by sceneId so we don't do O(N*M) lookups in the loop.
    const byScene = new Map<string, ScreenplayElement[]>();
    for (const el of (screenplay?.elements || []) as ScreenplayElement[]) {
      if (!el.sceneId) continue;
      const arr = byScene.get(el.sceneId) || [];
      arr.push(el);
      byScene.set(el.sceneId, arr);
    }
    return [...scenes]
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map((scene) => {
        const els = byScene.get(scene.id) || [];
        let words = 0;
        let dialogueWords = 0;
        const speakers = new Set<string>();
        let currentSpeaker: string | null = null;
        for (const el of els) {
          const text = stripHtml(el.content).trim();
          const w = countWords(text);
          words += w;
          if (el.type === 'character') {
            currentSpeaker = text.replace(/\(.+?\)/g, '').trim().toUpperCase();
          } else if (el.type === 'dialogue') {
            dialogueWords += w;
            if (currentSpeaker) speakers.add(currentSpeaker);
          } else if (el.type !== 'parenthetical') {
            currentSpeaker = null;
          }
        }
        return {
          scene,
          words,
          dialogueWords,
          characters: speakers.size,
          pages: Math.max(1, Math.ceil(els.length / 55)),
          dialogueRatio: words ? dialogueWords / words : NaN,
        };
      });
  }, [scenes, screenplay?.elements]);

  const totalWords = useMemo(() => blocks.reduce((acc, b) => acc + b.words, 0), [blocks]);
  // Min block width so empty scenes are still tappable/visible.
  const MIN_FLEX = 0.5;

  if (!scenes?.length) {
    return (
      <div className="p-4 rounded-lg bg-[var(--card)] border border-[var(--border)] text-xs text-[var(--text-muted)] text-center">
        Add scenes (Director tab → +) to see the heat map.
      </div>
    );
  }

  const jumpTo = (sceneId: string) => {
    setActiveScene(sceneId);
    setTab('writer');
  };

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] font-bold flex items-center gap-1.5">
          <Flame className="w-3 h-3 text-orange-400" /> Scene Heat Map
        </h3>
        <span className="text-[10px] text-[var(--text-muted)] flex items-center gap-1">
          <Info className="w-3 h-3" /> width = length · color = dialogue ↔ action
        </span>
      </div>

      {/* Strip */}
      <div className="flex h-9 rounded-lg overflow-hidden border border-[var(--border)] bg-[var(--card)]">
        {blocks.map((b) => {
          const isHover = hovered === b.scene.id;
          const flex = totalWords > 0 ? Math.max(MIN_FLEX, b.words / totalWords * blocks.length) : 1;
          return (
            <button
              key={b.scene.id}
              type="button"
              onClick={() => jumpTo(b.scene.id)}
              onMouseEnter={() => setHovered(b.scene.id)}
              onMouseLeave={() => setHovered(null)}
              onFocus={() => setHovered(b.scene.id)}
              onBlur={() => setHovered(null)}
              title={tooltipFor(b)}
              aria-label={tooltipFor(b)}
              className={`relative h-full transition-all border-r border-[var(--bg)]/30 last:border-r-0 ${
                isHover ? 'brightness-125 z-10' : ''
              }`}
              style={{
                flex,
                background: colorFor(b.dialogueRatio, b.words === 0),
              }}
            />
          );
        })}
      </div>

      {/* Legend + active scene readout */}
      <div className="flex items-center justify-between text-[10px] text-[var(--text-muted)]">
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-sm" style={{ background: colorFor(0.95, false) }} /> dialogue
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-sm" style={{ background: colorFor(0.5, false) }} /> mixed
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-sm" style={{ background: colorFor(0.05, false) }} /> action
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-sm" style={{ background: colorFor(0, true) }} /> empty
          </span>
        </div>
        <span>{blocks.length} scene{blocks.length === 1 ? '' : 's'} · {totalWords.toLocaleString()} words</span>
      </div>

      {/* Hover detail panel — kept inline (not a popover) so it works on touch */}
      {hovered && (() => {
        const b = blocks.find((x) => x.scene.id === hovered);
        if (!b) return null;
        return (
          <div className="mt-2 p-3 rounded-lg bg-[var(--card)] border border-[var(--accent)]/40 flex items-start gap-3">
            <span
              className="w-3 h-12 rounded-sm flex-shrink-0 mt-0.5"
              style={{ background: colorFor(b.dialogueRatio, b.words === 0) }}
            />
            <div className="flex-1 min-w-0">
              <div className="text-xs font-bold text-[var(--text)] truncate">
                {b.scene.heading || b.scene.name}
              </div>
              <div className="text-[10px] text-[var(--text-muted)] mt-0.5">
                {b.words.toLocaleString()} words · ~{b.pages} page{b.pages !== 1 ? 's' : ''} · {b.characters} character{b.characters === 1 ? '' : 's'}
                {!Number.isNaN(b.dialogueRatio) && ` · ${Math.round(b.dialogueRatio * 100)}% dialogue`}
              </div>
              {b.words === 0 && (
                <div className="text-[10px] text-amber-400 mt-1">
                  No words yet — click to start writing this scene.
                </div>
              )}
            </div>
            <span className="text-[10px] text-[var(--accent)] flex-shrink-0">click to open →</span>
          </div>
        );
      })()}
    </section>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Map a 0..1 dialogue ratio to a color: blue-ish (action) → grey (mixed) →
 * warm pink/red (dialogue). Empty scenes get a muted grey so they read as
 * "missing" rather than as a colored data point.
 */
function colorFor(ratio: number, empty: boolean): string {
  if (empty || Number.isNaN(ratio)) return 'rgba(120, 120, 130, 0.35)';
  // Lerp blue (210°) → red (0°) across the ratio.
  const hue = Math.round(210 - ratio * 210);
  const sat = 65;
  const light = 50;
  return `hsl(${hue}, ${sat}%, ${light}%)`;
}

function tooltipFor(b: HeatBlock): string {
  const name = b.scene.heading || b.scene.name || 'Scene';
  if (b.words === 0) return `${name} — empty`;
  const pct = Number.isNaN(b.dialogueRatio) ? '0' : Math.round(b.dialogueRatio * 100);
  return `${name} — ${b.words.toLocaleString()} words · ${b.characters} characters · ${pct}% dialogue`;
}

function stripHtml(html: string): string {
  if (typeof document !== 'undefined') {
    const d = document.createElement('div');
    d.innerHTML = html || '';
    return d.textContent || '';
  }
  return (html || '').replace(/<[^>]+>/g, '');
}

function countWords(s: string): number {
  if (!s) return 0;
  return s.trim().split(/\s+/).filter((w) => w.length > 0).length;
}
