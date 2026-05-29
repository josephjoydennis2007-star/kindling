import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';

/**
 * Floating "Coach ✨" pill that appears beside the currently-focused
 * dialogue paragraph in the editor. Click it to coach that single line
 * (dispatches the same `writer:coachLine` event Ctrl+Shift+L uses).
 *
 * We don't render into the editor's DOM (TipTap owns that). Instead we
 * compute screen coordinates of the active dialogue <p> on every
 * selectionchange event and render an absolutely-positioned chip
 * from React.
 *
 * Only shown when:
 *   - the focused element is inside a paragraph with class "dialogue"
 *   - that paragraph has non-empty text
 *   - we're not in reading mode (the parent gates this prop)
 *
 * Touch-friendly target: 28px tall pill, fades in.
 */

interface Props { enabled: boolean; }

interface Pos {
  top: number;
  left: number;
  speaker: string;
  line: string;
}

export default function CoachInlinePill({ enabled }: Props) {
  const [pos, setPos] = useState<Pos | null>(null);

  useEffect(() => {
    if (!enabled) { setPos(null); return; }

    const compute = () => {
      try {
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) { setPos(null); return; }
        let node: Node | null = sel.getRangeAt(0).startContainer;
        while (node && node.nodeType !== 1) node = node.parentNode;
        let dialogue: HTMLElement | null = null;
        for (let cur = node as HTMLElement | null; cur; cur = cur.parentElement) {
          if (cur.classList?.contains('dialogue')) { dialogue = cur; break; }
          if (cur.classList?.contains('ProseMirror')) break; // bailed out
        }
        if (!dialogue) { setPos(null); return; }
        const line = (dialogue.textContent || '').trim();
        if (!line) { setPos(null); return; }
        // Walk back to find the speaker.
        let speaker = 'UNKNOWN';
        let prev: Element | null = dialogue.previousElementSibling;
        while (prev) {
          if (prev.classList.contains('character')) {
            speaker = (prev.textContent || '').replace(/\(.+?\)/g, '').trim().toUpperCase() || 'UNKNOWN';
            break;
          }
          if (prev.classList.contains('scene-heading') || prev.classList.contains('transition')) break;
          prev = prev.previousElementSibling;
        }
        const rect = dialogue.getBoundingClientRect();
        // Position the pill just outside the right edge of the dialogue para,
        // vertically centered with the line. If the paper is wide and we'd
        // overflow the viewport, fall back to anchoring above-right.
        const left = Math.min(window.innerWidth - 140, rect.right + 8);
        const top = Math.max(8, rect.top + rect.height / 2 - 14);
        setPos({ top, left, speaker, line });
      } catch {
        setPos(null);
      }
    };

    // selectionchange covers cursor moves; scroll covers paper scrolling;
    // resize covers viewport changes. All three update the pill position.
    document.addEventListener('selectionchange', compute);
    document.addEventListener('scroll', compute, true);
    window.addEventListener('resize', compute);
    compute();
    return () => {
      document.removeEventListener('selectionchange', compute);
      document.removeEventListener('scroll', compute, true);
      window.removeEventListener('resize', compute);
    };
  }, [enabled]);

  if (!enabled || !pos) return null;

  const onClick = () => {
    document.dispatchEvent(new CustomEvent('writer:coachLine', {
      detail: { speaker: pos.speaker, line: pos.line },
    }));
  };

  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()} // don't steal editor focus
      onClick={onClick}
      title={`Coach this ${pos.speaker} line (${navigator.platform.startsWith('Mac') ? '⇧⌘L' : 'Ctrl+Shift+L'})`}
      className="fixed z-50 flex items-center gap-1 px-2 py-1 rounded-full bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white text-[10px] font-bold shadow-lg ring-1 ring-white/20 hover:brightness-110 transition-all animate-fade-in"
      style={{ top: pos.top, left: pos.left }}
    >
      <Sparkles className="w-3 h-3" />
      Coach
    </button>
  );
}
