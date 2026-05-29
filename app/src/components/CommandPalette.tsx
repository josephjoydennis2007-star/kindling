import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  PenLine,
  Clapperboard,
  LayoutGrid,
  Users,
  StickyNote,
  Bot,
  Settings,
  FileDown,
  Save,
  Focus,
  Layers,
  Sparkles,
  Image as ImageIcon,
  type LucideIcon,
} from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { toast } from 'sonner';

interface Props { open: boolean; onClose: () => void; onSave: () => void; onExport: () => void; onSettings: () => void; }

interface PaletteItem {
  id: string;
  label: string;
  hint?: string;
  icon: LucideIcon;
  run: () => void;
  /** Lower number = appears first */
  rank?: number;
}

/**
 * A simple but very effective Cmd/Ctrl-K palette. Indexes:
 *   - Built-in commands (open tabs, panels, save, export, focus mode, etc.)
 *   - Every scene, character, section, beat in the active story
 *
 * Selection: ↑/↓/Enter. Esc to close.
 */
export default function CommandPalette({ open, onClose, onSave, onExport, onSettings }: Props) {
  const setTab = useAppStore((s) => s.setTab);
  const setActiveDirectorScene = useAppStore((s) => s.setActiveDirectorScene);
  const setActiveSection = useAppStore((s) => s.setActiveSection);
  const togglePanel = useAppStore((s) => s.togglePanel);
  const toggleFocusMode = useAppStore((s) => s.toggleFocusMode);
  const focusCharacter = useAppStore((s) => s.focusCharacter);

  const scenes = useAppStore((s) => s.scenes);
  const characters = useAppStore((s) => s.characters);
  const sections = useAppStore((s) => s.screenplay.sections || []);
  const beats = useAppStore((s) => s.beats);

  const [q, setQ] = useState('');
  const [idx, setIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset on close
  useEffect(() => { if (!open) { setQ(''); setIdx(0); } }, [open]);

  // Autofocus when opened
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 30);
  }, [open]);

  // Build the full item index
  const items = useMemo<PaletteItem[]>(() => {
    const list: PaletteItem[] = [
      { id: 'tab-dashboard', label: 'Open Home dashboard',  icon: Sparkles,     run: () => setTab('dashboard'), rank: 1 },
      { id: 'tab-writer',    label: 'Open Writer',          icon: PenLine,      run: () => setTab('writer'),    rank: 1 },
      { id: 'tab-director',  label: 'Open Director',        icon: Clapperboard, run: () => setTab('director'),  rank: 1 },
      { id: 'tab-plot',      label: 'Open Plot board',      icon: LayoutGrid,   run: () => setTab('plot'),      rank: 1 },
      { id: 'panel-notes',   label: 'Toggle Notes',         icon: StickyNote,   run: () => togglePanel('notes' as any), rank: 2 },
      { id: 'panel-chars',   label: 'Toggle Characters',    icon: Users,        run: () => togglePanel('characters' as any), rank: 2 },
      { id: 'panel-ai',      label: 'Toggle AI Helper',     icon: Bot,          run: () => togglePanel('ai' as any), rank: 2 },
      { id: 'panel-assets',  label: 'Toggle Assets',        icon: ImageIcon,    run: () => togglePanel('assets' as any), rank: 2 },
      { id: 'cmd-save',      label: 'Save story',           hint: 'Ctrl+S',     icon: Save,       run: onSave, rank: 3 },
      { id: 'cmd-export',    label: 'Export…',              hint: 'Ctrl+Shift+E', icon: FileDown, run: onExport, rank: 3 },
      { id: 'cmd-focus',     label: 'Toggle Focus mode',    hint: 'Ctrl+.',     icon: Focus,      run: toggleFocusMode, rank: 3 },
      { id: 'cmd-settings',  label: 'Open Settings',        hint: 'Ctrl+,',     icon: Settings,   run: onSettings, rank: 3 },
      { id: 'cmd-shortcuts', label: 'Keyboard shortcuts',   hint: 'Reference',  icon: Settings,   run: () => {
          // Open Settings, then ask SettingsOverlay to switch to the Keys tab
          // once it mounts. The listener inside SettingsOverlay handles this.
          onSettings();
          requestAnimationFrame(() => {
            document.dispatchEvent(new CustomEvent('settings:openTab', { detail: { tab: 'shortcuts' } }));
          });
        }, rank: 3 },
    ];
    sections.forEach((s) => list.push({ id: 'sec-' + s.id, label: `Section: ${s.name}`, icon: Layers, run: () => { setActiveSection(s.id); setTab('writer'); }, rank: 4 }));
    scenes.forEach((s) => list.push({ id: 'scene-' + s.id, label: `Scene: ${s.name || s.heading}`, hint: `${s.shotIds.length} shots`, icon: Clapperboard, run: () => { setActiveDirectorScene(s.id); setTab('director'); }, rank: 5 }));
    characters.forEach((c) => list.push({ id: 'char-' + c.id, label: `Character: ${c.name}`, hint: c.description, icon: Users, run: () => focusCharacter(c.id), rank: 6 }));
    Object.values(beats).forEach((b) => list.push({ id: 'beat-' + b.id, label: `Beat: ${b.title || '(untitled)'}`, hint: b.beatType, icon: LayoutGrid, run: () => setTab('plot'), rank: 7 }));
    return list;
  }, [scenes, characters, sections, beats, setTab, setActiveDirectorScene, setActiveSection, togglePanel, toggleFocusMode, onSave, onExport, onSettings, focusCharacter]);

  // Filter + score
  const matches = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return items.slice(0, 30).sort((a, b) => (a.rank || 99) - (b.rank || 99));
    return items
      .map((it) => {
        const hay = `${it.label} ${it.hint || ''}`.toLowerCase();
        const score = hay.includes(query) ? hay.indexOf(query) + (it.rank || 99) * 100 : 99999;
        return { it, score };
      })
      .filter((x) => x.score < 99999)
      .sort((a, b) => a.score - b.score)
      .map((x) => x.it)
      .slice(0, 30);
  }, [items, q]);

  useEffect(() => { setIdx(0); }, [q]);

  const run = (it: PaletteItem) => {
    try { it.run(); } catch (e: any) { toast.error(e?.message || 'Command failed'); }
    onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[300] flex items-start justify-center pt-[10vh] px-4 bg-black/60 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Command palette"
            className="w-full max-w-xl bg-[var(--panel)] border border-[var(--border)] rounded-2xl shadow-2xl overflow-hidden"
          >
            <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--border)] bg-[var(--card)]">
              <Search className="w-4 h-4 text-[var(--text-muted)]" />
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown')   { e.preventDefault(); setIdx((i) => Math.min(matches.length - 1, i + 1)); }
                  else if (e.key === 'ArrowUp'){ e.preventDefault(); setIdx((i) => Math.max(0, i - 1)); }
                  else if (e.key === 'Enter')  { e.preventDefault(); if (matches[idx]) run(matches[idx]); }
                  else if (e.key === 'Escape') { e.preventDefault(); onClose(); }
                }}
                placeholder="Search scenes, characters, sections, commands…"
                className="flex-1 bg-transparent outline-none text-sm text-[var(--text)] placeholder:text-[var(--text-muted)]"
              />
              <span className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] font-bold border border-[var(--border)] rounded px-1.5 py-0.5">esc</span>
            </div>
            <div className="max-h-[60vh] overflow-y-auto">
              {matches.length === 0 && (
                <div className="text-center py-10 text-xs text-[var(--text-muted)]">
                  No matches. Try "scene", "settings", a character name…
                </div>
              )}
              {matches.map((it, i) => {
                const Icon = it.icon;
                return (
                  <button
                    key={it.id}
                    onMouseEnter={() => setIdx(i)}
                    onClick={() => run(it)}
                    className={`w-full flex items-center gap-3 px-3 py-2 text-left text-sm transition-colors ${
                      i === idx ? 'bg-[var(--accent)]/15 text-[var(--text)]' : 'text-[var(--text-secondary)] hover:bg-[var(--hover)]'
                    }`}
                  >
                    <Icon className={`w-4 h-4 flex-shrink-0 ${i === idx ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'}`} />
                    <span className="flex-1 truncate">{it.label}</span>
                    {it.hint && <span className="text-[10px] text-[var(--text-muted)] truncate max-w-[40%]">{it.hint}</span>}
                  </button>
                );
              })}
            </div>
            <div className="border-t border-[var(--border)] px-3 py-1.5 text-[10px] text-[var(--text-muted)] flex items-center gap-3 bg-[var(--sidebar)]">
              <span>↑ ↓ navigate</span>
              <span>↵ run</span>
              <span className="ml-auto">{matches.length} result{matches.length !== 1 ? 's' : ''}</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
