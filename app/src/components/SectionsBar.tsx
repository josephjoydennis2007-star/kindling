import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, X, BookmarkPlus, Layers, ChevronDown } from 'lucide-react';
import type { Section } from '@/types';

interface SectionsBarProps {
  sections: Section[];
  activeSectionId: string | null;
  onSelectSection: (id: string | null) => void;
  onAddSection: (name?: string) => string;
  onUpdateSection: (id: string, updates: Partial<Section>) => void;
  onDeleteSection: (id: string) => void;
}

const SUGGESTED_NAMES = [
  'Cold Opening',
  'Establishment',
  'Inciting Incident',
  'Experiment Activation',
  'Rising Action',
  'Escalation',
  'World Impact',
  'Containment Failure',
  'Climax',
  'Incident Close',
  'Resolution',
  'Tag / Stinger',
];

export default function SectionsBar({
  sections,
  activeSectionId,
  onSelectSection,
  onAddSection,
  onUpdateSection,
  onDeleteSection,
}: SectionsBarProps) {
  const [showAdd, setShowAdd] = useState(false);
  const [customName, setCustomName] = useState('');

  const add = (name?: string) => {
    onAddSection(name);
    setShowAdd(false);
    setCustomName('');
  };

  const sorted = [...sections].sort((a, b) => a.order - b.order);

  return (
    <div className="border-b border-[var(--border)] bg-[var(--sidebar)]">
      <div className="flex items-center gap-2 px-3 py-2 overflow-x-auto thin-scrollbar">
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-bold flex-shrink-0 pr-2 border-r border-[var(--border)]">
          <Layers className="w-3 h-3" />
          Sections
        </div>

        <button
          onClick={() => onSelectSection(null)}
          className={`flex-shrink-0 px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
            activeSectionId === null
              ? 'bg-[var(--accent)] text-[var(--bg)]'
              : 'text-[var(--text-secondary)] hover:bg-[var(--hover)] hover:text-[var(--text)]'
          }`}
        >
          All
        </button>

        {sorted.map((s) => {
          const active = activeSectionId === s.id;
          return (
            <SectionChip
              key={s.id}
              section={s}
              active={active}
              onClick={() => onSelectSection(s.id)}
              onRename={(name) => onUpdateSection(s.id, { name })}
              onDelete={() => onDeleteSection(s.id)}
            />
          );
        })}

        <div className="relative flex-shrink-0">
          <button
            onClick={() => setShowAdd((v) => !v)}
            className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-[var(--text-secondary)] hover:bg-[var(--hover)] hover:text-[var(--text)] border border-dashed border-[var(--border)] hover:border-[var(--accent)] transition-all"
          >
            <Plus className="w-3 h-3" /> Add Section
          </button>

          <AnimatePresence>
            {showAdd && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className="absolute right-0 top-full mt-2 z-50 w-[min(640px,calc(100vw-2rem))] p-4 bg-[var(--panel)] border border-[var(--border)] rounded-xl shadow-2xl"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="text-[11px] uppercase tracking-wider text-[var(--text-muted)] font-bold">
                    Add a section
                  </div>
                  <button
                    onClick={() => setShowAdd(false)}
                    className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--hover)]"
                    title="Close"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Everything visible at once — no tiny scroll. */}
                <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-bold mb-2">
                  Common presets
                </div>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5 mb-4">
                  {SUGGESTED_NAMES.map((n) => (
                    <button
                      key={n}
                      onClick={() => add(n)}
                      className="text-left text-[11px] px-2.5 py-2 rounded-md bg-[var(--card)] border border-[var(--border)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-all text-[var(--text-secondary)]"
                    >
                      {n}
                    </button>
                  ))}
                </div>

                <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-bold mb-2">
                  Or name your own
                </div>
                <div className="flex gap-2">
                  <input
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && customName.trim()) add(customName.trim());
                    }}
                    placeholder="Section name (e.g. Pre-credits, Investigation, Climax)"
                    autoFocus
                    className="flex-1 px-3 py-2 text-xs bg-[var(--bg)] border border-[var(--border)] rounded-md outline-none focus:border-[var(--accent)] text-[var(--text)] placeholder:text-[var(--text-muted)]"
                  />
                  <button
                    onClick={() => customName.trim() && add(customName.trim())}
                    disabled={!customName.trim()}
                    className="px-4 py-2 bg-[var(--accent)] text-[var(--bg)] rounded-md text-xs font-semibold disabled:opacity-40 flex items-center gap-1.5"
                  >
                    <BookmarkPlus className="w-3.5 h-3.5" />
                    Add
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

function SectionChip({
  section,
  active,
  onClick,
  onRename,
  onDelete,
}: {
  section: Section;
  active: boolean;
  onClick: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(section.name);
  const [menu, setMenu] = useState(false);

  return (
    <div className="relative flex-shrink-0">
      {editing ? (
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => {
            if (name.trim()) onRename(name.trim());
            setEditing(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              if (name.trim()) onRename(name.trim());
              setEditing(false);
            }
            if (e.key === 'Escape') {
              setName(section.name);
              setEditing(false);
            }
          }}
          className="px-2.5 py-1 rounded-md text-[11px] bg-[var(--bg)] border border-[var(--accent)] text-[var(--text)] outline-none w-32"
        />
      ) : (
        <div
          className={`group flex items-center rounded-md transition-all border ${
            active
              ? 'bg-[var(--accent)]/15 border-[var(--accent)]'
              : 'border-transparent hover:bg-[var(--hover)]'
          }`}
          style={{ boxShadow: active ? `inset 3px 0 0 ${section.color}` : undefined }}
        >
          <button
            onClick={onClick}
            onDoubleClick={() => setEditing(true)}
            className={`px-2.5 py-1 text-[11px] font-medium ${
              active ? 'text-[var(--accent)]' : 'text-[var(--text-secondary)]'
            }`}
            style={{ color: active ? section.color : undefined }}
          >
            {section.name}
          </button>
          <button
            onClick={() => setMenu((v) => !v)}
            className="px-1 py-1 opacity-60 group-hover:opacity-100 text-[var(--text-muted)] hover:text-[var(--text)]"
            title="Options"
          >
            <ChevronDown className="w-3 h-3" />
          </button>
        </div>
      )}

      <AnimatePresence>
        {menu && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="absolute right-0 top-full mt-1 z-50 bg-[var(--panel)] border border-[var(--border)] rounded-md shadow-xl overflow-hidden"
            onMouseLeave={() => setMenu(false)}
          >
            <button
              onClick={() => { setEditing(true); setMenu(false); }}
              className="block w-full text-left px-3 py-1.5 text-[11px] text-[var(--text-secondary)] hover:bg-[var(--hover)] hover:text-[var(--text)]"
            >
              Rename
            </button>
            <button
              onClick={() => { onDelete(); setMenu(false); }}
              className="block w-full text-left px-3 py-1.5 text-[11px] text-red-400 hover:bg-red-500/10"
            >
              <X className="w-3 h-3 inline mr-1" /> Delete
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
